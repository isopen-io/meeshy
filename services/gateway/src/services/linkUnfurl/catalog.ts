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
  },
};

/** La langue du catalogue qu'un code désigne — par son sous-tag primaire (`pt-BR` ⇒ `pt`). */
export function unfurlLanguageOf(code: string | null | undefined): UnfurlLanguage | null {
  const primary = code?.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return UNFURL_LANGUAGES.find((language) => language === primary) ?? null;
}
