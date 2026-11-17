/**
 * Les mots de l'aperçu d'un lien de conversation (#9712), dans les sept langues
 * d'interface de Meeshy (`SUPPORTED_INTERFACE_LANGUAGES`, `apps/web`).
 *
 * L'invitation tutoie, comme l'écran qu'elle ouvre. Les guillemets suivent la
 * typographie de chaque langue : un titre saisi par l'hôte s'y insère tel quel,
 * et c'est `page.ts` qui l'a nettoyé avant.
 */

export const UNFURL_LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;

export type UnfurlLanguage = (typeof UNFURL_LANGUAGES)[number];

/** Les quatre types de contenu qu'une carte nomme (#3673) — `ContentKind` de `@meeshy/shared/utils/content-link`. */
export type UnfurlContentKind = 'POST' | 'REEL' | 'STORY' | 'STATUS';

/** La nature d'un média qu'une carte décrit quand le contenu n'a pas de texte. */
export type UnfurlMediaNature = 'image' | 'video' | 'audio';

export type UnfurlCopy = {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  readonly hostInvitesTo: (host: string, title: string) => string;
  readonly hostInvites: (host: string) => string;
  readonly joinTitle: (title: string) => string;
  readonly genericTitle: string;
  readonly invitationPromise: string;
  readonly genericPromise: string;
  readonly imageAlt: string;
  readonly openInvitation: string;
  readonly openMeeshy: string;
  /** « Amani Diallo (@amani) sur Meeshy » : la carte d'une fiche (#18865). */
  readonly personOnMeeshy: (person: string) => string;
  readonly openProfile: string;
  /** « Réel de Amani Diallo » : la carte d'un contenu (#3673). */
  readonly contentBy: Readonly<Record<UnfurlContentKind, (author: string) => string>>;
  /** La description d'un contenu sans texte ni média qui se décrive. */
  readonly contentPromise: string;
  readonly openContent: string;
  readonly mediaNature: Readonly<Record<UnfurlMediaNature, string>>;
};

const NBSP = '\u00A0';

export const UNFURL_COPY: Readonly<Record<UnfurlLanguage, UnfurlCopy>> = {
  fr: {
    locale: 'fr_FR',
    dir: 'ltr',
    hostInvitesTo: (host, title) => `${host} t’invite à «${NBSP}${title}${NBSP}»`,
    hostInvites: (host) => `${host} t’invite sur Meeshy`,
    joinTitle: (title) => `Rejoins «${NBSP}${title}${NBSP}» sur Meeshy`,
    genericTitle: 'Meeshy — la messagerie qui traduit',
    invitationPromise: 'Écris dans ta langue, lis dans la tienne — sans compte, sans installation.',
    genericPromise: 'Écris dans ta langue, lis dans la tienne : Meeshy traduit chaque message en temps réel.',
    imageAlt: 'Meeshy — chacun écrit dans sa langue, chacun lit dans la sienne',
    openInvitation: 'Ouvrir l’invitation',
    openMeeshy: 'Ouvrir Meeshy',
    personOnMeeshy: (person) => `${person} sur Meeshy`,
    openProfile: 'Ouvrir la fiche',
    contentBy: {
      POST: (author) => `Publication de ${author}`,
      REEL: (author) => `Réel de ${author}`,
      STORY: (author) => `Story de ${author}`,
      STATUS: (author) => `Humeur de ${author}`,
    },
    contentPromise: 'À voir sur Meeshy, dans ta langue.',
    openContent: 'Voir sur Meeshy',
    mediaNature: { image: 'Photo', video: 'Vidéo', audio: 'Audio' },
  },
  en: {
    locale: 'en_US',
    dir: 'ltr',
    hostInvitesTo: (host, title) => `${host} invites you to “${title}”`,
    hostInvites: (host) => `${host} invites you to Meeshy`,
    joinTitle: (title) => `Join “${title}” on Meeshy`,
    genericTitle: 'Meeshy — the messenger that translates',
    invitationPromise: 'Write in your language, read in yours — no account, nothing to install.',
    genericPromise: 'Write in your language, read in yours: Meeshy translates every message in real time.',
    imageAlt: 'Meeshy — everyone writes in their language, everyone reads in theirs',
    openInvitation: 'Open the invitation',
    openMeeshy: 'Open Meeshy',
    personOnMeeshy: (person) => `${person} on Meeshy`,
    openProfile: 'Open the profile',
    contentBy: {
      POST: (author) => `Post by ${author}`,
      REEL: (author) => `Reel by ${author}`,
      STORY: (author) => `Story by ${author}`,
      STATUS: (author) => `Mood by ${author}`,
    },
    contentPromise: 'See it on Meeshy, in your language.',
    openContent: 'View on Meeshy',
    mediaNature: { image: 'Photo', video: 'Video', audio: 'Audio' },
  },
  es: {
    locale: 'es_ES',
    dir: 'ltr',
    hostInvitesTo: (host, title) => `${host} te invita a «${title}»`,
    hostInvites: (host) => `${host} te invita a Meeshy`,
    joinTitle: (title) => `Únete a «${title}» en Meeshy`,
    genericTitle: 'Meeshy — la mensajería que traduce',
    invitationPromise: 'Escribe en tu idioma, lee en el tuyo — sin cuenta, sin instalar nada.',
    genericPromise: 'Escribe en tu idioma, lee en el tuyo: Meeshy traduce cada mensaje en tiempo real.',
    imageAlt: 'Meeshy — cada uno escribe en su idioma y lee en el suyo',
    openInvitation: 'Abrir la invitación',
    openMeeshy: 'Abrir Meeshy',
    personOnMeeshy: (person) => `${person} en Meeshy`,
    openProfile: 'Abrir el perfil',
    contentBy: {
      POST: (author) => `Publicación de ${author}`,
      REEL: (author) => `Reel de ${author}`,
      STORY: (author) => `Historia de ${author}`,
      STATUS: (author) => `Estado de ${author}`,
    },
    contentPromise: 'Míralo en Meeshy, en tu idioma.',
    openContent: 'Ver en Meeshy',
    mediaNature: { image: 'Foto', video: 'Vídeo', audio: 'Audio' },
  },
  pt: {
    locale: 'pt_BR',
    dir: 'ltr',
    hostInvitesTo: (host, title) => `${host} convida você para “${title}”`,
    hostInvites: (host) => `${host} convida você para o Meeshy`,
    joinTitle: (title) => `Entre em “${title}” no Meeshy`,
    genericTitle: 'Meeshy — o mensageiro que traduz',
    invitationPromise: 'Escreva no seu idioma, leia no seu — sem conta, sem instalar nada.',
    genericPromise: 'Escreva no seu idioma, leia no seu: o Meeshy traduz cada mensagem em tempo real.',
    imageAlt: 'Meeshy — cada um escreve no seu idioma e lê no seu',
    openInvitation: 'Abrir o convite',
    openMeeshy: 'Abrir o Meeshy',
    personOnMeeshy: (person) => `${person} no Meeshy`,
    openProfile: 'Abrir o perfil',
    contentBy: {
      POST: (author) => `Publicação de ${author}`,
      REEL: (author) => `Reel de ${author}`,
      STORY: (author) => `Story de ${author}`,
      STATUS: (author) => `Humor de ${author}`,
    },
    contentPromise: 'Veja no Meeshy, no seu idioma.',
    openContent: 'Ver no Meeshy',
    mediaNature: { image: 'Foto', video: 'Vídeo', audio: 'Áudio' },
  },
  de: {
    locale: 'de_DE',
    dir: 'ltr',
    hostInvitesTo: (host, title) => `${host} lädt dich zu „${title}“ ein`,
    hostInvites: (host) => `${host} lädt dich zu Meeshy ein`,
    joinTitle: (title) => `Tritt „${title}“ auf Meeshy bei`,
    genericTitle: 'Meeshy — der Messenger, der übersetzt',
    invitationPromise: 'Schreib in deiner Sprache, lies in deiner — ohne Konto, ohne Installation.',
    genericPromise: 'Schreib in deiner Sprache, lies in deiner: Meeshy übersetzt jede Nachricht in Echtzeit.',
    imageAlt: 'Meeshy — jeder schreibt in seiner Sprache, jeder liest in seiner',
    openInvitation: 'Einladung öffnen',
    openMeeshy: 'Meeshy öffnen',
    personOnMeeshy: (person) => `${person} auf Meeshy`,
    openProfile: 'Profil öffnen',
    contentBy: {
      POST: (author) => `Beitrag von ${author}`,
      REEL: (author) => `Reel von ${author}`,
      STORY: (author) => `Story von ${author}`,
      STATUS: (author) => `Stimmung von ${author}`,
    },
    contentPromise: 'Auf Meeshy ansehen, in deiner Sprache.',
    openContent: 'Auf Meeshy ansehen',
    mediaNature: { image: 'Foto', video: 'Video', audio: 'Audio' },
  },
  it: {
    locale: 'it_IT',
    dir: 'ltr',
    hostInvitesTo: (host, title) => `${host} ti invita a «${title}»`,
    hostInvites: (host) => `${host} ti invita su Meeshy`,
    joinTitle: (title) => `Unisciti a «${title}» su Meeshy`,
    genericTitle: 'Meeshy — la messaggistica che traduce',
    invitationPromise: 'Scrivi nella tua lingua, leggi nella tua — senza account, senza installare nulla.',
    genericPromise: 'Scrivi nella tua lingua, leggi nella tua: Meeshy traduce ogni messaggio in tempo reale.',
    imageAlt: 'Meeshy — ognuno scrive nella sua lingua e legge nella sua',
    openInvitation: 'Apri l’invito',
    openMeeshy: 'Apri Meeshy',
    personOnMeeshy: (person) => `${person} su Meeshy`,
    openProfile: 'Apri il profilo',
    contentBy: {
      POST: (author) => `Post di ${author}`,
      REEL: (author) => `Reel di ${author}`,
      STORY: (author) => `Storia di ${author}`,
      STATUS: (author) => `Umore di ${author}`,
    },
    contentPromise: 'Guardalo su Meeshy, nella tua lingua.',
    openContent: 'Vedi su Meeshy',
    mediaNature: { image: 'Foto', video: 'Video', audio: 'Audio' },
  },
  ar: {
    locale: 'ar_AR',
    dir: 'rtl',
    hostInvitesTo: (host, title) => `${host} يدعوك إلى «${title}»`,
    hostInvites: (host) => `${host} يدعوك إلى Meeshy`,
    joinTitle: (title) => `انضم إلى «${title}» على Meeshy`,
    genericTitle: 'Meeshy — المراسلة التي تترجم',
    invitationPromise: 'اكتب بلغتك واقرأ بلغتك — بلا حساب ولا تثبيت.',
    genericPromise: 'اكتب بلغتك واقرأ بلغتك: يترجم Meeshy كل رسالة فورًا.',
    imageAlt: 'Meeshy — يكتب كلٌّ بلغته ويقرأ بلغته',
    openInvitation: 'افتح الدعوة',
    openMeeshy: 'افتح Meeshy',
    personOnMeeshy: (person) => `${person} على Meeshy`,
    openProfile: 'افتح الملف الشخصي',
    contentBy: {
      POST: (author) => `منشور ${author}`,
      REEL: (author) => `ريل ${author}`,
      STORY: (author) => `قصة ${author}`,
      STATUS: (author) => `مزاج ${author}`,
    },
    contentPromise: 'شاهده على Meeshy بلغتك.',
    openContent: 'اعرض على Meeshy',
    mediaNature: { image: 'صورة', video: 'فيديو', audio: 'صوت' },
  },
};

/** La langue du catalogue qu'un code désigne — par son sous-tag primaire (`pt-BR` ⇒ `pt`). */
export function unfurlLanguageOf(code: string | null | undefined): UnfurlLanguage | null {
  const primary = code?.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return UNFURL_LANGUAGES.find((language) => language === primary) ?? null;
}
