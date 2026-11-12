import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { PeerAvatar } from '@/components/peer-avatar';
import type { Portrait } from '@/components/call-portrait';
import type { CallButton } from '@/components/call-glass-button';
import type { Arrives } from '@/components/call-arrives';
import type { useScreenZoom } from '@/components/use-screen-zoom';
import type { HeldSwap } from '@/lib/calls/use-pill-motion';
import type { PeerSpeechRing } from '@/components/call-camera-off';
import type { CallModerationSlot } from '@/components/call-control-slots';
import { StreamVideo, useSrcObject } from '@/components/call-media-elements';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import type { CallModeration } from '@/lib/calls/call-moderation';
import type { autoSharer, resolveSpotlight, SpotlightChoice } from '@/lib/calls/call-spotlight';
import { chooseGrid, chooseMember, chooseSelf } from '@/lib/calls/call-spotlight-gestures';
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
import { initialsOf } from '@/lib/view/conversation';


const CallSelfCamera = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallSelfCamera })));

/**
 * **LA GRILLE D'UN APPEL DE GROUPE** (#3721, #8392, #8393) — une tuile par
 * participant, la sienne en dernier, chacune bordée de la couleur STABLE de sa
 * personne (celle de son nom dans les sous-titres). Toucher une tuile la met à
 * la une, les autres passent en bandeau ; « Grille » rend la grille.
 *
 * Dès qu'un membre partage son écran, son ÉCRAN monte seul à la une, affiché
 * ENTIER (`contain` : rogner un écran en cache le texte), son portrait en
 * médaillon, sous « Écran de X ». Un choix manuel l'emporte ; la règle vit dans
 * `lib/calls/call-spotlight.ts`, le choix reste local. Le plein écran s'offre
 * sur toute tuile à la une (#9098). MA tuile passe à la une comme les autres,
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
  /** Le zoom de l'écran partagé à la une (pincer, Ctrl + molette, double toucher) : son crochet et ses lois vivent dans l'écran, qui le remet. */
  readonly useScreenZoom: typeof useScreenZoom;
  /** Le bandeau des autres sort par son bord quand l'écran devient plein, et revient par lui (U2.10). */
  readonly HeldSwap: typeof HeldSwap;
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
  /** Le plein écran de la tuile à la une : le bandeau et tout le reste s'effacent. */
  readonly immersive: boolean;
  readonly onToggleImmersive: () => void;
  readonly moderation: CallModeration | null;
  readonly language: InterfaceLanguage;
  /** Le chrome est-il affiché (#9183, `GroupStageTapRule.outcome(isChromeVisible:)` sur iOS). Par défaut visible : une scène sans chrome à gérer (témoins qui n'en parlent pas) garde l'ancien comportement. */
  readonly chromeVisible?: boolean;
  readonly onRevealChrome?: () => void;
  /** L'écran est-il plus large que haut : 2 × 3 devient 3 × 2, le bandeau passe en colonne à droite (`GroupCallGridLayout`, P11.1, P14.2). */
  readonly landscape?: boolean;
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

function NameLabel({ name, muted, suffix }: { readonly name: string; readonly muted: boolean; readonly suffix: string | null }) {
  return (
    <span className="glass-call absolute bottom-2 start-2 flex max-w-[85%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-mini">
      {muted ? (
        <span className="contents" data-call-tile-muted="">
          <GlyphSvg glyph={CALL_SCREEN_GLYPHS.microphoneSlash} size={12} />
        </span>
      ) : null}
      {name}
      {suffix === null ? null : ` · ${suffix}`}
    </span>
  );
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
      {subject.video ? <HeldVideo held={held} subject={subject} /> : <kit.Portrait name={subject.name} avatar={subject.avatar} size={portrait} pulse={subject.ringing} presenceKey={subject.presenceKey} tint={subject.color} />}
      <NameLabel name={subject.shown} muted={subject.muted} suffix={subject.suffix} />
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

function SharedScreen({ kit, member, stream, language }: { readonly kit: CallGridKit; readonly member: CallMember; readonly stream: MediaStream | undefined; readonly language: InterfaceLanguage }) {
  const title = translate(language, 'call.screen.of', { name: member.name });
  const { zoom, pinching, handlers } = kit.useScreenZoom();
  const hint = useId();
  return (
    <div className="relative min-h-0 min-w-0 flex-1 origin-top-left overflow-hidden rounded-card" style={{ touchAction: 'none' }} data-call-slot={member.userId} aria-describedby={hint} data-call-shared-screen="" data-call-screen-zoom={String(zoom)} {...handlers}>
      <div className={`absolute inset-0 ${pinching ? '' : 'transition-transform duration-200 motion-reduce:transition-none'}`} style={zoom === 1 ? undefined : { transform: `scale(${zoom})` }}>
        <StreamVideo stream={stream ?? null} mirrored={false} fit="contain" className="absolute inset-0 size-full" label={title} member={member.userId} />
      </div>
      <span id={hint} hidden>
        {translateCallControls(language, 'callControls.screenZoom.hint')}
      </span>
      <div className="absolute bottom-2 right-2 overflow-hidden rounded-full border-2" style={{ borderColor: kit.colorOf(member.userId) }} data-call-screen-medallion="">
        <PeerAvatar presenceKey={member.userId} initials={initialsOf(member.name)} color={colorForName(member.name)} size={44} {...(member.avatar === null ? {} : { src: member.avatar })} />
      </div>
      <span className="glass-call-prominent absolute start-2 top-2 flex max-w-[70%] items-center gap-1 rounded-full px-3 py-1 text-mini font-semibold" role="status" data-call-screen-banner="">
        <GlyphSvg glyph={CALL_SCREEN_GLYPHS.monitorArrowUp} size={14} />
        <span className="truncate">{title}</span>
        {zoom > 1 ? <span aria-hidden="true">{` · ${zoomLabel(zoom, language)}`}</span> : null}
      </span>
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
  const fade = `linear-gradient(to ${bottom ? 'right' : 'bottom'}, transparent, #000 8px, #000 calc(100% - 8px), transparent)`;
  return bottom ? { maskImage: fade, gridAutoColumns: STRIP_TILE_WIDTH, gridTemplateRows: STRIP_TILE_HEIGHT, height: STRIP_TILE_HEIGHT + 2 * STRIP_HALO_PAD } : { maskImage: fade, gridAutoRows: STRIP_TILE_HEIGHT, gridTemplateColumns: STRIP_TILE_WIDTH, width: STRIP_COLUMN_WIDTH };
};

const SCROLL_HIDDEN = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

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
  readonly full: boolean;
  readonly leaving: boolean;
  readonly onGrid: () => void;
  readonly onToggleImmersive: () => void;
  readonly children: ReactNode;
};

/**
 * La capsule « Revenir à la grille · Plein écran » : en place avec la une, ou — `leaving` — retenue au retour à la
 * grille le temps de son fondu (U1.12). Plein écran, elle échappe au rangement du chrome (U2.4).
 */
function SpotlightCapsule({ kit, language, screen, full, leaving, onGrid, onToggleImmersive, children }: CapsuleProps) {
  return (
    <div className={`absolute ${leaving ? 'end-5' : 'end-2'} top-2 flex flex-col items-end gap-2`} data-call-chrome-fade="" {...(full ? { 'data-call-chrome-keep': '' } : {})}>
      <kit.Arrives leaving={leaving} className={`${screen ? 'glass-call-prominent' : 'glass-call'} flex gap-1 rounded-full p-1`} data-call-spotlight-capsule="">
        <kit.Button label={translate(language, 'call.spotlight.back')} glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS.squaresFour} size={20} />} onPress={onGrid} size={44} data={{ 'data-call-grid-back': '' }} />
        <kit.Button
          label={translate(language, full ? 'call.fullscreen.exit' : 'call.fullscreen.enter')}
          glyph={<GlyphSvg glyph={CALL_VIEW_GLYPHS[full ? 'cornersIn' : 'cornersOut']} size={20} />}
          onPress={onToggleImmersive}
          pressed={full}
          size={44}
          data={{ 'data-call-fullscreen': '' }}
        />
      </kit.Arrives>
      {children}
    </div>
  );
}

export function CallGrid({ kit, members, remoteStreams, self, selfZoom = null, choice, onChoose, immersive, onToggleImmersive, moderation, language, chromeVisible = true, onRevealChrome = () => undefined, landscape = false }: CallGridProps) {
  const press = kit.usePressedChrome(chromeVisible);
  /** #9183 — chrome masqué, toucher une vignette le RENDS au lieu de changer la une (`GroupStageTapRule` sur iOS) ; décidé à la descente du pointeur (#17548). */
  const decide = (next: SpotlightChoice) => () => (press.release() ? onRevealChrome() : onChoose(next));
  const featureLabel = (member: CallMember) => translate(language, 'call.spotlight.show', { name: member.name });
  const view = kit.resolveSpotlight({ members, choice, remoteStreams });
  const held = useHeldVideos(members);
  const shown = useRef<{ readonly screen: boolean; readonly full: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const fullscreen = immersive;
  kit.useStageFlip(root, `${view === null ? 'grid' : `${view.featured?.userId ?? SELF}:${view.screen}`}|${fullscreen}|${landscape}`);
  const mine = selfSubject(kit, self, language);
  const peer = (member: CallMember) => peerSubject(kit, member, remoteStreams[member.userId], language);
  const tile = (subject: Subject, onPress: (() => void) | null, label: string, portrait: number) => ({ kit, subject, held: held.current, onPress, label, portrait, press });
  const selfLabel = translateCallControls(language, 'callControls.spotlight.self');

  const gridScene = (ghost: ReactNode) => (
    <div className="relative grid min-h-[140px] flex-1 gap-2 px-3" style={{ gridTemplateColumns: `repeat(${gridColumns(members.length + 1, landscape)}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}>
      {members.map((member) => {
        const moderated = moderation !== null && moderation.canModerate(member.userId);
        const menu = moderated ? (
          <div className="absolute right-1.5 top-1.5 z-10" data-call-chrome-fade="">
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
  const capsuleOf = (screen: boolean, full: boolean, leaving: boolean, below: ReactNode = null) => (
    <SpotlightCapsule kit={kit} language={language} screen={screen} full={full} leaving={leaving} onGrid={() => onChoose(chooseGrid(sharer?.userId ?? null))} onToggleImmersive={onToggleImmersive}>
      {below}
    </SpotlightCapsule>
  );
  if (view !== null) shown.current = { screen: view.screen, full: fullscreen };

  if (view === null) return <div ref={root} className="contents">{gridScene(shown.current === null ? null : capsuleOf(shown.current.screen, shown.current.full, true))}</div>;

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
            <SharedScreen key={featured.userId} kit={kit} member={featured} stream={remoteStreams[featured.userId]} language={language} />
          ) : (
            <div className="grid min-h-0 min-w-0 flex-1">
              <Slot {...tile(peer(featured), null, featured.name, 96)} />
            </div>
          )}
          {featured === null && selfZoom !== null ? <SelfZoom zoom={selfZoom} stream={self.cameraOn ? self.stream : null} language={language} /> : null}
          {capsuleOf(screen, fullscreen, false, moderated && featured !== null && !fullscreen ? <kit.ModerationSlot member={featured} language={language} moderation={moderation} prominent={screen} /> : null)}
        </div>
        <kit.HeldSwap value={fullscreen ? null : side} shape={side === 'bottom' ? 'bottom' : 'end'} className={`grid shrink-0 gap-2 ${SCROLL_HIDDEN} ${side === 'bottom' ? '-mx-2 grid-flow-col content-center overflow-x-auto overscroll-x-none px-2' : '-my-2 content-start justify-center overflow-y-auto overscroll-y-none py-2'}`} style={stripBox(side)} data-call-strip="" data-call-strip-edge={side}>
          {() => (
            <>
              {peerTiles}
              {featured === null ? null : <Slot {...tile(mine, decide(chooseSelf()), selfLabel, 40)} />}
            </>
          )}
        </kit.HeldSwap>
      </div>
    </div>
  );
}
