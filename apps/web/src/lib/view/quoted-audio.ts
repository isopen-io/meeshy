import type { Message } from '@/lib/api/types';

import { electAudio } from './media';
import { kindOf } from './message';
import { quotedIsProtected } from './quoted-protection';
import { representativeOf } from './quoted-preview';

/**
 * LA ZONE LECTURE D'UNE CITATION (#8320, directive porteur du 2026-09-27) —
 * miroir de `QuotedAudioPlayback` côté iOS.
 *
 * Quand une réponse cite un AUDIO, la citation se partage en deux zones
 * exclusives : la lecture joue l'audio cité SUR PLACE, le reste ramène au
 * message d'origine. Cette fonction est le SITE UNIQUE de la question « la
 * zone lecture a-t-elle quelque chose à jouer, et QUOI ? » — la peau
 * (`QuoteAudioPlay`, `components/quote-audio-play.tsx`) dessine, elle ne
 * décide pas.
 *
 * `null` dès qu'il n'y a rien d'HONNÊTE à jouer — et la citation garde alors
 * son placeholder, sans bouton qui mentirait :
 *  - le message cité est SUPPRIMÉ (#7927 — la passerelle vide déjà ses
 *    pièces, le refus est reposé ici, fail-closed) ;
 *  - il est PROTÉGÉ, au niveau du MESSAGE ou de la PIÈCE (vue unique,
 *    flouté, chiffré) : le fichier EST le secret ;
 *  - il a EXPIRÉ : un éphémère se lit dans le fil jusqu'à son terme, jamais
 *    au-delà ;
 *  - la pièce n'est pas un audio, ou n'a pas de fichier servi.
 *
 * LA PISTE suit le Prisme audio du vocal d'origine (`electAudio`, CLAUDE.md
 * § Prisme, cycle 128) : la transcription servie élit la langue, la piste
 * suit — jamais une seconde descente.
 */
export type QuotedAudio = {
  readonly attachmentId: string;
  readonly url: string;
  readonly language: string;
  /** La durée de la PISTE élue (une piste traduite n'a pas celle de l'original) ; `null` si inconnue. */
  readonly durationMs: number | null;
};

type QuotedAudioSource = Pick<
  Message,
  'attachments' | 'originalLanguage' | 'isViewOnce' | 'isBlurred' | 'isEncrypted' | 'effectFlags'
> &
  Partial<Pick<Message, 'deletedAt' | 'expiresAt'>>;

const hasExpired = (expiresAt: Date | string | undefined, now: Date): boolean => {
  if (expiresAt === undefined || expiresAt === null) return false;
  const at = new Date(expiresAt).getTime();
  return Number.isFinite(at) && at <= now.getTime();
};

export function quotedAudioOf(params: {
  readonly quoted: QuotedAudioSource;
  readonly readerLanguages: readonly string[];
  readonly now: Date;
}): QuotedAudio | null {
  const { quoted, readerLanguages, now } = params;
  if (quoted.deletedAt !== undefined && quoted.deletedAt !== null) return null;
  if (quotedIsProtected(quoted) || hasExpired(quoted.expiresAt, now)) return null;
  const piece = representativeOf(quoted)?.attachment;
  if (piece === undefined || kindOf(piece) !== 'audio' || quotedIsProtected(piece)) return null;
  if (piece.fileUrl === undefined || piece.fileUrl.trim() === '') return null;

  const { track } = electAudio({
    attachment: piece,
    readerLanguages,
    fallbackLanguage: quoted.originalLanguage,
  });
  const durationMs = track.durationMs ?? (track.translated ? undefined : piece.duration);
  return {
    attachmentId: piece.id,
    url: track.url,
    language: track.language,
    durationMs: durationMs ?? null,
  };
}
