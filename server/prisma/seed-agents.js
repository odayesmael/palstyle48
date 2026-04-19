const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedAgents() {
  const agents = [
    { name: 'master', displayName: 'Maestro', description: 'Main Agent — Controls everything and communicates with Admin', isActive: true, automationLevel: 'full' },
    { name: 'crm', displayName: 'Customer Agent', description: 'Automatically track, analyze, and segment customers', isActive: true, automationLevel: 'semi' },
    { name: 'inbox', displayName: 'Messaging Agent', description: 'Reply to and categorize customer messages', isActive: true, automationLevel: 'semi' },
    { name: 'content', displayName: 'Content Agent', description: 'Create, publish, and analyze content', isActive: true, automationLevel: 'semi' },
    { name: 'ads', displayName: 'Ads Agent', description: 'Monitor and optimize ad campaigns', isActive: true, automationLevel: 'semi' },
    { name: 'finance', displayName: 'Finance Agent', description: 'Track revenue, expenses, and financial reports', isActive: true, automationLevel: 'semi' },
    { name: 'inventory', displayName: 'Inventory Agent', description: 'Monitor and sync inventory across platforms', isActive: true, automationLevel: 'full' },
  ];

  for (const agent of agents) {
    await prisma.agentConfig.upsert({
      where: { name: agent.name },
      update: {},
      create: agent,
    });
  }
  console.log('✅ Agents seeded:', agents.length);
  await prisma.$disconnect();
}
seedAgents();
