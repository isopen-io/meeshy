import type { SendPayload } from '@/lib/send/send-sheet-plan';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

/**
 * CE QU'UNE AUTRE APPLICATION NOUS PARTAGE (#8884) — les trois morceaux que le
 * système remet, que ce soit le `share_target` d'une PWA (service worker,
 * `public/sw-share-target.js`) ou l'intent `SEND` de la coque Android
 * (`MeeshyShareIntentPlugin.java`). Les deux entrées convergent ICI, puis sur
 * la même feuille d'envoi : `payloadOfIncomingShare` est le SEUL endroit qui
 * décide ce que ce contenu devient.
 */
export type IncomingShare = {
  readonly files: readonly File[];
  readonly text: string;
  readonly title: string;
  readonly url: string;
};

/**
 * TOUT FICHIER NON VIDE (D9, #10949) — image, vidéo, son, document. Le système
 * ne filtre pas toujours ; ce qu'on écarte ici, le site commun aux deux
 * entrées, ce sont les fichiers VIDES, qu'aucun envoi ne sait porter.
 */
const isShareableFile = (file: File): boolean => file.size > 0;

const HTTP_URL = /https?:\/\/[^\s<>"']+/i;

const isHttpUrl = (candidate: string): boolean => /^https?:\/\/\S+$/i.test(candidate);

const withoutOccurrences = (text: string, fragment: string): string => text.split(fragment).join(' ').replace(/\s+/g, ' ').trim();

/** Le texte d'un partage, son adresse sortie à part. */
function textOf(share: IncomingShare): { readonly text: string; readonly link: string | null } {
  const given = share.url.trim();
  const body = share.text.trim() === '' ? share.title.trim() : share.text.trim();
  const link = isHttpUrl(given) ? given : (HTTP_URL.exec(body)?.[0] ?? null);
  const stray = given !== '' && !isHttpUrl(given) ? given : '';
  const text = [link === null ? body : withoutOccurrences(body, link), stray].filter((part) => part !== '').join(' ');
  return { text, link };
}

/**
 * Des fichiers d'abord : ils sont ce que l'utilisateur a choisi de partager.
 * Sans fichier, un texte avec son adresse — l'adresse sortie du texte, sinon
 * le plan la poserait deux fois. Rien d'exploitable : `null`, et aucun écran
 * ne s'ouvre pour un partage vide.
 */
export function payloadOfIncomingShare(share: IncomingShare): SendPayload | null {
  const files = share.files.filter(isShareableFile);
  if (files.length > 0) return { kind: 'files', files };
  const { text, link } = textOf(share);
  if (link === null) return text === '' ? null : { kind: 'text', text };
  return { kind: 'text', text, url: link };
}

/**
 * La demande que l'écran de partage reçoit : toujours « envoyer » (ce n'est
 * pas un message qu'on transfère). Le texte joint à des FICHIERS devient leur
 * légende (D9) ; « Plus d'options… » quand le partage porte une adresse.
 */
export function requestOfIncomingShare(share: IncomingShare): SendSheetRequest | null {
  const payload = payloadOfIncomingShare(share);
  if (payload === null) return null;
  if (payload.kind === 'files') {
    const { text, link } = textOf(share);
    const caption = [text, link ?? ''].filter((part) => part !== '').join('\n');
    return { intent: 'share', payload, ...(caption === '' ? {} : { caption }) };
  }
  return { intent: 'share', payload, ...(payload.kind === 'text' && payload.url !== undefined ? { moreOptions: { url: payload.url } } : {}) };
}
