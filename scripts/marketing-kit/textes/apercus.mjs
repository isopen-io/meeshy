// Textes des aperçus vidéo (#9807) et des visuels créatifs (#9811) de la fiche App Store.
// Vocabulaire du jeu repris du catalogue de l'app (Localizable.xcstrings : game.chest.title « Coffre du
// jour », game.guide.step.rank.what « Ton rang ne baisse jamais », reveal.badge.*) : l'écran filmé et la
// légende disent le même mot. Rien n'y promet ce que l'app ne fait pas : chaque légende décrit le plan
// qu'elle surmonte. L'arabe doit être relu par un locuteur natif avant l'envoi.

// Une légende par scène filmée, posée sur son plan.
export const LEGENDES_APERCUS = {
  'jeu-frappe': {
    fr: 'Frappe ta Meesh.',
    en: 'Mint your Meesh.',
    es: 'Acuña tu Meesh.',
    de: 'Präg deine Meesh.',
    it: 'Conia la tua Meesh.',
    pt: 'Cunhe sua Meesh.',
    ar: 'اسكّ عملة Meesh.',
  },
  'jeu-coffre': {
    fr: 'Ouvre le coffre du jour.',
    en: 'Open the chest of the day.',
    es: 'Abre el cofre del día.',
    de: 'Öffne die Truhe des Tages.',
    it: 'Apri il forziere del giorno.',
    pt: 'Abra o baú do dia.',
    ar: 'افتح صندوق اليوم.',
  },
  'jeu-rang': {
    fr: 'Monte en rang. Il ne baisse jamais.',
    en: 'Rank up. It never drops.',
    es: 'Sube de rango. Nunca baja.',
    de: 'Steig im Rang auf. Er sinkt nie.',
    it: 'Sali di rango. Non scende mai.',
    pt: 'Suba de rank. Ele nunca cai.',
    ar: 'ارتقِ في الرتبة. لا تنخفض أبدًا.',
  },
  'jeu-niveau': {
    fr: 'Monte de niveau.',
    en: 'Level up.',
    es: 'Sube de nivel.',
    de: 'Steig ein Level auf.',
    it: 'Sali di livello.',
    pt: 'Suba de nível.',
    ar: 'ارتقِ إلى مستوى جديد.',
  },
  'jeu-badge': {
    fr: 'Gagne des badges.',
    en: 'Earn badges.',
    es: 'Gana insignias.',
    de: 'Sammle Abzeichen.',
    it: 'Ottieni badge.',
    pt: 'Conquiste selos.',
    ar: 'اربح الشارات.',
  },
  'interaction-emoji': {
    fr: 'Réagis d’un emoji.',
    en: 'React with an emoji.',
    es: 'Reacciona con un emoji.',
    de: 'Reagier mit einem Emoji.',
    it: 'Reagisci con un’emoji.',
    pt: 'Reaja com um emoji.',
    ar: 'تفاعل بإيموجي.',
  },
  'interaction-emoji-post': {
    fr: 'Aime leurs publications.',
    en: 'Love their posts.',
    es: 'Dale amor a sus publicaciones.',
    de: 'Like ihre Beiträge.',
    it: 'Metti un cuore ai loro post.',
    pt: 'Curta os posts deles.',
    ar: 'أعجب بمنشوراتهم.',
  },
  'interaction-sticker': {
    fr: 'Pose Mee et Meo sur ta story.',
    en: 'Put Mee and Meo in your story.',
    es: 'Pon a Mee y Meo en tu story.',
    de: 'Setz Mee und Meo in deine Story.',
    it: 'Metti Mee e Meo nella tua storia.',
    pt: 'Coloque Mee e Meo no seu story.',
    ar: 'ضع Mee وMeo في قصتك.',
  },
  'interaction-commentaire-audio': {
    fr: 'Ta voix, transcrite et traduite.',
    en: 'Your voice, transcribed and translated.',
    es: 'Tu voz, transcrita y traducida.',
    de: 'Deine Stimme, transkribiert und übersetzt.',
    it: 'La tua voce, trascritta e tradotta.',
    pt: 'Sua voz, transcrita e traduzida.',
    ar: 'صوتك، مكتوبًا ومترجمًا.',
  },
  'interaction-reel': {
    fr: 'Publie ton réel.',
    en: 'Post your reel.',
    es: 'Publica tu reel.',
    de: 'Poste dein Reel.',
    it: 'Pubblica il tuo reel.',
    pt: 'Publique seu reel.',
    ar: 'انشر مقطعك.',
  },
  'conversation-traduite': {
    fr: 'Chacun sa langue. Tous se comprennent.',
    en: 'Everyone types. Everyone gets it.',
    es: 'Cada uno su idioma. Todos se entienden.',
    de: 'Jeder schreibt. Alle verstehen.',
    it: 'Ognuno la sua lingua. Tutti capiscono.',
    pt: 'Cada um na sua língua. Todos entendem.',
    ar: 'كل واحد بلغته. والكل يفهم.',
  },
}

// Mention de la carte de fin : Apple exige de dire qu'une fonction montrée demande un compte
// (App Store « App Previews » : « if your app … requires login, you must disclose this »).
export const COMPTE_REQUIS = {
  fr: 'Compte Meeshy requis.',
  en: 'Meeshy account required.',
  es: 'Requiere una cuenta de Meeshy.',
  de: 'Meeshy-Konto erforderlich.',
  it: 'Richiede un account Meeshy.',
  pt: 'Requer uma conta Meeshy.',
  ar: 'يتطلب حساب Meeshy.',
}

// Sous-titres des visuels créatifs, sous le titre de la série (LEGENDES.L2).
export const SOUS_TITRES_CREATIFS = {
  entete: {
    fr: 'Frappe tes Meesh, ouvre le coffre, monte en rang.',
    en: 'Mint Meesh, open the chest, rank up.',
    es: 'Acuña Meesh, abre el cofre, sube de rango.',
    de: 'Präg Meesh, öffne die Truhe, steig im Rang auf.',
    it: 'Conia Meesh, apri il forziere, sali di rango.',
    pt: 'Cunhe Meesh, abra o baú, suba de rank.',
    ar: 'اسكّ عملات Meesh، افتح الصندوق، وارتقِ في الرتبة.',
  },
  recherche: {
    fr: 'Messages et vocaux traduits. Un jeu pour monter en rang.',
    en: 'Translated messages and voice notes. A game to rank up.',
    es: 'Mensajes y notas de voz traducidos. Un juego para subir de rango.',
    de: 'Übersetzte Nachrichten und Sprachnachrichten. Ein Spiel für deinen Rang.',
    it: 'Messaggi e vocali tradotti. Un gioco per salire di rango.',
    pt: 'Mensagens e áudios traduzidos. Um jogo para subir de rank.',
    ar: 'رسائل ورسائل صوتية مترجمة. ولعبة للارتقاء في الرتبة.',
  },
}
