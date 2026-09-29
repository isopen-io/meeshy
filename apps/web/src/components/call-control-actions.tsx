import { Fragment, lazy, Suspense, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import type { CallButton, CallButtonTone } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import type { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import type { CallAction, CallControlSet, MineAction } from '@/lib/calls/call-controls';
import type { CallPanelKind, CallPanels } from '@/lib/calls/call-screen-layer';
import type { SelfControlGroup } from '@/lib/calls/call-self-controls';
import { callRecording, callRecordingStore } from '@/lib/calls/call-recording-live';
import type { RowKeyHandler, RowWheelHandler } from '@/lib/calls/call-row-keys';
import type { ActiveCall } from '@/lib/calls/call-store';
import type { LocalZoom } from '@/lib/calls/self-zoom';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LE `(…)` SORT** (#8391, #8550) — les actions de la vue « C
 * adapté », en deux familles, la même chose en duo et en groupe : la pilule
 * GRANDIT vers le haut et monte, au-dessus de sa ligne de commandes, une
 * RANGÉE par famille — « Mon image », puis « L'appel ». Chaque rangée est
 * légendée en petites capitales et DÉFILE À L'HORIZONTALE (accrochage aux
 * boutons, jamais de retour à la ligne) ; chaque bouton garde sa légende et
 * ses 44 de cible. Au clavier, une rangée est une barre d'outils : ← et →
 * vont au voisin (`call-row-keys.ts`).
 *
 * Un seul verre, celui de la pilule : ses rangées et leurs boutons n'en
 * portent pas. Les règles (qui est offert, dans quel ordre) sont dans
 * `lib/calls/call-controls.ts`.
 *
 * Une chose à la fois (#8578, `call-screen-layer.ts`) : Enregistrer au repos
 * (#8437), Ajouter (#8433) et Réagir (#8439) ouvrent un PANNEAU qui REMPLACE
 * les rangées dans le cadre ; Effets (#8442, #8551) et Capturer (#8552)
 * entrent dans un MODE qui libère tout l'écran.
 *
 * Chunk à part (`budgets.json` › `call_action_rows`) : les rangées ne se
 * montrent qu'au `(…)`, et les commandes de ma caméra qu'avec ma vignette ; l'écran
 * d'appel le précharge dès que l'appel vit. Il n'importe RIEN de l'écran
 * d'appel (`call_overlay`, `dynamic_only`) : le bouton de verre, les glyphes,
 * les flèches et la molette d'une rangée, les identifiants lui sont remis
 * (`CallRowsKit`).
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
};

const CAPTIONS_KEY = { off: 'call.captions.on', translated: 'call.captions.original', original: 'call.captions.off' } as const;

const screenGlyph = (name: CallScreenGlyphName, size = 22) => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

type ActionContext = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly panels: CallPanels;
  readonly kit: CallRowsKit;
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
  tone: panels.open === panel ? ('active' as const) : ('bare' as const),
  expanded: panels.open === panel,
  panel,
});

function mineAction(action: MineAction, { call, language, panels, kit }: ActionContext): ActionView {
  switch (action) {
    case 'camera':
      return {
        key: action,
        label: translate(language, call.cameraOn ? 'call.camera.off' : 'call.camera.on'),
        caption: translate(language, 'call.devices.camera'),
        glyph: screenGlyph(call.cameraOn ? 'videoCamera' : 'videoCameraSlash'),
        onPress: callActions.toggleCamera,
        tone: call.cameraOn ? 'active' : 'bare',
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
        tone: 'bare',
        data: { 'data-call-control': 'flip' },
      };
    case 'effects':
      return {
        key: action,
        label: translate(language, 'call.effects.open'),
        caption: translate(language, 'call.effects'),
        glyph: <GlyphSvg glyph={kit.glyphs.magicWand} size={22} />,
        onPress: () => panels.enter('effects'),
        tone: 'bare',
        data: { 'data-call-control': 'effects' },
      };
    case 'screen':
      return {
        key: action,
        label: translate(language, call.screenSharing ? 'call.screen.stop' : 'call.screen.share'),
        caption: translate(language, 'call.screen.short'),
        glyph: screenGlyph('monitorArrowUp'),
        onPress: callActions.toggleScreen,
        tone: call.screenSharing ? 'active' : 'bare',
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
  if (action === 'capture')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.capture.label'),
      caption: translateCallControls(language, 'callControls.capture'),
      glyph: <GlyphSvg glyph={kit.glyphs.aperture} size={22} />,
      onPress: () => panels.enter('montage'),
      tone: 'bare',
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
    tone: call.captionsMode === 'off' ? 'bare' : 'active',
    pressed: call.captionsMode !== 'off',
    data: { 'data-call-captions': '' },
  };
}

function ActionButton({ view, kit }: { readonly view: ActionView; readonly kit: CallRowsKit }) {
  return (
    <kit.Button
      label={view.label}
      glyph={view.glyph}
      onPress={view.onPress}
      tone={view.tone}
      {...(view.pressed === undefined ? {} : { pressed: view.pressed })}
      {...(view.expanded === undefined || view.panel === undefined ? {} : { expanded: view.expanded, controls: kit.panelIds[view.panel], popup: true })}
      {...(view.disabled === undefined ? {} : { disabled: view.disabled })}
      caption={view.caption}
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
function RecordButton({ language, panels, kit }: { readonly language: InterfaceLanguage; readonly panels: CallPanels; readonly kit: CallRowsKit }) {
  const kind = useStore(callRecordingStore, (state) => state.view.kind);
  const idle = kind === 'idle';
  const choosing = idle && panels.open === 'record';
  return (
    <kit.Button
      label={translate(language, idle ? 'callRecording.start' : 'callRecording.stop')}
      glyph={<span aria-hidden className={idle ? 'size-4 rounded-full border-2 border-current' : 'size-3.5 rounded-[3px]'} style={idle ? undefined : { background: 'var(--ios-error-strong)' }} />}
      onPress={() => (idle ? panels.toggle('record') : void callRecording.stop())}
      tone={kind === 'recording' || choosing ? 'active' : 'bare'}
      {...(idle ? { expanded: choosing, controls: kit.panelIds.record, popup: true } : { pressed: kind === 'recording' })}
      disabled={kind === 'asking'}
      caption={translate(language, 'call.record.short')}
      data={{ 'data-call-record': kind, [kit.rowItem]: '' }}
    />
  );
}

function Family({ actions, context }: { readonly actions: readonly (MineAction | CallAction)[]; readonly context: ActionContext }) {
  return (
    <>
      {actions.map((action) => (
        <Fragment key={action}>
          {action === 'record' ? (
            <RecordButton language={context.language} panels={context.panels} kit={context.kit} />
          ) : action === 'camera' || action === 'flip' || action === 'effects' || action === 'screen' ? (
            <ActionButton view={mineAction(action, context)} kit={context.kit} />
          ) : (
            <ActionButton view={callAction(action, context)} kit={context.kit} />
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
export const ROW_TITLE = 'px-2 text-mini font-semibold tracking-wide text-white/70 [font-variant-caps:all-small-caps]';

type RowsProps = { readonly call: ActiveCall; readonly set: CallControlSet; readonly language: InterfaceLanguage; readonly panels: CallPanels; readonly kit: CallRowsKit };

const CallZoomStep = lazy(() => import('./call-self-camera').then((module) => ({ default: module.CallZoomStep })));

const CAMERA_ORDER = ['flip', 'camera', 'effects', 'screen'] as const;

/**
 * LES COMMANDES DE MA CAMÉRA (#8576, #8626) — Retourner, Couper la caméra,
 * Effets (qui entre dans le mode), Partager l'écran, et dans ma vignette le
 * cran du zoom (#8441 : `local`, que l'écran d'appel ne remet qu'à ma
 * vignette, `zoomControlIn`), en une rangée compacte :
 * autour de ma vignette (`tile`, #8747 : `group` en pose une moitié —
 * Effets · Écran au-dessus, Retourner · Couper et le cran en dessous), ou en
 * haut au centre quand mon image remplit l'écran (`top`). ← et → y passent
 * d'un bouton à l'autre.
 */
export function CallCameraControls({ call, set, language, panels, kit, place, local, group, only }: RowsProps & { readonly place: 'tile' | 'top'; readonly local: LocalZoom | null; readonly group?: SelfControlGroup | undefined; readonly only?: readonly MineAction[] | undefined }) {
  const context = { call, language, panels, kit };
  const label = translateCallControls(language, 'callControls.camera.options');
  return (
    <div role="toolbar" aria-label={label} aria-orientation="horizontal" onKeyDown={kit.onRowKeyDown} className="glass-call flex w-max items-center gap-0.5 rounded-full p-0.5" data-call-self-controls={place} data-call-self-group={group}>
      {CAMERA_ORDER.filter((action) => set.mine.includes(action) && (only === undefined || only.includes(action))).map((action) => {
        const view = mineAction(action, context);
        return (
          <kit.Button
            key={action}
            label={view.label}
            glyph={view.glyph}
            onPress={view.onPress}
            tone={view.tone}
            {...(view.pressed === undefined ? {} : { pressed: view.pressed })}
            {...(view.disabled === undefined ? {} : { disabled: view.disabled })}
            size={44}
            data={{ ...view.data, 'data-call-self-control': action, [kit.rowItem]: '' }}
          />
        );
      })}
      {local !== null ? (
        <Suspense fallback={null}>
          <CallZoomStep stream={call.cameraOn && !call.screenSharing ? call.localStream : null} local={local} language={language} Button={kit.Button} rowItem={kit.rowItem} />
        </Suspense>
      ) : null}
    </div>
  );
}

/** Les deux familles, une rangée chacune, dans la pilule qui a grandi. */
export function CallActionRows({ call, set, language, panels, kit }: RowsProps) {
  const context = { call, language, panels, kit };
  const families = [
    ['mine', set.mine, 'call.section.mine'],
    ['call', set.call, 'call.section.call'],
  ] as const;
  return (
    <div id={kit.actionsId} className="flex flex-col gap-2" data-call-actions="rows">
      {families.map(([side, actions, legend]) =>
        actions.length === 0 ? null : (
          <div key={side} role="group" aria-labelledby={`call-row-${side}`} className="flex min-w-0 flex-col gap-1" data-call-row={side}>
            <span id={`call-row-${side}`} className={ROW_TITLE} data-call-row-title="">
              {translate(language, legend)}
            </span>
            <div role="toolbar" aria-labelledby={`call-row-${side}`} aria-orientation="horizontal" onKeyDown={kit.onRowKeyDown} onWheel={kit.onRowWheel} className={ROW_SCROLL} data-call-row-scroll="">
              <Family actions={actions} context={context} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
