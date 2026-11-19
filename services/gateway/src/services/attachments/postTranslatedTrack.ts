/**
 * #19841 — la piste vocale traduite d'un post ou d'une story est une
 * URL-capacité, comme le fichier d'origine de son média : la route de fichiers
 * la sert sans identité. Sa clé porte donc un secret au moins aussi fort que
 * celui de l'original (`<nom>_<uuidv4>`) : 128 bits tirés à CHAQUE écriture,
 * `translated/post/<postMediaId>_<langue>_<jeton>.<ext>`.
 *
 * Une clé neuve par écriture ne désigne jamais d'autres octets : le cache d'un
 * an qu'elle reçoit ne fige plus une piste périmée. La piste qu'elle remplace
 * s'efface une fois la nouvelle inscrite ({@link supersededPostTrackUrls}).
 *
 * Toute autre clé sous `translated/post/` — l'ancienne forme devinable
 * `<postMediaId>_<langue>.<ext>` comprise — se refuse comme un fichier absent.
 */
import { randomBytes } from 'crypto';
import { storageKeyFromMediaUrl } from './mediaStorageKey';

const POST_TRACK_DIRECTORY = 'translated/post/';
const SERVABLE_POST_TRACK = /^translated\/post\/[0-9a-f]{24}_[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?_[0-9a-f]{32}\.[a-z0-9]+$/;

type TrackReference = { readonly url?: string };

export function postTrackFilename(input: { readonly postMediaId: string; readonly language: string; readonly extension: string }): string {
  return `post/${input.postMediaId}_${input.language}_${randomBytes(16).toString('hex')}.${input.extension}`;
}

export function isRefusedPostTrackKey(storageKey: string): boolean {
  return storageKey.startsWith(POST_TRACK_DIRECTORY) && !SERVABLE_POST_TRACK.test(storageKey);
}

function postTrackUrl(url: string | undefined): string | null {
  const key = url === undefined ? null : storageKeyFromMediaUrl(url);
  return key !== null && key.startsWith(POST_TRACK_DIRECTORY) && !key.split('/').includes('..') ? (url ?? null) : null;
}

/** Les adresses de pistes de post qu'une carte `translations` référence. */
export function postTrackUrls(translations: Readonly<Record<string, TrackReference>> | null | undefined): readonly string[] {
  return Object.values(translations ?? {}).flatMap((track) => {
    const url = postTrackUrl(track?.url);
    return url === null ? [] : [url];
  });
}

/**
 * Les pistes de post que l'inscription vient de remplacer, langue par langue :
 * l'ancienne adresse quand la nouvelle en diffère. Une entrée dont la piste
 * n'a pas pu s'écrire garde l'adresse précédente (`mergeTranslationEntries`),
 * donc rien ne s'efface pour elle. Seul `translated/post/` est rendu.
 */
export function supersededPostTrackUrls(
  existing: Readonly<Record<string, TrackReference>>,
  inscribed: Readonly<Record<string, TrackReference>>,
  languages: readonly string[]
): readonly string[] {
  return languages.flatMap((language) => {
    const previous = postTrackUrl(existing[language]?.url);
    const next = inscribed[language]?.url;
    return previous !== null && next !== undefined && next !== previous ? [previous] : [];
  });
}
