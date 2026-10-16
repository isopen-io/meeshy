import type { LandingLanguage } from './landing-languages';

/**
 * CE QUE LA LANDING DIT, dans les sept langues (#10002, planche « Main »).
 *
 * Un `Record` sur `LandingLanguage` plutôt qu'un catalogue à clés libres : une
 * langue ajoutée au produit sans sa copie ne compile pas, et une clé oubliée
 * dans une langue non plus. `{count}` est remplacé par l'effectif servi par
 * `GET /world`, jamais par un chiffre écrit ici.
 */
export type LandingStep = { readonly title: string; readonly text: string };

export type LandingCopy = {
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly ogImageAlt: string;
  readonly navLabel: string;
  readonly navHow: string;
  readonly navWorld: string;
  readonly navFaq: string;
  readonly languageLabel: string;
  readonly signIn: string;
  readonly myConversations: string;
  readonly presence: string;
  readonly headline: string;
  readonly headlineAccent: string;
  readonly lede: string;
  readonly join: string;
  readonly joinNote: string;
  /** La légende du QR vers /world (#10784) — le seul chemin d'entrée sans compte depuis meeshy.me. */
  readonly worldQrCaption: string;
  /** Le texte de remplacement du QR : ce qu'il contient et ce qu'on en fait. */
  readonly worldQrAlt: string;
  /** Ce qui précède l'adresse en clair sous le QR (#10811) : le lien qu'on se partage, pour qui lit meeshy.me sur son téléphone. */
  readonly worldLinkLead: string;
  readonly previewLabel: string;
  readonly previewSubtitle: string;
  readonly previewKenji: string;
  readonly previewKenjiFrom: string;
  readonly previewLuizaNote: string;
  readonly previewYou: string;
  readonly previewYourself: string;
  readonly howTitle: string;
  readonly steps: readonly [LandingStep, LandingStep, LandingStep];
  readonly worldTitle: string;
  readonly worldText: string;
  readonly createAccount: string;
  readonly features: readonly [LandingStep, LandingStep, LandingStep, LandingStep];
  readonly footerLabel: string;
  readonly help: string;
  readonly faq: string;
  readonly privacy: string;
  readonly terms: string;
  readonly download: string;
  readonly about: string;
  readonly contact: string;
  readonly partners: string;
  readonly unavailable: string;
  readonly returnToWorld: string;
};

const fr: LandingCopy = {
  metaTitle: 'Meeshy — Parlez au monde entier, chacun lit dans sa langue',
  metaDescription:
    'Écrivez dans votre langue, on vous lit dans la sienne : Meeshy traduit chaque message et chaque vocal en direct. Entrez dans World Wide sans compte.',
  ogImageAlt: 'Meeshy — Parlez au monde entier. Chacun lit dans sa langue.',
  navLabel: 'Navigation principale',
  navHow: 'Comment ça marche',
  navWorld: 'World Wide',
  navFaq: 'FAQ',
  languageLabel: "Langue de l'interface",
  signIn: 'Se connecter',
  myConversations: 'Mes conversations',
  presence: '{count} personnes dans World Wide',
  headline: 'Parlez au monde entier.',
  headlineAccent: 'Chacun lit dans sa langue.',
  lede: 'Écrivez en français, on vous lit en japonais, en arabe ou en portugais. Meeshy traduit chaque message, chaque vocal, en direct.',
  join: 'Rejoindre World Wide',
  joinNote: 'Sans compte, sans e-mail. Tout ce que vous lirez y arrivera dans la langue choisie.',
  worldQrCaption: 'Flashez pour entrer dans World Wide',
  worldQrAlt: "Code QR vers meeshy.me/world : flashez-le avec l'appareil photo de votre téléphone pour entrer dans World Wide",
  worldLinkLead: 'Le lien de partage :',
  previewLabel: 'Aperçu de World Wide',
  previewSubtitle: 'Traduit pour vous',
  previewKenji: "Bonjour à tous ! Quelqu'un ici apprend le japonais ?",
  previewKenjiFrom: 'JA → FR',
  previewLuizaNote: 'Vocal traduit en français, avec sa voix',
  previewYou: 'Moi ! Je suis à Lyon, on fait un échange ?',
  previewYourself: 'Vous',
  howTitle: 'Trois gestes, et vous êtes dans la conversation',
  steps: [
    { title: 'Votre nom', text: "Un prénom ou un pseudo. Pas d'inscription, pas d'e-mail." },
    { title: 'Votre langue', text: 'Celle de votre appareil est proposée. Tout arrive dans cette langue.' },
    { title: "World Wide s'ouvre", text: 'Écrivez, envoyez un vocal ou un texte. Chacun le reçoit dans sa langue.' },
  ],
  worldTitle: 'World Wide, la conversation de la planète',
  worldText:
    "Une seule conversation, ouverte à tous, modérée par l'équipe Meeshy. Sans compte, on y partage des messages, des vocaux et des fichiers texte — traduits pour chacun.",
  createAccount: 'Créer un compte',
  features: [
    { title: 'Traduction automatique', text: "Messages, transcriptions, aperçus : tout dans votre langue, l'original à un geste." },
    { title: 'Votre voix, dans leur langue', text: 'Un vocal est transcrit, traduit puis relu avec une voix proche de la vôtre.' },
    { title: 'Chiffrement de bout en bout', text: "À activer par conversation : la traduction se fait alors sur l'appareil." },
    { title: 'Partout', text: 'Navigateur, Android, iPhone : la même conversation.' },
  ],
  footerLabel: 'Pages légales et aide',
  help: 'Aide',
  faq: 'FAQ',
  privacy: 'Confidentialité',
  terms: "Conditions d'utilisation",
  download: "Télécharger l'app",
  about: 'À propos',
  contact: 'Contact',
  partners: 'Partenaires',
  unavailable: 'World Wide est momentanément fermée. Connectez-vous pour retrouver vos conversations.',
  returnToWorld: 'Revenir dans World Wide',
};

const en: LandingCopy = {
  metaTitle: 'Meeshy — Talk to the whole world, everyone reads in their language',
  metaDescription:
    'Write in your language, be read in theirs: Meeshy translates every message and every voice note live. Join World Wide without an account.',
  ogImageAlt: 'Meeshy — Talk to the whole world. Everyone reads in their language.',
  navLabel: 'Main navigation',
  navHow: 'How it works',
  navWorld: 'World Wide',
  navFaq: 'FAQ',
  languageLabel: 'Interface language',
  signIn: 'Sign in',
  myConversations: 'My conversations',
  presence: '{count} people in World Wide',
  headline: 'Talk to the whole world.',
  headlineAccent: 'Everyone reads in their language.',
  lede: 'Write in English, get read in Japanese, Arabic or Portuguese. Meeshy translates every message and every voice note, live.',
  join: 'Join World Wide',
  joinNote: 'No account, no e-mail. Everything you read there will arrive in the language you pick.',
  worldQrCaption: 'Scan to enter World Wide',
  worldQrAlt: 'QR code to meeshy.me/world: scan it with your phone camera to enter World Wide',
  worldLinkLead: 'The share link:',
  previewLabel: 'World Wide preview',
  previewSubtitle: 'Translated for you',
  previewKenji: 'Hello everyone! Is anyone here learning Japanese?',
  previewKenjiFrom: 'JA → EN',
  previewLuizaNote: 'Voice note translated into English, in her own voice',
  previewYou: "Me! I'm in Lyon, want to do a language exchange?",
  previewYourself: 'You',
  howTitle: 'Three steps and you are in the conversation',
  steps: [
    { title: 'Your name', text: 'A first name or a nickname. No sign-up, no e-mail.' },
    { title: 'Your language', text: "Your device's language is suggested. Everything arrives in that language." },
    { title: 'World Wide opens', text: 'Write, send a voice note or a text file. Everyone gets it in their language.' },
  ],
  worldTitle: "World Wide, the planet's conversation",
  worldText:
    'One single conversation, open to everyone, moderated by the Meeshy team. Without an account you can share messages, voice notes and text files — translated for each reader.',
  createAccount: 'Create an account',
  features: [
    { title: 'Automatic translation', text: 'Messages, transcripts, previews: everything in your language, the original one gesture away.' },
    { title: 'Your voice, in their language', text: 'A voice note is transcribed, translated, then read back in a voice close to yours.' },
    { title: 'End-to-end encryption', text: 'Turn it on per conversation: translation then happens on the device.' },
    { title: 'Everywhere', text: 'Browser, Android, iPhone: the same conversation.' },
  ],
  footerLabel: 'Legal pages and help',
  help: 'Help',
  faq: 'FAQ',
  privacy: 'Privacy',
  terms: 'Terms of use',
  download: 'Download the app',
  about: 'About',
  contact: 'Contact',
  partners: 'Partners',
  unavailable: 'World Wide is closed for now. Sign in to find your conversations.',
  returnToWorld: 'Back to World Wide',
};

const es: LandingCopy = {
  metaTitle: 'Meeshy — Habla con el mundo entero, cada uno lee en su idioma',
  metaDescription:
    'Escribe en tu idioma y te leen en el suyo: Meeshy traduce cada mensaje y cada nota de voz en directo. Entra en World Wide sin cuenta.',
  ogImageAlt: 'Meeshy — Habla con el mundo entero. Cada uno lee en su idioma.',
  navLabel: 'Navegación principal',
  navHow: 'Cómo funciona',
  navWorld: 'World Wide',
  navFaq: 'Preguntas frecuentes',
  languageLabel: 'Idioma de la interfaz',
  signIn: 'Iniciar sesión',
  myConversations: 'Mis conversaciones',
  presence: '{count} personas en World Wide',
  headline: 'Habla con el mundo entero.',
  headlineAccent: 'Cada uno lee en su idioma.',
  lede: 'Escribe en español y te leen en japonés, árabe o portugués. Meeshy traduce cada mensaje y cada nota de voz, en directo.',
  join: 'Unirme a World Wide',
  joinNote: 'Sin cuenta, sin correo. Todo lo que leas llegará en el idioma que elijas.',
  worldQrCaption: 'Escanea para entrar en World Wide',
  worldQrAlt: 'Código QR hacia meeshy.me/world: escanéalo con la cámara de tu teléfono para entrar en World Wide',
  worldLinkLead: 'El enlace para compartir:',
  previewLabel: 'Vista previa de World Wide',
  previewSubtitle: 'Traducido para ti',
  previewKenji: '¡Hola a todos! ¿Alguien aquí aprende japonés?',
  previewKenjiFrom: 'JA → ES',
  previewLuizaNote: 'Nota de voz traducida al español, con su voz',
  previewYou: '¡Yo! Estoy en Lyon, ¿hacemos un intercambio?',
  previewYourself: 'Tú',
  howTitle: 'Tres pasos y ya estás en la conversación',
  steps: [
    { title: 'Tu nombre', text: 'Un nombre o un apodo. Sin registro, sin correo.' },
    { title: 'Tu idioma', text: 'Te proponemos el de tu dispositivo. Todo llega en ese idioma.' },
    { title: 'World Wide se abre', text: 'Escribe, envía una nota de voz o un texto. Cada uno lo recibe en su idioma.' },
  ],
  worldTitle: 'World Wide, la conversación del planeta',
  worldText:
    'Una sola conversación, abierta a todos, moderada por el equipo de Meeshy. Sin cuenta se comparten mensajes, notas de voz y archivos de texto, traducidos para cada uno.',
  createAccount: 'Crear una cuenta',
  features: [
    { title: 'Traducción automática', text: 'Mensajes, transcripciones, vistas previas: todo en tu idioma, el original a un gesto.' },
    { title: 'Tu voz, en su idioma', text: 'Una nota de voz se transcribe, se traduce y se lee con una voz parecida a la tuya.' },
    { title: 'Cifrado de extremo a extremo', text: 'Se activa por conversación: la traducción se hace entonces en el dispositivo.' },
    { title: 'En todas partes', text: 'Navegador, Android, iPhone: la misma conversación.' },
  ],
  footerLabel: 'Páginas legales y ayuda',
  help: 'Ayuda',
  faq: 'Preguntas frecuentes',
  privacy: 'Privacidad',
  terms: 'Condiciones de uso',
  download: 'Descargar la app',
  about: 'Acerca de',
  contact: 'Contacto',
  partners: 'Socios',
  unavailable: 'World Wide está cerrada por ahora. Inicia sesión para encontrar tus conversaciones.',
  returnToWorld: 'Volver a World Wide',
};

const pt: LandingCopy = {
  metaTitle: 'Meeshy — Fale com o mundo inteiro, cada um lê na sua língua',
  metaDescription:
    'Escreva na sua língua e seja lido na de cada um: o Meeshy traduz cada mensagem e cada áudio ao vivo. Entre no World Wide sem conta.',
  ogImageAlt: 'Meeshy — Fale com o mundo inteiro. Cada um lê na sua língua.',
  navLabel: 'Navegação principal',
  navHow: 'Como funciona',
  navWorld: 'World Wide',
  navFaq: 'Perguntas frequentes',
  languageLabel: 'Idioma da interface',
  signIn: 'Entrar',
  myConversations: 'Minhas conversas',
  presence: '{count} pessoas no World Wide',
  headline: 'Fale com o mundo inteiro.',
  headlineAccent: 'Cada um lê na sua língua.',
  lede: 'Escreva em português e seja lido em japonês, árabe ou francês. O Meeshy traduz cada mensagem e cada áudio, ao vivo.',
  join: 'Entrar no World Wide',
  joinNote: 'Sem conta, sem e-mail. Tudo o que você ler chegará no idioma escolhido.',
  worldQrCaption: 'Escaneie para entrar no World Wide',
  worldQrAlt: 'Código QR para meeshy.me/world: escaneie com a câmera do celular para entrar no World Wide',
  worldLinkLead: 'O link de compartilhamento:',
  previewLabel: 'Prévia do World Wide',
  previewSubtitle: 'Traduzido para você',
  previewKenji: 'Olá a todos! Alguém aqui está aprendendo japonês?',
  previewKenjiFrom: 'JA → PT',
  previewLuizaNote: 'Áudio traduzido para o português, com a voz dela',
  previewYou: 'Eu! Estou em Lyon, vamos fazer um intercâmbio?',
  previewYourself: 'Você',
  howTitle: 'Três passos e você está na conversa',
  steps: [
    { title: 'Seu nome', text: 'Um nome ou apelido. Sem cadastro, sem e-mail.' },
    { title: 'Seu idioma', text: 'O do seu aparelho é sugerido. Tudo chega nesse idioma.' },
    { title: 'O World Wide se abre', text: 'Escreva, envie um áudio ou um texto. Cada um recebe na sua língua.' },
  ],
  worldTitle: 'World Wide, a conversa do planeta',
  worldText:
    'Uma única conversa, aberta a todos, moderada pela equipe Meeshy. Sem conta, compartilham-se mensagens, áudios e arquivos de texto — traduzidos para cada um.',
  createAccount: 'Criar uma conta',
  features: [
    { title: 'Tradução automática', text: 'Mensagens, transcrições, prévias: tudo no seu idioma, o original a um gesto.' },
    { title: 'Sua voz, na língua deles', text: 'Um áudio é transcrito, traduzido e lido com uma voz parecida com a sua.' },
    { title: 'Criptografia de ponta a ponta', text: 'Ative por conversa: a tradução passa a ser feita no aparelho.' },
    { title: 'Em todo lugar', text: 'Navegador, Android, iPhone: a mesma conversa.' },
  ],
  footerLabel: 'Páginas legais e ajuda',
  help: 'Ajuda',
  faq: 'Perguntas frequentes',
  privacy: 'Privacidade',
  terms: 'Termos de uso',
  download: 'Baixar o app',
  about: 'Sobre',
  contact: 'Contato',
  partners: 'Parceiros',
  unavailable: 'O World Wide está fechado no momento. Entre para encontrar suas conversas.',
  returnToWorld: 'Voltar ao World Wide',
};

const de: LandingCopy = {
  metaTitle: 'Meeshy — Sprich mit der ganzen Welt, jeder liest in seiner Sprache',
  metaDescription:
    'Schreib in deiner Sprache, gelesen wirst du in ihrer: Meeshy übersetzt jede Nachricht und jede Sprachnachricht live. Ohne Konto in World Wide.',
  ogImageAlt: 'Meeshy — Sprich mit der ganzen Welt. Jeder liest in seiner Sprache.',
  navLabel: 'Hauptnavigation',
  navHow: "So funktioniert's",
  navWorld: 'World Wide',
  navFaq: 'FAQ',
  languageLabel: 'Sprache der Oberfläche',
  signIn: 'Anmelden',
  myConversations: 'Meine Unterhaltungen',
  presence: '{count} Personen in World Wide',
  headline: 'Sprich mit der ganzen Welt.',
  headlineAccent: 'Jeder liest in seiner Sprache.',
  lede: 'Schreib auf Deutsch, gelesen wirst du auf Japanisch, Arabisch oder Portugiesisch. Meeshy übersetzt jede Nachricht und jede Sprachnachricht, live.',
  join: 'World Wide beitreten',
  joinNote: 'Ohne Konto, ohne E-Mail. Alles, was du dort liest, kommt in der gewählten Sprache an.',
  worldQrCaption: 'Scannen, um World Wide zu betreten',
  worldQrAlt: 'QR-Code zu meeshy.me/world: Scanne ihn mit der Handykamera, um World Wide zu betreten',
  worldLinkLead: 'Der Link zum Teilen:',
  previewLabel: 'Vorschau von World Wide',
  previewSubtitle: 'Für dich übersetzt',
  previewKenji: 'Hallo zusammen! Lernt hier jemand Japanisch?',
  previewKenjiFrom: 'JA → DE',
  previewLuizaNote: 'Sprachnachricht auf Deutsch übersetzt, mit ihrer Stimme',
  previewYou: 'Ich! Ich bin in Lyon, machen wir einen Sprachaustausch?',
  previewYourself: 'Du',
  howTitle: 'Drei Schritte, und du bist in der Unterhaltung',
  steps: [
    { title: 'Dein Name', text: 'Ein Vorname oder Spitzname. Keine Registrierung, keine E-Mail.' },
    { title: 'Deine Sprache', text: 'Die deines Geräts wird vorgeschlagen. Alles kommt in dieser Sprache an.' },
    { title: 'World Wide öffnet sich', text: 'Schreib, schick eine Sprachnachricht oder einen Text. Jeder erhält sie in seiner Sprache.' },
  ],
  worldTitle: 'World Wide, die Unterhaltung des Planeten',
  worldText:
    'Eine einzige Unterhaltung, offen für alle, moderiert vom Meeshy-Team. Ohne Konto teilt man Nachrichten, Sprachnachrichten und Textdateien — für jeden übersetzt.',
  createAccount: 'Konto erstellen',
  features: [
    { title: 'Automatische Übersetzung', text: 'Nachrichten, Transkripte, Vorschauen: alles in deiner Sprache, das Original eine Geste entfernt.' },
    { title: 'Deine Stimme, in ihrer Sprache', text: 'Eine Sprachnachricht wird transkribiert, übersetzt und mit einer Stimme wie deiner vorgelesen.' },
    { title: 'Ende-zu-Ende-Verschlüsselung', text: 'Pro Unterhaltung aktivierbar: Die Übersetzung erfolgt dann auf dem Gerät.' },
    { title: 'Überall', text: 'Browser, Android, iPhone: dieselbe Unterhaltung.' },
  ],
  footerLabel: 'Rechtliches und Hilfe',
  help: 'Hilfe',
  faq: 'FAQ',
  privacy: 'Datenschutz',
  terms: 'Nutzungsbedingungen',
  download: 'App herunterladen',
  about: 'Über uns',
  contact: 'Kontakt',
  partners: 'Partner',
  unavailable: 'World Wide ist gerade geschlossen. Melde dich an, um deine Unterhaltungen zu finden.',
  returnToWorld: 'Zurück zu World Wide',
};

const it: LandingCopy = {
  metaTitle: 'Meeshy — Parla con il mondo intero, ognuno legge nella sua lingua',
  metaDescription:
    'Scrivi nella tua lingua, ti leggono nella loro: Meeshy traduce ogni messaggio e ogni vocale in diretta. Entra in World Wide senza account.',
  ogImageAlt: 'Meeshy — Parla con il mondo intero. Ognuno legge nella sua lingua.',
  navLabel: 'Navigazione principale',
  navHow: 'Come funziona',
  navWorld: 'World Wide',
  navFaq: 'FAQ',
  languageLabel: "Lingua dell'interfaccia",
  signIn: 'Accedi',
  myConversations: 'Le mie conversazioni',
  presence: '{count} persone in World Wide',
  headline: 'Parla con il mondo intero.',
  headlineAccent: 'Ognuno legge nella sua lingua.',
  lede: 'Scrivi in italiano, ti leggono in giapponese, arabo o portoghese. Meeshy traduce ogni messaggio e ogni vocale, in diretta.',
  join: 'Unisciti a World Wide',
  joinNote: 'Senza account, senza e-mail. Tutto ciò che leggerai arriverà nella lingua scelta.',
  worldQrCaption: 'Inquadra per entrare in World Wide',
  worldQrAlt: 'Codice QR verso meeshy.me/world: inquadralo con la fotocamera del telefono per entrare in World Wide',
  worldLinkLead: 'Il link da condividere:',
  previewLabel: 'Anteprima di World Wide',
  previewSubtitle: 'Tradotto per te',
  previewKenji: 'Ciao a tutti! Qualcuno qui studia il giapponese?',
  previewKenjiFrom: 'JA → IT',
  previewLuizaNote: 'Vocale tradotto in italiano, con la sua voce',
  previewYou: 'Io! Sono a Lione, facciamo uno scambio linguistico?',
  previewYourself: 'Tu',
  howTitle: 'Tre gesti e sei nella conversazione',
  steps: [
    { title: 'Il tuo nome', text: 'Un nome o un soprannome. Nessuna registrazione, nessuna e-mail.' },
    { title: 'La tua lingua', text: 'Ti proponiamo quella del tuo dispositivo. Tutto arriva in quella lingua.' },
    { title: 'World Wide si apre', text: 'Scrivi, invia un vocale o un testo. Ognuno lo riceve nella sua lingua.' },
  ],
  worldTitle: 'World Wide, la conversazione del pianeta',
  worldText:
    "Un'unica conversazione, aperta a tutti, moderata dal team Meeshy. Senza account si condividono messaggi, vocali e file di testo — tradotti per ognuno.",
  createAccount: 'Crea un account',
  features: [
    { title: 'Traduzione automatica', text: "Messaggi, trascrizioni, anteprime: tutto nella tua lingua, l'originale a un gesto." },
    { title: 'La tua voce, nella loro lingua', text: 'Un vocale viene trascritto, tradotto e riletto con una voce simile alla tua.' },
    { title: 'Crittografia end-to-end', text: 'Si attiva per conversazione: la traduzione avviene allora sul dispositivo.' },
    { title: 'Ovunque', text: 'Browser, Android, iPhone: la stessa conversazione.' },
  ],
  footerLabel: 'Pagine legali e aiuto',
  help: 'Aiuto',
  faq: 'FAQ',
  privacy: 'Privacy',
  terms: "Condizioni d'uso",
  download: "Scarica l'app",
  about: 'Chi siamo',
  contact: 'Contatti',
  partners: 'Partner',
  unavailable: 'World Wide è chiusa per ora. Accedi per ritrovare le tue conversazioni.',
  returnToWorld: 'Torna in World Wide',
};

const ar: LandingCopy = {
  metaTitle: 'Meeshy — تحدّث إلى العالم كله، وكلٌّ يقرأ بلغته',
  metaDescription:
    'اكتب بلغتك ويقرؤك الآخرون بلغاتهم: يترجم Meeshy كل رسالة وكل رسالة صوتية مباشرةً. ادخل إلى World Wide دون حساب.',
  ogImageAlt: 'Meeshy — تحدّث إلى العالم كله. كلٌّ يقرأ بلغته.',
  navLabel: 'التنقل الرئيسي',
  navHow: 'كيف يعمل',
  navWorld: 'World Wide',
  navFaq: 'الأسئلة الشائعة',
  languageLabel: 'لغة الواجهة',
  signIn: 'تسجيل الدخول',
  myConversations: 'محادثاتي',
  presence: '{count} شخصًا في World Wide',
  headline: 'تحدّث إلى العالم كله.',
  headlineAccent: 'كلٌّ يقرأ بلغته.',
  lede: 'اكتب بالعربية، ويقرؤك الآخرون باليابانية أو الفرنسية أو البرتغالية. يترجم Meeshy كل رسالة وكل رسالة صوتية مباشرةً.',
  join: 'انضم إلى World Wide',
  joinNote: 'دون حساب ودون بريد إلكتروني. كل ما تقرؤه هناك سيصلك باللغة التي تختارها.',
  worldQrCaption: 'امسح الرمز للدخول إلى World Wide',
  worldQrAlt: 'رمز QR إلى meeshy.me/world: امسحه بكاميرا هاتفك للدخول إلى World Wide',
  worldLinkLead: 'رابط المشاركة:',
  previewLabel: 'معاينة World Wide',
  previewSubtitle: 'مترجم لك',
  previewKenji: 'مرحبًا بالجميع! هل يتعلم أحد هنا اليابانية؟',
  previewKenjiFrom: 'JA → AR',
  previewLuizaNote: 'رسالة صوتية مترجمة إلى العربية، بصوتها',
  previewYou: 'أنا! أنا في ليون، هل نتبادل اللغات؟',
  previewYourself: 'أنت',
  howTitle: 'ثلاث خطوات وتكون في المحادثة',
  steps: [
    { title: 'اسمك', text: 'اسم أو لقب. لا تسجيل ولا بريد إلكتروني.' },
    { title: 'لغتك', text: 'نقترح لغة جهازك. كل شيء يصلك بهذه اللغة.' },
    { title: 'تُفتح World Wide', text: 'اكتب، أرسل رسالة صوتية أو ملفًا نصيًا. يتلقاها كلٌّ بلغته.' },
  ],
  worldTitle: 'World Wide، محادثة الكوكب',
  worldText:
    'محادثة واحدة مفتوحة للجميع يشرف عليها فريق Meeshy. دون حساب، تُتبادل فيها الرسائل والرسائل الصوتية والملفات النصية — مترجمةً لكل واحد.',
  createAccount: 'إنشاء حساب',
  features: [
    { title: 'ترجمة تلقائية', text: 'الرسائل والنصوص المفرّغة والمعاينات: كل شيء بلغتك، والأصل على بعد لمسة.' },
    { title: 'صوتك بلغتهم', text: 'تُفرَّغ الرسالة الصوتية وتُترجم ثم تُقرأ بصوت قريب من صوتك.' },
    { title: 'تشفير تام بين الطرفين', text: 'يُفعَّل لكل محادثة: تتم الترجمة حينها على الجهاز.' },
    { title: 'في كل مكان', text: 'المتصفح وأندرويد وآيفون: المحادثة نفسها.' },
  ],
  footerLabel: 'الصفحات القانونية والمساعدة',
  help: 'المساعدة',
  faq: 'الأسئلة الشائعة',
  privacy: 'الخصوصية',
  terms: 'شروط الاستخدام',
  download: 'تنزيل التطبيق',
  about: 'حول Meeshy',
  contact: 'اتصل بنا',
  partners: 'الشركاء',
  unavailable: 'World Wide مغلقة حاليًا. سجّل الدخول للعثور على محادثاتك.',
  returnToWorld: 'العودة إلى World Wide',
};

export const LANDING_COPY: Readonly<Record<LandingLanguage, LandingCopy>> = { fr, en, es, pt, de, it, ar };
