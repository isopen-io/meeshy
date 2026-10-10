// La vidéo de STATUT « Trouve ta moitié » (#9988), dans les sept langues : 25 s, 9:16, un arc en quatre plans — on
// rigole, on devient amis, on devient complices, puis l'amour — et la signature. Tutoiement, chaleureux, jamais mièvre.
// Les répliques montrées dans les écrans viennent du kit (textes/demo.mjs, textes/amour.mjs) : ici ne vivent que la
// typographie de la vidéo, ses légendes de publication et les originaux japonais de la conversation d'amitié.
// L'arabe doit être relu par un locuteur natif avant la publication.

export const TEXTES_STATUT = {
  rire: {
    titre: {
      fr: 'D’abord, on rigole.', en: 'First, you laugh.', es: 'Primero, te ríes.', de: 'Erst wird gelacht.',
      it: 'Prima, si ride.', pt: 'Primeiro, a gente ri.', ar: 'في البداية، نضحك.',
    },
    sousTitre: {
      fr: 'avec le monde entier', en: 'with the whole world', es: 'con el mundo entero', de: 'mit der ganzen Welt',
      it: 'con il mondo intero', pt: 'com o mundo inteiro', ar: 'مع العالم كله',
    },
  },
  amis: {
    titre: {
      fr: 'Puis on devient amis.', en: 'Then you become friends.', es: 'Luego, amigos.', de: 'Dann Freunde.',
      it: 'Poi, amici.', pt: 'Depois, amigos.', ar: 'ثم نصبح أصدقاء.',
    },
    sousTitre: {
      fr: 'chacun dans sa langue', en: 'each in your own language', es: 'cada uno en su idioma', de: 'jeder in seiner Sprache',
      it: 'ognuno nella sua lingua', pt: 'cada um no seu idioma', ar: 'كلٌّ بلغته',
    },
  },
  complices: {
    titre: {
      fr: 'Puis complices.', en: 'Then inseparable.', es: 'Luego, cómplices.', de: 'Dann unzertrennlich.',
      it: 'Poi, complici.', pt: 'Depois, cúmplices.', ar: 'ثم أقرب فأقرب.',
    },
    sousTitre: {
      fr: 'même à distance', en: 'even miles apart', es: 'incluso a distancia', de: 'auch aus der Ferne',
      it: 'anche a distanza', pt: 'mesmo à distância', ar: 'حتى عن بُعد',
    },
  },
  amour: {
    titre: {
      fr: 'Puis l’amour.', en: 'Then, love.', es: 'Luego, el amor.', de: 'Dann die Liebe.',
      it: 'Poi, l’amore.', pt: 'Depois, o amor.', ar: 'ثم الحب.',
    },
    sousTitre: {
      fr: 'le grand jour ✈️', en: 'the big day ✈️', es: 'el gran día ✈️', de: 'der große Tag ✈️',
      it: 'il grande giorno ✈️', pt: 'o grande dia ✈️', ar: 'اليوم الموعود ✈️',
    },
  },
  // La signature : deux phrases courtes, la seconde dit COMMENT (par le rire, pas par un questionnaire de compatibilité).
  devise: {
    fr: 'Trouve ta moitié. Commence par en rire.',
    en: 'Find your other half. Start with a laugh.',
    es: 'Encuentra tu media naranja. Empieza riéndote.',
    de: 'Finde deine bessere Hälfte. Fang mit einem Lachen an.',
    it: 'Trova la tua metà. Comincia con una risata.',
    pt: 'Encontre sua cara-metade. Comece dando risada.',
    ar: 'اعثر على نصفك الآخر. وابدأ بضحكة.',
  },
  adresse: 'meeshy.me',
}

// Le rire et l'amour dans plusieurs langues : les deux motifs du fond, qui dérivent derrière les cadres (parallaxe).
export const RIRES = ['haha', 'jajaja', 'ㅋㅋㅋ', 'www', 'mdr', 'kkkk', 'هههه', '555', 'xD', '哈哈哈', 'ахаха', 'lol']
export const AMOURS = ['je t’aime', '사랑해', 'te quiero', '愛してる', 'ti amo', 'ich liebe dich', 'أحبك', 'eu te amo', 'I love you', '我爱你', 'seni seviyorum', 'nakupenda']

// La conversation d'AMITIÉ : les trois répliques du DM du kit (textes/demo.mjs, `dm`), écrites en coréen par Min-jun.
// Aiko les écrit en japonais ; leur traduction est la même, aucune ne porte de marque de genre.
export const AMITIE_JAPONAIS = {
  'dm.annonce': 'ノヴァが土曜日にライブするって!! 信じられる? 🤯',
  'dm.billets': '土曜日のライブのチケット出たよ!! 🎟️',
  'dm.section': '私たち同じブロックかな? 🤩',
}

// Ce qui accompagne la vidéo quand on la publie : une légende de statut (WhatsApp, Instagram, Facebook, Meeshy) et un
// titre et une description pour YouTube Shorts. Chacun pousse vers l'inscription sur meeshy.me.
export const PUBLICATION = {
  fr: {
    statut: 'On a commencé par un fou rire. Maintenant, ils comptent les jours 🥹 Ta moitié parle peut-être une autre langue : Meeshy traduit tout. 👉 meeshy.me',
    titre: 'Il parlait coréen. Elle, pas un mot. 12 jours plus tard… ❤️ #Meeshy',
    description: 'D’abord on rigole, puis on devient amis, puis complices… puis l’amour. Sur Meeshy, chaque message, chaque vocal et chaque story se lisent dans ta langue : la distance et la langue ne comptent plus.\n\nTrouve ta moitié. Commence par en rire. Inscris-toi gratuitement : https://meeshy.me\n\n#Meeshy #amour #rencontre #traduction #shorts',
  },
  en: {
    statut: 'It started with a laugh. Now they’re counting the days 🥹 Your other half might speak another language: Meeshy translates everything. 👉 meeshy.me',
    titre: 'He spoke Korean. She didn’t speak a word. 12 days later… ❤️ #Meeshy',
    description: 'First you laugh, then you become friends, then inseparable… then, love. On Meeshy, every message, voice note and story reads in your language, so distance and language stop mattering.\n\nFind your other half. Start with a laugh. Join for free: https://meeshy.me\n\n#Meeshy #love #dating #translation #shorts',
  },
  es: {
    statut: 'Empezó con una carcajada. Ahora cuentan los días 🥹 Tu media naranja quizá hable otro idioma: Meeshy lo traduce todo. 👉 meeshy.me',
    titre: 'Él hablaba coreano. Ella, ni una palabra. 12 días después… ❤️ #Meeshy',
    description: 'Primero te ríes, luego amigos, luego cómplices… y luego, el amor. En Meeshy, cada mensaje, cada audio y cada story se leen en tu idioma: la distancia y el idioma dejan de importar.\n\nEncuentra tu media naranja. Empieza riéndote. Regístrate gratis: https://meeshy.me\n\n#Meeshy #amor #pareja #traducción #shorts',
  },
  de: {
    statut: 'Es fing mit einem Lachanfall an. Jetzt zählen sie die Tage 🥹 Deine bessere Hälfte spricht vielleicht eine andere Sprache: Meeshy übersetzt alles. 👉 meeshy.me',
    titre: 'Sie sprach Japanisch. Er kein Wort. 12 Tage später… ❤️ #Meeshy',
    description: 'Erst wird gelacht, dann Freunde, dann unzertrennlich… dann die Liebe. Auf Meeshy liest du jede Nachricht, jede Sprachnachricht und jede Story in deiner Sprache: Entfernung und Sprache spielen keine Rolle mehr.\n\nFinde deine bessere Hälfte. Fang mit einem Lachen an. Kostenlos registrieren: https://meeshy.me\n\n#Meeshy #Liebe #Kennenlernen #Übersetzung #shorts',
  },
  it: {
    statut: 'È cominciata con una risata. Ora contano i giorni 🥹 La tua metà forse parla un’altra lingua: Meeshy traduce tutto. 👉 meeshy.me',
    titre: 'Lui parlava coreano. Lei, neanche una parola. 12 giorni dopo… ❤️ #Meeshy',
    description: 'Prima si ride, poi amici, poi complici… poi l’amore. Su Meeshy ogni messaggio, ogni vocale e ogni storia si leggono nella tua lingua: distanza e lingua non contano più.\n\nTrova la tua metà. Comincia con una risata. Iscriviti gratis: https://meeshy.me\n\n#Meeshy #amore #incontri #traduzione #shorts',
  },
  pt: {
    statut: 'Começou com uma crise de riso. Agora eles contam os dias 🥹 Sua cara-metade pode falar outra língua: o Meeshy traduz tudo. 👉 meeshy.me',
    titre: 'Ela falava japonês. Ele, nem uma palavra. 12 dias depois… ❤️ #Meeshy',
    description: 'Primeiro a gente ri, depois vira amigo, depois cúmplice… depois, o amor. No Meeshy, cada mensagem, cada áudio e cada story chegam no seu idioma: distância e idioma deixam de importar.\n\nEncontre sua cara-metade. Comece dando risada. Cadastre-se grátis: https://meeshy.me\n\n#Meeshy #amor #namoro #tradução #shorts',
  },
  ar: {
    statut: 'بدأت القصة بضحكة. والآن يعدّان الأيام 🥹 ربما يتكلم نصفك الآخر لغة أخرى: Meeshy يترجم كل شيء. 👉 meeshy.me',
    titre: 'كانت تتكلم اليابانية. وهو لا يعرف كلمة واحدة. بعد 12 يومًا… ❤️ #Meeshy',
    description: 'في البداية نضحك، ثم نصبح أصدقاء، ثم أقرب فأقرب… ثم الحب. على Meeshy تُقرأ كل رسالة وكل رسالة صوتية وكل قصة بلغتك: لم تعد المسافة ولا اللغة عائقًا.\n\nاعثر على نصفك الآخر. وابدأ بضحكة. سجّل مجانًا: https://meeshy.me\n\n#Meeshy #حب #تعارف #ترجمة #shorts',
  },
}
