import 'dotenv/config'
import { Telegraf } from 'telegraf'
import PG from 'pg';

const bot = new Telegraf(process.env.BOT_TOKEN);
const pool = new PG.Pool({ connectionString: process.env.DATABASE_URL })

function normalizeLine(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/;+$/g, "")
    .replace(/\s+/g, " ")
}

function parseKV(line) {
  const m = line.match(/^(.+?)\s*(?:--|—|–|-|:)\s*(.+)$/)
  if (!m) return null

  const key = normalizeLine(m[1])
  const value = normalizeLine(m[2])

  if (!key || !value) return null

  return { key, value }
}

function isDateRangeLine(s) {
  const t = normalizeLine(s)
  return /^(\d{2}\.\d{2}\.(?:\d{2}|\d{4})|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(t)
}

function parseMessage(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeLine)

  const nonEmpty = lines.filter(Boolean)
  if (nonEmpty.length < 4) return null

  // ищем ключевые строки
  const wellIdx = nonEmpty.findIndex(l => /^Скважина\s+/i.test(l))
  const stageIdx = nonEmpty.findIndex(l => /^Стадия\s+/i.test(l))
  const dateIdx = nonEmpty.findIndex(isDateRangeLine)

  if (wellIdx === -1 || stageIdx === -1 || dateIdx === -1) return null

  const headerLines = nonEmpty.slice(0, Math.min(wellIdx, stageIdx)).join(" ") || null

  const wellLine = nonEmpty[wellIdx]
  const stageLine = nonEmpty[stageIdx]

  // обычно "ОГРП (+)" прямо перед датой, но не всегда, поэтому:
  const opLine = nonEmpty[dateIdx - 1] || null
  const dateRangeLine = nonEmpty[dateIdx]

  const fields = {}
  for (let i = dateIdx + 1; i < nonEmpty.length; i++) {
    const kv = parseKV(nonEmpty[i])
    if (!kv) continue
    fields[kv.key] = kv.value
  }

  if (Object.keys(fields).length === 0) return null

  //TODO: узнать какие поля ожидает наш сервак
  return {
    headerLine: headerLines,
    wellLine,
    stageLine,
    opLine,
    dateRangeLine,
    fields,
  }
}


function parseStatus(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  // ищем строку "Приступили ..."
  const idx = lines.findIndex(l => /приступили/i.test(l))
  if (idx === -1) return null

  const line = lines[idx]

  // Флот
  console.log(lines)
  const fleetLine = lines.find(l => l.toLowerCase().includes('флот')) || null
  console.log(fleetLine)

  let fleetNum = null
  let fleetName = null

  if (fleetLine) {
    const m = line.match(/\b(\d{4})\b.*?\b(\d{3})\b.*?\bпорт\s*(\d+\/\d+|\d+)\b/i)
    if (m) {
      fleetName = m[1].trim()
      fleetNum = m[2]
    }
  }

  // тип работ
  const work = (line.match(/\b(ОГРП|ГРП)\b/i)?.[1] || null)?.toUpperCase()

  // Порт
  let grp_number = null
  const portMatch = line.match(/\bпорт\b\s*(?:№|:)?\s*([0-9]+(?:\/[0-9]+)?)/i)
  if (portMatch) grp_number = portMatch[1]

  const nums = line.match(/\d+/g) || []

  const well = (line.match(/\b\d{4}\b/)?.[0]) || null

  // Куст
  let bush = null
  const threeDigits = line.match(/\b\d{3}\b/g) || []
  if (threeDigits.length) bush = threeDigits[0]

  if (!grp_number) {
    const ratio = line.match(/\b\d+\/\d+\b/)
    if (ratio) grp_number = ratio[0]
  }

  // Минимум: должен быть хотя бы well или grp_number или bush, иначе это не то
  if (!well && !bush && !grp_number) return null

  return {
    type: 'start_work',
    fleetLine,
    fleetNum,
    fleetName,
    work,
    well,
    bush,
    grp_number,
    raw: line
  }
}

function parseAny(text) {
  // Отчет по операции
  const report = parseMessage(text)
  if (report) return { type: 'report', ...report }

  // Для сообщений типа ".... Приступили к работе"
  const status = parseStatus(text)
  if (status) return status

  return null
}

async function saveReport(parsed) {
  const query = `
    INSERT INTO dw_messages (message)
    VALUES ($1)
    RETURNING id_code
  `

  const values = [parsed]

  const { rows } = await pool.query(query, values)

  return rows[0].id_code
}

async function logError(error, chatId) {
  try {
    await pool.query(
      `
      INSERT INTO errors (error_msg, chat_id)
      VALUES ($1, $2)
      `,
      [
        error?.stack?.slice(0, 1000) || String(error).slice(0, 1000),
        chatId
      ]
    )
  } catch (dbError) {
    console.error('CRITICAL: failed to log error to DB', dbError)
  }
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text
  const parsed = parseAny(text)

  // Фильтр от коротких сообщений типа "'Спасибо', 'Ок'"
  if (!text || text.length > 20000) return

  if (!parsed) return

  try {
    await saveReport(parsed)
  } catch (error){
    console.error(`Error while save: `, error)
    await logError(error, ctx.chat?.id)
  }
})

bot.launch()
console.log('Bot is running')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
