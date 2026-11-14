import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import type { Portrait } from '@/components/call-portrait';
import type { CallButton } from '@/components/call-glass-button';
import type { Arrives } from '@/components/call-arrives';
import type { GroupSharedScreenProps } from '@/components/call-grid-screen';
import { useStowFade, type HeldSwap } from '@/lib/calls/use-pill-motion';
import type { CameraOffStage, PeerSpeechRing } from '@/components/call-camera-off';
import { CallTileNameplate } from '@/components/call-tile-nameplate';
import type { CallModerationSlot } from '@/components/call-control-slots';
import { useSrcObject } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import type { CallModeration } from '@/lib/calls/call-moderation';
import type { autoSharer, FullScreenLevel, resolveSpotlight, SpotlightChoice } from '@/lib/calls/call-spotlight';
import { chooseGrid, chooseMember, chooseSelf, fullScreenHidesStrip, fullScreenLevelAfter, fullScreenLevelFor, spotlightCapsuleButtons, type SpotlightButton } from '@/lib/calls/call-spotlight-gestures';
import { edgeFadeMask } from '@/lib/calls/call-row-keys';
import type { CallMember } from '@/lib/calls/call-store';
import { zoomLabel } from '@/lib/calls/camera-zoom';
import { filmstripOf, type Filmstrip, STRIP_COLUMN_WIDTH, STRIP_HALO_PAD, STRIP_TILE_HEIGHT, STRIP_TILE_WIDTH } from '@/lib/calls/call-group-stage';
import { gridColumns, hasVideo } from '@/lib/calls/call-view';
import type { useStageFlip } from '@/lib/calls/use-stage-flip';
import type { usePressedChrome } from '@/lib/calls/use-pressed-chrome';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { LocalZoom } from '@/lib/calls/self-zoom';


const CallSelfCamera = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallSelfCamera })));

/**
 * **LA GRILLE D'UN APPEL DE GROUPE** (#3721, #8392, #8393) — une tuile par
 * participant, la sienne en dernier, chacune bordée de la couleur STABLE de sa
 * personne (celle de son nom dans les sous-titres). Toucher une tuile la met à
 * la une, les autres passent en bandeau ; « Grille » rend la grille.
 *
 * Dès qu'un membre partage son écran, son ÉCRAN monte seul à la une, affiché
 * ENTIER (`contain` : rogner un écran en cache le texte), son portrait en
 * médaillon, sous « Écran de X » — même après un choix manuel (#18180), et le
 * lecteur d'écran l'annonce. La règle vit dans `lib/calls/call-spotlight.ts`,
 * le choix reste local. Le plein écran s'offre sur toute tuile à la une
 * (#9098) ; un écran partagé en a DEUX niveaux (#17961) : le plein écran garde
 * le bandeau des autres, un second appui passe au plein écran total, l'écran
 * seul. Un toucher range la capsule et la puce vers le haut, et les rend. MA tuile passe à la une comme les autres,
 * les commandes de ma caméra en haut au centre (comme iOS), porte mon
 * micro coupé ET le zoom de ma caméra (#9182, `call-self-camera.tsx` —
 * pincer, Ctrl + molette, capsule sur le bord) ; un écran partagé à la une se
 * ZOOME — pincer, Ctrl + molette, double toucher pour le revoir entier
 * (`use-screen-zoom.ts`). Pendant un partage, les caméras des autres restent
 * en rail sous l'écran (#9112).
 * Qui MODÈRE l'appel trouve sur chaque tuile d'un pair
 * (et sur la une) le menu « Couper le micro » · « Retirer de l'appel » (#8438) ;
 * une personne invitée sonne dans sa tuile, portrait pulsé (#8433).
 *
 * La grille suit l'ORDRE D'ARRIVÉE, moi en dernier, et l'orientation de l'écran (2 × 3 en portrait,
 * 3 × 2 en paysage) ; une vignette ne se réagence jamais à la parole, elle s'illumine (liseré renforcé
 * et halo à la couleur de la personne, la mienne comprise). Le bandeau des autres porte des vignettes de
 * 84 × 112, en colonne de 128 à droite en paysage, effacées en fondu à leurs bords. Grille ↔ à la une est
 * un MOUVEMENT : chaque vignette garde son identité (`data-call-slot`) et son `<video>` (déplacé, non
 * recréé). Les commandes rangées, toucher une vignette ne fait que les rendre — décidé à la DESCENTE du
 * pointeur (#17548).
 */

const TILE = 'var(--color-media-fill)';

/**
 * CE QUE L'ÉCRAN REMET À LA GRILLE (#17650) — la grille est un chunk chargé
 * à part ; ce qu'elle partage avec l'écran (le portrait, le bouton de verre, le
 * menu de modération, la couleur de chacun, la règle de la une) vit dans
 * l'écran, qui le lui remet au lieu qu'elle l'importe (`budgets.json` ›
 * `call_overlay.dynamic_only`).
 */
export type CallGridKit = {
  readonly Portrait: typeof Portrait;
  readonly Button: typeof CallButton;
  readonly ModerationSlot: typeof CallModerationSlot;
  /** La couleur STABLE d'une personne — `null` : moi sans identifiant, le liseré neutre. */
  readonly colorOf: (userId: string | null) => string;
  readonly resolveSpotlight: typeof resolveSpotlight;
  readonly autoSharer: typeof autoSharer;
  /** Le calque UNIQUE de la parole (`SpeechRing`), allumé au niveau reçu du flux : une bascule ne rend que lui, jamais la grille. */
  readonly SpeechRing: typeof PeerSpeechRing;
  /** Décider à la descente du pointeur, comme le duo : le crochet vit dans l'écran, qui le remet. */
  readonly usePressedChrome: typeof usePressedChrome;
  /** Chaque vignette passe de sa case à la suivante (P14.10) : le crochet et son moteur chargé à part vivent dans l'écran. */
  readonly useStageFlip: typeof useStageFlip;
  /** Ce qui arrive avec la une (la capsule) y entre en fondu, et repart de même (`leaving`), plus court sous « Réduire les animations » : rien n'apparaît ni ne disparaît d'un coup. */
  readonly Arrives: typeof Arrives;
  /** Le bandeau des autres sort par son bord au plein écran total, et revient par lui (U2.10). */
  readonly HeldSwap: typeof HeldSwap;
  /** L'image d'une vignette cède à son avatar en fondu, et revient de même (loi 17.12) : la scène noire du duo. */
  readonly CameraOff: typeof CameraOffStage;
  /** L'écran partagé à la une, chargé à part (`call-grid-screen.tsx`) : un groupe sans partage ne le paie pas. */
  readonly SharedScreen: (props: GroupSharedScreenProps) => ReactNode;
};

export type CallGridProps = {
  readonly kit: CallGridKit;
  readonly members: readonly CallMember[];
  readonly remoteStreams: Readonly<Record<string, MediaStream>>;
  readonly self: {
    /** Mon identifiant : ma vignette porte MA couleur, celle de mes sous-titres (#16635). Absent : le liseré neutre. */
    readonly id?: string | null;
    readonly stream: MediaStream | null;
    readonly cameraOn: boolean;
    readonly mirrored: boolean;
    readonly micMuted: boolean;
    /** Mon nom et mon avatar : le portrait de ma tuile caméra coupée, comme iOS (le libellé reste « Vous »). */
    readonly name?: string | null;
    readonly avatar?: string | null;
  };
  /** Le zoom de ma caméra quand MA tuile est à la une (#9182, comme `GroupCallStageView.featuredTile` sur iOS) — pincer, Ctrl + molette, capsule sur le bord. `null` : pas de zoom à offrir (un témoin qui n'en parle pas garde l'ancien comportement). */
  readonly selfZoom?: { readonly local: LocalZoom; readonly column: (capsule: ReactNode) => ReactNode } | null;
  readonly choice: SpotlightChoice;
  readonly onChoose: (choice: SpotlightChoice) => void;
  /**
   * Le plein écran de la une (loi 15, #17961) : `full` range l'en-tête, la pilule et les bannières et GARDE le bandeau
   * des autres ; `total` — un écran partagé seulement — ne montre que lui. La capsule monte ou descend d'un niveau.
   */
  readonly fullScreen: FullScreenLevel;
  readonly onFullScreen: (level: FullScreenLevel) => void;
  readonly moderation: CallModeration | null;
  readonly language: InterfaceLanguage;
  /** Le chrome est-il affiché (#9183, `GroupStageTapRule.outcome(isChromeVisible:)` sur iOS). Par défaut visible : une scène sans chrome à gérer (témoins qui n'en parlent pas) garde l'ancien comportement. */
  readonly chromeVisible?: boolean;
  readonly onRevealChrome?: () => void;
  /** L'écran est-il plus large que haut : 2 × 3 devient 3 × 2, le bandeau passe en colonne à droite (`GroupCallGridLayout`, P11.1, P14.2). */
  readonly landscape?: boolean;
  /** La FENÊTRE est-elle de hauteur compacte (`isCompactHeight`) : seule une scène paysage qui l'est pose quatre tuiles sur une rangée (L4.1, W2.1). */
  readonly compact?: boolean;
};

/** Les `<video>` de la grille, tenus par identité : une vignette qui change d'arbre (grille, à la une, bandeau) y retrouve le sien (P14.10). */
type Held = Map<string, HTMLVideoElement>;

/** Ce qu'une vignette montre d'une personne — la mienne ou celle d'un pair : la couleur de SA personne colore le liseré, l'avatar et le halo (P11.6). */
type Subject = {
  readonly id: string;
  readonly name: string;
  readonly shown: string;
  readonly avatar: string | null;
  readonly color: string;
  readonly stream: MediaStream | null;
  readonly video: boolean;
  readonly mirrored: boolean;
  readonly muted: boolean;
  readonly suffix: string | null;
  readonly ringing: boolean;
  readonly presenceKey: string | undefined;
  readonly self: boolean;
};

const SELF = 'self';

function peerSubject(kit: CallGridKit, member: CallMember, stream: MediaStream | undefined, language: InterfaceLanguage): Subject {
  const ringing = member.link === 'ringing';
  const suffix = member.link === 'connected' ? null : ringing ? translateCallControls(language, 'callControls.ringing') : translate(language, member.link === 'reconnecting' ? 'call.reconnecting' : 'call.connecting');
  return { id: member.userId, name: member.name, shown: member.name, avatar: member.avatar, color: kit.colorOf(member.userId), stream: stream ?? null, video: member.cameraOn && hasVideo(stream), mirrored: false, muted: member.micMuted, suffix, ringing, presenceKey: member.userId, self: false };
}

function selfSubject(kit: CallGridKit, self: CallGridProps['self'], language: InterfaceLanguage): Subject {
  const you = translate(language, 'call.you');
  return { id: SELF, name: self.name || you, shown: you, avatar: self.avatar ?? null, color: kit.colorOf(self.id || null), stream: self.stream, video: self.cameraOn, mirrored: self.mirrored, muted: self.micMuted, suffix: null, ringing: false, presenceKey: undefined, self: true };
}

/**
 * LA VIDÉO D'UNE VIGNETTE, DÉPLACÉE ET NON RECRÉÉE (P14.10) — son `<video>` est tenu par la grille, sous
 * l'identité de la personne ; la vignette qui se monte dans un autre arbre le pose dans SON cadre, et
 * l'image ne coupe pas. Le flux se pose comme partout (`useSrcObject`).
 */
function HeldVideo({ held, subject }: { readonly held: Held; readonly subject: Subject }) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  useLayoutEffect(() => {
    const element = held.get(subject.id) ?? document.createElement('video');
    held.set(subject.id, element);
    element.autoplay = true;
    element.playsInline = true;
    element.defaultMuted = element.muted = true;
    element.className = 'absolute inset-0 size-full';
    Object.assign(element.style, { objectFit: 'cover', transform: subject.mirrored ? 'scaleX(-1)' : '', backgroundColor: 'var(--color-media-backdrop)' });
    element.setAttribute('aria-label', subject.shown);
    element.setAttribute('data-call-stream', 'cover');
    element.toggleAttribute('data-call-mirrored', subject.mirrored);
    element.setAttribute(subject.self ? 'data-call-self' : 'data-call-member', subject.self ? '' : subject.id);
    if (element.parentNode !== host.current) host.current?.appendChild(element);
    video.current = element;
  });
  useSrcObject<HTMLVideoElement>(subject.stream, video);
  return <div ref={host} className="absolute inset-0" />;
}

type TileProps = {
  readonly kit: CallGridKit;
  readonly subject: Subject;
  readonly held: Held;
  /** `null` : la vignette n'agit pas (la une, un invité qui sonne). */
  readonly onPress: (() => void) | null;
  readonly label: string;
  readonly portrait: number;
  readonly press: ReturnType<typeof usePressedChrome>;
};

function Tile({ kit, subject, held, onPress, label, portrait, press }: TileProps) {
  const body = (
    <>
      {subject.ringing ? (
        <kit.Portrait name={subject.name} avatar={subject.avatar} size={portrait} pulse presenceKey={subject.presenceKey} tint={subject.color} />
      ) : (
        <kit.CameraOff videoOn={subject.video} video={<HeldVideo held={held} subject={subject} />} name={subject.name} avatar={subject.avatar} presenceKey={subject.presenceKey} color={subject.color} speech={null} label={null} size={portrait} tile />
      )}
      <CallTileNameplate name={subject.shown} muted={subject.muted} suffix={subject.suffix} />
    </>
  );
  const Tag = onPress === null || subject.ringing ? 'div' : 'button';
  const act = Tag === 'div' ? {} : { type: 'button' as const, 'aria-label': label, onClick: onPress ?? undefined, onPointerDownCapture: press.press, onKeyDown: press.clear };
  const marks = { ...(subject.self ? { 'data-call-tile-self': '' } : { 'data-call-tile': subject.id }), ...(subject.ringing ? { 'data-call-ringing': '' } : {}) };
  return (
    <Tag className="relative grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-card border-2" style={{ background: TILE, borderColor: subject.color }} {...act} {...marks}>
      {body}
    </Tag>
  );
}

/**
 * La case d'une personne : sa vignette, le halo de sa parole (le calque unique de `SpeechRing`, au niveau
 * reçu de SON flux — le mien compris —, jamais dans le bouton de la vignette) et, pour qui modère, son
 * menu posé à côté. `data-call-slot` est son identité d'un arbre à l'autre (`useStageFlip`).
 */
function Slot({ menu = null, ...tile }: TileProps & { readonly menu?: ReactNode }) {
  const { kit, subject } = tile;
  return (
    <div className="relative grid min-h-0 min-w-0 origin-top-left" data-call-slot={subject.id}>
      <Tile {...tile} />
      {subject.stream === null || subject.ringing ? null : <kit.SpeechRing color={subject.color} stream={subject.stream} shape="tile" />}
      {menu}
    </div>
  );
}

/**
 * Le bandeau des autres : des vignettes de 84 × 112 en rangée sous la une, en colonne de 128 à sa droite en
 * paysage (P14.1, P14.2) ; ce qui défile s'efface en fondu à ses deux bords, sur les 8 de son liseré (la recette
 * de `RAIL_FADE`, dans l'axe du bandeau) : au repos, aucune vignette n'est estompée.
 */
const stripBox = (strip: Filmstrip): CSSProperties => {
  const bottom = strip !== 'trailing';
  const fade = edgeFadeMask(bottom ? 'to right' : 'to bottom');
  return bottom ? { maskImage: fade, gridAutoColumns: STRIP_TILE_WIDTH, gridTemplateRows: STRIP_TILE_HEIGHT, height: STRIP_TILE_HEIGHT + 2 * STRIP_HALO_PAD } : { maskImage: fade, gridAutoRows: STRIP_TILE_HEIGHT, gridTemplateColumns: STRIP_TILE_WIDTH, width: STRIP_COLUMN_WIDTH };
};

const SCROLL_HIDDEN = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** La puce « Écran de X · 2× » (U2.5) : rangée et rendue avec la capsule, vers le haut, son propre fondu sous « Réduire les animations ». */
function ScreenChip({ zoom, title, stowed, language }: { readonly zoom: number; readonly title: string; readonly stowed: boolean; readonly language: InterfaceLanguage }) {
  const chip = useRef<HTMLSpanElement>(null);
  useStowFade(chip, stowed);
  return (
    <span ref={chip} className="glass-call-prominent absolute start-2 top-2 flex max-w-[70%] items-center gap-1 rounded-full px-3 py-1 text-mini font-semibold" aria-hidden={stowed ? true : undefined} data-call-stow="top" data-call-chrome-keep="" data-call-stowed={stowed ? '' : undefined} data-call-screen-banner="">
      <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={14} />
      <span className="truncate">{title}</span>
      {zoom > 1 ? <span aria-hidden="true">{` · ${zoomLabel(zoom, language)}`}</span> : null}
    </span>
  );
}

/** L'écran partagé avant que son chunk n'arrive — il se charge avec la grille, il est là d'ordinaire : sa place, réservée. */
const SCREEN_WAITING = <div className="min-h-0 min-w-0 flex-1 rounded-card" />;

/** Le bandeau des autres, qui sort par son bord au plein écran total (U2b) et revient par lui (U2.10) ; il reste au plein écran (U2). */
function OthersStrip({ kit, side, hidden, children }: { readonly kit: CallGridKit; readonly side: Filmstrip; readonly hidden: boolean; readonly children: ReactNode }) {
  const axis = side === 'bottom' ? '-mx-2 grid-flow-col content-center overflow-x-auto overscroll-x-none px-2' : '-my-2 content-start justify-center overflow-y-auto overscroll-y-none py-2';
  return (
    <kit.HeldSwap value={hidden ? null : side} shape={side === 'bottom' ? 'bottom' : 'end'} className={`grid shrink-0 gap-2 ${SCROLL_HIDDEN} ${axis}`} style={stripBox(side)} data-call-strip="" data-call-strip-edge={side}>
      {() => children}
    </kit.HeldSwap>
  );
}

/** Les `<video>` tenus par identité : celui d'un membre parti se retire, tous partent avec la grille. */
function useHeldVideos(members: readonly CallMember[]) {
  const held = useRef<Held>(new Map());
  const present = members.map((member) => member.userId).join();
  useEffect(() => {
    for (const [id, video] of held.current) if (id !== SELF && !members.some((member) => member.userId === id)) video.remove(), held.current.delete(id);
  }, [present]);
  useEffect(
    () => () => {
      for (const video of held.current.values()) video.srcObject = null, video.remove();
      held.current.clear();
    },
    [],
  );
  return held;
}

/** Le zoom de ma caméra quand MA tuile est à la une (#9182) : son chunk à la demande. */
function SelfZoom({ zoom, stream, language }: { readonly zoom: NonNullable<CallGridProps['selfZoom']>; readonly stream: MediaStream | null; readonly language: InterfaceLanguage }) {
  return (
    <Suspense fallback={null}>
      <CallSelfCamera stream={stream} local={zoom.local} language={language} glyphs={{ plus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.plus} size={18} />, minus: <GlyphSvg glyph={CALL_VIEW_GLYPHS.minus} size={18} /> }} column={zoom.column} />
    </Suspense>
  );
}

type CapsuleProps = {
  readonly kit: CallGridKit;
  readonly language: InterfaceLanguage;
  readonly screen: boolean;
  readonly level: FullScreenLevel;
  readonly leaving: boolean;
  readonly stowed: boolean;
  readonly onButton: (button: SpotlightButton) => void;
  readonly children: ReactNode;
};

type CapsuleFace = { readonly label: string; readonly glyph: 'squaresFour' | 'cornersOut' | 'cornersIn'; readonly data: Readonly<Record<`data-${string}`, string>>; readonly pressed?: boolean };

const capsuleFace = (button: SpotlightButton, language: InterfaceLanguage): CapsuleFace => {
  if (button === 'grid') return { label: translate(language, 'call.spotlight.back'), glyph: 'squaresFour', data: { 'data-call-grid-back': '' } };
  if (button === 'full-screen') return { label: translate(language, 'call.fullscreen.enter'), glyph: 'cornersOut', data: { 'data-call-fullscreen': 'enter' }, pressed: false };
  if (button === 'total-full-screen') return { label: translateCallControls(language, 'callControls.fullscreen.total.enter'), glyph: 'cornersOut', data: { 'data-call-fullscreen': 'total' }, pressed: false };
  if (button === 'exit-full-screen') return { label: translate(language, 'call.fullscreen.exit'), glyph: 'cornersIn', data: { 'data-call-fullscreen': 'exit' }, pressed: true };
  return { label: translateCallControls(language, 'callControls.fullscreen.total.exit'), glyph: 'cornersIn', data: { 'data-call-fullscreen': 'exit-total' }, pressed: true };
};

/**
 * La capsule « Revenir à la grille · Plein écran » : en place avec la une, ou — `leaving` — retenue au retour à la
 * grille le temps de son fondu (U1.12). Plein écran, elle porte le niveau suivant et la descente d'un niveau (U2, U2b).
 * Un toucher la range vers le HAUT avec l'en-tête et la rend avec lui (U1.10), en plein écran aussi (U2.4) : son
 * rangement est le SIEN (`data-call-stowed`), car le plein écran range l'en-tête sans elle.
 */
function SpotlightCapsule({ kit, language, screen, level, leaving, stowed, onButton, children }: CapsuleProps) {
  const place = useRef<HTMLDivElement>(null);
  useStowFade(place, stowed);
  return (
    <div ref={place} className={`absolute ${leaving ? 'end-5' : 'end-2'} top-2 flex flex-col items-end gap-2`} style={STOW_CLEARANCE} aria-hidden={stowed ? true : undefined} data-call-stow="top" data-call-chrome-keep="" data-call-stowed={stowed ? '' : undefined} data-call-spotlight-place="">
      <kit.Arrives leaving={leaving} prominent={screen} className={`${screen ? 'glass-call-prominent' : 'glass-call'} flex gap-1 rounded-full p-1`} data-call-spotlight-capsule="">
        {spotlightCapsuleButtons(level, screen).map((button) => {
          const face = capsuleFace(button, language);
          return <kit.Button key={button} label={face.label} glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS[face.glyph]} size={20} />} onPress={() => onButton(button)} size={44} data={face.data} {...(face.pressed === undefined ? {} : { pressed: face.pressed })} />;
        })}
      </kit.Arrives>
      {children}
    </div>
  );
}

/** Qui partage son écran, dit au lecteur d'écran dans une zone vive TOUJOURS montée (U2.1, #18180) : un partage qui commence s'annonce, une fois. */
function ShareAnnounce({ sharer, language }: { readonly sharer: CallMember | null; readonly language: InterfaceLanguage }) {
  return (
    <span role="status" className="sr-only" data-call-share-announce="">
      {sharer === null ? '' : translate(language, 'call.screen.peerSharing', { name: sharer.name })}
    </span>
  );
}

const STOW_CLEARANCE = { '--stow-clearance': '3.75rem' } as CSSProperties;

export function CallGrid({ kit, members, remoteStreams, self, selfZoom = null, choice, onChoose, fullScreen: wanted, onFullScreen, moderation, language, chromeVisible = true, onRevealChrome = () => undefined, landscape = false, compact = false }: CallGridProps) {
  const press = kit.usePressedChrome(chromeVisible);
  /** #9183 — chrome masqué, toucher une vignette le RENDS au lieu de changer la une (`GroupStageTapRule` sur iOS) ; décidé à la descente du pointeur (#17548). */
  const decide = (next: SpotlightChoice) => () => (press.release() ? onRevealChrome() : onChoose(next));
  const featureLabel = (member: CallMember) => translate(language, 'call.spotlight.show', { name: member.name });
  const view = kit.resolveSpotlight({ members, choice, remoteStreams });
  const fullScreen = fullScreenLevelFor(wanted, view?.screen === true);
  const held = useHeldVideos(members);
  const shown = useRef<{ readonly screen: boolean; readonly level: FullScreenLevel } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  kit.useStageFlip(root, `${view === null ? 'grid' : `${view.featured?.userId ?? SELF}:${view.screen}`}|${fullScreen}|${landscape}|${compact}`);
  const mine = selfSubject(kit, self, language);
  const peer = (member: CallMember) => peerSubject(kit, member, remoteStreams[member.userId], language);
  const tile = (subject: Subject, onPress: (() => void) | null, label: string, portrait: number) => ({ kit, subject, held: held.current, onPress, label, portrait, press });
  const selfLabel = translateCallControls(language, 'callControls.spotlight.self');
  const stowed = !chromeVisible;

  const gridScene = (ghost: ReactNode) => (
    <div className="relative grid min-h-[140px] w-full max-w-[1064px] mx-auto flex-1 gap-2 px-3" style={{ gridTemplateColumns: `repeat(${gridColumns(members.length + 1, landscape, compact)}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
      {members.map((member) => {
        const moderated = moderation !== null && moderation.canModerate(member.userId);
        const menu = moderated ? (
          <div className="absolute right-1.5 top-1.5 z-10" data-call-chrome-fade="" data-call-tile-menu="">
            <kit.ModerationSlot member={member} language={language} moderation={moderation} />
          </div>
        ) : null;
        return <Slot key={member.userId} {...tile(peer(member), decide(chooseMember(member.userId)), featureLabel(member), 64)} menu={menu} />;
      })}
      <Slot {...tile(mine, decide(chooseSelf()), selfLabel, 64)} />
      {ghost}
    </div>
  );

  const sharer = kit.autoSharer(members, remoteStreams);
  const announce = <ShareAnnounce sharer={sharer} language={language} />;
  const capsuleOf = (screen: boolean, level: FullScreenLevel, leaving: boolean, below: ReactNode = null) => {
    const onButton = (button: SpotlightButton) => {
      if (button === 'grid') onChoose(chooseGrid(sharer?.userId ?? null));
      if (level !== 'off' || button !== 'grid') onFullScreen(fullScreenLevelAfter(button, level, screen));
    };
    return <SpotlightCapsule kit={kit} language={language} screen={screen} level={level} leaving={leaving} stowed={stowed} onButton={onButton}>{below}</SpotlightCapsule>;
  };
  if (view !== null) shown.current = { screen: view.screen, level: fullScreen };

  if (view === null) return <div ref={root} className="contents">{gridScene(shown.current === null ? null : capsuleOf(shown.current.screen, shown.current.level, true))}{announce}</div>;

  const { featured, others, screen } = view;
  const moderated = featured !== null && moderation !== null && moderation.canModerate(featured.userId);
  const side = filmstripOf({ fullscreen: false, landscape });
  const peerTiles = others.map((member) => <Slot key={member.userId} {...tile(peer(member), decide(chooseMember(member.userId)), featureLabel(member), 40)} />);
  return (
    <div ref={root} className="contents">
      <div className={`relative flex min-h-[140px] min-w-0 flex-1 gap-2 px-3 ${side === 'trailing' ? 'flex-row' : 'flex-col'}`} data-call-spotlight={featured?.userId ?? 'self'}>
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {featured === null ? (
            <div className="grid min-h-0 min-w-0 flex-1">
              <Slot {...tile(mine, null, selfLabel, 96)} />
            </div>
          ) : screen ? (
            <Suspense key={featured.userId} fallback={SCREEN_WAITING}>
              <kit.SharedScreen member={featured} stream={remoteStreams[featured.userId]} language={language} chip={(zoom, title) => <ScreenChip zoom={zoom} title={title} stowed={stowed} language={language} />} color={kit.colorOf(featured.userId)} />
            </Suspense>
          ) : (
            <div className="grid min-h-0 min-w-0 flex-1">
              <Slot {...tile(peer(featured), null, featured.name, 96)} />
            </div>
          )}
          {featured === null && selfZoom !== null ? <SelfZoom zoom={selfZoom} stream={self.cameraOn ? self.stream : null} language={language} /> : null}
          {capsuleOf(screen, fullScreen, false, moderated && featured !== null && fullScreen === 'off' ? <kit.ModerationSlot member={featured} language={language} moderation={moderation} prominent={screen} /> : null)}
        </div>
        <OthersStrip kit={kit} side={side} hidden={fullScreenHidesStrip(fullScreen)}>
          {peerTiles}
          {featured === null ? null : <Slot {...tile(mine, decide(chooseSelf()), selfLabel, 40)} />}
        </OthersStrip>
      </div>
      {announce}
    </div>
  );
}
