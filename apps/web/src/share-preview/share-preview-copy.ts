import type { LandingLanguage } from '@/landing/landing-languages';

/**
 * LES MOTS DE L'APERÇU D'UNE ADRESSE DE L'APPLICATION (#10192), une famille par
 * genre d'adresse, dans les sept langues d'interface.
 *
 * Une famille DYNAMIQUE (`conversation`, `invitation`, `link`, `app`) ne dit
 * rien de ce que l'adresse désigne : ni titre, ni membre, ni identifiant. Ce
 * texte est le même pour une conversation qui existe et pour une qui n'existe
 * pas — c'est ce qui le rend sûr. L'invitation tutoie, comme l'écran qu'elle
 * ouvre et l'aperçu de la passerelle (`services/linkUnfurl/catalog.ts`) ; le
 * reste vouvoie, comme l'application et la landing.
 */
export type SharePreviewFamily = 'world' | 'login' | 'signup' | 'conversation' | 'invitation' | 'link' | 'app';

export type SharePreviewText = { readonly title: string; readonly description: string };

export type SharePreviewCopy = Readonly<Record<SharePreviewFamily, SharePreviewText>> & {
  /** Le texte alternatif de l'image de marque (`/og/invitation-v1.png`). */
  readonly brandImageAlt: string;
};

const fr: SharePreviewCopy = {
  world: {
    title: 'World Wide — la conversation du monde entier, sur Meeshy',
    description: 'Entrez sans compte : écrivez dans votre langue, chacun vous lit dans la sienne. Meeshy traduit chaque message en direct.',
  },
  login: {
    title: 'Se connecter à Meeshy',
    description: 'Retrouvez vos conversations : Meeshy traduit chaque message et chaque vocal dans votre langue.',
  },
  signup: {
    title: 'Créer un compte Meeshy',
    description: 'Gratuit : écrivez dans votre langue, on vous lit dans la sienne. Meeshy traduit chaque message en direct.',
  },
  conversation: {
    title: 'Une conversation sur Meeshy',
    description: 'Ouvrez-la dans Meeshy : chaque message s’affiche dans votre langue.',
  },
  invitation: {
    title: 'Une invitation sur Meeshy',
    description: 'Écris dans ta langue, lis dans la tienne — sans compte, sans installation.',
  },
  link: {
    title: 'Un lien partagé sur Meeshy',
    description: 'Ouvrez-le avec Meeshy, la messagerie qui traduit chaque message dans votre langue.',
  },
  app: {
    title: 'Meeshy — la messagerie qui traduit',
    description: 'Écrivez dans votre langue, lisez dans la vôtre : Meeshy traduit chaque message et chaque vocal en temps réel.',
  },
  brandImageAlt: 'Meeshy — chacun écrit dans sa langue, chacun lit dans la sienne',
};

const en: SharePreviewCopy = {
  world: {
    title: 'World Wide — the whole world’s conversation, on Meeshy',
    description: 'Join without an account: write in your language, everyone reads you in theirs. Meeshy translates every message live.',
  },
  login: {
    title: 'Sign in to Meeshy',
    description: 'Get back to your conversations: Meeshy translates every message and voice note into your language.',
  },
  signup: {
    title: 'Create a Meeshy account',
    description: 'Free: write in your language, be read in theirs. Meeshy translates every message live.',
  },
  conversation: {
    title: 'A conversation on Meeshy',
    description: 'Open it in Meeshy: every message shows up in your language.',
  },
  invitation: {
    title: 'An invitation on Meeshy',
    description: 'Write in your language, read in yours — no account, nothing to install.',
  },
  link: {
    title: 'A link shared on Meeshy',
    description: 'Open it with Meeshy, the messenger that translates every message into your language.',
  },
  app: {
    title: 'Meeshy — the messenger that translates',
    description: 'Write in your language, read in yours: Meeshy translates every message and voice note in real time.',
  },
  brandImageAlt: 'Meeshy — everyone writes in their language, everyone reads in theirs',
};

const es: SharePreviewCopy = {
  world: {
    title: 'World Wide — la conversación del mundo entero, en Meeshy',
    description: 'Entra sin cuenta: escribe en tu idioma y cada uno te lee en el suyo. Meeshy traduce cada mensaje en directo.',
  },
  login: {
    title: 'Iniciar sesión en Meeshy',
    description: 'Vuelve a tus conversaciones: Meeshy traduce cada mensaje y cada nota de voz a tu idioma.',
  },
  signup: {
    title: 'Crear una cuenta de Meeshy',
    description: 'Gratis: escribe en tu idioma y te leen en el suyo. Meeshy traduce cada mensaje en directo.',
  },
  conversation: {
    title: 'Una conversación en Meeshy',
    description: 'Ábrela en Meeshy: cada mensaje aparece en tu idioma.',
  },
  invitation: {
    title: 'Una invitación en Meeshy',
    description: 'Escribe en tu idioma, lee en el tuyo — sin cuenta, sin instalar nada.',
  },
  link: {
    title: 'Un enlace compartido en Meeshy',
    description: 'Ábrelo con Meeshy, la mensajería que traduce cada mensaje a tu idioma.',
  },
  app: {
    title: 'Meeshy — la mensajería que traduce',
    description: 'Escribe en tu idioma, lee en el tuyo: Meeshy traduce cada mensaje y cada nota de voz en tiempo real.',
  },
  brandImageAlt: 'Meeshy — cada uno escribe en su idioma y lee en el suyo',
};

const pt: SharePreviewCopy = {
  world: {
    title: 'World Wide — a conversa do mundo inteiro, no Meeshy',
    description: 'Entre sem conta: escreva no seu idioma e cada um lê você no dele. O Meeshy traduz cada mensagem ao vivo.',
  },
  login: {
    title: 'Entrar no Meeshy',
    description: 'Volte às suas conversas: o Meeshy traduz cada mensagem e cada áudio para o seu idioma.',
  },
  signup: {
    title: 'Criar uma conta no Meeshy',
    description: 'Grátis: escreva no seu idioma e seja lido no deles. O Meeshy traduz cada mensagem ao vivo.',
  },
  conversation: {
    title: 'Uma conversa no Meeshy',
    description: 'Abra no Meeshy: cada mensagem aparece no seu idioma.',
  },
  invitation: {
    title: 'Um convite no Meeshy',
    description: 'Escreva no seu idioma, leia no seu — sem conta, sem instalar nada.',
  },
  link: {
    title: 'Um link compartilhado no Meeshy',
    description: 'Abra com o Meeshy, o mensageiro que traduz cada mensagem para o seu idioma.',
  },
  app: {
    title: 'Meeshy — o mensageiro que traduz',
    description: 'Escreva no seu idioma, leia no seu: o Meeshy traduz cada mensagem e cada áudio em tempo real.',
  },
  brandImageAlt: 'Meeshy — cada um escreve no seu idioma e lê no seu',
};

const de: SharePreviewCopy = {
  world: {
    title: 'World Wide — das Gespräch der ganzen Welt, auf Meeshy',
    description: 'Ohne Konto dabei: Schreib in deiner Sprache, alle lesen dich in ihrer. Meeshy übersetzt jede Nachricht live.',
  },
  login: {
    title: 'Bei Meeshy anmelden',
    description: 'Zurück zu deinen Unterhaltungen: Meeshy übersetzt jede Nachricht und jede Sprachnachricht in deine Sprache.',
  },
  signup: {
    title: 'Ein Meeshy-Konto erstellen',
    description: 'Kostenlos: Schreib in deiner Sprache, gelesen wirst du in ihrer. Meeshy übersetzt jede Nachricht live.',
  },
  conversation: {
    title: 'Eine Unterhaltung auf Meeshy',
    description: 'Öffne sie in Meeshy: Jede Nachricht erscheint in deiner Sprache.',
  },
  invitation: {
    title: 'Eine Einladung auf Meeshy',
    description: 'Schreib in deiner Sprache, lies in deiner — ohne Konto, ohne Installation.',
  },
  link: {
    title: 'Ein auf Meeshy geteilter Link',
    description: 'Öffne ihn mit Meeshy, dem Messenger, der jede Nachricht in deine Sprache übersetzt.',
  },
  app: {
    title: 'Meeshy — der Messenger, der übersetzt',
    description: 'Schreib in deiner Sprache, lies in deiner: Meeshy übersetzt jede Nachricht und jede Sprachnachricht in Echtzeit.',
  },
  brandImageAlt: 'Meeshy — jeder schreibt in seiner Sprache, jeder liest in seiner',
};

const it: SharePreviewCopy = {
  world: {
    title: 'World Wide — la conversazione del mondo intero, su Meeshy',
    description: 'Entra senza account: scrivi nella tua lingua, ognuno ti legge nella sua. Meeshy traduce ogni messaggio in diretta.',
  },
  login: {
    title: 'Accedi a Meeshy',
    description: 'Ritrova le tue conversazioni: Meeshy traduce ogni messaggio e ogni vocale nella tua lingua.',
  },
  signup: {
    title: 'Crea un account Meeshy',
    description: 'Gratis: scrivi nella tua lingua, vieni letto nella loro. Meeshy traduce ogni messaggio in diretta.',
  },
  conversation: {
    title: 'Una conversazione su Meeshy',
    description: 'Aprila in Meeshy: ogni messaggio appare nella tua lingua.',
  },
  invitation: {
    title: 'Un invito su Meeshy',
    description: 'Scrivi nella tua lingua, leggi nella tua — senza account, senza installare nulla.',
  },
  link: {
    title: 'Un link condiviso su Meeshy',
    description: 'Aprilo con Meeshy, la messaggistica che traduce ogni messaggio nella tua lingua.',
  },
  app: {
    title: 'Meeshy — la messaggistica che traduce',
    description: 'Scrivi nella tua lingua, leggi nella tua: Meeshy traduce ogni messaggio e ogni vocale in tempo reale.',
  },
  brandImageAlt: 'Meeshy — ognuno scrive nella sua lingua e legge nella sua',
};

const ar: SharePreviewCopy = {
  world: {
    title: 'World Wide — محادثة العالم كله على Meeshy',
    description: 'ادخل بلا حساب: اكتب بلغتك، ويقرؤك كل شخص بلغته. يترجم Meeshy كل رسالة مباشرةً.',
  },
  login: {
    title: 'تسجيل الدخول إلى Meeshy',
    description: 'عُد إلى محادثاتك: يترجم Meeshy كل رسالة وكل رسالة صوتية إلى لغتك.',
  },
  signup: {
    title: 'إنشاء حساب على Meeshy',
    description: 'مجانًا: اكتب بلغتك ويقرؤك الآخرون بلغتهم. يترجم Meeshy كل رسالة مباشرةً.',
  },
  conversation: {
    title: 'محادثة على Meeshy',
    description: 'افتحها في Meeshy: تظهر كل رسالة بلغتك.',
  },
  invitation: {
    title: 'دعوة على Meeshy',
    description: 'اكتب بلغتك واقرأ بلغتك — بلا حساب ولا تثبيت.',
  },
  link: {
    title: 'رابط مُشارَك على Meeshy',
    description: 'افتحه في Meeshy، المراسلة التي تترجم كل رسالة إلى لغتك.',
  },
  app: {
    title: 'Meeshy — المراسلة التي تترجم',
    description: 'اكتب بلغتك واقرأ بلغتك: يترجم Meeshy كل رسالة وكل رسالة صوتية فورًا.',
  },
  brandImageAlt: 'Meeshy — يكتب كلٌّ بلغته ويقرأ بلغته',
};

export const SHARE_PREVIEW_COPY: Readonly<Record<LandingLanguage, SharePreviewCopy>> = { fr, en, es, pt, de, it, ar };
