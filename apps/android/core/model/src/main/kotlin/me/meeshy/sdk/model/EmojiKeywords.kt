package me.meeshy.sdk.model

/**
 * A search concept: the [words] (any language) that find every emoji in [emojis].
 * Accents and case are irrelevant — [EmojiSearchIndex] folds both sides.
 */
data class EmojiKeywordEntry(
    val emojis: List<String>,
    val words: List<String>,
)

/**
 * Keyword table of the picker search — the iOS `EmojiDataManager.keywords` (EN/FR)
 * widened to the app's seven languages. Every emoji named here exists in
 * [EmojiCatalog], so a search can never offer something the grid does not show.
 */
object EmojiKeywords {

    val entries: List<EmojiKeywordEntry> by lazy(LazyThreadSafetyMode.PUBLICATION) {
        listOf(
        entry(
            emojis = "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 💟 😍 🥰",
            words = "heart hearts coeur cœur corazon corazón coracao coração herz cuore قلب",
        ),
        entry(
            emojis = "😀 😃 😄 😁 😆 😅 😊 🙂 😉 ☺️",
            words = "smile smiling sourire sonrisa sonreir sonreír sorriso sorrir lächeln lacheln sorridere ابتسامة",
        ),
        entry(
            emojis = "😢 😭 😞 😔 🙁 ☹️ 😥",
            words = "sad triste tristeza traurig trist حزين",
        ),
        entry(
            emojis = "😂 🤣 😆 😁",
            words = "laugh lol rire rigoler reir reír rir lachen ridere ضحك",
        ),
        entry(
            emojis = "❤️ 😍 🥰 😘 💕 💖 💗 💞 💝 💘",
            words = "love amour amor liebe amore حب",
        ),
        entry(
            emojis = "🔥 💥 🌋",
            words = "fire feu fuego fogo feuer fuoco نار",
        ),
        entry(
            emojis = "👌 👍 ✅ ✔️ 🆗",
            words = "ok okay",
        ),
        entry(
            emojis = "👍 ✅ ✔️ ☑️",
            words = "yes oui si sí sim ja sì نعم",
        ),
        entry(
            emojis = "👎 ❌ 🚫 ⛔",
            words = "no non nein não nao لا",
        ),
        entry(
            emojis = "👏 🙌",
            words = "clap applaud applaudir applaudissements aplaudir aplauso palmas klatschen applaudire تصفيق",
        ),
        entry(
            emojis = "🤔 🧐 💭",
            words = "think thinking penser réfléchir pensar pensando denken pensare تفكير",
        ),
        entry(
            emojis = "😢 😭 🥲",
            words = "cry crying pleurer pleurs llorar chorar weinen piangere بكاء",
        ),
        entry(
            emojis = "😠 😡 🤬 💢",
            words = "angry mad colère colere enojado enfadado raiva bravo wütend wutend arrabbiato غضب",
        ),
        entry(
            emojis = "🎉 🎊 🥳 🎈 🎁",
            words = "party celebrate fête fete célébrer celebrer fiesta festa feier فرح احتفال",
        ),
        entry(
            emojis = "😎 🆒",
            words = "cool",
        ),
        entry(
            emojis = "❄️ 🥶",
            words = "cold froid frío frio kalt freddo بارد",
        ),
        entry(
            emojis = "⭐ 🌟 ✨ 💫 🌠",
            words = "star stars étoile etoile estrella estrela stern stella نجمة",
        ),
        entry(
            emojis = "☀️ 🌞 🌅 🌄",
            words = "sun sunny soleil sol sonne شمس",
        ),
        entry(
            emojis = "🌙 🌛 🌜 🌝 🌚",
            words = "moon lune luna lua mond قمر",
        ),
        entry(
            emojis = "🐶 🐕 🐩",
            words = "dog puppy chien perro cachorro cão cao hund cane كلب",
        ),
        entry(
            emojis = "🐱 🐈 🐈‍⬛",
            words = "cat kitten chat gato katze gatto قطة",
        ),
        entry(
            emojis = "🍕 🍔 🍟 🌭 🍿 🍩 🍪",
            words = "food eat manger nourriture comida comer essen cibo mangiare طعام",
        ),
        entry(
            emojis = "🍺 🍻 🥂 🍷 🍸 ☕ 🧋",
            words = "drink boire boisson beber bebida trinken bere مشروب",
        ),
        entry(
            emojis = "🎵 🎶 🎤 🎧 🎸 🎹 🎷",
            words = "music musique música musica musik موسيقى",
        ),
        entry(
            emojis = "⚽ 🏀 🏈 ⚾ 🎾 🏐",
            words = "sport sports deporte esporte رياضة",
        ),
        entry(
            emojis = "🚗 🚕 🚙 🏎️ 🚓",
            words = "car voiture coche carro auto macchina سيارة",
        ),
        entry(
            emojis = "✈️ 🛫 🛬 🛩️",
            words = "plane airplane avion avión aviao avião flugzeug aereo طائرة",
        ),
        entry(
            emojis = "💰 💵 💴 💶 💷 💸 💳",
            words = "money argent dinero dinheiro geld soldi denaro مال",
        ),
        entry(
            emojis = "🇫🇷",
            words = "france francia frankreich فرنسا",
        ),
        entry(
            emojis = "🇺🇸",
            words = "usa",
        ),
        entry(
            emojis = "🇬🇧",
            words = "uk",
        ),
        entry(
            emojis = "🙏",
            words = "thanks thank merci gracias obrigado danke grazie شكرا pray prier rezar beten please",
        ),
        entry(
            emojis = "😘 😗 😙 😚",
            words = "kiss bisou baiser beso beijo kuss bacio قبلة",
        ),
        entry(
            emojis = "😮 😯 😲 😳 🤯",
            words = "surprise surprised wow surpris sorpresa surpresa überraschung uberraschung",
        ),
        entry(
            emojis = "😴 💤 🥱",
            words = "sleep sleepy dormir sommeil sueño sueno schlafen dormire نوم",
        ),
        entry(
            emojis = "🤒 🤕 🤢 🤮 🤧 😷",
            words = "sick ill malade enfermo doente krank malato مريض",
        ),
        entry(
            emojis = "🤪 😜 😛 😝 🤡",
            words = "joke silly crazy blague broma piada witz scherzo",
        ),
        entry(
            emojis = "👀",
            words = "eyes look yeux regarder ojos olhos augen occhi عيون",
        ),
        entry(
            emojis = "💪",
            words = "strong muscle fort fuerte forte stark",
        ),
        entry(
            emojis = "🎁",
            words = "gift present cadeau regalo presente geschenk هدية",
        ),
        entry(
            emojis = "🎂 🍰 🧁 🎉 🎈",
            words = "birthday anniversaire cumpleaños cumpleanos aniversário aniversario geburtstag compleanno عيد",
        ),
        entry(
            emojis = "📱 📲 ☎️ 📞",
            words = "phone mobile téléphone telephone portable teléfono telefone telefon telefono هاتف",
        ),
        entry(
            emojis = "💻 🖥️ ⌨️",
            words = "computer laptop ordinateur ordenador computador rechner كمبيوتر",
        ),
        entry(
            emojis = "🏠 🏡",
            words = "home house maison casa haus بيت",
        ),
        entry(
            emojis = "🏳️ 🏴 🏁 🚩 🎌",
            words = "flag drapeau bandera bandeira flagge bandiera علم",
        ),
        entry(
            emojis = "💧 🌊",
            words = "water eau agua água wasser acqua ماء",
        ),
        entry(
            emojis = "🌸 🌹 🌻",
            words = "flower fleur flor blume fiore زهرة",
        ),
        entry(
            emojis = "🌈",
            words = "rainbow arcoiris arco-íris regenbogen arcobaleno",
        ),
        entry(
            emojis = "⚡",
            words = "lightning thunder éclair eclair rayo raio blitz fulmine",
        ),
        entry(
            emojis = "💯",
            words = "100 hundred cent cien cem hundert cento",
        ),
        entry(
            emojis = "💀 ☠️",
            words = "skull dead mort muerto morto tot",
        ),
        entry(
            emojis = "👻",
            words = "ghost fantôme fantome fantasma geist",
        ),
        entry(
            emojis = "💩",
            words = "poop caca cocô coco kot",
        ),
        entry(
            emojis = "⏰ ⌛ ⏳ ⏱️",
            words = "time clock temps horloge heure tiempo reloj tempo relógio zeit uhr orologio ساعة",
        ),
        entry(
            emojis = "📚 📖 📕",
            words = "book livre libro buch libri كتاب",
        ),
        entry(
            emojis = "💡",
            words = "idea idée idee ideia lamp ampoule bombilla lâmpada",
        ),
        entry(
            emojis = "🍀",
            words = "luck lucky chance suerte sorte glück gluck fortuna",
        ),
        entry(
            emojis = "🏆 🥇 🥈 🥉",
            words = "trophy winner champion trophée troféu trofeo pokal",
        ),
        entry(
            emojis = "👋",
            words = "hello hi wave bonjour salut hola olá ola oi hallo ciao مرحبا",
        ),
        entry(
            emojis = "✌️",
            words = "peace paix paz frieden pace",
        ),
        entry(
            emojis = "⚠️",
            words = "warning attention atención atencion aviso achtung attenzione تحذير",
        ),
        entry(
            emojis = "✅ ✔️ ☑️",
            words = "done check fait hecho feito erledigt fatto تم",
        ),
        entry(
            emojis = "❓ ❔",
            words = "question pregunta pergunta frage domanda سؤال",
        ),
        entry(
            emojis = "🙈 🙉 🙊",
            words = "monkey singe mono macaco affe scimmia",
        ),
        )
    }

    private fun entry(emojis: String, words: String): EmojiKeywordEntry =
        EmojiKeywordEntry(emojis = emojis.split(' '), words = words.split(' '))
}
