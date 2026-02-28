import "dotenv/config";
import cron from "node-cron";
import { pool } from "./db.js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: { 
    user: process.env.SMTP_USER, 
    pass: process.env.SMTP_PASS 
  },
})

async function logError(error, chatId) {
  try {
    await pool.query(
      `INSERT INTO dw_errors (error_msg, chat_id) VALUES ($1, $2)`,
      [String(error?.stack || error).slice(0, 1000), chatId ?? null],
    );
  } catch (e) {
    console.error("CRITICAL: cannot write to errors table:", e);
  }
}

function makePayload(rows) {
  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    items: rows.map((r) => ({
      id_code: r.id_code,
      chat_id: r.chat_id ?? null,
      message: r.message,
    })),
  };
}

async function encryptFileAESGCM(inputPath, outputPath, secret) {
  const data = await fs.readFile(inputPath);

  const key = crypto.scryptSync(secret, "reports-salt", 32);
  const iv = crypto.randomBytes(12); // GCM рекомендует 12 байт
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  const out = Buffer.concat([iv, tag, encrypted]);
  await fs.writeFile(outputPath, out);
}

async function runOnce() {
  const client = await pool.connect();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reports-"));
  const plainPath = path.join(tmpDir, `report-${Date.now()}.json`);
  const encPath = plainPath + ".enc";

  try {
    if (!process.env.REPORT_SECRET) {
      throw new Error("REPORT_SECRET is missing in .env");
    }

    await client.query("BEGIN");

    const { rows } = await client.query(`
      SELECT id_code, message
      FROM dw_messages
      WHERE status = 'new'
      ORDER BY id_code ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 500
    `);

    if (rows.length === 0) {
      await client.query("COMMIT");
      console.log("[worker] nothing to send");
      return;
    }

    // Генерим JSON файл
    const payload = makePayload(rows);
    await fs.writeFile(plainPath, JSON.stringify(payload, null, 2), "utf8");

    // Шифруем в .enc
    await encryptFileAESGCM(plainPath, encPath, process.env.REPORT_SECRET);

    await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.MAIL_TO,
      subject: `Данные: ${rows.length} шт.`,
      text:
        `Вложение.\n` +
        `Файл: ${path.basename(encPath)}\n` +
        `Записей: ${rows.length}\n` +
        `Время: ${new Date().toISOString()}\n`,
      attachments: [
        {
          filename: "report.enc",
          path: encPath,
          contentType: "application/octet-stream",
        },
      ],
    });

    // Помечаем как отправленные
    const ids = rows.map((r) => r.id_code);
    await client.query(
      `UPDATE dw_messages
        SET status='sent', sent_at=NOW()
        WHERE id_code = ANY($1::bigint[])`,
      [ids],
    );

    await client.query("COMMIT");
    console.log(`[worker] sent ${rows.length} rows (encrypted attachment)`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[worker] error:", err);
    await logError(err, null);
  } finally {
    client.release();
    // Чистим временные файлы
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.error(err)
    }
  }
}

// 30 мин
cron.schedule("*/30 * * * *", runOnce);
console.log("worker online");
runOnce();
