import { Fragment, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { CallCameraPicker } from '@/components/call-camera-picker';
import type { CallButton, CallButtonTone } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import type { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import type { CallAction, MineAction } from '@/lib/calls/call-controls';
import type { CallFamilyRow } from '@/lib/calls/call-controls-disposition';
import type { CallPanelKind, CallPanels } from '@/lib/calls/call-screen-layer';
import { callRecording } from '@/lib/calls/call-recording-live';
import { callRecordingStore } from '@/lib/calls/call-recording-store';
import type { RowKeyHandler, RowWheelHandler } from '@/lib/calls/call-row-keys';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LE `(…)` SORT** (#8391, #8550, #17327) — les actions de la vue « C
 * adapté », en deux familles, dans le même ordre et avec les mêmes boutons où
 * qu'elles se posent (`call-controls-disposition.ts`) :
 *
 * - À DEUX, un RAIL vertical par famille sur les bords de l'écran (`CallActionRail`) :
 *   « Mon image » au début, « L'appel » à la fin, des boutons de 44 sans
 *   légende dans une capsule de verre, que le doigt fait défiler quand l'écran
 *   est court. ↑ et ↓ vont au voisin ;
 * - À PLUSIEURS, la pilule GRANDIT vers le haut et monte une RANGÉE par famille
 *   (`CallActionRows`) — « Mon image », puis « L'appel » —, légendée en petites
 *   capitales, qui DÉFILE À L'HORIZONTALE (accrochage aux boutons, jamais de
 *   retour à la ligne) ; chaque bouton garde sa légende et ses 44 de cible.
 *   ← et → vont au voisin (`call-row-keys.ts`).
 *
 * Un seul verre : celui de la pilule pour ses rangées, celui de la capsule pour
 * un rail ; leurs boutons n'en portent pas. Les règles (qui est offert, dans
 * quel ordre) sont dans `lib/calls/call-controls.ts`.
 *
 * Comme iOS (#9094, #9095) : sur un ordinateur à plusieurs webcams, le choix
 * de la caméra (`call-camera-picker.tsx`) remplace Retourner ; Effets se
 * montre actif quand un effet est posé ; un appel vocal propose d'ajouter la
 * vidéo (la caméra et son « + ») ; l'image dans l'image ferme la famille
 * « l'appel ».
 *
 * Une chose à la fois (#8578, `call-screen-layer.ts`) : Enregistrer au repos
 * (#8437), Ajouter (#8433) et Réagir (#8439) ouvrent un PANNEAU qui REMPLACE
 * les rails ou les rangées ; Effets (#8442, #8551) et Capturer (#8552)
 * entrent dans un MODE qui libère tout l'écran.
 *
 * Chunk à part (`budgets.json` › `call_action_rows`) : les actions ne se
 * montrent qu'au `(…)` ; l'écran d'appel le précharge dès que l'appel vit. Il
 * n'importe RIEN de l'écran d'appel (`call_overlay`, `dynamic_only`) : le
 * bouton de verre, les glyphes, les flèches et la molette d'une rangée, les
 * identifiants lui sont remis (`CallRowsKit`).
 */

/** Ce que l'écran d'appel remet aux rangées et aux commandes de ma caméra. */
export type CallRowsKit = {
  readonly Button: typeof CallButton;
  readonly glyphs: typeof CALL_VIEW_GLYPHS;
  readonly onRowKeyDown: RowKeyHandler;
  readonly onRowWheel: RowWheelHandler;
  readonly rowItem: string;
  readonly actionsId: string;
  readonly panelIds: Readonly<Record<CallPanelKind, string>>;
  /** Un effet est posé sur ma vidéo : Effets se montre actif (`.active` d'iOS, #9095). Un hook. */
  readonly useEffectsActive: () => boolean;
  /** La caméra derrière la piste envoyée (les effets en font une autre piste). */
  readonly cameraSourceOf: (track: MediaStreamTrack) => MediaStreamTrack;
  /** L'image dans l'image, ouverte DANS le geste (`requestCallPip`). */
  readonly requestPip: () => void;
  readonly pipGlyph: ReactNode;
};

const CAPTIONS_KEY = { off: 'call.captions.on', translated: 'call.captions.original', original: 'call.captions.off' } as const;

const screenGlyph = (name: CallScreenGlyphName, size = 22) => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

/** Un glyphe et son badge, à la manière des `*.badge.*` d'iOS (`video.badge.plus`, `camera.badge.ellipsis`). */
const badged = (base: ReactNode, badge: ReactNode) => (
  <span className="relative grid place-items-center">
    {base}
    <span aria-hidden className="absolute -right-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full" style={{ background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' }}>
      {badge}
    </span>
  </span>
);

/**
 * La caméra allumée, coupée, ou — dans un appel VOCAL — à ajouter : iOS y
 * pose `video.badge.plus`, la caméra et son « + » (#9095).
 */
function cameraGlyph(call: ActiveCall, kit: CallRowsKit): ReactNode {
  const state = call.cameraOn ? 'on' : call.media === 'audio' ? 'add' : 'off';
  const glyph = state === 'on' ? screenGlyph('videoCamera') : state === 'off' ? screenGlyph('videoCameraSlash') : badged(screenGlyph('videoCamera'), <GlyphSvg glyph={kit.glyphs.plus} size={10} />);
  return <span className="contents" data-call-camera-glyph={state}>{glyph}</span>;
}

type ActionContext = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly panels: CallPanels;
  readonly kit: CallRowsKit;
  readonly effectsActive: boolean;
};

type ActionView = {
  readonly key: string;
  readonly label: string;
  readonly caption: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly tone: CallButtonTone;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly panel?: CallPanelKind;
  readonly disabled?: boolean;
  readonly data: Readonly<Record<`data-${string}`, string>>;
};

const panelView = (panels: CallPanels, panel: CallPanelKind) => ({
  onPress: () => panels.toggle(panel),
  tone: panels.open === panel ? ('active' as const) : ('disc' as const),
  expanded: panels.open === panel,
  panel,
});

function mineAction(action: Exclude<MineAction, 'camera-picker'>, { call, language, panels, kit, effectsActive }: ActionContext): ActionView {
  switch (action) {
    case 'camera':
      return {
        key: action,
        label: translate(language, call.cameraOn ? 'call.camera.off' : 'call.camera.on'),
        caption: translate(language, 'call.devices.camera'),
        glyph: cameraGlyph(call, kit),
        onPress: callActions.toggleCamera,
        tone: call.cameraOn ? 'active' : 'disc',
        pressed: call.cameraOn,
        disabled: call.screenSharing,
        data: { 'data-call-control': 'camera' },
      };
    case 'flip':
      return {
        key: action,
        label: translate(language, 'call.flip.label'),
        caption: translate(language, 'call.flip'),
        glyph: screenGlyph('cameraRotate'),
        onPress: callActions.switchCamera,
        tone: 'disc',
        data: { 'data-call-control': 'flip' },
      };
    case 'effects':
      return {
        key: action,
        label: translate(language, 'call.effects.open'),
        caption: translate(language, 'call.effects'),
        glyph: <GlyphSvg glyph={kit.glyphs.magicWand} size={22} />,
        onPress: () => panels.enter('effects'),
        tone: effectsActive ? 'active' : 'disc',
        pressed: effectsActive,
        data: { 'data-call-control': 'effects' },
      };
    case 'screen':
      return {
        key: action,
        label: translate(language, call.screenSharing ? 'call.screen.stop' : 'call.screen.share'),
        caption: translate(language, 'call.screen.short'),
        glyph: screenGlyph('monitorArrowUp'),
        onPress: callActions.toggleScreen,
        tone: call.screenSharing ? 'active' : 'disc',
        pressed: call.screenSharing,
        data: { 'data-call-screen-share': '' },
      };
  }
}

/** Le Journal (#8579) : une page et ses lignes — ce qui a été dit, et sa traduction. */
const journalGlyph = (
  <svg aria-hidden viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3.5h9l3 3v14H6z" />
    <path d="M9 9.5h6M9 13h6M9 16.5h3.5" />
  </svg>
);

function callAction(action: Exclude<CallAction, 'record'>, context: ActionContext): ActionView {
  const { language, panels, kit } = context;
  if (action === 'invite')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.invite.label'),
      caption: translateCallControls(language, 'callControls.invite'),
      glyph: <GlyphSvg glyph={kit.glyphs.userPlus} size={22} />,
      ...panelView(panels, 'people'),
      data: { 'data-call-control': 'invite' },
    };
  if (action === 'react')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.react.label'),
      caption: translateCallControls(language, 'callControls.react'),
      glyph: <GlyphSvg glyph={kit.glyphs.smiley} size={22} />,
      ...panelView(panels, 'react'),
      data: { 'data-call-control': 'react' },
    };
  if (action === 'journal')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.journal.label'),
      caption: translateCallControls(language, 'callControls.journal'),
      glyph: journalGlyph,
      ...panelView(panels, 'journal'),
      data: { 'data-call-control': 'journal' },
    };
  if (action === 'pip')
    return {
      key: action,
      label: translate(language, 'call.pip.enter'),
      caption: translateCallControls(language, 'callControls.pip'),
      glyph: kit.pipGlyph,
      onPress: kit.requestPip,
      tone: 'disc',
      data: { 'data-call-control': 'pip', 'data-call-pip': '' },
    };
  if (action === 'capture')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.capture.label'),
      caption: translateCallControls(language, 'callControls.capture'),
      glyph: <GlyphSvg glyph={kit.glyphs.aperture} size={22} />,
      onPress: () => panels.enter('montage'),
      tone: 'disc',
      data: { 'data-call-control': 'capture' },
    };
  return captionsAction(context);
}

function captionsAction({ call, language }: ActionContext): ActionView {
  const invited = call.captionsMode === 'off' && call.captionPeers.length > 0;
  return {
    key: 'captions',
    label: translate(language, invited ? 'call.captions.invited' : CAPTIONS_KEY[call.captionsMode]),
    caption: translate(language, 'callCaptions.region'),
    glyph: (
      <span className="relative">
        {screenGlyph('closedCaptioning')}
        {invited ? <span className="absolute -right-1 -top-1 size-2.5 rounded-full" style={{ background: 'var(--ios-success)' }} /> : null}
      </span>
    ),
    onPress: callActions.toggleCaptions,
    tone: call.captionsMode === 'off' ? 'disc' : 'active',
    pressed: call.captionsMode !== 'off',
    data: { 'data-call-captions': '' },
  };
}

/** Une rangée de la pilule légende ses boutons ; un rail n'en porte pas et tient des cibles de 44. */
type Variant = 'row' | 'rail';

const RAIL_BUTTON = 44;

function ActionButton({ view, kit, variant }: { readonly view: ActionView; readonly kit: CallRowsKit; readonly variant: Variant }) {
  return (
    <kit.Button
      label={view.label}
      glyph={view.glyph}
      onPress={view.onPress}
      tone={view.tone}
      {...(view.pressed === undefined ? {} : { pressed: view.pressed })}
      {...(view.expanded === undefined || view.panel === undefined ? {} : { expanded: view.expanded, controls: kit.panelIds[view.panel], popup: true })}
      {...(view.disabled === undefined ? {} : { disabled: view.disabled })}
      {...(variant === 'rail' ? { size: RAIL_BUTTON } : { caption: view.caption })}
      data={{ ...view.data, [kit.rowItem]: '' }}
    />
  );
}

/**
 * ENREGISTRER L'APPEL (#8064, #8437) — au repos, le bouton ouvre le choix
 * « Audio seul » · « Audio et vidéo » ; la demande part ensuite à la
 * passerelle, qui recueille l'accord de tous — rien ne s'enregistre avant. Le
 * même bouton renonce à une demande ou arrête l'enregistrement en cours.
 */
function RecordButton({ language, panels, kit, variant }: { readonly language: InterfaceLanguage; readonly panels: CallPanels; readonly kit: CallRowsKit; readonly variant: Variant }) {
  const kind = useStore(callRecordingStore, (state) => state.view.kind);
  const idle = kind === 'idle';
  const choosing = idle && panels.open === 'record';
  return (
    <kit.Button
      label={translate(language, idle ? 'callRecording.start' : 'callRecording.stop')}
      glyph={<span aria-hidden className={idle ? 'size-4 rounded-full border-2 border-current' : 'size-3.5 rounded-[3px]'} style={idle ? undefined : { background: 'var(--ios-error-strong)' }} />}
      onPress={() => (idle ? panels.toggle('record') : void callRecording.stop())}
      tone={kind === 'recording' || choosing ? 'active' : 'disc'}
      {...(idle ? { expanded: choosing, controls: kit.panelIds.record, popup: true } : { pressed: kind === 'recording' })}
      disabled={kind === 'asking'}
      {...(variant === 'rail' ? { size: RAIL_BUTTON } : { caption: translate(language, 'call.record.short') })}
      data={{ 'data-call-record': kind, [kit.rowItem]: '' }}
    />
  );
}

const pickerGlyph = (kit: CallRowsKit) => badged(screenGlyph('videoCamera'), <GlyphSvg glyph={kit.glyphs.dotsThree} size={10} />);

function Family({ actions, context, variant }: { readonly actions: readonly (MineAction | CallAction)[]; readonly context: ActionContext; readonly variant: Variant }) {
  return (
    <>
      {actions.map((action) => (
        <Fragment key={action}>
          {action === 'record' ? (
            <RecordButton language={context.language} panels={context.panels} kit={context.kit} variant={variant} />
          ) : action === 'camera-picker' ? (
            <CallCameraPicker call={context.call} language={context.language} kit={context.kit} glyph={pickerGlyph(context.kit)} captioned={variant === 'row'} data={{ 'data-call-control': 'camera-picker', [context.kit.rowItem]: '' }} />
          ) : action === 'camera' || action === 'flip' || action === 'effects' || action === 'screen' ? (
            <ActionButton view={mineAction(action, context)} kit={context.kit} variant={variant} />
          ) : (
            <ActionButton view={callAction(action, context)} kit={context.kit} variant={variant} />
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Le défilement d'une rangée : horizontal, LIBRE, sans barre visible (#8575).
 * Aucune accroche : `snap-start` sur chaque bouton ramenait à 0 toute rangée
 * qui ne débordait que d'un bouton, dont le dernier restait hors d'atteinte
 * au doigt. Aucune élasticité non plus (`overscroll-x-none`, #8736) : sur une
 * rangée courte, le bout est atteint à chaque glissé, et la fin du rebond
 * local qu'autorisait `contain` terminait le glissé suivant (#8619).
 */
export const ROW_SCROLL = 'flex gap-1 overflow-x-auto overscroll-x-none px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0';

/** La légende d'une rangée, en petites capitales. */
export const ROW_TITLE = 'px-2 text-mini font-semibold tracking-wide text-on-media-3 [font-variant-caps:all-small-caps]';

const FAMILY_LEGEND = { mine: 'call.section.mine', call: 'call.section.call' } as const;

/** Ce qui défile dans un rail s'efface en fondu à ses deux bords, sur les 8 px de son bord : au repos, aucun bouton n'est estompé. */
const RAIL_FADE = { maskImage: 'linear-gradient(to bottom, transparent, #000 8px, #000 calc(100% - 8px), transparent)' } as const;

/**
 * UN RAIL (#17327) — une famille en colonne de verre sur le bord de l'écran :
 * des boutons de 44 sans légende, qui défilent DANS la capsule quand l'écran
 * est court (paysage), en s'effaçant en fondu en haut comme en bas (facture
 * #17406) — le verre, lui, reste entier : le fondu est posé sur ce qui défile,
 * jamais sur la capsule, et les disques des boutons n'ont pas de flou qu'il
 * couperait. Le nom de la famille est celui de la rangée du groupe : « Mon
 * image », « L'appel ».
 */
export function CallActionRail({ call, row, language, panels, kit }: { readonly call: ActiveCall; readonly row: CallFamilyRow; readonly language: InterfaceLanguage; readonly panels: CallPanels; readonly kit: CallRowsKit }) {
  const context = { call, language, panels, kit, effectsActive: kit.useEffectsActive() };
  return (
    <div
      role="toolbar"
      aria-label={translate(language, FAMILY_LEGEND[row.family])}
      aria-orientation="vertical"
      onKeyDown={kit.onRowKeyDown}
      className="glass-call pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-full"
      data-call-rail={row.family}
    >
      <div className="flex min-h-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0" style={RAIL_FADE} data-call-rail-scroll="">
        <Family actions={row.actions} context={context} variant="rail" />
      </div>
    </div>
  );
}

/** Les familles qu'on lui remet, une rangée chacune, dans la pilule qui a grandi. */
export function CallActionRows({ call, rows, language, panels, kit }: { readonly call: ActiveCall; readonly rows: readonly CallFamilyRow[]; readonly language: InterfaceLanguage; readonly panels: CallPanels; readonly kit: CallRowsKit }) {
  const context = { call, language, panels, kit, effectsActive: kit.useEffectsActive() };
  return (
    <div id={kit.actionsId} className="flex flex-col gap-2" data-call-actions="rows">
      {rows.map(({ family, actions }) => (
        <div key={family} role="group" aria-labelledby={`call-row-${family}`} className="flex min-w-0 flex-col gap-1" data-call-row={family}>
          <span id={`call-row-${family}`} className={ROW_TITLE} data-call-row-title="">
            {translate(language, FAMILY_LEGEND[family])}
          </span>
          <div role="toolbar" aria-labelledby={`call-row-${family}`} aria-orientation="horizontal" onKeyDown={kit.onRowKeyDown} onWheel={kit.onRowWheel} className={ROW_SCROLL} data-call-row-scroll="">
            <Family actions={actions} context={context} variant="row" />
          </div>
        </div>
      ))}
    </div>
  );
}
