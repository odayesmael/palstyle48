// ─── Expense Service ──────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CATEGORIES = ['ads', 'shipping', 'inventory', 'salary', 'subscription', 'rent', 'other']

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function createExpense(data) {
  const { category, platform, amount, currency = 'USD', description, date, isRecurring = false, recurringDay } = data

  if (!CATEGORIES.includes(category)) throw new Error(`Invalid category: ${category}`)
  if (!amount || amount <= 0) throw new Error('Amount must be positive')

  return prisma.expense.create({
    data: {
      category,
      platform:    platform || null,
      amount:      parseFloat(amount),
      currency,
      description: description || null,
      date:        date ? new Date(date) : new Date(),
      isRecurring: Boolean(isRecurring),
      recurringDay: isRecurring && recurringDay ? parseInt(recurringDay) : null,
    },
  })
}

async function updateExpense(id, data) {
  const { category, platform, amount, currency, description, date, isRecurring, recurringDay } = data
  const update = {}
  if (category)    update.category    = category
  if (platform !== undefined) update.platform = platform
  if (amount)      update.amount      = parseFloat(amount)
  if (currency)    update.currency    = currency
  if (description !== undefined) update.description = description
  if (date)        update.date        = new Date(date)
  if (isRecurring !== undefined) update.isRecurring = Boolean(isRecurring)
  if (recurringDay !== undefined) update.recurringDay = recurringDay ? parseInt(recurringDay) : null
  update.updatedAt = new Date()
  return prisma.expense.update({ where: { id }, data: update })
}

async function deleteExpense(id) {
  return prisma.expense.delete({ where: { id } })
}

async function getExpenses(filters = {}) {
  const where = {}
  if (filters.category) where.category = filters.category
  if (filters.platform) where.platform = filters.platform
  if (filters.startDate || filters.endDate) {
    where.date = {}
    if (filters.startDate) where.date.gte = new Date(filters.startDate)
    if (filters.endDate)   where.date.lte = new Date(filters.endDate)
  }
  return prisma.expense.findMany({
    where,
    orderBy: { date: 'desc' },
    take: filters.limit ? parseInt(filters.limit) : 100,
  })
}

async function getExpensesByMonth(year, month) {
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0)
  end.setHours(23, 59, 59, 999)

  const expenses = await prisma.expense.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'desc' },
  })

  // Group by category
  const byCategory = {}
  let total = 0
  for (const exp of expenses) {
    byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount
    total += exp.amount
  }

  return { expenses, byCategory, total }
}

module.exports = { createExpense, updateExpense, deleteExpense, getExpenses, getExpensesByMonth, CATEGORIES }
