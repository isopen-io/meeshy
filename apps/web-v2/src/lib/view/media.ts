import { prismFor, resolveAudioTrack, servedTranscript, type Served, type ServedTrack } from '@/lib/api/prism';
import type { Attachment } from '@/lib/api/types';

/**
 * L'ÉLECTION D'UNE PIÈCE JOINTE (#5805) — la composition en DEUX temps que
 * `api/prism.ts` sépare volontairement : `servedTranscript` élit le TEXTE,
 * `resolveAudioTrack` REÇOIT sa langue pour élire la PISTE — jamais une
 * seconde descente (CLAUDE.md § Prisme, cycle 128 ; `tasks/lessons.md` § 284).
 *
 * DEUX FONCTIONS, PAS UNE (revue #5805). Le lot livrait un `electMedia` unique
 * que l'IMAGE appelait aussi : une image recevait donc une « piste audio
 * servie » dont l'`url` était… son propre fichier PNG, et le dépouillement
 * `transcriptTranslationTracks` tournait à chaque rendu de chaque image pour
 * une valeur jetée. Un nom qui promet une piste audio et rend un PNG est une
 * seconde langue pour la même chose (directive porteur 3b) ; trente écrans
 * copieraient l'appel qui la produit. La frontière est donc celle du CONTENU :
 * - `electDescription` — le TEXTE d'une pièce, et rien d'autre (image, fichier) ;
 * - `electAudio` — le texte ET la piste d'un VOCAL, d'UNE descente.
 */
export type MediaAttachment = Pick<Attachment, 'transcription' | 'translations' | 'alt' | 'originalName' | 'fileUrl'>;

type ElectionInput = {
  readonly attachment: MediaAttachment;
  readonly readerLanguages: readonly string[];
  /** Traduire (#5814) — une langue EXPLORÉE au rang 0, la MÊME insertion que le texte du message (`prismFor`). */
  readonly displayLanguage?: string | undefined;
  /** La langue de la pièce QUAND elle n'a pas de transcription — `message.originalLanguage`. */
  readonly fallbackLanguage: string;
};

/**
 * LE TEXTE SERVI D'UNE PIÈCE — `alt` d'une image, transcription d'un vocal.
 * C'est lui qui alimente `alt=`, `aria-label` et l'attribut `lang` (cycle 122 :
 * un résolveur n'a corrigé personne tant qu'on ne sait pas QUI l'affiche).
 */
export function electDescription(params: ElectionInput): Served {
  const { attachment, readerLanguages, displayLanguage, fallbackLanguage } = params;
  return servedTranscript({
    preferredLanguages: prismFor({ readerLanguages, displayLanguage }),
    attachment,
    fallbackLanguage,
  });
}

export type ElectedAudio = {
  /** La TRANSCRIPTION servie et sa langue. */
  readonly described: Served;
  /** La PISTE servie — TOUJOURS une piste (l'originale quand `translated === false`), jamais une URL fabriquée. */
  readonly track: ServedTrack;
};

/**
 * LE VOCAL : SON TEXTE ET SA PISTE, D'UNE SEULE DESCENTE.
 *
 * La piste est élue par la langue du TEXTE SERVI, jamais par une descente
 * parallèle : deux descentes serviraient « la réunion est déplacée » au-dessus
 * d'une piste espagnole — un défaut PIRE qu'une traduction absente, parce
 * qu'il a l'air d'une traduction ratée plutôt que d'une traduction manquante
 * (CLAUDE.md § Prisme, cycle 128).
 */
export function electAudio(params: ElectionInput): ElectedAudio {
  const { attachment, fallbackLanguage } = params;
  const described = electDescription(params);
  const track = resolveAudioTrack({
    servedLanguage: described.language,
    originalLanguage: attachment.transcription?.language ?? fallbackLanguage,
    originalUrl: attachment.fileUrl,
    translations: attachment.translations,
  });
  return { described, track };
}

/** La piste seule, sans ses métadonnées de service (`translated` retiré : la convention `null` le remplace). */
export type ElectedTrack = {
  readonly url: string;
  readonly language: string;
  readonly mimeType?: string;
  readonly durationMs?: number;
};

/**
 * LA PISTE SEULE, CONVENTION `null` = ORIGINAL (#5805) — miroir direct de
 * `AudioTrackLanguageResolver.url(for:)`
 * (`apps/ios/Meeshy/Features/Main/Models/AudioTrackLanguageResolver.swift:86-95`),
 * dont la forme Swift rend `nil` pour dire « joue le fichier original ».
 *
 * PROJECTION de `electAudio`, jamais une seconde loi : le widget du fil a
 * besoin des DEUX moitiés (le texte sous l'onde ET le fichier de l'`<audio>`)
 * et appelle donc `electAudio` ; cette forme étroite sert l'appelant qui n'a
 * qu'une PISTE à servir — une bannière de notification, un lecteur détaché de
 * sa transcription — et lui rend la convention que le résolveur iOS emploie,
 * plutôt qu'un `ServedTrack.translated` à tester à côté.
 */
export function electAudioTrack(
  attachment: MediaAttachment,
  preferredLanguages: readonly string[],
  opts?: { readonly displayLanguage?: string; readonly fallbackLanguage?: string },
): ElectedTrack | null {
  const { track } = electAudio({
    attachment,
    readerLanguages: preferredLanguages,
    fallbackLanguage: opts?.fallbackLanguage ?? attachment.transcription?.language ?? 'fr',
    displayLanguage: opts?.displayLanguage,
  });
  if (!track.translated) return null;
  return {
    url: track.url,
    language: track.language,
    ...(track.mimeType !== undefined ? { mimeType: track.mimeType } : {}),
    ...(track.durationMs !== undefined ? { durationMs: track.durationMs } : {}),
  };
}
