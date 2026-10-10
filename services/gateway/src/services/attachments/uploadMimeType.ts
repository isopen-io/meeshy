import { canonicalMediaMimeType } from '@meeshy/shared/utils/media-mime-type';

import { matchesAudioSignature } from './ContentSignature';

/**
 * LE TYPE SOUS LEQUEL UN TÉLÉVERSEMENT EST ADMIS (#9693) — partagé par la
 * route multipart et le chemin TUS, pour que les deux ne divergent pas.
 *
 * Un alias (`audio/x-wav`) se ramène au nom accepté ; un type générique se
 * déduit de l'extension SEULEMENT si les octets de tête portent un conteneur
 * média connu. Sans cette preuve, la déclaration d'origine reste : un fichier
 * mal nommé n'est jamais refusé là où il était accepté comme fichier.
 */
export function admittedUploadMimeType(input: { readonly declared: string; readonly fileName: string; readonly head: Buffer }): string {
  const canonical = canonicalMediaMimeType({ mimeType: input.declared, fileName: input.fileName });
  if (canonical === input.declared) return input.declared;
  return matchesAudioSignature(input.head) ? canonical : input.declared;
}

export type MediaStreamKinds = { readonly video: boolean; readonly audio: boolean };

const essenceOf = (mimeType: string): string => (mimeType.split(';')[0] ?? '').trim().toLowerCase();

/** Un `.mp4` n'a qu'un type système, `video/mp4`, qu'il porte une image ou non. */
export const mayBeAudioOnlyContainer = (mimeType: string): boolean => essenceOf(mimeType) === 'video/mp4';

/**
 * Un MP4 sans piste vidéo est un SON (#9693) : déclaré `video/mp4`, il
 * montait une vignette noire et un lecteur vidéo vide sur tous les clients.
 */
export function audioOnlyContainerMimeType(mimeType: string, streams: MediaStreamKinds | null): string {
  if (!mayBeAudioOnlyContainer(mimeType) || streams === null) return mimeType;
  return !streams.video && streams.audio ? 'audio/mp4' : mimeType;
}
