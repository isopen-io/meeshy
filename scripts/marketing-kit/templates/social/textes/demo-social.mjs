// Contenus de démo propres au kit social : mêmes 12 profils fictifs que textes/demo.mjs,
// chaque texte porte sa langue d'origine et ses traductions (le Prisme les sert au lecteur).
import { t } from './langues.mjs'

const contenu = (id, lang, text, translations) => ({ id, lang, text, translations })

// Le bonjour du LECTEUR dans Global (il l'écrit dans sa langue ; {0} = sa ville).
export const MON_BONJOUR = t('Salut, je viens de {0} 👋', 'Hi, I’m from {0} 👋', '¡Hola! Soy de {0} 👋', 'Hi, ich komme aus {0} 👋', 'Ciao, sono di {0} 👋', 'Oi, sou de {0} 👋', 'مرحبًا، أنا من {0} 👋')

// Les réponses reçues dans Global : sans ville ni genre du lecteur, elles valent pour les sept.
export const REPONSES_GLOBAL = [
  { auteur: 'yusuf.h', ...contenu('sg.yusuf', 'ar', 'أهلًا وسهلًا! تحياتي من عمّان 👋', {
    fr: 'Bienvenue ! Salutations d’Amman 👋', en: 'Welcome! Greetings from Amman 👋', es: '¡Hola! Saludos desde Amán 👋',
    de: 'Willkommen! Grüße aus Amman 👋', it: 'Ciao! Saluti da Amman 👋', pt: 'Oi! Saudações de Amã 👋',
  }) },
  { auteur: 'lucas.olv', ...contenu('sg.lucas', 'pt', 'Oiii! Aqui é São Paulo, bora conversar? 🇧🇷', {
    fr: 'Coucou ! Ici São Paulo, on discute ? 🇧🇷', en: 'Heyyy! São Paulo here, wanna chat? 🇧🇷', es: '¡Holaaa! Aquí São Paulo, ¿hablamos? 🇧🇷',
    de: 'Heyyy! Hier ist São Paulo, quatschen wir? 🇧🇷', it: 'Ciaooo! Qui San Paolo, due chiacchiere? 🇧🇷', ar: 'أهلًا! هنا ساو باولو، نتكلم؟ 🇧🇷',
  }) },
  { auteur: 'jonas.wb', ...contenu('sg.jonas', 'de', 'Hallo aus Berlin! Was hörst du gerade? 🎧', {
    fr: 'Salut de Berlin ! Tu écoutes quoi en ce moment ? 🎧', en: 'Hi from Berlin! What are you listening to? 🎧', es: '¡Hola desde Berlín! ¿Qué escuchas ahora? 🎧',
    it: 'Ciao da Berlino! Cosa ascolti adesso? 🎧', pt: 'Oi de Berlim! O que você tá ouvindo? 🎧', ar: 'مرحبًا من برلين! ماذا تسمع الآن؟ 🎧',
  }) },
  { auteur: 'aiko.t', ...contenu('sg.aiko', 'ja', 'ようこそ！大阪からこんにちは🌸', {
    fr: 'Bienvenue ! Coucou d’Osaka 🌸', en: 'Welcome! Hi from Osaka 🌸', es: '¡Hola! Saludos desde Osaka 🌸',
    de: 'Willkommen! Hallo aus Osaka 🌸', it: 'Ciao! Un saluto da Osaka 🌸', pt: 'Oi! Um salve de Osaka 🌸', ar: 'أهلًا بك! تحية من أوساكا 🌸',
  }) },
  { auteur: 'minjun.p', ...contenu('sg.minjun', 'ko', '반가워요! 서울에서 인사해요 👋', {
    fr: 'Enchanté ! Bonjour de Séoul 👋', en: 'Nice to meet you! Hello from Seoul 👋', es: '¡Encantado! Hola desde Seúl 👋',
    de: 'Freut mich! Hallo aus Seoul 👋', it: 'Piacere! Ciao da Seul 👋', pt: 'Prazer! Oi de Seul 👋', ar: 'تشرفنا! مرحبًا من سيول 👋',
  }) },
]

// Le post « ma ville » du lecteur (V5, C3) et les commentaires qu'il reçoit.
export const MA_VILLE = t('Mon quartier ce soir 🌆', 'My neighborhood tonight 🌆', 'Mi barrio esta noche 🌆', 'Mein Viertel heute Abend 🌆', 'Il mio quartiere stasera 🌆', 'Meu bairro hoje à noite 🌆', 'حيّي الليلة 🌆')

export const COMMENTAIRES_VILLE = [
  { auteur: 'aiko.t', ...contenu('sv.aiko', 'ja', '夜景きれい！行ってみたい✨', {
    fr: 'Trop belle, la vue de nuit ! J’ai envie d’y aller ✨', en: 'Gorgeous night view! I want to go ✨', es: '¡Qué vista nocturna! Quiero ir ✨',
    de: 'Wunderschön bei Nacht! Da will ich hin ✨', it: 'Che vista di notte! Voglio andarci ✨', pt: 'Que vista linda à noite! Quero ir ✨', ar: 'منظر ليلي رائع! أريد أن أزوره ✨',
  }) },
  { auteur: 'kwame.m', ...contenu('sv.kwame', 'en', 'Adding this to my list. Any food tips? 🍜', {
    fr: 'Je l’ajoute à ma liste. Des bons plans resto ? 🍜', es: 'Lo apunto en mi lista. ¿Algún sitio para comer? 🍜', de: 'Kommt auf meine Liste. Essens-Tipps? 🍜',
    it: 'Lo aggiungo alla lista. Consigli per mangiare? 🍜', pt: 'Vou pôr na minha lista. Dicas de comida? 🍜', ar: 'سأضيفها إلى قائمتي. أي نصائح للأكل؟ 🍜',
  }) },
  { auteur: 'yusuf.h', ...contenu('sv.yusuf', 'ar', 'مدينتك جميلة! تحياتي من عمّان ☀️', {
    fr: 'Ta ville est magnifique ! Salutations d’Amman ☀️', en: 'Your city is beautiful! Greetings from Amman ☀️', es: '¡Tu ciudad es preciosa! Saludos desde Amán ☀️',
    de: 'Deine Stadt ist wunderschön! Grüße aus Amman ☀️', it: 'La tua città è bellissima! Saluti da Amman ☀️', pt: 'Sua cidade é linda! Saudações de Amã ☀️',
  }) },
  { auteur: 'giulia.r', ...contenu('sv.giulia', 'it', 'Ci vediamo lì un giorno? 😍', {
    fr: 'On s’y retrouve un jour ? 😍', en: 'Meet there someday? 😍', es: '¿Nos vemos allí algún día? 😍',
    de: 'Treffen wir uns da mal? 😍', pt: 'A gente se encontra lá um dia? 😍', ar: 'نلتقي هناك يومًا ما؟ 😍',
  }) },
  { auteur: 'minjun.p', ...contenu('sv.minjun', 'ko', '와, 분위기 최고! 👏', {
    fr: 'Waouh, l’ambiance est folle ! 👏', en: 'Wow, what a vibe! 👏', es: '¡Guau, qué ambiente! 👏',
    de: 'Wow, was für eine Stimmung! 👏', it: 'Wow, che atmosfera! 👏', pt: 'Uau, que clima! 👏', ar: 'واو، أجواء رائعة! 👏',
  }) },
]

// Le message du groupe de la miniature Y2.
export const MESSAGE_VOYAGE = contenu('y2.voyage', 'ja', '週末どこ行く？🧳', {
  fr: 'On part où ce week-end ? 🧳', en: 'Where are we going this weekend? 🧳', es: '¿A dónde vamos este finde? 🧳',
  de: 'Wohin fahren wir am Wochenende? 🧳', it: 'Dove andiamo questo weekend? 🧳', pt: 'Pra onde a gente vai no fim de semana? 🧳', ar: 'إلى أين نسافر في عطلة نهاية الأسبوع؟ 🧳',
})

// « Bonjour » dans quelques-unes des 76 langues — le nuage des visuels Global.
export const BONJOURS = ['Bonjour', 'Hello', '안녕', 'こんにちは', 'مرحبا', 'Olá', 'Hallo', 'Ciao', 'Hola', 'नमस्ते', 'Jambo', 'Mbote', 'Salaam', 'Merhaba', 'Xin chào', 'Sawubona', 'Cześć', 'Γειά', 'Привет', '你好', 'Nanga def', 'Akwaaba']

export const CONTENUS_SOCIAUX = () => [...REPONSES_GLOBAL, ...COMMENTAIRES_VILLE, MESSAGE_VOYAGE]
