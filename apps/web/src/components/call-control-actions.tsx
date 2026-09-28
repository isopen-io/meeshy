import { Fragment, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { CallButton, type CallButtonTone } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import type { CallAction, CallControlSet, MineAction } from '@/lib/calls/call-controls';
import { callRecording, callRecordingStore } from '@/lib/calls/call-recording-live';
import { onRowKeyDown, onRowWheel, ROW_ITEM } from '@/lib/calls/call-row-keys';
import type { ActiveCall } from '@/lib/calls/call-store';
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
 * Cinq boutons OUVRENT un panneau, un seul à la fois (`CallPanels`) — et il
 * s'ouvre DANS le même cadre, en rangées posées au-dessus des familles :
 * Effets (#8442, #8551), Enregistrer au repos (#8437), Capturer (#8552),
 * Ajouter (#8433) et Réagir (#8439).
 */

export const CALL_ACTIONS_ID = 'call-actions';

const CAPTIONS_KEY = { off: 'call.captions.on', translated: 'call.captions.original', original: 'call.captions.off' } as const;

const screenGlyph = (name: CallScreenGlyphName, size = 22) => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

/** Les panneaux qu'un bouton du `(…)` ouvre dans le cadre de la pilule — un seul à la fois. */
export type CallPanel = 'effects' | 'people' | 'react' | 'record' | 'capture';

export type CallPanels = { readonly open: CallPanel | null; readonly toggle: (panel: CallPanel) => void };

export const CALL_PANEL_ID: Readonly<Record<CallPanel, string>> = {
  effects: 'call-effects-panel',
  people: 'call-people-panel',
  react: 'call-react-panel',
  record: 'call-record-panel',
  capture: 'call-capture-panel',
};

export const CALL_EFFECTS_PANEL_ID = CALL_PANEL_ID.effects;

type ActionContext = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly panels: CallPanels;
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
  readonly panel?: CallPanel;
  readonly disabled?: boolean;
  readonly data: Readonly<Record<`data-${string}`, string>>;
};

const panelView = (panels: CallPanels, panel: CallPanel) => ({
  onPress: () => panels.toggle(panel),
  tone: panels.open === panel ? ('active' as const) : ('bare' as const),
  expanded: panels.open === panel,
  panel,
});

function mineAction(action: MineAction, { call, language, panels }: ActionContext): ActionView {
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
        glyph: <GlyphSvg glyph={CALL_VIEW_GLYPHS.magicWand} size={22} />,
        ...panelView(panels, 'effects'),
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

function callAction(action: Exclude<CallAction, 'record'>, context: ActionContext): ActionView {
  const { language, panels } = context;
  if (action === 'invite')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.invite.label'),
      caption: translateCallControls(language, 'callControls.invite'),
      glyph: <GlyphSvg glyph={CALL_VIEW_GLYPHS.userPlus} size={22} />,
      ...panelView(panels, 'people'),
      data: { 'data-call-control': 'invite' },
    };
  if (action === 'react')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.react.label'),
      caption: translateCallControls(language, 'callControls.react'),
      glyph: <GlyphSvg glyph={CALL_VIEW_GLYPHS.smiley} size={22} />,
      ...panelView(panels, 'react'),
      data: { 'data-call-control': 'react' },
    };
  if (action === 'capture')
    return {
      key: action,
      label: translateCallControls(language, 'callControls.capture.label'),
      caption: translateCallControls(language, 'callControls.capture'),
      glyph: <GlyphSvg glyph={CALL_VIEW_GLYPHS.aperture} size={22} />,
      ...panelView(panels, 'capture'),
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

const ROW_DATA = { [ROW_ITEM]: '' } as const;

function ActionButton({ view }: { readonly view: ActionView }) {
  return (
    <CallButton
      label={view.label}
      glyph={view.glyph}
      onPress={view.onPress}
      tone={view.tone}
      {...(view.pressed === undefined ? {} : { pressed: view.pressed })}
      {...(view.expanded === undefined || view.panel === undefined ? {} : { expanded: view.expanded, controls: CALL_PANEL_ID[view.panel], popup: true })}
      {...(view.disabled === undefined ? {} : { disabled: view.disabled })}
      caption={view.caption}
      data={{ ...view.data, ...ROW_DATA }}
    />
  );
}

/**
 * ENREGISTRER L'APPEL (#8064, #8437) — au repos, le bouton ouvre le choix
 * « Audio seul » · « Audio et vidéo » ; la demande part ensuite à la
 * passerelle, qui recueille l'accord de tous — rien ne s'enregistre avant. Le
 * même bouton renonce à une demande ou arrête l'enregistrement en cours.
 */
function RecordButton({ language, panels }: { readonly language: InterfaceLanguage; readonly panels: CallPanels }) {
  const kind = useStore(callRecordingStore, (state) => state.view.kind);
  const idle = kind === 'idle';
  const choosing = idle && panels.open === 'record';
  return (
    <CallButton
      label={translate(language, idle ? 'callRecording.start' : 'callRecording.stop')}
      glyph={<span aria-hidden className={idle ? 'size-4 rounded-full border-2 border-current' : 'size-3.5 rounded-[3px]'} style={idle ? undefined : { background: 'var(--ios-error-strong)' }} />}
      onPress={() => (idle ? panels.toggle('record') : void callRecording.stop())}
      tone={kind === 'recording' || choosing ? 'active' : 'bare'}
      {...(idle ? { expanded: choosing, controls: CALL_PANEL_ID.record, popup: true } : { pressed: kind === 'recording' })}
      disabled={kind === 'asking'}
      caption={translate(language, 'call.record.short')}
      data={{ 'data-call-record': kind, ...ROW_DATA }}
    />
  );
}

function Family({ actions, context }: { readonly actions: readonly (MineAction | CallAction)[]; readonly context: ActionContext }) {
  return (
    <>
      {actions.map((action) => (
        <Fragment key={action}>
          {action === 'record' ? (
            <RecordButton language={context.language} panels={context.panels} />
          ) : action === 'camera' || action === 'flip' || action === 'effects' || action === 'screen' ? (
            <ActionButton view={mineAction(action, context)} />
          ) : (
            <ActionButton view={callAction(action, context)} />
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
 * au doigt.
 */
export const ROW_SCROLL = 'flex gap-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0';

/** La légende d'une rangée, en petites capitales. */
export const ROW_TITLE = 'px-2 text-mini font-semibold tracking-wide text-white/70 [font-variant-caps:all-small-caps]';

type RowsProps = { readonly call: ActiveCall; readonly set: CallControlSet; readonly language: InterfaceLanguage; readonly panels: CallPanels };

/** Les deux familles, une rangée chacune, dans la pilule qui a grandi. */
export function CallActionRows({ call, set, language, panels }: RowsProps) {
  const context = { call, language, panels };
  const families = [
    ['mine', set.mine, 'call.section.mine'],
    ['call', set.call, 'call.section.call'],
  ] as const;
  return (
    <div id={CALL_ACTIONS_ID} className="flex flex-col gap-2" data-call-actions="rows">
      {families.map(([side, actions, legend]) =>
        actions.length === 0 ? null : (
          <div key={side} role="group" aria-labelledby={`call-row-${side}`} className="flex min-w-0 flex-col gap-1" data-call-row={side}>
            <span id={`call-row-${side}`} className={ROW_TITLE} data-call-row-title="">
              {translate(language, legend)}
            </span>
            <div role="toolbar" aria-labelledby={`call-row-${side}`} aria-orientation="horizontal" onKeyDown={onRowKeyDown} onWheel={onRowWheel} className={ROW_SCROLL} data-call-row-scroll="">
              <Family actions={actions} context={context} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
