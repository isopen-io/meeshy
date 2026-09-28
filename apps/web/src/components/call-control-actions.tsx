import { Fragment, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { CallButton, type CallButtonTone } from '@/components/call-glass-button';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS, type CallScreenGlyphName } from '@/components/glyphs-call-screen';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callActions } from '@/lib/calls/call-actions';
import type { CallAction, CallControlSet, MineAction } from '@/lib/calls/call-controls';
import { callRecording, callRecordingStore } from '@/lib/calls/call-recording-live';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LE `(…)` SORT** (#8391) — les actions de la vue « C adapté », en
 * deux familles :
 *
 * - en DUO, deux rails verticaux de verre collés aux bords, à mi-hauteur :
 *   à gauche « mon image », à droite « l'appel ». Pas de légende : le libellé
 *   accessible et son infobulle nomment chaque bouton ;
 * - en GROUPE, deux rangées légendées (grille de 4) dans la pilule qui a
 *   grandi : d'abord mon image, puis l'appel.
 *
 * Un seul verre par groupe : le rail porte le verre, ses boutons non. Les
 * règles (qui est offert, dans quel ordre) sont dans `lib/calls/call-controls.ts`.
 *
 * Quatre boutons OUVRENT un panneau au-dessus de la pilule, un seul à la fois
 * (`CallPanels`) : Effets (#8442), Ajouter (#8433), Réagir (#8439) et, au
 * repos, Enregistrer (#8437), qui demande d'abord « Audio seul » ou « Audio et
 * vidéo ».
 */

export const CALL_ACTIONS_ID = 'call-actions';

const CAPTIONS_KEY = { off: 'call.captions.on', translated: 'call.captions.original', original: 'call.captions.off' } as const;

const screenGlyph = (name: CallScreenGlyphName, size = 22) => <GlyphSvg glyph={CALL_SCREEN_GLYPHS[name]} size={size} />;

/** Les panneaux qu'un bouton du `(…)` ouvre au-dessus de la pilule — un seul à la fois. */
export type CallPanel = 'effects' | 'people' | 'react' | 'record';

export type CallPanels = { readonly open: CallPanel | null; readonly toggle: (panel: CallPanel) => void };

export const CALL_PANEL_ID: Readonly<Record<CallPanel, string>> = {
  effects: 'call-effects-panel',
  people: 'call-people-panel',
  react: 'call-react-panel',
  record: 'call-record-panel',
};

export const CALL_EFFECTS_PANEL_ID = CALL_PANEL_ID.effects;

type ActionContext = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly panels: CallPanels;
  /** Montre la légende sous le bouton (rangées d'un groupe). */
  readonly captioned: boolean;
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

function ActionButton({ view, captioned }: { readonly view: ActionView; readonly captioned: boolean }) {
  return (
    <CallButton
      label={view.label}
      glyph={view.glyph}
      onPress={view.onPress}
      tone={view.tone}
      {...(view.pressed === undefined ? {} : { pressed: view.pressed })}
      {...(view.expanded === undefined || view.panel === undefined ? {} : { expanded: view.expanded, controls: CALL_PANEL_ID[view.panel], popup: true })}
      {...(view.disabled === undefined ? {} : { disabled: view.disabled })}
      {...(captioned ? { caption: view.caption } : {})}
      data={view.data}
    />
  );
}

/**
 * ENREGISTRER L'APPEL (#8064, #8437) — au repos, le bouton ouvre le choix
 * « Audio seul » · « Audio et vidéo » ; la demande part ensuite à la
 * passerelle, qui recueille l'accord de tous — rien ne s'enregistre avant. Le
 * même bouton renonce à une demande ou arrête l'enregistrement en cours. Il a
 * quitté l'en-tête pour le rail de l'appel (#8391).
 */
function RecordButton({ language, captioned, panels }: { readonly language: InterfaceLanguage; readonly captioned: boolean; readonly panels: CallPanels }) {
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
      {...(captioned ? { caption: translate(language, 'call.record.short') } : {})}
      data={{ 'data-call-record': kind }}
    />
  );
}

function Family({ actions, context }: { readonly actions: readonly (MineAction | CallAction)[]; readonly context: ActionContext }) {
  return (
    <>
      {actions.map((action) => (
        <Fragment key={action}>
          {action === 'record' ? (
            <RecordButton language={context.language} captioned={context.captioned} panels={context.panels} />
          ) : action === 'camera' || action === 'flip' || action === 'effects' || action === 'screen' ? (
            <ActionButton view={mineAction(action, context)} captioned={context.captioned} />
          ) : (
            <ActionButton view={callAction(action, context)} captioned={context.captioned} />
          )}
        </Fragment>
      ))}
    </>
  );
}

type FamiliesProps = { readonly call: ActiveCall; readonly set: CallControlSet; readonly language: InterfaceLanguage; readonly prominent: boolean; readonly panels: CallPanels };

const RAIL_SIDE = { mine: 'left-3', call: 'right-3' } as const;

/** Les deux rails du duo — collés aux bords, à mi-hauteur. */
export function CallRails({ call, set, language, prominent, panels }: FamiliesProps) {
  const context = { call, language, panels, captioned: false };
  const families = [
    ['mine', set.mine, 'call.section.mine'],
    ['call', set.call, 'call.section.call'],
  ] as const;
  return (
    <div id={CALL_ACTIONS_ID} className="contents" data-call-actions="rails">
      {families.map(([side, actions, legend]) =>
        actions.length === 0 ? null : (
          <div
            key={side}
            role="group"
            aria-label={translate(language, legend)}
            className={`${prominent ? 'glass-call-prominent' : 'glass-call'} absolute top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-full p-1 ${RAIL_SIDE[side]}`}
            data-call-rail={side}
          >
            <Family actions={actions} context={context} />
          </div>
        ),
      )}
    </div>
  );
}

/** Les deux rangées légendées d'un groupe, dans la pilule qui a grandi. */
export function CallActionRows({ call, set, language, panels }: Omit<FamiliesProps, 'prominent'>) {
  const context = { call, language, panels, captioned: true };
  const families = [
    ['mine', set.mine, 'call.section.mine'],
    ['call', set.call, 'call.section.call'],
  ] as const;
  return (
    <div id={CALL_ACTIONS_ID} className="flex flex-col gap-3 px-2 pt-2" data-call-actions="rows">
      {families.map(([side, actions, legend]) =>
        actions.length === 0 ? null : (
          <div key={side} role="group" aria-labelledby={`call-row-${side}`} className="flex flex-col gap-1.5" data-call-row={side}>
            <span id={`call-row-${side}`} className="px-1 text-mini font-semibold text-white">
              {translate(language, legend)}
            </span>
            <div className="grid grid-cols-4 justify-items-center gap-y-2">
              <Family actions={actions} context={context} />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
