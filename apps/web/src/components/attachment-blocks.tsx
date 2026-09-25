import { Fragment, Suspense, lazy, useCallback, useMemo, useState } from 'react';


import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import { reportAttachmentStatus } from '@/lib/api/attachments';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { attachmentOpenReport } from '@/lib/view/attachment-open-report';
import { electAudio, type MediaCarrier } from '@/lib/view/media';
import { partitionAttachments, type MediaGridFrame } from '@/lib/view/media-grid-layout';
import { waveformOf } from '@/lib/view/message';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { PLAYBACK_SPEEDS, seekFraction, speedLabel } from '@/lib/view/media-transport';
import {
  karaokeSegments,
  karaokeTone,
  segmentSeekTarget,
  type KaraokeTone,
} from '@/lib/view/transcript-karaoke';
import { useKaraokeIndex } from '@/lib/view/use-karaoke';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { TRANSCRIPT_TEXT_OPACITY } from '@/lib/reading-mode/metrics';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MaskedAttachment } from './masked-attachment';
import { MediaGrid } from './media-grid';
import { useAttachmentMasked } from './view-once-opened';

/**
 * LES WIDGETS DE MÉDIA DU FIL (#5805, redécoupé #6221 « la grille de
 * médias ») — SITE UNIQUE, partagé par `bubble.tsx` et `focal-row.tsx`
 * (rangée plate). `Attachments` est désormais le PARTITIONNEUR
 * (`partitionAttachments`, miroir `BubbleContentBuilder.swift:221-247`) :
 * `visual` (image | vidéo) monte `MediaGrid` (grille 2/3/4+, `media-
 * grid.tsx` — ce fichier n'en connaît plus le détail), `audio` monte
 * `VoiceAttachment` (ci-dessous, INCHANGÉ), `nonMedia` un fichier/lieu.
 *
 * `ImageTile`/`VideoFallback`/`MaskedAttachment` ont DÉMÉNAGÉ vers
 * `media-grid.tsx` / `video-tile.tsx` / `masked-attachment.tsx` — ce fichier
 * ne les redéfinit plus, il les ORCHESTRE.
 *
 * La visionneuse plein écran (`media-viewer.tsx`) est un CHUNK À LA
 * DEMANDE : `lazy(() => import('./media-viewer'))`, monté SEULEMENT quand
 * `openIndex !== null` — jamais un `import` statique depuis ce fichier, qui
 * vit dans le socle du fil (`thread-*.js`, gardé par `measure-weight.mjs`).
 *
 * UNE IMAGE et UN VOCAL, dans la langue du LECTEUR : l'`alt`/la transcription
 * descend le Prisme (`servedTranscript`, `api/prism.ts`) et la PISTE audio
 * élue suit la langue du TEXTE déjà servi — jamais une seconde descente
 * (CLAUDE.md § Prisme, cycle 128 ; `resolveAudioTrack`). Un seul média joue à
 * la fois (`useMediaPlayback` → `mediaCoordinator`, partagé vocal/vidéo).
 *
 * HORS TRANCHE (issues compagnons, § 1.5/§3 de la spécification #6221) : la
 * pellicule conversation-entière et ses trois actions (réagir/répondre/
 * composer), le karaoké segment par segment et la vitesse, le carrousel
 * multi-pistes, l'anneau de téléchargement.
 */
const MediaViewer = lazy(() => import('./media-viewer'));

/** [0..1] → pourcentage arrondi au DIXIÈME — `MediaConsumptionProgressBar.swift:23-41`. */
const consumptionPercentOf = (fraction: number): number => Math.round(fraction * 1000) / 10;

/**
 * LE PASSAGE PRONONCÉ, GRAS ET À L'ENCRE PRIMAIRE (#7911) — miroir de
 * `inlineSegmentColor` (`AudioPlayerView+Transcription.swift:562`) : l'actif
 * ressort en gras et en couleur de marque sur un voile léger, les passés
 * restent pleins, les suivants gardent l'opacité de la transcription.
 *
 * L'encre SUIT LE FOND : `--color-karaoke-ink` vaut indigo-600 en clair,
 * indigo-300 en sombre (`app.css`), et BLANC dans la bulle envoyée, peinte en
 * indigo-500 (`bubble.tsx`) — l'indigo y disparaîtrait sur lui-même. Le voile
 * se dérive de l'encre, jamais d'une seconde couleur.
 */
const KARAOKE_STYLE: Readonly<Record<KaraokeTone, Readonly<Record<string, string | number>>>> = {
  idle: { opacity: TRANSCRIPT_TEXT_OPACITY },
  upcoming: { opacity: TRANSCRIPT_TEXT_OPACITY },
  past: { opacity: 1 },
  active: {
    opacity: 1,
    fontWeight: 700,
    color: 'var(--color-karaoke-ink)',
    backgroundColor: 'color-mix(in srgb, var(--color-karaoke-ink) 14%, transparent)',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  },
};

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
  const { described: transcript, track } = electAudio({
    attachment,
    readerLanguages: languages,
    displayLanguage,
    fallbackLanguage,
  });
  // `tracksTime` est OPT-IN : sans lui `position`/`duration` restent à 0 et une
  // tuile du fil ne paie rien. Le vocal en a besoin — le karaoké et le parcours
  // au doigt lisent tous deux la position.
  //
  // `report` (#7225, W6) : REPRISE au montage depuis la consommation SERVIE
  // (`currentUserConsumption`), et RAPPORT au serveur à la pause, au saut, à
  // la fin et au démontage — le hook porte la reprise, le throttle 5 s et le
  // tracker de segments, ce widget ne fait que lui donner ce qu'il connaît.
  const consumption = attachment.currentUserConsumption;
  const { status, progress, toggle, bind, position, duration, seek, rate, setRate, reportedFraction } =
    useMediaPlayback({
      attachmentId: attachment.id,
      tracksTime: true,
      report: {
        kind: 'listened',
        // LA PISTE ÉLUE EST CE QUI A ÉTÉ ÉCOUTÉ (revue #7225) — une piste
        // traduite est une écoute d'une AUTRE version du contenu, et le
        // serveur la stocke comme telle. Sans ce champ, une écoute en
        // français était comptée sur l'original anglais (Prisme : « qu'est-ce
        // qui part À CÔTÉ de ce qu'on vient de résoudre ? »).
        language: track.language,
        ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
        ...(consumption != null
          ? { resume: { positionMs: consumption.lastPlayPositionMs, complete: consumption.listenedComplete } }
          : {}),
      },
    });
  const uiLanguage = currentInterfaceLanguage();

  /*
   LE KARAOKÉ SUIT LA PISTE QU'ON ENTEND (#6306, #7911).

   Les bornes viennent de la piste JOUÉE : la transcription pour l'original,
   `AttachmentTranslation.segments` pour une piste traduite, et à défaut les
   mots répartis sur la durée. `karaokeSegments` refuse tout karaoké quand le
   texte servi et la piste ne parlent pas la même langue — un karaoké faux est
   pire qu'aucun karaoké, il affirme suivre la voix.

   `AttachmentTranscription` est une UNION — audio, vidéo, document, image — et
   seules les deux premières horodatent : la loi interroge la forme, elle
   n'élargit pas le type de la charge.

   La durée vient de l'élément dès qu'il la connaît (la piste traduite n'a pas
   la durée de l'original), sinon de celle que la piste déclare.
  */
  const declaredMs = track.durationMs ?? (track.translated ? undefined : attachment.duration) ?? 0;
  const durationMs = duration > 0 ? duration * 1000 : declaredMs;
  const segments = useMemo(
    () =>
      karaokeSegments({
        transcription: attachment.transcription,
        translations: attachment.translations,
        servedText: transcript.text,
        servedLanguage: transcript.language,
        trackLanguage: track.language,
        durationMs,
      }),
    [attachment.transcription, attachment.translations, transcript.text, transcript.language, track.language, durationMs],
  );
  // L'élément en ÉTAT, pas en ref : le hook du karaoké doit se réabonner quand
  // `key={track.url}` remonte un `<audio>` neuf.
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const bindAudio = useCallback(
    (element: HTMLAudioElement | null) => {
      bind(element);
      setAudioElement(element);
    },
    [bind],
  );
  const activeSegment = useKaraokeIndex(audioElement, segments, status === 'playing');

  const waves = waveformOf(attachment);
  // `duration` voyage en MILLISECONDES sur la charge du dépôt.
  const seconds = Math.round((attachment.duration ?? 0) / 1000);
  const servedFraction =
    consumption?.listenedComplete === true
      ? 1
      : consumption?.lastPlayPositionMs != null && attachment.duration
        ? consumption.lastPlayPositionMs / attachment.duration
        : 0;
  // LA BARRE AU REPOS REFLÈTE CE QUI EST RAPPORTÉ (#7225) — `reportedFraction`
  // grandit dès qu'un rapport PART (optimistic update, CLAUDE.md § Instant
  // App), SANS attendre qu'un nouvel `attachment` revienne du serveur. `Math.max`
  // avec la valeur SERVIE : jamais de recul, l'une ou l'autre source peut être
  // la plus fraîche selon qui a parlé en dernier.
  const restingFraction = Math.max(servedFraction, reportedFraction);
  // La teinte de l'onde AU REPOS suit la fraction SERVIE ; EN LECTURE, la
  // progression VIVANTE prend le relais — jamais l'inverse (miroir
  // `MediaConsumptionStore`, `:1445-1451`).
  const tintFraction = Math.max(progress, restingFraction);
  const consumptionPercent = consumptionPercentOf(restingFraction);
  // Masquée sous 1 % (`MediaConsumptionProgressBar.swift:26`).
  const showsConsumptionBar = consumptionPercent >= 1;

  const isPlaying = status === 'playing';
  const isError = status === 'error';
  /**
   * LA LANGUE SERVIE EST TOUJOURS ANNONCÉE (revue-correction #7017).
   *
   * Cette ligne lisait `transcript.language !== READER_LOCALE ? … : undefined`,
   * c'est-à-dire « pas d'attribut redondant sur du contenu déjà en langue de
   * page ». La prémisse était fausse : `READER_LOCALE` n'est PAS la langue du
   * document. `<html lang>` est posé par le script d'amorçage de la langue
   * d'INTERFACE depuis `navigator.languages`
   * (`inline-interface-language-bootstrap.js`, #6206) ; `READER_LOCALE` est le
   * rang 1 du Prisme de CONTENU, et vaut toujours `'fr'` (`lib/reader.ts`).
   * L'attribut disparaissait donc exactement dans le cas où il est
   * indispensable — du français dans un document anglais, le cas NOMINAL d'un
   * francophone sur un appareil anglais : le texte héritait de `lang="en"` et
   * un lecteur d'écran le prononçait avec une voix anglaise.
   *
   * Aucune comparaison ne peut remplacer celle-là sans mentir : le seul terme
   * juste serait la langue EFFECTIVE de l'hôte, que ce composant ne connaît
   * pas et n'a pas à connaître (elle dépend de l'arbre, pas de la pièce).
   * On annonce donc, à tous les rangs — un `lang` redondant est valide et
   * inoffensif, un `lang` manquant ou vide ne l'est pas.
   */
  const lang = transcript.language !== '' ? transcript.language : undefined;

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
        ref={bindAudio}
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
        {/* L'ONDE SE PARCOURT AU DOIGT (#6306) — elle était `aria-hidden` et
            inerte : on voyait la progression sans pouvoir s'y déplacer.
            `onPointerMove` déplace RÉELLEMENT l'écoute pendant le geste
            (`AVAudioPlayer.currentTime` a son équivalent gratuit ici : poser
            `currentTime` sur un `<audio>` ne coûte aucun décodage), ce que la
            directive « gestes progressifs et annulables » exige — un `onEnded`
            seul y est nommément interdit.
            `role="slider"` plutôt qu'`aria-hidden` : ce qui a un effet doit être
            atteignable au clavier et annoncé. */}
        <span
          role="slider"
          tabIndex={0}
          aria-label={translate(uiLanguage, 'media.audio.position')}
          aria-valuemin={0}
          aria-valuemax={Math.max(1, Math.round(duration))}
          aria-valuenow={Math.round(position)}
          className="flex h-6 flex-1 cursor-pointer items-center gap-px"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            seek(seekFraction({ clientX: e.clientX, left: r.left, width: r.width }) * duration);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const r = e.currentTarget.getBoundingClientRect();
            seek(seekFraction({ clientX: e.clientX, left: r.left, width: r.width }) * duration);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            seek(Math.max(0, Math.min(duration, position + (e.key === 'ArrowRight' ? 5 : -5))));
          }}
        >
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
        {/* LA VITESSE (#6306) — un cycle, pas un menu : c'est le geste d'iOS
            (`cycleSpeed`), et un vocal se réécoute plus vite bien plus souvent
            qu'on ne choisit une vitesse précise. La loi des paliers est celle du
            transport vidéo, partagée — deux échelles de vitesse dans la même app
            seraient une jumelle divergente. */}
        <button
          type="button"
          onClick={() => setRate(PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(rate as 1) + 1) % PLAYBACK_SPEEDS.length] ?? 1)}
          className="tap-target-22 shrink-0 rounded-chip px-1 text-time tabular-nums"
          aria-label={translate(uiLanguage, 'media.audio.speed')}
        >
          {speedLabel(rate, uiLanguage)}
        </button>
      </div>

      {transcript.text !== '' ? (
        <p
          data-transcript
          className="text-title"
          /* `TRANSCRIPT_TEXT_OPACITY`, jamais `META_TEXT_OPACITY` (revue
             #5805) : la transcription est le CONTENU servi par le Prisme, et
             l'opacité de l'heure la faisait tomber à 3,74:1 en schéma clair.
             Segmentée, l'opacité descend sur CHAQUE mot (#7911) : posée sur
             le bloc, elle plafonnait le segment actif — une opacité se
             multiplie, un enfant ne peut pas être plus opaque que son parent. */
          {...(segments === undefined ? { style: { opacity: TRANSCRIPT_TEXT_OPACITY } } : {})}
          {...(lang !== undefined ? { lang } : {})}
        >
          {segments === undefined
            ? transcript.text
            : segments.map((segment, i) => {
                const tone = karaokeTone(i, activeSegment);
                return (
                  <Fragment key={`${segment.startMs}-${i}`}>
                    <span
                      data-karaoke={tone}
                      onClick={() => {
                        const target = segmentSeekTarget(segments, i);
                        if (target !== null) seek(target);
                      }}
                      className="cursor-pointer rounded-[4px] transition-[color,background-color,opacity] duration-150"
                      style={KARAOKE_STYLE[tone]}
                    >
                      {segment.text}
                    </span>{' '}
                  </Fragment>
                );
              })}
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

/**
 * LA RANGÉE D'UN DOCUMENT (#7363, W6) — avant ce lot, un `<div>` STATIQUE
 * (aucun `href`, aucun `onClick`) : un document reçu n'était PAS ouvrable du
 * tout. `<a target="_blank">` : le navigateur RESTITUE le fichier (un PDF
 * s'affiche inline, le reste télécharge selon son propre `Content-
 * Disposition`) — l'équivalent web de la fiche plein écran
 * `DocumentViewerView.swift`. Le clic rapporte IMMÉDIATEMENT (`attachment
 * OpenReport`, miroir `DocumentViewerView.onAppear { reportDocumentOpened()
 * }`) — `isMine` ferme le rapport pour sa propre pièce, jamais l'ouverture
 * elle-même.
 */
function FileAttachmentRow({
  attachment,
  isMine,
  deps,
}: {
  readonly attachment: Attachment;
  readonly isMine: boolean;
  readonly deps?: ConversationsDeps;
}) {
  const lang = currentInterfaceLanguage();
  const name = attachment.originalName;

  return (
    <a
      href={attachmentSrc(attachment.fileUrl)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={translate(lang, 'message-detail.attachment.open', { name })}
      data-attachment-file={attachment.id}
      className="flex items-center gap-2 py-1"
      style={{ minHeight: 44 }}
      onClick={() => {
        const report = attachmentOpenReport({ isMine });
        if (report === null) return;
        void reportAttachmentStatus({ ...(deps ?? apiDeps), attachmentId: attachment.id, report });
      }}
    >
      <Glyph name="file" size={24} />
      <span className="min-w-0 flex-1 truncate text-title">{name}</span>
      <span className="text-time opacity-70">{Math.round(attachment.fileSize / 1024)} Ko</span>
    </a>
  );
}

export function Attachments({
  attachments,
  languages,
  displayLanguage,
  fallbackLanguage,
  carrier,
  mediaFrame,
  isMine = false,
  deps,
}: {
  readonly attachments: readonly Attachment[];
  /** Le prisme du lecteur — descendu pour l'`alt`/la transcription ET la piste audio. */
  readonly languages: readonly string[];
  /** Traduire (#5814) — une langue IMPOSÉE au rang 0, la MÊME insertion que le texte du message. */
  readonly displayLanguage?: string;
  /** La langue de la pièce QUAND elle n'a pas de transcription — `message.originalLanguage`. */
  readonly fallbackLanguage: string;
  /** Remis à la visionneuse plein écran (auteur, date, légende servie) — absent ⇒ aucun bloc auteur (loi 4). */
  readonly carrier?: MediaCarrier;
  /** La forme de la grille, DÉCLARÉE par l'hôte (revue #6169) : `box` en bulle, `tiles` en rangée plate. Obligatoire — un défaut muet ferait porter à l'une des peaux la forme de l'autre. */
  readonly mediaFrame: MediaGridFrame;
  /** CE MESSAGE EST-IL LE MIEN ? (#7363, W6) — gouverne le rapport d'OUVERTURE
   * (image/document) : un expéditeur qui rouvre son propre envoi ne
   * s'auto-déclare pas destinataire (`attachmentOpenReport`). Défaut `false`
   * — comportement historique inchangé pour les appelants qui ne connaissent
   * pas encore la propriété (miroir `DocumentViewerView.isMe`, même défaut). */
  readonly isMine?: boolean;
  /** INJECTABLE pour les témoins — `apiDeps` (singleton réel) par défaut. */
  readonly deps?: ConversationsDeps;
}) {
  const { visual, audio, nonMedia } = partitionAttachments(attachments);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const maskedAttachment = useAttachmentMasked();

  return (
    <>
      {visual.length > 0 ? (
        <MediaGrid
          items={visual}
          frame={mediaFrame}
          languages={languages}
          fallbackLanguage={fallbackLanguage}
          onOpen={setOpenIndex}
          {...(displayLanguage !== undefined ? { displayLanguage } : {})}
        />
      ) : null}

      {audio.map((attachment, i) =>
        maskedAttachment(attachment) ? (
          <MaskedAttachment key={`audio-${i}`} attachment={attachment} />
        ) : (
          <VoiceAttachment
            key={`audio-${i}`}
            attachment={attachment}
            languages={languages}
            fallbackLanguage={fallbackLanguage}
            {...(displayLanguage !== undefined ? { displayLanguage } : {})}
          />
        ),
      )}

      {nonMedia.map((attachment, i) =>
        maskedAttachment(attachment) ? (
          <MaskedAttachment key={`file-${i}`} attachment={attachment} />
        ) : (
          <FileAttachmentRow key={`file-${i}`} attachment={attachment} isMine={isMine} {...(deps !== undefined ? { deps } : {})} />
        ),
      )}

      {openIndex !== null ? (
        <Suspense fallback={null}>
          <MediaViewer
            items={visual}
            startIndex={openIndex}
            onClose={() => setOpenIndex(null)}
            languages={languages}
            fallbackLanguage={fallbackLanguage}
            isMine={isMine}
            {...(displayLanguage !== undefined ? { displayLanguage } : {})}
            {...(carrier !== undefined ? { carrier } : {})}
            {...(deps !== undefined ? { deps } : {})}
          />
        </Suspense>
      ) : null}
    </>
  );
}
