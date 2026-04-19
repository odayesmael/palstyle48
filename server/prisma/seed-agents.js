const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedAgents() {
  const agents = [
    { name: 'master', displayName: 'المايسترو', description: 'الإيجنت الرئيسي — يتحكم بالكل ويتواصل مع المدير', isActive: true, automationLevel: 'full' },
    { name: 'crm', displayName: 'إيجنت العملاء', description: 'تتبع وتحليل وتصنيف العملاء تلقائياً', isActive: true, automationLevel: 'semi' },
    { name: 'inbox', displayName: 'إيجنت الرسائل', description: 'الرد على رسائل العملاء وتصنيفها', isActive: true, automationLevel: 'semi' },
    { name: 'content', displayName: 'إيجنت المحتوى', description: 'إنشاء ونشر وتحليل المحتوى', isActive: true, automationLevel: 'semi' },
    { name: 'ads', displayName: 'إيجنت الإعلانات', description: 'مراقبة وتحسين الحملات الإعلانية', isActive: true, automationLevel: 'semi' },
    { name: 'finance', displayName: 'إيجنت المالية', description: 'تتبع الإيرادات والمصاريف والتقارير المالية', isActive: true, automationLevel: 'semi' },
    { name: 'inventory', displayName: 'إيجنت المخزون', description: 'مراقبة ومزامنة المخزون بين المنصات', isActive: true, automationLevel: 'full' },
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
