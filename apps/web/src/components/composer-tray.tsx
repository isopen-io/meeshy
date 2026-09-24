import { useEffect, useMemo, useRef, useState } from 'react';

import { ComposerAttachmentPanel, type ComposerAttachmentPanelProps } from './composer-attachment-panel';
import { Glyph, GlyphSvg } from './glyph';
import { COMPOSER_GLYPHS } from './glyphs-composer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { previewUrlFor } from '@/lib/send/attachment-preview-url';
import { type PendingAttachment } from '@/lib/send/attachments';
import type { SharedPlace } from '@/lib/send/shared-place';
import { MIN_SENDABLE_DURATION_MS, type RecorderState } from '@/lib/view/use-recorder';
import { interpolatedLevel, waveformBarCount } from '@/lib/view/waveform';

/**
 * LE TIROIR DU COMPOSEUR (#5668) — CHARGÉ À LA DEMANDE (`composer.tsx` le
 * monte par `lazy()`, jamais dans le chunk du fil ni le socle) : le panneau
 * de pièces jointes, la bande d'aperçu, la barre d'enregistrement et la
 * bande d'avertissement. AUCUN état ici — tout est REÇU (props), même motif
 * que `RecordingBar`/`+Attachments.swift` : l'hôte (`composer.tsx`) possède
 * `pending`/`panelOpen`/`useRecorder()`, cette vue les REND.
 *
 * TROIS VARIANTES, et leur PLACE dans la colonne du composeur est celle
 * d'iOS (`UniversalComposerBar+Layout.swift:158-258`, lu ligne à ligne à la
 * revue-correction) :
 *
 * | variante | où | source iOS |
 * |---|---|---|
 * | `above` (aperçu des pièces + avertissement) | AU-DESSUS de la rangée, sous la bande de citation | `:165-171` — `customAttachmentsPreview` est monté APRÈS `replyBanner` et AVANT `// Main composer` |
 * | `recording-bar` | À LA PLACE de la rangée | `:209-224` — `if effectiveIsRecording { recordingBar } else { HStack … }` |
 * | `panel` (les tuiles) | SOUS la rangée | `:254-258` — `attachmentCarouselPanel`, à la place du clavier |
 *
 * La première version de ce lot posait l'aperçu SOUS la rangée, avec le
 * panneau : les vignettes en attente se retrouvaient sous le champ, entre
 * lui et le bord de l'écran, alors que tout ce qui DÉCRIT le message à
 * partir (citation, pièces, avertissement) vit au-dessus sur les trois
 * plateformes.
 */
export type ComposerTrayProps =
  | {
      readonly variant: 'recording-bar';
      readonly recorderState: RecorderState;
      readonly onCancelRecording: () => void;
      readonly onStopToTray: () => void;
      readonly onSendRecording: () => void;
    }
  | {
      readonly variant: 'above';
      readonly pending: readonly PendingAttachment[];
      readonly onRemove: (localId: string) => void;
      readonly notice: ComposerNotice | null;
      /** LE LIEU ATTACHÉ (#7280) — `null` quand aucun. Il se rend AU-DESSUS
       * de la rangée, avec tout ce qui DÉCRIT le message à partir (citation,
       * pièces, avertissement) : iOS y pose la même puce
       * (`composer.chip.kind.location`). */
      readonly place: SharedPlace | null;
      readonly onRemovePlace: () => void;
    }
  | ({ readonly variant: 'panel' } & ComposerAttachmentPanelProps);

/**
 * CE QUE LE COMPOSEUR A REFUSÉ, ET LA SORTIE (revue-correction #5668) — un
 * seul emplacement pour les DEUX familles d'avertissement : le micro
 * (refusé / indisponible) et le fichier écarté (droit, taille, nombre —
 * `send/attachments.ts § acceptPendingFiles`). Deux bandes distinctes se
 * seraient empilées ; une seule dit la dernière cause et se ferme.
 * `onRetry` absent ⇒ aucun bouton « Réessayer » : un refus qu'on ne peut pas
 * rejouer n'en offre pas la porte (loi 4).
 */
export type ComposerNotice = {
  readonly message: string;
  readonly onRetry?: () => void;
  readonly onDismiss: () => void;
};

const REDUCED_MOTION = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `0:12` — miroir `formatDuration` (`+Recording.swift:405-407`) et
 * `Voice`/`message-blocks.tsx:346-348` (même écriture `m:ss`, pas `MM:SS`). */
function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** `1 min 12 s` — ce que le lecteur d'écran PRONONCE, là où `0:12` se lit à
 * l'œil (miroir `LocalizedNumber.spokenDuration`, `+Recording.swift:209`). */
function spokenDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest} s` : `${minutes} min ${rest} s`;
}

/**
 * DÉFAUT 8 (revue #5668) — mesurée sur 178 px disponibles, l'onde
 * n'occupait que 73 px (41 %) : les 15 échantillons bruts, un par barre,
 * alignés `flex-start` sans rien pour remplir le reste. Miroir
 * `UniversalComposerBar+Recording.swift:305-340` — `barCount` dépend de la
 * LARGEUR MESURÉE du conteneur (`ResizeObserver`), et `interpolatedLevel`
 * (`lib/view/waveform.ts`) étale les 15 niveaux sur TOUTES les barres :
 * l'onde lit comme une courbe continue, jamais un tas collé à gauche.
 * `MAX_LEVELS` (`use-recorder.ts`) reste à 15 côté ÉCHANTILLONNAGE — c'est
 * l'AFFICHAGE qui interpole, jamais l'échantillonnage qui grossit.
 */
function Waveform({ levels }: { readonly levels: readonly number[] }) {
  const reduced = REDUCED_MOTION();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // AVANT toute mesure (premier rendu, ou environnement sans
  // `ResizeObserver`) : repli sur les échantillons bruts plutôt qu'UNE
  // seule barre — jamais un écran qui semble vide.
  const barCount = width > 0 ? waveformBarCount(width) : Math.max(levels.length, 1);
  const sampled = levels.length > 0 ? levels : [0];
  const bars = Array.from({ length: barCount }, (_, i) => interpolatedLevel(i, barCount, sampled));

  return (
    <span ref={containerRef} className="flex h-6 flex-1 items-center gap-[2.5px]" aria-hidden>
      {bars.map((level, i) => (
        <span
          key={i}
          className="w-[2.5px] shrink-0 rounded-full"
          style={{
            height: reduced ? 3 : Math.round(3 + 22 * level),
            backgroundColor: 'var(--recording-ink)',
          }}
        />
      ))}
    </span>
  );
}

/**
 * LA BARRE D'ENREGISTREMENT — `[X annuler][onde][• durée][■ arrêter→joindre]
 * [↑ envoyer]`, TOUS DANS LA MÊME PILULE : la `HStack` d'iOS porte son
 * `.background(RoundedRectangle(cornerRadius: 22))` au niveau de la RANGÉE
 * ENTIÈRE (`+Recording.swift:159-289`), pas autour des trois premiers
 * éléments. La première version de ce lot laissait « arrêter » et « envoyer »
 * flotter à côté de la pilule.
 *
 * SOUS `MIN_SENDABLE_DURATION_MS`, LES DEUX BOUTONS NE FONT RIEN — c'est le
 * `guard canSend else { HapticFeedback.error(); return }` d'iOS
 * (`:212-216` et `:245-249`) : l'enregistrement CONTINUE. La version
 * précédente appelait quand même les gestes, dont le hook rend `null` sous le
 * seuil : le tap DÉTRUISAIT l'enregistrement en cours au lieu d'inviter à
 * tenir un instant de plus. `aria-disabled` (et non `disabled`) garde les
 * boutons dans le parcours clavier et laisse lire leur indice, exactement
 * comme iOS les garde focalisables avec un `accessibilityHint` qui change.
 *
 * LE SCHÉMA SOMBRE EST BLANC, PAS ACCENTUÉ — iOS bascule les cinq couleurs de
 * cette barre sur du blanc en sombre (`:144-152`, `:220-225`) ; les peindre
 * en `--accent` donnait un carré d'arrêt accent sur un fond accent à 12 %,
 * illisible sur nuit. `--recording-ink` / `--recording-fill` tiennent la
 * bascule au SEUL endroit qui la connaît.
 */
function RecordingBar({
  recorderState,
  onCancelRecording,
  onStopToTray,
  onSendRecording,
}: {
  readonly recorderState: RecorderState;
  readonly onCancelRecording: () => void;
  readonly onStopToTray: () => void;
  readonly onSendRecording: () => void;
}) {
  const reduced = REDUCED_MOTION();
  const canSend = recorderState.durationMs >= MIN_SENDABLE_DURATION_MS;
  const holdOn = 'Maintenez encore pour atteindre la durée minimum';
  return (
    <div className="px-3 py-2.5">
      <div
        className="flex min-h-11 items-center gap-2.5 rounded-[22px] px-1.5 py-1"
        style={{
          backgroundColor: 'var(--recording-surface)',
          border: '1px solid var(--recording-hairline)',
        }}
      >
        <button
          type="button"
          onClick={onCancelRecording}
          className="tap-target-32 grid size-8 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: 'color-mix(in srgb, var(--ios-error-strong) 14%, transparent)' }}
          aria-label="Annuler l’enregistrement"
          title="Supprime le message vocal en cours"
        >
          <Glyph name="x" size={14} style={{ color: 'var(--ios-error-strong)' }} />
        </button>

        <Waveform levels={recorderState.levels} />

        {/* LA DURÉE EST PRONONCÉE, pas seulement dessinée (revue-correction
            #5668) — un `aria-label` posé sur ce groupe REMPLAÇAIT son
            contenu : le lecteur d'écran disait « Enregistrement en cours » et
            JAMAIS le temps écoulé, la seule information que cette bande
            porte. iOS sert les deux (`accessibilityLabel` + `accessibilityValue`,
            `:206-209`). Ici : un libellé invisible, puis le temps LU. */}
        <span role="timer" className="flex shrink-0 items-center gap-1.5 text-time tabular-nums">
          <span
            aria-hidden
            className={`size-1.5 rounded-full${reduced ? '' : ' animate-pulse'}`}
            style={{ backgroundColor: 'var(--ios-error-strong)' }}
          />
          <span className="sr-only">Enregistrement en cours, </span>
          <time dateTime={`PT${Math.round(recorderState.durationMs / 1000)}S`}>
            <span aria-hidden>{formatDuration(recorderState.durationMs)}</span>
            <span className="sr-only">{spokenDuration(recorderState.durationMs)}</span>
          </time>
        </span>

        <button
          type="button"
          onClick={canSend ? onStopToTray : undefined}
          aria-disabled={canSend ? undefined : true}
          className="tap-target-32 grid size-8 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: 'var(--recording-fill)', opacity: canSend ? 1 : 0.4 }}
          aria-label="Arrêter et ajouter aux pièces jointes"
          title={canSend ? 'Place le message vocal dans les pièces jointes pour l’éditer avant l’envoi' : holdOn}
        >
          <GlyphSvg glyph={COMPOSER_GLYPHS.stop} size={14} style={{ color: 'var(--recording-ink)' }} />
        </button>

        <button
          type="button"
          onClick={canSend ? onSendRecording : undefined}
          aria-disabled={canSend ? undefined : true}
          className="tap-target-32 grid size-8 shrink-0 place-items-center rounded-full"
          style={{
            background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 65%, white))',
            opacity: canSend ? 1 : 0.4,
          }}
          aria-label="Envoyer le message vocal"
          title={canSend ? 'Termine et envoie l’enregistrement' : holdOn}
        >
          <Glyph name="arrowUp" size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}

function PreviewTile({ attachment, onRemove }: { readonly attachment: PendingAttachment; readonly onRemove: () => void }) {
  /**
   * UN URL D'OBJET PAR PIÈCE, PARTAGÉ AVEC LA BULLE OPTIMISTE (défaut 7,
   * revue #5668) — `previewUrlFor` (`lib/send/attachment-preview-url.ts`)
   * est le SEUL site qui appelle `URL.createObjectURL`, mémoïsé par
   * `localId`. Cette tuile ne le RÉVOQUE plus à son démontage : l'envoi
   * démonte la tuile (le plateau se ferme) exactement quand la bulle
   * optimiste commence à utiliser la MÊME URL — la révoquer ici casserait
   * l'image qu'`attachmentPreviewOf` vient de poser. La révocation est
   * EXPLICITE, au geste qui sait que l'URL ne sert plus jamais : retirer la
   * pièce AVANT l'envoi (`onRemove`, `composer.tsx § removeAttachment`).
   */
  const previewUrl = useMemo(
    () => (attachment.kind === 'image' ? previewUrlFor(attachment.localId, attachment.file) : undefined),
    [attachment.localId, attachment.file, attachment.kind],
  );

  return (
    <div className="relative shrink-0" style={{ width: 56 }}>
      <div
        className="grid size-14 place-items-center overflow-hidden rounded-[10px]"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
      >
        {previewUrl !== undefined ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <Glyph name={attachment.kind === 'audio' ? 'microphone' : 'file'} size={22} style={{ color: 'var(--accent)' }} />
        )}
      </div>
      {/* Cible de 44 px (dimension 5) INVISIBLE, CONTENANT le badge visuel de
          18 px — jamais un pseudo-élément sur un bouton déjà `absolute`
          (voir le doc-comment de `tap-target-32`, `app.css`). */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2.5 -top-2.5 grid size-11 place-items-center"
        aria-label={`Supprimer ${attachment.name}`}
      >
        <span
          className="grid size-[18px] place-items-center rounded-full text-white"
          style={{ backgroundColor: 'var(--color-error)' }}
          aria-hidden
        >
          <Glyph name="x" size={10} />
        </span>
      </button>
      <span className="mt-1 block truncate text-check" style={{ width: 60 }}>
        {attachment.name}
      </span>
    </div>
  );
}

function PreviewStrip({
  pending,
  onRemove,
}: {
  readonly pending: readonly PendingAttachment[];
  readonly onRemove: (localId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Pièces jointes en attente"
      className="scrollbar-none flex gap-3 overflow-x-auto px-3 py-2.5"
      style={{
        height: 100,
        borderRadius: 16,
        margin: '0 12px 4px',
        backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
      }}
    >
      {pending.map((attachment) => (
        <PreviewTile key={attachment.localId} attachment={attachment} onRemove={() => onRemove(attachment.localId)} />
      ))}
    </div>
  );
}

/**
 * L'AVERTISSEMENT DU COMPOSEUR (miroir « toast actionnable »
 * `AudioRecorderManager.swift:136-157`) — DESSINÉ, jamais un silence : la
 * cause, un « Réessayer » quand le geste se rejoue, et TOUJOURS une sortie.
 * `role="status"` : le lecteur d'écran l'annonce sans voler le focus.
 */
function NoticeBanner({ notice }: { readonly notice: ComposerNotice }) {
  return (
    <div
      role="status"
      className="mx-3 mb-1 flex items-center gap-2 rounded-quote px-2.5 py-2"
      style={{ backgroundColor: 'var(--color-ios-card)' }}
    >
      <Glyph name="warningCircle" size={16} style={{ color: 'var(--color-error)' }} />
      <span className="min-w-0 flex-1 text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
        {notice.message}
      </span>
      {notice.onRetry !== undefined ? (
        <button
          type="button"
          onClick={notice.onRetry}
          className="tap-target-32 h-8 shrink-0 rounded-chip px-2 text-title font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          Réessayer
        </button>
      ) : null}
      <button
        type="button"
        onClick={notice.onDismiss}
        className="grid size-11 shrink-0 place-items-center"
        aria-label="Fermer l’avertissement"
      >
        <Glyph name="x" size={14} style={{ color: 'var(--color-ios-ink-2)' }} />
      </button>
    </div>
  );
}

/**
 * LA PUCE DU LIEU ATTACHÉ (#7280) — miroir de la puce « LIEU » d'iOS
 * (`composer.chip.kind.location`), posée au-dessus de la rangée avec les
 * pièces en attente.
 *
 * ELLE MONTRE DES COORDONNÉES, PAS UN NOM — et c'est délibéré : le web n'a
 * aucun géocodeur inverse dans ce lot, et afficher « Lieu inconnu » sur une
 * position parfaitement connue serait dire le contraire de ce qui part. Les
 * coordonnées sont formatées par la LANGUE D'INTERFACE (`Intl.NumberFormat`) :
 * le français écrit « 48,8566 », l'anglais « 48.8566 », et concaténer un
 * `toFixed()` aurait servi le point décimal aux sept langues.
 *
 * LE RETRAIT EST UNE CIBLE DE 44 px (dimension 5) contenant un badge de
 * 18 px — la MÊME anatomie que `PreviewTile`, jamais un bouton de la taille
 * de son dessin.
 */
function PlaceChip({ place, onRemove }: { readonly place: SharedPlace; readonly onRemove: () => void }) {
  const language = currentInterfaceLanguage();
  const coordinate = new Intl.NumberFormat(language, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return (
    <div
      data-composer-place
      className="mx-3 mb-1 flex items-center gap-2 rounded-quote px-2.5 py-2"
      style={{ backgroundColor: 'var(--color-ios-card)' }}
    >
      <GlyphSvg glyph={COMPOSER_GLYPHS.mapPin} size={16} style={{ color: 'var(--ios-tile-location)' }} />
      <span className="min-w-0 flex-1 text-title">
        <span className="font-semibold" style={{ color: 'var(--ios-tile-location)' }}>
          {translate(language, 'composer.location.chip')}{' '}
        </span>
        <span className="tabular-nums" style={{ color: 'var(--color-ios-ink-2)' }}>
          {coordinate.format(place.latitude)} · {coordinate.format(place.longitude)}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-11 shrink-0 place-items-center"
        aria-label={translate(language, 'composer.location.remove')}
      >
        <span
          className="grid size-[18px] place-items-center rounded-full text-white"
          style={{ backgroundColor: 'var(--color-error)' }}
          aria-hidden
        >
          <Glyph name="x" size={10} />
        </span>
      </button>
    </div>
  );
}

export default function ComposerTray(props: ComposerTrayProps) {
  if (props.variant === 'recording-bar') {
    return (
      <RecordingBar
        recorderState={props.recorderState}
        onCancelRecording={props.onCancelRecording}
        onStopToTray={props.onStopToTray}
        onSendRecording={props.onSendRecording}
      />
    );
  }

  if (props.variant === 'panel') {
    const { variant: _variant, ...panel } = props;
    return <ComposerAttachmentPanel {...panel} />;
  }

  return (
    <>
      {props.pending.length > 0 ? <PreviewStrip pending={props.pending} onRemove={props.onRemove} /> : null}
      {props.place !== null ? <PlaceChip place={props.place} onRemove={props.onRemovePlace} /> : null}
      {props.notice !== null ? <NoticeBanner notice={props.notice} /> : null}
    </>
  );
}
