import { Telegraf } from "telegraf";
import { pool } from "./db.js";

const bot = new Telegraf(process.env.BOT_TOKEN);

function normalizeLine(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/;+$/g, "")
    .replace(/\s+/g, " ");
}

function looksLikeOperationalMessage(text) {
  const s = String(text || "").toLowerCase()

  const hasWell =
    /скв\.?\s*№?\s*\d+/i.test(s) ||
    /скважина\s*\d+/i.test(s)

  const hasStage = /стадия\s*\d+\/\d+/i.test(s)
  const hasFleet = /флот/i.test(s)
  const hasPressure = /(рнач|рср|ркон|pmin|pmax|isip)/i.test(s)
  const hasDate = /\d{2}\.\d{2}\.\d{2,4}/.test(s)

  const score =
    (hasWell ? 2 : 0) +
    (hasStage ? 1 : 0) +
    (hasFleet ? 1 : 0) +
    (hasPressure ? 1 : 0) +
    (hasDate ? 1 : 0)

  return score >= 2
}

function isTrashMessage(text) {
  const s = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!s) return true;

  const trashPatterns = [
    /^ок$/i,
    /^ок+$/i,
    /^оке?й$/i,
    /^ok$/i,
    /^thanks$/i,
    /^thx$/i,
    /^спасибо$/i,
    /^спс$/i,
    /^понял$/i,
    /^принял$/i,
    /^ясно$/i,
    /^ага$/i,
    /^угу$/i,
    /^добро$/i,
    /^\+$/i,
    /^-\s*$/,
  ];

  if (trashPatterns.some((re) => re.test(s))) return true;

  if (
    s.length <= 10 &&
    !/\d/.test(s) &&
    !/(грп|огрп|скв|скважина|стадия|флот|пласт|isip|давл|pн|pср|pкон|q|v)/i.test(
      s,
    )
  ) {
    return true;
  }

  return false;
}

function parseMessage(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const fullText = lines.join("\n");

  let well = null;
  let fleetNum = null;
  let bush = null;
  let fieldName = null;
  let stage = null;

  well =
    fullText.match(/(?:Скважина|Скв\.?)\s*№?\s*(\d{3,6})/i)?.[1] ||
    fullText.match(/\b(\d{4})\b/)?.[1] ||
    null;

  fleetNum = fullText.match(/Флот[^\n]*?№\s*(\d+)/i)?.[1] || null;

  // Куст
  bush = fullText.match(/(?:куст|КП)\s*№?\s*(\d{2,4})/i)?.[1] || null;

  stage = fullText.match(/Стадия\s*(\d+\/\d+)/i)?.[1] || null;

  const fieldLine = lines.find((l) => /м\/р|месторожд/i.test(l)) || null;

  if (fieldLine) {
    fieldName = fieldLine.replace(/^Наименование\s*/i, "").trim();
  }

  if (!well && !fleetNum && !bush && !fieldName && !stage) return null;

  return {
    well,
    fleetNum,
    bush,
    fieldName,
    stage,
  };
}

async function saveReport(parsed) {
  const query = `
    INSERT INTO dw_messages (message)
    VALUES ($1)
    RETURNING id_code
  `;

  const values = [parsed];

  const { rows } = await pool.query(query, values);

  console.log('[BOT] message parsed successfuly')
  return rows[0].id_code;
}

async function logError(error, chatId) {
  try {
    await pool.query(
      `
      INSERT INTO errors (error_msg, chat_id)
      VALUES ($1, $2)
      `,
      [error?.stack?.slice(0, 1000) || String(error).slice(0, 1000), chatId],
    );
  } catch (dbError) {
    console.error("CRITICAL: failed to log error to DB", dbError);
  }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (isTrashMessage(text)) return;

  const parsed = parseMessage(text);

  if (!looksLikeOperationalMessage(text)) return

  const payload = {
    rawText: text,
    parsed,
    parseStatus: parsed ? "meta_only" : "raw_only",
    receivedAt: new Date().toISOString(),
  }

  try {
    await saveReport(payload);
  } catch (error) {
    console.error(`[BOT] Error while save: `, error);
    await logError(error, ctx.chat?.id);
  }
});

bot.launch();
console.log("Bot is running");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
