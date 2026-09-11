import { useState } from 'react';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import { resolveAudioTrack, servedTranscript } from '@/lib/api/prism';
import { kindOf, waveformOf } from '@/lib/view/message';
import { useAudioPlayback } from '@/lib/view/use-audio-playback';
import { READER_LOCALE } from '@/lib/reader';
import { MEDIA_GRID_MAX_WIDTH, TRANSCRIPT_TEXT_OPACITY } from '@/lib/reading-mode/metrics';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

/**
 * LES WIDGETS DE MÉDIA DU FIL (#5805) — SITE UNIQUE, partagé par `bubble.tsx`
 * et `focal-row.tsx` (rangée plate), extrait de `message-blocks.tsx`
 * (`Voice` :315-355, `Attachments` :357-421 avant ce lot — la RESPONSABILITÉ
 * change : « blocs de contenu d'un message » ≠ « widgets de média », que les
 * stories, le feed et les commentaires monteront aussi).
 *
 * UNE IMAGE et UN VOCAL, dans la langue du LECTEUR : l'`alt`/la transcription
 * descend le Prisme (`servedTranscript`, `api/prism.ts`) et la PISTE audio
 * élue suit la langue du TEXTE déjà servi — jamais une seconde descente
 * (CLAUDE.md § Prisme, cycle 128 ; `resolveAudioTrack`). Un seul vocal joue à
 * la fois (`useAudioPlayback` → `audioCoordinator`).
 *
 * HORS TRANCHE (issues compagnons, § 9 de la spécification #5805) : la
 * grille 2/3/4+ et son badge `+N`, la vidéo, la visionneuse plein écran, le
 * karaoké segment par segment et la vitesse, le carrousel multi-pistes — le
 * site est prêt à les recevoir, aucun ne les réclame ici.
 */

function ImageTile({
  attachment,
  languages,
  displayLanguage,
  fallbackLanguage,
}: {
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
}) {
  const preferredLanguages = displayLanguage === undefined ? languages : [displayLanguage, ...languages];
  const described = servedTranscript({ preferredLanguages, attachment, fallbackLanguage });
  const hasDimensions = attachment.width !== undefined && attachment.height !== undefined;
  const aspectRatio = hasDimensions ? `${attachment.width} / ${attachment.height}` : `${MEDIA_GRID_MAX_WIDTH} / 240`;
  // `lang` est ABSENT ssi la langue servie est celle du document — jamais un
  // attribut redondant sur du contenu déjà dans la langue de la page.
  const lang = described.language !== READER_LOCALE ? described.language : undefined;
  // L'ÉCHEC DE DÉCODAGE (`onError`) — `<img hidden>`, mais le glyphe et le
  // libellé SERVI restent (table des états, § 6 de la spécification #5805) :
  // le même repli d'accessibilité qu'une pièce SANS URL, jamais un silence.
  const [failed, setFailed] = useState(false);
  const showsFallbackLabel = attachment.fileUrl === '' || failed;

  return (
    <figure
      data-attachment={attachment.id}
      className="grid max-w-full place-items-center overflow-hidden rounded-media"
      style={{
        width: MEDIA_GRID_MAX_WIDTH,
        aspectRatio,
        // Jamais `bg-black/40` (valeur en dur, `targets/bulle.md` § 10) : un
        // fond dérivé de l'accent de la conversation, faible opacité.
        backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
      }}
      {...(showsFallbackLabel ? { role: 'img', 'aria-label': described.text } : {})}
    >
      {/* Le glyphe reste DERRIÈRE : fond de chargement ET repli d'erreur. */}
      <Glyph name="image" size={40} className="col-start-1 row-start-1 opacity-40" />
      {attachment.fileUrl === '' ? null : (
        <img
          data-attachment-image={attachment.id}
          src={attachmentSrc(attachment.fileUrl)}
          alt={described.text}
          hidden={failed}
          {...(lang !== undefined ? { lang } : {})}
          {...(attachment.width !== undefined ? { width: attachment.width } : {})}
          {...(attachment.height !== undefined ? { height: attachment.height } : {})}
          loading="lazy"
          decoding="async"
          className="col-start-1 row-start-1 size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </figure>
  );
}

/** [0..1] → pourcentage arrondi au DIXIÈME — `MediaConsumptionProgressBar.swift:23-41`. */
const consumptionPercentOf = (fraction: number): number => Math.round(fraction * 1000) / 10;

function VoiceAttachment({
  attachment,
  languages,
  displayLanguage,
  fallbackLanguage,
}: {
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
}) {
  const preferredLanguages = displayLanguage === undefined ? languages : [displayLanguage, ...languages];
  const transcript = servedTranscript({ preferredLanguages, attachment, fallbackLanguage });
  const track = resolveAudioTrack({
    servedLanguage: transcript.language,
    originalLanguage: attachment.transcription?.language ?? fallbackLanguage,
    originalUrl: attachment.fileUrl,
    translations: attachment.translations,
  });
  const { status, progress, toggle, bind } = useAudioPlayback({ attachmentId: attachment.id });

  const waves = waveformOf(attachment);
  // `duration` voyage en MILLISECONDES sur la charge du dépôt.
  const seconds = Math.round((attachment.duration ?? 0) / 1000);
  const consumption = attachment.currentUserConsumption;
  const servedFraction =
    consumption?.listenedComplete === true
      ? 1
      : consumption?.lastPlayPositionMs != null && attachment.duration
        ? consumption.lastPlayPositionMs / attachment.duration
        : 0;
  // La teinte de l'onde AU REPOS suit la fraction SERVIE ; EN LECTURE, la
  // progression VIVANTE prend le relais — jamais l'inverse (miroir
  // `MediaConsumptionStore`, `:1445-1451`).
  const tintFraction = Math.max(progress, servedFraction);
  const consumptionPercent = consumptionPercentOf(servedFraction);
  // Masquée sous 1 % (`MediaConsumptionProgressBar.swift:26`).
  const showsConsumptionBar = consumptionPercent >= 1;

  const isPlaying = status === 'playing';
  const isError = status === 'error';
  const lang = transcript.language !== READER_LOCALE ? transcript.language : undefined;

  return (
    <div className="flex flex-col gap-1 py-1" data-attachment={attachment.id}>
      {/* L'ÉLÉMENT N'EST JAMAIS AFFICHÉ (pas de `controls`) : le chrome est le
          bouton + l'onde ci-dessous, exactement comme iOS.

          `src` OMIS (jamais `src=""`) quand la piste élue n'a pas de fichier
          (fixture legacy « vocal décoratif », `fileUrl: ''` — `m5`,
          `fixtures.ts`) : un `<audio src="">` PRÉSENT déclenche seul, sans
          aucun clic, la chaîne native `play → error → pause` (mesuré) — le
          navigateur résout la chaîne vide contre le DOCUMENT courant et
          échoue à la décoder comme de l'audio. Régression trouvée par
          `check-thread-states.mjs` (§ offline/retry, `/c/c-deploiement`) :
          le premier « Réessayer » de la page devenait celui, INERTE, de ce
          widget en faux état d'erreur — devant le VRAI bouton de reprise
          d'envoi, plus bas dans le fil. */}
      {/* `key={track.url}` (revue #5805) — CHANGER DE LANGUE CHANGE DE
          FICHIER, et un `<audio>` dont le `src` change en cours de lecture
          est arrêté par le navigateur SANS émettre `pause` : l'état du hook
          restait `playing`, le bouton disait « Mettre en pause » sur un
          silence, et `toggle()` ne pouvait plus rien (il appelait `pause()`
          sur un élément déjà en pause, qui n'émet alors aucun événement).
          Une `key` REMONTE l'élément : `bind(null)` relâche le coordinateur,
          coupe le son et revient à `idle` — le bouton redit « Lire l'audio »
          et joue la piste NEUVE. */}
      <audio
        key={track.url}
        ref={bind}
        preload="none"
        data-track-language={track.language}
        className="hidden"
        {...(track.url === '' ? {} : { src: attachmentSrc(track.url) })}
      />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          /* `tap-target-34` (`app.css`) porte la zone tactile de ce bouton de
             34 px de dessin a 44x44, meme dispositif que `tap-target-22`. */
          className="tap-target-34 grid size-[34px] shrink-0 place-items-center rounded-chip"
          style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, transparent))' }}
          // « Lire l'audio » (`media.audio.play`, `AudioPlayerView.swift:1278`)
          // — vocabulaire iOS REPRIS tel quel (§1.6 de la spécification #5805).
          aria-label={isPlaying ? 'Mettre en pause' : "Lire l'audio"}
        >
          {isPlaying ? (
            <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={13} className="text-white" />
          ) : (
            <Glyph name="fillPlay" size={13} className="text-white" />
          )}
        </button>
        <span className="flex h-6 flex-1 items-center gap-px" aria-hidden>
          {waves.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{
                height: `${Math.max(12, h * 4)}%`,
                backgroundColor: 'currentColor',
                opacity: i / waves.length < tintFraction ? 1 : 0.45,
              }}
            />
          ))}
        </span>
        <span className="shrink-0 text-time tabular-nums">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>

      {transcript.text !== '' ? (
        <p
          data-transcript
          className="text-title"
          /* `TRANSCRIPT_TEXT_OPACITY`, jamais `META_TEXT_OPACITY` (revue
             #5805) : la transcription est le CONTENU servi par le Prisme, et
             l'opacité de l'heure la faisait tomber à 3,74:1 en schéma clair. */
          style={{ opacity: TRANSCRIPT_TEXT_OPACITY }}
          {...(lang !== undefined ? { lang } : {})}
        >
          {transcript.text}
        </p>
      ) : null}

      {showsConsumptionBar ? (
        <span
          data-consumption
          aria-hidden
          className="block rounded-full"
          style={{
            height: 3,
            width: `${consumptionPercent}%`,
            backgroundColor: 'color-mix(in srgb, var(--accent) 85%, transparent)',
          }}
        />
      ) : null}

      {isError ? (
        <div data-audio-status="error" className="flex items-center">
          <button type="button" onClick={toggle} className="text-mini underline" style={{ minHeight: 44 }}>
            Lecture impossible — Réessayer
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Attachments({
  attachments,
  languages,
  displayLanguage,
  fallbackLanguage,
}: {
  readonly attachments: readonly Attachment[];
  /** Le prisme du lecteur — descendu pour l'`alt`/la transcription ET la piste audio. */
  readonly languages: readonly string[];
  /** Traduire (#5814) — une langue IMPOSÉE au rang 0, la MÊME insertion que le texte du message. */
  readonly displayLanguage?: string;
  /** La langue de la pièce QUAND elle n'a pas de transcription — `message.originalLanguage`. */
  readonly fallbackLanguage: string;
}) {
  return (
    <>
      {attachments.map((attachment, i) => {
        const kind = kindOf(attachment);
        if (kind === 'audio') {
          return (
            <VoiceAttachment
              key={i}
              attachment={attachment}
              languages={languages}
              fallbackLanguage={fallbackLanguage}
              {...(displayLanguage !== undefined ? { displayLanguage } : {})}
            />
          );
        }
        if (kind === 'image') {
          return (
            <ImageTile
              key={i}
              attachment={attachment}
              languages={languages}
              fallbackLanguage={fallbackLanguage}
              {...(displayLanguage !== undefined ? { displayLanguage } : {})}
            />
          );
        }
        if (kind === 'file') {
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <Glyph name="file" size={24} />
              <span className="min-w-0 flex-1 truncate text-title">{attachment.originalName}</span>
              <span className="text-time opacity-70">{Math.round(attachment.fileSize / 1024)} Ko</span>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
