/**
 * Reniflement de signature (magic bytes) — vérifie le CONTENU réel d'un
 * fichier plutôt que le `Content-Type` déclaré par le client.
 *
 * Contexte (task-1-fix-round-1) : l'exemption audio de la boucle
 * d'autorisation anonyme (`routes/attachments/upload.ts`) se fiait
 * uniquement au `mimeType` déclaré par le client, sans jamais regarder les
 * octets — un PDF déclaré `audio/webm` passait tel quel. Ce module ferme ce
 * contournement (et le même défaut, préexistant, côté image/fichier) sans
 * ajouter de dépendance de sniffing (`file-type`, `mmmagic` : absentes de ce
 * dépôt) — une reconnaissance de signatures en tête de fichier suffit et
 * reste testable.
 *
 * Ne PAS confondre avec `getAttachmentType` (packages/shared/types/attachment) :
 * cette fonction classe par DÉCLARATION (mimeType/extension) pour le pipeline
 * de traitement (thumbnails, limites de taille…) une fois le fichier admis.
 * Les fonctions ci-dessous vérifient les OCTETS pour décider si une
 * déclaration mérite d'être crue — rôles différents, ne pas fusionner.
 */

function startsWithBytes(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function startsWithAscii(buffer: Buffer, ascii: string, offset = 0): boolean {
  if (buffer.length < offset + ascii.length) return false;
  return buffer.toString('latin1', offset, offset + ascii.length) === ascii;
}

/**
 * Conteneurs audio réellement produits par les clients Meeshy pour un
 * message vocal, établis à partir du code (pas d'une liste générique) :
 *
 * - Web `MediaRecorder` (`apps/web/components/v2/AudioPostComposer.tsx`,
 *   `apps/web/hooks/use-voice-recording.ts`, `AudioRecorderCard.tsx`,
 *   `AudioRecorderWithEffects.tsx`) : essaie `audio/mp4`, `audio/webm`
 *   (`;codecs=opus` ou générique), `audio/ogg` (`;codecs=opus` ou générique),
 *   dans cet ordre selon `MediaRecorder.isTypeSupported` — donc en pratique
 *   WebM/EBML (Chrome, Firefox, Edge, Brave) ou MP4/ftyp (Safari), Ogg en
 *   repli.
 * - iOS `AVAudioRecorder` (`AudioRecordingProviding.swift`, codec `.aac` par
 *   défaut — le seul actif en production) : conteneur M4A, soit MP4/ftyp
 *   également, labellisé `audio/mp4`.
 *
 * Ajoutés en complément car déjà acceptés par `isAudioMimeType`
 * (`packages/shared/types/attachment.ts` → `ACCEPTED_MIME_TYPES.AUDIO`) et
 * trivialement identifiables par signature, pour ne pas régresser un vocal
 * légitime dans ce format : WAV (RIFF/WAVE), MP3 (tag ID3v2 ou frame sync
 * MPEG — la plupart des encodeurs n'apposent pas systématiquement de tag),
 * AAC brut/ADTS.
 *
 * ⚠️ RÉSERVE — codec Opus iOS (`AudioCodec.opus`, conteneur CAF, MIME
 * `audio/opus`) : dormant, non activé en production (cf. commentaire de
 * `AudioRecordingProviding.swift` — « Until then the default stays .aac »)
 * et absent de `isAudioMimeType`. Aucune signature CAF n'est donc fournie
 * ici : ce format n'atteint pas ce chemin aujourd'hui, et `isAudioMimeType`
 * le rejetterait de toute façon en amont. À couvrir si/quand ce codec
 * s'active.
 */
export function matchesAudioSignature(buffer: Buffer): boolean {
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return true; // WebM/Matroska (EBML)
  if (startsWithAscii(buffer, 'ftyp', 4)) return true; // MP4/M4A (ISO base media — ftyp box)
  if (startsWithAscii(buffer, 'OggS')) return true; // Ogg
  if (startsWithAscii(buffer, 'RIFF') && startsWithAscii(buffer, 'WAVE', 8)) return true; // WAV
  if (startsWithAscii(buffer, 'ID3')) return true; // MP3 (tag ID3v2)
  // MP3 sans tag ID3 / AAC brut (ADTS) : sync word 12 bits (0xFFE-0xFFF) en
  // tête de trame — 1er octet 0xFF, 3 bits de poids fort du 2e à 1.
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  return false;
}

/**
 * Signatures des formats acceptés par `isImageMimeType`
 * (`ACCEPTED_MIME_TYPES.IMAGE` : jpeg/jpg, png, gif, webp).
 */
export function matchesImageSignature(buffer: Buffer): boolean {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true; // PNG
  if (startsWithAscii(buffer, 'GIF87a') || startsWithAscii(buffer, 'GIF89a')) return true; // GIF
  if (startsWithAscii(buffer, 'RIFF') && startsWithAscii(buffer, 'WEBP', 8)) return true; // WEBP
  return false;
}
