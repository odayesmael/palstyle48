/**
 * Content Agent Service - AI-powered content creation assistant
 */

const aiProvider = require('../ai/provider')
const contentPrompt = require('../ai/prompts/content.prompt')

const TONES = {
  عصرية:   'عصرية وشبابية وترفيهية، تستخدم emojis بكثرة وتشعر بالحيوية',
  كلاسيكية: 'أنيقة وراقية، لغة رسمية نظيفة تناسب العلامات الفاخرة',
  حماسية:   'مثيرة ومتحمسة، تدفع للتصرف الفوري مع عناصر FOMO',
  فاخرة:    'فاخرة وإبداعية، تصف المنتجات بأسلوب مجلات الموضة'
}

/**
 * Generate 3 caption variations + hashtags
 */
async function generateCaption({ productName, productDesc, platform, tone }) {
  const platformRules = platform === 'instagram'
    ? 'Instagram (max 2200 حرف، يبدأ بـ hook قوي في أول سطر)'
    : 'Facebook (يمكن أن يكون أطول، مع call to action)'

  const toneDesc = TONES[tone] || TONES['عصرية']

  const prompt = `
أنت خبير تسويق رقمي متخصص في أزياء الملابس.

اكتب 3 نسخ من كابشن تسويقي للمنتج التالي:
المنتج: ${productName}
الوصف: ${productDesc || 'منتج أزياء عصري وأنيق'}
المنصة: ${platformRules}
النبرة: ${toneDesc}

المطلوب:
1. نسخة قصيرة (1-2 جملة): مثالية لـ Story
2. نسخة متوسطة (3-4 جمل): مثالية للـ Post
3. نسخة طويلة (5-6 جمل): تشمل التفاصيل وقصة المنتج

ثم أضف:
- 15 هاشتاق مناسب (مزيج من العربي والإنجليزي)

اكتب بالعربية الفصحى المبسطة. استخدم emojis بشكل لائق.
الرد بJSON بالشكل التالي:
{
  "short": "...",
  "medium": "...",
  "long": "...",
  "hashtags": ["..."]
}
`
  try {
    const result = await aiProvider.generateJSON([{ role: 'user', content: prompt }])
    if (result?.short && result?.medium && result?.long) return result

    // Fallback parse if returned as string
    if (typeof result === 'string') {
      const match = result.match(/\{[\s\S]*\}/)
      if (match) return JSON.parse(match[0])
    }
  } catch (err) {
    console.error('[ContentAgent] generateCaption error:', err.message)
  }

  // Fallback
  return {
    short: `✨ ${productName} — قطعة تستحق الاهتمام! تسوق الآن.`,
    medium: `✨ ${productName}\n${productDesc || ''}\n\n🛍️ متوفر على متجرنا الآن!`,
    long: `✨ ${productName}\n\n${productDesc || 'قطعة أزياء متميزة تجمع بين الأناقة والراحة.'}\n\n🎨 متوفر بألوان وأحجام متعددة\n🚚 شحن سريع لجميع الدول\n💎 جودة تستحق الثقة\n\n🛍️ سارع للطلب قبل نفاد الكمية!`,
    hashtags: ['palstyle48', 'فساتين', 'موضة', 'أزياء', 'ملابس_نسائية', 'استايل', 'fashion', 'style', 'ootd', 'hijabfashion', 'abayas', 'newcollection', 'trending', 'instafashion', 'التسوق_اونلاين']
  }
}

/**
 * Suggest 7 content ideas for the coming week
 */
async function suggestWeeklyIdeas({ topPosts = [] }) {
  const topSummary = topPosts.length > 0
    ? `أفضل منشوراتك مؤخراً:\n${topPosts.slice(0,3).map(p => `- ${p.type}: تفاعل ${p.engagement}`).join('\n')}`
    : 'لا توجد بيانات أداء متاحة'

  const prompt = `
أنت مدير محتوى لمتجر ملابس يُدعى palstyle48.

${topSummary}

اقترح 7 أفكار محتوى لأسبوع كامل (من الأحد للسبت).
لكل يوم:
- نوع المحتوى: post / reel / story / carousel
- وصف الفكرة (جملة أو جملتين)
- أفضل وقت للنشر
- المنصة: instagram أو facebook أو كلاهما

اكتب JSON بالشكل:
[
  { "day": "الأحد", "type": "reel", "idea": "...", "bestTime": "7:00 م", "platform": "instagram" },
  ...
]
`
  try {
    const result = await aiProvider.generateJSON([{ role: 'user', content: prompt }])
    if (Array.isArray(result) && result.length) return result
  } catch (err) {
    console.error('[ContentAgent] suggestIdeas error:', err.message)
  }

  // Fallback ideas
  return [
    { day: 'الأحد', type: 'reel', idea: 'نشر فيديو "أسبوعنا الجديد" يعرض كولكشن الأسبوع بموسيقى ترندية', bestTime: '7:00 م', platform: 'instagram' },
    { day: 'الاثنين', type: 'post', idea: 'منشور تفاعلي "أي اللوك يعجبك أكثر؟" مع خيارين من الأزياء', bestTime: '9:00 م', platform: 'instagram' },
    { day: 'الثلاثاء', type: 'story', idea: 'استطلاع عن اللون المفضل للموسم القادم', bestTime: '8:00 م', platform: 'instagram' },
    { day: 'الأربعاء', type: 'carousel', idea: 'كاروسيل 5 طرق لتنسيق الفستان الواحد', bestTime: '7:00 م', platform: 'instagram' },
    { day: 'الخميس', type: 'post', idea: 'منشور "نهاية الأسبوع" مع تلميح لعرض الجمعة', bestTime: '9:00 م', platform: 'facebook' },
    { day: 'الجمعة', type: 'post', idea: 'إطلاق عرض نهاية الأسبوع مع كود خصم حصري', bestTime: '10:00 ص', platform: 'instagram' },
    { day: 'السبت', type: 'reel', idea: 'فيديو "behind the scenes" من عملية تصوير المنتجات', bestTime: '8:00 م', platform: 'instagram' }
  ]
}

module.exports = { generateCaption, suggestWeeklyIdeas }
