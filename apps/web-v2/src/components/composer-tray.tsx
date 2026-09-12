import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import { Glyph, GlyphSvg } from './glyph';
import { COMPOSER_GLYPHS } from './glyphs-composer';
import { previewUrlFor } from '@/lib/send/attachment-preview-url';
import { mayAttach, type PendingAttachment } from '@/lib/send/attachments';
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
    }
  | {
      readonly variant: 'panel';
      readonly onPickPhotos: (files: FileList | null) => void;
      readonly onPickFile: (files: FileList | null) => void;
      readonly onStartVoice: () => void;
      readonly canRecord: boolean;
      readonly rights?: ParticipantPermissions;
    };

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

const TILE_SIZE = 58;

function Tile({
  label,
  color,
  children,
}: {
  readonly label: string;
  readonly color: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <span
        className="grid place-items-center rounded-full text-white shadow-sm"
        style={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, transparent))`,
        }}
      >
        {children}
      </span>
      <span className="text-check">{label}</span>
    </>
  );
}

function AttachmentPanel({
  onPickPhotos,
  onPickFile,
  onStartVoice,
  canRecord,
  rights,
}: {
  readonly onPickPhotos: (files: FileList | null) => void;
  readonly onPickFile: (files: FileList | null) => void;
  readonly onStartVoice: () => void;
  readonly canRecord: boolean;
  readonly rights?: ParticipantPermissions;
}) {
  // LOI 4 — une tuile n'existe QUE si son geste a un effet : sans droit (ou,
  // pour le vocal, sans moteur d'enregistrement dans ce navigateur), elle ne
  // se rend PAS, jamais grisée. Le droit se lit par le MÊME chemin que celui
  // qu'appliquera la passerelle (`mayAttach`, miroir
  // `attachmentSendRightForMimeType`) — jamais une seconde table écrite ici.
  const canImages = mayAttach(rights, 'image/*');
  const canFiles = mayAttach(rights, 'application/octet-stream');
  const canAudios = canRecord && mayAttach(rights, 'audio/*');

  return (
    <div role="group" aria-label="Types de pièces jointes" style={{ paddingInline: 18, paddingBlock: 12 }}>
      {/* La POIGNÉE du panneau iOS (`+Attachments.swift`, en tête du
          carrousel) : purement décorative, elle dit « ceci est un tiroir ». */}
      <span
        aria-hidden
        className="mx-auto mb-3 block h-1 w-9 rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}
      />
      <div className="flex gap-3.5">
        {canImages ? (
          <label className="flex flex-col items-center gap-1.5" style={{ width: TILE_SIZE + 8 }}>
            <Tile label="Photos" color="var(--ios-tile-photo)">
              <Glyph name="image" size={26} />
            </Tile>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="Choisir des photos"
              onChange={(e) => {
                onPickPhotos(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
        ) : null}

        {canFiles ? (
          <label className="flex flex-col items-center gap-1.5" style={{ width: TILE_SIZE + 8 }}>
            <Tile label="Fichier" color="var(--ios-tile-file)">
              <Glyph name="file" size={26} />
            </Tile>
            <input
              type="file"
              multiple
              className="sr-only"
              aria-label="Choisir un fichier"
              onChange={(e) => {
                onPickFile(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
        ) : null}

        {canAudios ? (
          <button
            type="button"
            onClick={onStartVoice}
            className="flex flex-col items-center gap-1.5"
            style={{ width: TILE_SIZE + 8 }}
            aria-label="Enregistrer un message vocal"
          >
            <Tile label="Vocal" color="var(--ios-tile-voice)">
              <Glyph name="microphone" size={26} />
            </Tile>
          </button>
        ) : null}
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
    return (
      <AttachmentPanel
        onPickPhotos={props.onPickPhotos}
        onPickFile={props.onPickFile}
        onStartVoice={props.onStartVoice}
        canRecord={props.canRecord}
        {...(props.rights === undefined ? {} : { rights: props.rights })}
      />
    );
  }

  return (
    <>
      {props.pending.length > 0 ? <PreviewStrip pending={props.pending} onRemove={props.onRemove} /> : null}
      {props.notice !== null ? <NoticeBanner notice={props.notice} /> : null}
    </>
  );
}
