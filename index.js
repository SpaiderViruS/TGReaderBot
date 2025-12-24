import 'dotenv/config'
import { Telegraf } from 'telegraf'

const bot = new Telegraf(process.env.BOT_TOKEN)

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
  return /^(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(t)
}

function parseMessage(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeLine)

  const nonEmpty = lines.filter(Boolean)
  if (nonEmpty.length < 5) return null

  const wellLine = nonEmpty[0]
  const stageLine = nonEmpty[1]

  const dateIdx = nonEmpty.findIndex(isDateRangeLine)
  if (dateIdx === -1) return null

  const opLine = nonEmpty[dateIdx - 1] || null
  const dateRangeLine = nonEmpty[dateIdx]

  const fields = {}
  for (let i = dateIdx + 1; i < nonEmpty.length; i++) {
    const kv = parseKV(nonEmpty[i])
    if (!kv) continue
    fields[kv.key] = kv.value
  }

  if (Object.keys(fields).length === 0) return null

  return { wellLine, stageLine, opLine, dateRangeLine, fields }
}

bot.on('text', (ctx) => {
  const text = ctx.message.text
  const parsed = parseMessage(text)

  console.log('\n=== NEW MESSAGE ===')
  console.log(`from_id: ${ctx.from?.id}`)
  console.log(`chat_id: ${ctx.chat?.id}`)

  if (!parsed) {
    console.log('Error RAW:\n', text)
    return
  }

  console.log('PARSE: ')
  console.log(JSON.stringify(parsed, null, 2))
})

bot.launch()
console.log('Bot is running')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
