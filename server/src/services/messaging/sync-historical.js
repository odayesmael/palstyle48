require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const MetaIntegration = require('../../integrations/meta.integration')
const { processIncomingMessage } = require('./pipeline.service')
const { decrypt } = require('../../integrations/oauth-helper')

async function runHistoricalSync() {
  console.log('🔄 Starting Historical Message Sync...')

  try {
    // 1. Get Meta platform auth from DB
    const metaPlatform = await prisma.platform.findUnique({ where: { name: 'meta' } })
    if (!metaPlatform || !metaPlatform.isConnected) {
      console.log('❌ Meta is not connected in the database.')
      return
    }

    const decryptedToken = decrypt(metaPlatform.accessToken)
    const meta = new MetaIntegration()
    await meta.connect({ accessToken: decryptedToken })
    
    // 2. Fetch pages and their conversations
    console.log('📡 Fetching pages...')
    const pages = await meta.getPages()
    
    for (const page of pages) {
      console.log(`\n📄 Checking Page / IG Account: ${page.name}`)
      
      try {
        // Fetch conversations
        const convsRes = await meta._get(`/${page.id}/conversations`, {
          fields: 'id,participants,updated_time',
          access_token: page.access_token
        })
        
        const conversations = convsRes.data || []
        console.log(`- Found ${conversations.length} conversation threads.`)
        
        // Loop over the first 5 conversations for testing
        for (const thread of conversations.slice(0, 5)) {
          // Identify sender (the participant that is NOT the page itself)
          const sender = thread.participants?.data?.find(p => p.id !== page.id) || {}
          
          // Fetch the actual messages in this thread
          const msgsRes = await meta._get(`/${thread.id}/messages`, {
            fields: 'id,message,from,created_time,attachments',
            access_token: page.access_token,
            limit: 3 // get the latest 3 messages
          })
          
          const messages = msgsRes.data || []
          
          // We only want to process messages sent BY THE CUSTOMER historically
          const customerMessages = messages.filter(m => m.from && m.from.id !== page.id)
          
          for (const msg of customerMessages) {
            // Check if this message already exists in DB
            const existing = await prisma.message.findFirst({ where: { platformMsgId: msg.id } })
            if (existing) continue // Skip if we already synced it
            
            console.log(`\n📥 Passing historical message to Pipeline: "${msg.message.substring(0, 40)}..." from ${sender.name || sender.email}`)
            
            // Pass it to the Master Message Pipeline
            await processIncomingMessage({
              platform: 'meta', // We could specify fb or ig based on platform rules, but meta covers it
              platformMsgId: msg.id,
              senderName: sender.name || sender.email,
              senderHandle: sender.name || sender.email,
              senderId: sender.id,
              content: msg.message,
              threadId: thread.id,
            })
          }
        }
      } catch (e) {
        console.error(`- ❌ Failed to fetch conversations for page ${page.id}:`, e.message)
      }
    }
    
    console.log('\n✅ Historical Sync Complete!')
  } catch (err) {
    console.error('❌ Error during sync:', err)
  } finally {
    await prisma.$disconnect()
  }
}

runHistoricalSync()
