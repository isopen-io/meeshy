/**
 * L'alerte de la sauvegarde nocturne (#9668) — UN texte, deux porteurs : la
 * notification de chaque ADMIN et BIGBOSS (titre + corps) et l'e-mail au
 * compte BIGBOSS (même titre en sujet, même corps, plus le lien de la
 * supervision). Les deux disent la même chose parce qu'ils viennent d'ici.
 *
 * Quatre cas : un échec (sa raison et la date de la dernière réussite), une
 * sauvegarde vieillie de plus de 26 h, aucun verdict, et le retour au vert.
 * Les dates se disent à l'heure de Paris, celle du calendrier de la sauvegarde.
 *
 * Composé hors d'`EmailService` (budget) : ce module rend le sujet, le HTML et
 * le texte ; le service fournit ses styles, son pied de page et l'adresse.
 *
 * @module services/email/backup-alert-email
 */
import type { BackupAlertMessage } from '../admin/backup-alert';
import { BACKUP_TIME_ZONE } from '../admin/backup-status';
import { formatInTimeZone } from '../../utils/time-zone-format';

type Lang = 'fr' | 'en' | 'es' | 'pt' | 'it' | 'de';
type Kind = BackupAlertMessage['kind'];

type Copy = {
  readonly title: Readonly<Record<Kind, string>>;
  readonly body: Readonly<Record<Kind, string>>;
  readonly never: string;
  readonly unknownReason: string;
  readonly zone: string;
  readonly button: string;
  readonly greeting: string;
  readonly locale: string;
};

const COPY: Readonly<Record<Lang, Copy>> = {
  fr: {
    title: {
      failed: 'Sauvegarde de la production en échec',
      stale: 'Aucune sauvegarde récente de la production',
      missing: 'Sauvegarde de la production : aucun verdict',
      recovered: 'Sauvegarde de la production rétablie',
    },
    body: {
      failed: 'La sauvegarde de cette nuit a échoué : {reason}. Dernière sauvegarde réussie : {last}.',
      stale: 'La dernière sauvegarde réussie date du {last}, il y a plus de 26 heures : la sauvegarde de minuit ne s’est pas lancée ou n’a rien publié.',
      missing: 'La sauvegarde nocturne n’a publié aucun verdict : elle ne s’est jamais lancée, ou son dossier de verdict n’est pas monté dans la passerelle.',
      recovered: 'La sauvegarde de la production a de nouveau réussi, le {last}.',
    },
    never: 'aucune',
    unknownReason: 'raison inconnue',
    zone: 'heure de Paris',
    button: 'Ouvrir la supervision',
    greeting: 'Bonjour',
    locale: 'fr-FR',
  },
  en: {
    title: {
      failed: 'Production backup failed',
      stale: 'No recent production backup',
      missing: 'Production backup: no verdict',
      recovered: 'Production backup restored',
    },
    body: {
      failed: 'Last night’s backup failed: {reason}. Last successful backup: {last}.',
      stale: 'The last successful backup dates from {last}, more than 26 hours ago: the midnight backup did not start or published nothing.',
      missing: 'The nightly backup has published no verdict: it never started, or its verdict folder is not mounted in the gateway.',
      recovered: 'The production backup succeeded again, on {last}.',
    },
    never: 'none',
    unknownReason: 'unknown reason',
    zone: 'Paris time',
    button: 'Open monitoring',
    greeting: 'Hello',
    locale: 'en-US',
  },
  es: {
    title: {
      failed: 'Copia de seguridad de producción fallida',
      stale: 'Ninguna copia de seguridad reciente de producción',
      missing: 'Copia de seguridad de producción: sin veredicto',
      recovered: 'Copia de seguridad de producción restablecida',
    },
    body: {
      failed: 'La copia de seguridad de esta noche ha fallado: {reason}. Última copia correcta: {last}.',
      stale: 'La última copia correcta es del {last}, hace más de 26 horas: la copia de medianoche no se lanzó o no publicó nada.',
      missing: 'La copia nocturna no ha publicado ningún veredicto: nunca se lanzó, o su carpeta de veredicto no está montada en la pasarela.',
      recovered: 'La copia de seguridad de producción ha vuelto a funcionar, el {last}.',
    },
    never: 'ninguna',
    unknownReason: 'motivo desconocido',
    zone: 'hora de París',
    button: 'Abrir la supervisión',
    greeting: 'Hola',
    locale: 'es-ES',
  },
  pt: {
    title: {
      failed: 'Backup da produção falhou',
      stale: 'Nenhum backup recente da produção',
      missing: 'Backup da produção: sem veredito',
      recovered: 'Backup da produção restabelecido',
    },
    body: {
      failed: 'O backup desta noite falhou: {reason}. Último backup bem-sucedido: {last}.',
      stale: 'O último backup bem-sucedido é de {last}, há mais de 26 horas: o backup da meia-noite não foi iniciado ou não publicou nada.',
      missing: 'O backup noturno não publicou nenhum veredito: nunca foi iniciado, ou a pasta do veredito não está montada no gateway.',
      recovered: 'O backup da produção voltou a funcionar, em {last}.',
    },
    never: 'nenhum',
    unknownReason: 'motivo desconhecido',
    zone: 'horário de Paris',
    button: 'Abrir a supervisão',
    greeting: 'Olá',
    locale: 'pt-BR',
  },
  it: {
    title: {
      failed: 'Backup della produzione non riuscito',
      stale: 'Nessun backup recente della produzione',
      missing: 'Backup della produzione: nessun esito',
      recovered: 'Backup della produzione ripristinato',
    },
    body: {
      failed: 'Il backup di questa notte non è riuscito: {reason}. Ultimo backup riuscito: {last}.',
      stale: 'L’ultimo backup riuscito risale al {last}, più di 26 ore fa: il backup di mezzanotte non è partito o non ha pubblicato nulla.',
      missing: 'Il backup notturno non ha pubblicato alcun esito: non è mai partito, oppure la sua cartella non è montata nel gateway.',
      recovered: 'Il backup della produzione è di nuovo riuscito, il {last}.',
    },
    never: 'nessuno',
    unknownReason: 'motivo sconosciuto',
    zone: 'ora di Parigi',
    button: 'Apri la supervisione',
    greeting: 'Ciao',
    locale: 'it-IT',
  },
  de: {
    title: {
      failed: 'Sicherung der Produktion fehlgeschlagen',
      stale: 'Keine aktuelle Sicherung der Produktion',
      missing: 'Sicherung der Produktion: kein Ergebnis',
      recovered: 'Sicherung der Produktion wiederhergestellt',
    },
    body: {
      failed: 'Die Sicherung dieser Nacht ist fehlgeschlagen: {reason}. Letzte erfolgreiche Sicherung: {last}.',
      stale: 'Die letzte erfolgreiche Sicherung stammt vom {last}, vor mehr als 26 Stunden: Die Mitternachtssicherung ist nicht gestartet oder hat nichts veröffentlicht.',
      missing: 'Die nächtliche Sicherung hat kein Ergebnis veröffentlicht: Sie ist nie gestartet, oder ihr Ergebnisordner ist nicht im Gateway eingebunden.',
      recovered: 'Die Sicherung der Produktion ist wieder gelungen, am {last}.',
    },
    never: 'keine',
    unknownReason: 'unbekannter Grund',
    zone: 'Pariser Zeit',
    button: 'Überwachung öffnen',
    greeting: 'Hallo',
    locale: 'de-DE',
  },
};

const langOf = (language: string | undefined): Lang => {
  const short = (language ?? '').slice(0, 2).toLowerCase();
  return (short in COPY ? short : 'en') as Lang;
};

const lastSuccessText = (copy: Copy, lastSuccessAt: string | null): string =>
  lastSuccessAt === null
    ? copy.never
    : `${formatInTimeZone(new Date(lastSuccessAt), copy.locale, BACKUP_TIME_ZONE, { dateStyle: 'long', timeStyle: 'short' })} (${copy.zone})`;

/** Le titre et le corps, dans la langue du destinataire — la notification les sert tels quels. */
export function backupAlertText(message: BackupAlertMessage, language: string | undefined): { title: string; body: string } {
  const copy = COPY[langOf(language)];
  const body = copy.body[message.kind]
    .replace('{reason}', message.reason?.trim() || copy.unknownReason)
    .replace('{last}', lastSuccessText(copy, message.lastSuccessAt));
  return { title: copy.title[message.kind], body };
}

export type BackupAlertEmailData = {
  readonly to: string;
  readonly name: string;
  readonly language?: string;
  readonly message: BackupAlertMessage;
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function composeBackupAlertEmail(
  data: BackupAlertEmailData,
  frame: { readonly styles: string; readonly footerHtml: string; readonly footerText: string; readonly monitoringUrl: string },
): { subject: string; html: string; text: string } {
  const lang = langOf(data.language);
  const copy = COPY[lang];
  const { title, body } = backupAlertText(data.message, lang);
  const recovered = data.message.kind === 'recovered';
  const header = recovered ? 'background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%)' : 'background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)';
  const url = escapeHtml(frame.monitoringUrl);

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${frame.styles}</style></head><body><div class="container"><div class="header" style="${header}"><h1>${escapeHtml(title)}</h1></div><div class="content"><p>${copy.greeting} <strong>${escapeHtml(data.name)}</strong>,</p><div class="${recovered ? 'success' : 'warning'}">${escapeHtml(body)}</div><div style="text-align:center"><a href="${url}" class="button">${copy.button}</a></div><p class="link-text" style="word-break:break-all;font-size:14px">${url}</p></div><div class="footer">${frame.footerHtml}</div></div></body></html>`;
  const text = `${title}\n\n${copy.greeting} ${data.name},\n\n${body}\n\n${copy.button} : ${frame.monitoringUrl}\n\n${frame.footerText}`;

  return { subject: `${title} - Meeshy`, html, text };
}
