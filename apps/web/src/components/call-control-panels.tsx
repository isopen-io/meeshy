import type { ReactNode } from 'react';

import { CALL_REACTION_EMOJIS, type CallReactionEmoji } from '@meeshy/shared/types/call-control-law';
import type { CallRecordingKind } from '@meeshy/shared/types/call-recording';

import { CallPanelFrame, PanelRow, type PanelBack, type RowKeyDown, type RowWheel } from '@/components/call-panel-frame';
import { callActions } from '@/lib/calls/call-actions';
import { callRecording } from '@/lib/calls/call-recording-live';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **DEUX PANNEAUX DU `(…)`** (#8439, #8437, #8550) — la palette « Réagir »
 * (les huit réactions de la passerelle, `CALL_REACTION_EMOJIS`) et le choix de
 * ce qu'on enregistre (« Audio seul » · « Audio et vidéo »). Chacun s'ouvre
 * DANS le cadre de la pilule, en une rangée qui défile à l'horizontale
 * (`call-panel-frame.tsx`).
 *
 * Réagir ne ferme pas la palette : on enchaîne ; ma réaction s'affiche aussitôt
 * (`engine-controls.ts`), et le débit est tenu par le moteur. Choisir un
 * enregistrement ferme le panneau et part à la passerelle, qui recueille
 * l'accord de tous. « Audio et vidéo » n'est offert que là où le navigateur
 * sait filmer un canevas (`captureStream`).
 *
 * Chunk à part (`budgets.json` › `call_control_panels`), chargé au premier
 * appui : il n'importe RIEN de l'écran d'appel (`call_overlay`,
 * `dynamic_only`) — son identifiant, le glyphe de Fermer et les flèches d'une
 * rangée lui sont remis.
 */

type PanelBase = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onRowKeyDown: RowKeyDown;
  readonly onRowWheel?: RowWheel | undefined;
  readonly back?: PanelBack | undefined;
};

const ITEM = 'grid place-items-center rounded-full transition-transform hover:bg-media-fill focus-visible:bg-media-fill active:scale-90 motion-reduce:transition-none';

export function CallReactionPalette({ react = callActions.react, ...base }: PanelBase & { readonly react?: (emoji: CallReactionEmoji) => void }) {
  const title = t(base.language, 'callControls.react.palette');
  return (
    <CallPanelFrame id={base.id} title={title} closeLabel={t(base.language, 'callControls.close')} closeGlyph={base.closeGlyph} onClose={base.onClose} back={base.back} data={{ 'data-call-react-panel': '' }}>
      <PanelRow title={title} role="toolbar" onRowKeyDown={base.onRowKeyDown} onRowWheel={base.onRowWheel}>
        {CALL_REACTION_EMOJIS.map((emoji, index) => (
          <button
            key={emoji}
            type="button"
            aria-label={t(base.language, 'callControls.react.send', { emoji })}
            onClick={() => react(emoji)}
            className={`${ITEM} size-14 text-[1.9rem] leading-none`}
            data-call-react={emoji}
            data-row-item=""
            {...(index === 0 ? { 'data-panel-first': '' } : {})}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </PanelRow>
    </CallPanelFrame>
  );
}

export const canRecordVideo = (): boolean =>
  typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && typeof MediaRecorder !== 'undefined';

const CHOICES: readonly { readonly kind: CallRecordingKind; readonly label: 'callControls.record.audio' | 'callControls.record.video'; readonly detail: 'callControls.record.audioDetail' | 'callControls.record.videoDetail'; readonly icon: string }[] = [
  { kind: 'audio', label: 'callControls.record.audio', detail: 'callControls.record.audioDetail', icon: '🎙️' },
  { kind: 'video', label: 'callControls.record.video', detail: 'callControls.record.videoDetail', icon: '🎬' },
];

export function CallRecordChoice({ request = (kind) => void callRecording.request(kind), videoAvailable = canRecordVideo(), ...base }: PanelBase & { readonly request?: (kind: CallRecordingKind) => void; readonly videoAvailable?: boolean }) {
  const title = t(base.language, 'callControls.record.title');
  return (
    <CallPanelFrame id={base.id} title={title} closeLabel={t(base.language, 'callControls.close')} closeGlyph={base.closeGlyph} onClose={base.onClose} back={base.back} data={{ 'data-call-record-choice': '' }}>
      <PanelRow title={title} role="toolbar" onRowKeyDown={base.onRowKeyDown} onRowWheel={base.onRowWheel}>
        {CHOICES.map((choice, index) => {
          const disabled = choice.kind === 'video' && !videoAvailable;
          return (
            <button
              key={choice.kind}
              type="button"
              disabled={disabled}
              onClick={() => {
                request(choice.kind);
                base.onClose();
              }}
              className="flex min-h-14 items-center gap-3 rounded-hero px-3 text-start transition-colors hover:bg-media-fill focus-visible:bg-media-fill disabled:opacity-40 motion-reduce:transition-none"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-media-hairline)' }}
              data-call-record-kind={choice.kind}
              data-row-item=""
              {...(index === 0 ? { 'data-panel-first': '' } : {})}
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-[1.3rem]" style={{ background: 'var(--color-media-fill)' }}>
                {choice.icon}
              </span>
              <span className="flex flex-col">
                <span className="whitespace-nowrap text-body font-semibold">{t(base.language, choice.label)}</span>
                <span className="whitespace-nowrap text-mini" style={{ color: 'var(--color-on-media-3)' }}>
                  {t(base.language, choice.detail)}
                </span>
              </span>
            </button>
          );
        })}
      </PanelRow>
    </CallPanelFrame>
  );
}
