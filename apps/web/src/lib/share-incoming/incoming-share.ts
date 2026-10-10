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
 * Les types que la feuille sait envoyer — ceux du `share_target`
 * (`share-target.ts`) et de l'intent-filter de la coque. Le système ne filtre
 * pas toujours (un `POST /share` peut porter n'importe quoi) : un fichier d'un
 * autre type est écarté ICI, le site commun aux deux entrées.
 */
const isShareableFile = (file: File): boolean => file.type.startsWith('image/') || file.type.startsWith('video/');

const HTTP_URL = /https?:\/\/[^\s<>"']+/i;

const isHttpUrl = (candidate: string): boolean => /^https?:\/\/\S+$/i.test(candidate);

const withoutOccurrences = (text: string, fragment: string): string => text.split(fragment).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Des fichiers d'abord : ils sont ce que l'utilisateur a choisi de partager, le
 * texte qui les accompagne n'est que leur légende, et la feuille offre sa
 * propre zone de légende. Sans fichier, un texte avec son adresse — l'adresse
 * sortie du texte, sinon `joinLines` (le plan d'envoi) la poserait deux fois.
 * Rien d'exploitable : `null`, et aucune feuille ne s'ouvre pour un partage vide.
 */
export function payloadOfIncomingShare(share: IncomingShare): SendPayload | null {
  const files = share.files.filter(isShareableFile);
  if (files.length > 0) return { kind: 'files', files };

  const given = share.url.trim();
  const body = share.text.trim() === '' ? share.title.trim() : share.text.trim();
  const link = isHttpUrl(given) ? given : (HTTP_URL.exec(body)?.[0] ?? null);
  const stray = given !== '' && !isHttpUrl(given) ? given : '';
  const text = [link === null ? body : withoutOccurrences(body, link), stray].filter((part) => part !== '').join(' ');

  if (link === null) return text === '' ? null : { kind: 'text', text };
  return { kind: 'text', text, url: link };
}

/**
 * La demande que la feuille d'envoi reçoit : toujours « partager » (ce n'est pas
 * un message qu'on transfère), avec « Plus d'options… » quand le partage porte
 * une adresse — la feuille système et « Copier le lien » ont alors un objet.
 */
export function requestOfIncomingShare(share: IncomingShare): SendSheetRequest | null {
  const payload = payloadOfIncomingShare(share);
  if (payload === null) return null;
  return { intent: 'share', payload, ...(payload.kind === 'text' && payload.url !== undefined ? { moreOptions: { url: payload.url } } : {}) };
}
