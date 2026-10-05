/**
 * L'e-mail « code de connexion + lien » (#8033) — celui que reçoit un compte
 * DÉJÀ vérifié qui se connecte par la porte « e-mail seul ».
 *
 * L'e-mail de vérification souhaite la bienvenue et remercie de l'inscription :
 * l'envoyer à quelqu'un qui est là depuis un an serait un mensonge. Même paire
 * (six chiffres + lien `/auth/verify-email`), autre mot.
 *
 * Composé hors d'`EmailService` (hors budget) : ce module rend le sujet, le
 * HTML et le texte ; le service fournit ses styles et son pied de page.
 *
 * @module services/email/login-code-email
 */

type Lang = 'fr' | 'en' | 'es' | 'pt' | 'it' | 'de';

type LoginCodeCopy = {
  readonly subject: string;
  readonly title: string;
  readonly greeting: string;
  readonly intro: string;
  readonly codeLabel: string;
  readonly button: string;
  readonly expiry: string;
  readonly notYou: string;
};

const COPY: Record<Lang, LoginCodeCopy> = {
  fr: {
    subject: 'Votre code de connexion - Meeshy',
    title: 'Connexion à Meeshy',
    greeting: 'Bonjour',
    intro: 'Voici votre code de connexion. Saisissez-le dans l’application, ou touchez le bouton :',
    codeLabel: 'Votre code',
    button: 'Me connecter',
    expiry: 'Ce code et ce lien expirent dans {minutes} minutes et ne servent qu’une fois.',
    notYou: 'Vous n’avez rien demandé ? Ignorez cet e-mail : personne ne peut se connecter sans ce code.',
  },
  en: {
    subject: 'Your sign-in code - Meeshy',
    title: 'Sign in to Meeshy',
    greeting: 'Hello',
    intro: 'Here is your sign-in code. Enter it in the app, or tap the button:',
    codeLabel: 'Your code',
    button: 'Sign me in',
    expiry: 'This code and link expire in {minutes} minutes and work only once.',
    notYou: 'Didn’t ask for this? Ignore this email: nobody can sign in without this code.',
  },
  es: {
    subject: 'Tu código de acceso - Meeshy',
    title: 'Iniciar sesión en Meeshy',
    greeting: 'Hola',
    intro: 'Este es tu código de acceso. Introdúcelo en la aplicación o pulsa el botón:',
    codeLabel: 'Tu código',
    button: 'Iniciar sesión',
    expiry: 'Este código y este enlace caducan en {minutes} minutos y solo sirven una vez.',
    notYou: '¿No lo has pedido? Ignora este correo: nadie puede entrar sin este código.',
  },
  pt: {
    subject: 'Seu código de acesso - Meeshy',
    title: 'Entrar no Meeshy',
    greeting: 'Olá',
    intro: 'Aqui está seu código de acesso. Digite-o no aplicativo ou toque no botão:',
    codeLabel: 'Seu código',
    button: 'Entrar',
    expiry: 'Este código e este link expiram em {minutes} minutos e funcionam uma única vez.',
    notYou: 'Não pediu nada? Ignore este e-mail: ninguém entra sem este código.',
  },
  it: {
    subject: 'Il tuo codice di accesso - Meeshy',
    title: 'Accedi a Meeshy',
    greeting: 'Ciao',
    intro: 'Ecco il tuo codice di accesso. Inseriscilo nell’app oppure tocca il pulsante:',
    codeLabel: 'Il tuo codice',
    button: 'Accedi',
    expiry: 'Questo codice e questo link scadono tra {minutes} minuti e valgono una sola volta.',
    notYou: 'Non l’hai chiesto tu? Ignora questa email: nessuno può accedere senza questo codice.',
  },
  de: {
    subject: 'Dein Anmeldecode - Meeshy',
    title: 'Bei Meeshy anmelden',
    greeting: 'Hallo',
    intro: 'Hier ist dein Anmeldecode. Gib ihn in der App ein oder tippe auf die Schaltfläche:',
    codeLabel: 'Dein Code',
    button: 'Anmelden',
    expiry: 'Dieser Code und dieser Link laufen in {minutes} Minuten ab und gelten nur einmal.',
    notYou: 'Nichts angefordert? Ignoriere diese E-Mail: Ohne diesen Code kann sich niemand anmelden.',
  },
};

const langOf = (language: string | undefined): Lang => {
  const short = (language ?? '').slice(0, 2).toLowerCase();
  return (short in COPY ? short : 'en') as Lang;
};

/** « Ce code et ce lien expirent dans N minutes… » — aussi servi à l'e-mail de vérification d'une paire courte. */
export function codeExpiryText(language: string | undefined, minutes: number): string {
  return COPY[langOf(language)].expiry.replace('{minutes}', String(minutes));
}

export type LoginCodeEmailData = {
  readonly to: string;
  readonly name: string;
  readonly code: string;
  readonly link: string;
  readonly expiryMinutes: number;
  readonly language?: string;
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function composeLoginCodeEmail(
  data: LoginCodeEmailData,
  frame: { readonly styles: string; readonly footerHtml: string; readonly footerText: string },
): { subject: string; html: string; text: string } {
  const lang = langOf(data.language);
  const c = COPY[lang];
  const expiry = codeExpiryText(lang, data.expiryMinutes);
  const name = escapeHtml(data.name);

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${frame.styles}</style></head><body><div class="container"><div class="header"><h1>${c.title}</h1></div><div class="content"><p>${c.greeting} <strong>${name}</strong>,</p><p>${c.intro}</p><div style="text-align:center;margin:20px 0"><p style="font-size:14px;color:#666;margin-bottom:8px">${c.codeLabel}</p><div style="display:inline-block;padding:12px 24px;background:#f4f4f5;border-radius:8px;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:monospace;color:#1e1b4b">${data.code}</div></div><div style="text-align:center"><a href="${data.link}" class="button">${c.button}</a></div><p class="link-text" style="word-break:break-all;font-size:14px">${data.link}</p><div class="info"><ul style="margin:10px 0;padding-left:20px"><li>${expiry}</li><li>${c.notYou}</li></ul></div></div><div class="footer">${frame.footerHtml}</div></div></body></html>`;
  const text = `${c.title}\n\n${c.greeting} ${data.name},\n\n${c.intro}\n\n${c.codeLabel}: ${data.code}\n\n${data.link}\n\n${expiry}\n\n${c.notYou}\n\n${frame.footerText}`;

  return { subject: c.subject, html, text };
}
