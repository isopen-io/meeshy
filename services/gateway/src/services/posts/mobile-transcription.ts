import type { MobileTranscription } from '../../routes/posts/types';

/**
 * **LA GRAPHIE DU FIL N'EST PAS LA GRAPHIE DU MAGASIN** — audit de cohérence
 * iOS ↔ passerelle, 2026-09-11.
 *
 * ## Le défaut
 *
 * `POST /posts` et `POST /posts/:id/comments` acceptent une transcription faite
 * SUR L'APPAREIL (`MobileTranscriptionSchema`, `routes/posts/types.ts`). Sa
 * graphie est celle de Speech d'Apple, que le SDK recopie telle quelle :
 * `duration_ms`, `segments[].start` / `.end` en **secondes**, `speaker_id`.
 *
 * Les deux services la persistaient **verbatim** dans `PostMedia.transcription`
 * (`{ ...data.mobileTranscription, segments, source: 'mobile' }`). Or ce
 * document a une graphie CANONIQUE, et ce n'est pas celle-là :
 * `attachmentTranscriptionSchema` (`packages/shared/utils/attachment-validators.ts`)
 * déclare `durationMs`, `segments[].startMs` / `.endMs` en **millisecondes**,
 * `speakerId` — c'est la forme qu'écrit le chemin serveur
 * (`PostAudioService.handleTranscriptionReady`) et la seule que les lecteurs
 * connaissent.
 *
 * Conséquence mesurable côté iOS : `TranscriptionSegment`
 * (`MeeshySDK/Sockets/MessageSocketManager.swift`) accepte `startMs`/`endMs` ou
 * `startTime`/`endTime` — jamais `start`/`end`. Un audio transcrit sur
 * l'appareil rendait donc son TEXTE, et des segments **sans aucun
 * horodatage** : pas de surlignage au fil de la lecture, pas de saut à un
 * segment, et une durée totale lue à `0`. Le même enregistrement transcrit par
 * Whisper côté serveur s'affichait, lui, complètement.
 *
 * ## Pourquoi ça n'avait rien cassé de visible
 *
 * Le texte, lui, porte le même nom des deux côtés. Ce qui se perd est
 * exactement ce qui ne se voit pas quand on regarde si « la transcription
 * marche » : le temps.
 *
 * Le chemin TUS (`routes/uploads/tus-handler.ts`) avait tranché autrement et
 * l'écrit noir sur blanc — « la forme validée est celle que le translator lit
 * (`startMs`/`endMs`), pas celle de `POST /posts` […] : c'est le lecteur final
 * qui dicte la forme ». La règle est juste ; elle n'avait simplement jamais été
 * appliquée ICI, où le lecteur final veut la même chose.
 *
 * ## Ce que cette fonction garantit
 *
 * Sa sortie passe `parseAttachmentTranscription` — c'est le témoin, pas une
 * intention. Elle est le SITE UNIQUE de la conversion : deux copies auraient
 * divergé sur l'arrondi, sur la valeur de `confidence` absente, ou sur l'une
 * des clés, et le défaut serait revenu par la moitié non corrigée.
 */
export function attachmentTranscriptionFromMobile(
  mobile: MobileTranscription,
): Record<string, unknown> {
  return {
    // Même discriminateur que le chemin serveur : sans lui, le rendu doit
    // l'inférer du `mimeType`, et les deux sources ne se relisent pas pareil.
    type: 'audio',
    text: mobile.text,
    language: mobile.language,
    // `confidence` est OBLIGATOIRE dans la forme canonique et FACULTATIF sur le
    // fil. Le repli est celui du chemin serveur (`?? 0`) — un second repli
    // aurait fait dire deux choses différentes à la même absence.
    confidence: mobile.confidence ?? 0,
    source: 'mobile',
    // PAS de `model`. Le fil ne dit pas quel moteur a transcrit ; le déduire
    // ici (« apple_speech ») serait le serveur qui INVENTE un fait que sa
    // source ne porte pas — et Android enverra la même forme avec un autre
    // moteur. `source: 'mobile'` dit tout ce qui est su.
    ...(mobile.duration_ms === undefined ? {} : { durationMs: mobile.duration_ms }),
    segments: (mobile.segments ?? []).map((segment) => ({
      text: segment.text,
      // SECONDES → MILLISECONDES. L'unité est le vrai piège : `start: 12.4`
      // relu comme des millisecondes donne un segment de 12 ms au lieu de
      // 12,4 s — un décalage qui a l'air d'un bug de lecteur, pas de format.
      startMs: secondesEnMillisecondes(segment.start),
      endMs: secondesEnMillisecondes(segment.end),
      ...(segment.speaker_id === undefined ? {} : { speakerId: segment.speaker_id }),
    })),
  };
}

/**
 * `startMs`/`endMs` sont des NOMBRES canoniques bornés à `nonnegative` ; un
 * horodatage manquant vaut 0 plutôt que `undefined`, parce que le schéma les
 * exige tous les deux et qu'un segment sans début n'est pas un segment.
 */
function secondesEnMillisecondes(secondes: number | undefined): number {
  if (secondes === undefined || !Number.isFinite(secondes) || secondes < 0) return 0;
  return Math.round(secondes * 1000);
}
