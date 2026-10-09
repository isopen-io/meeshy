/**
 * Le type MIME d'un MÉDIA tel qu'on doit le DÉCLARER, quel que soit le nom que
 * le système d'exploitation lui a donné (#9693).
 *
 * Le type d'un `File` vient de l'OS, pas du fichier : Firefox sous Linux et la
 * WebView Android nomment un WAV `audio/x-wav`, d'autres `audio/wave` ou
 * `audio/vnd.wave` ; un MP3 sort parfois en `audio/x-mpeg` ; et un fichier que
 * l'OS ne reconnaît pas arrive SANS type (`''`, que le navigateur envoie en
 * `application/octet-stream`). Aucun de ces noms n'est dans
 * `ACCEPTED_MIME_TYPES.AUDIO` : la pièce était classée « fichier » — refusée
 * d'un commentaire, montrée sans lecteur, sans durée côté passerelle.
 *
 * Deux règles, et rien d'autre :
 * - un ALIAS connu se ramène au nom accepté (`audio/x-wav` → `audio/wav`) ;
 * - un type ABSENT ou GÉNÉRIQUE se déduit de l'extension, pour les seuls
 *   formats média que les trois clients lisent.
 * Tout autre type est rendu TEL QUEL, paramètres compris : une déclaration
 * précise n'est jamais réécrite d'après un nom de fichier.
 */
const AUDIO_ALIASES: Readonly<Record<string, string>> = {
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-pn-wav': 'audio/wav',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'audio/mpg': 'audio/mpeg',
  'audio/x-aac': 'audio/aac',
};

const GENERIC_TYPES: ReadonlySet<string> = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/unknown']);

const MEDIA_EXTENSION_TYPES: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
};

const essenceOf = (mimeType: string): string => (mimeType.split(';')[0] ?? '').trim().toLowerCase();

const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
};

export function canonicalMediaMimeType(input: {
  readonly mimeType: string | null | undefined;
  readonly fileName?: string | null | undefined;
}): string {
  const declared = input.mimeType ?? '';
  const essence = essenceOf(declared);
  const alias = AUDIO_ALIASES[essence];
  if (alias !== undefined) return alias;
  if (!GENERIC_TYPES.has(essence)) return declared;
  return MEDIA_EXTENSION_TYPES[extensionOf(input.fileName ?? '')] ?? declared;
}
