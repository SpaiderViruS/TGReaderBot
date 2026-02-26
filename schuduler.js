import "dotenv/config";
import cron from "node-cron";
import { pool } from './db.js'
import nodemailer from "nodemailer";

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function logError(error, chatId) {
  try {
    await pool.query(
      `INSERT INTO errors (error_msg, chat_id) VALUES ($1, $2)`,
      [String(error?.stack || error).slice(0, 1000), chatId ?? null],
    );
  } catch (e) {
    console.error("CRITICAL: cannot write to errors table:", e);
  }
}

function buildEmailText(rows) {
  return rows
    .map((r) => {
      const msg = r.message;
      const header =
        msg?.type === "report"
          ? `[REPORT] ${msg.wellLine || ""} | ${msg.stageLine || ""} | ${msg.dateRangeLine || ""}`
          : msg?.type === "start_work"
            ? `[START] флот ${msg.fleetNum ?? "?"} | ${msg.raw || ""}`
            : `[MSG] ${JSON.stringify(msg)}`;
      return `id=${r.id_code} chat=${r.chat_id ?? "-"}\n${header}\n${JSON.stringify(msg, null, 2)}`;
    })
    .join("\n\n-------------------------\n\n");
}

async function runOnce() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(`
      SELECT id_code, chat_id, message
      FROM reports
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

    const text = buildEmailText(rows);

    await mailer.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      subject: `Оперативные данные: ${rows.length} шт.`,
      text,
    });

    const ids = rows.map((r) => r.id_code);

    await client.query(
      `UPDATE reports SET status='sent', sent_at=NOW() WHERE id_code = ANY($1::bigint[])`,
      [ids],
    );

    await client.query("COMMIT");
    console.log(`[worker] sent ${rows.length} rows`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[worker] error:", err);
    await logError(err, null);
  } finally {
    client.release();
  }
}

// каждые 30 минут
cron.schedule("*/30 * * * *", runOnce);

console.log("worker started (every 30 min)");

runOnce();
