import type { ReactNode } from 'react';

import { CALL_REACTION_EMOJIS, type CallReactionEmoji } from '@meeshy/shared/types/call-control-law';
import type { CallRecordingKind } from '@meeshy/shared/types/call-recording';

import { CallPanelFrame, CHIP, chipStyle, PanelRow, type PanelBack } from '@/components/call-panel-frame';
import { callActions } from '@/lib/calls/call-actions';
import { callRecording } from '@/lib/calls/call-recording-live';
import { onRowKeyDown, onRowWheel } from '@/lib/calls/call-row-keys';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **DEUX PANNEAUX DU `(…)`** (#8439, #8437, #8550) — la palette « Réagir »
 * (les huit réactions de la passerelle, `CALL_REACTION_EMOJIS`) et le choix de
 * ce qu'on enregistre (« Audio » | « Vidéo »). Chacun s'ouvre
 * DANS le cadre de la pilule, en une rangée qui défile à l'horizontale
 * (`call-panel-frame.tsx`).
 *
 * Réagir ne ferme pas la palette : on enchaîne ; ma réaction s'affiche aussitôt
 * (`engine-controls.ts`), et le débit est tenu par le moteur. Toucher Audio ou Vidéo ferme le panneau et part à la passerelle, qui recueille
 * l'accord de tous. « Audio et vidéo » n'est offert que là où le navigateur
 * sait filmer un canevas (`captureStream`).
 *
 * Chunk à part (`budgets.json` › `call_control_panels`), chargé au premier
 * appui : il n'importe RIEN de l'écran d'appel (`call_overlay`,
 * `dynamic_only`) — son identifiant et le glyphe de Fermer lui sont remis, et il
 * lit lui-même les flèches d'une rangée (`call-row-keys.ts`).
 */

type PanelBase = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly back?: PanelBack | undefined;
};

const ITEM = 'grid place-items-center rounded-full transition-transform hover:bg-media-fill focus-visible:bg-media-fill active:scale-90 motion-reduce:transition-none';

export function CallReactionPalette({ react = callActions.react, ...base }: PanelBase & { readonly react?: (emoji: CallReactionEmoji) => void }) {
  const title = t(base.language, 'callControls.react.palette');
  return (
    <CallPanelFrame id={base.id} title={title} closeLabel={t(base.language, 'callControls.close')} closeGlyph={base.closeGlyph} onClose={base.onClose} back={base.back} data={{ 'data-call-react-panel': '' }}>
      <PanelRow title={title} role="toolbar" onRowKeyDown={onRowKeyDown} onRowWheel={onRowWheel}>
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

const CHOICES: readonly { readonly kind: CallRecordingKind; readonly label: 'callControls.record.audio' | 'callControls.record.video' }[] = [
  { kind: 'audio', label: 'callControls.record.audio' },
  { kind: 'video', label: 'callControls.record.video' },
];

/**
 * **ENREGISTRER L'APPEL** (G3.2) — le titre, la phrase d'accord (« Tout le monde
 * doit accepter… »), puis DEUX puces larges Audio | Vidéo : toucher l'une lance
 * aussitôt la demande d'accord et referme l'option, il n'y a rien à confirmer.
 */
export function CallRecordChoice({ request = (kind) => void callRecording.request(kind), videoAvailable = canRecordVideo(), ...base }: PanelBase & { readonly request?: (kind: CallRecordingKind) => void; readonly videoAvailable?: boolean }) {
  const title = t(base.language, 'callControls.record.title');
  return (
    <CallPanelFrame id={base.id} title={title} closeLabel={t(base.language, 'callControls.close')} closeGlyph={base.closeGlyph} onClose={base.onClose} back={base.back} data={{ 'data-call-record-choice': '' }}>
      <p className="px-3 text-center text-mini" style={{ color: 'var(--color-on-media-3)' }} data-call-record-consent="">
        {t(base.language, 'callControls.record.consent')}
      </p>
      <div role="toolbar" aria-label={title} aria-orientation="horizontal" onKeyDown={onRowKeyDown} className="grid grid-cols-2 gap-2 px-1.5 pb-0.5">
        {CHOICES.map((choice, index) => (
          <button
            key={choice.kind}
            type="button"
            disabled={choice.kind === 'video' && !videoAvailable}
            onClick={() => {
              request(choice.kind);
              base.onClose();
            }}
            className={`${CHIP} justify-center disabled:opacity-40`}
            style={chipStyle(false)}
            data-call-record-kind={choice.kind}
            data-row-item=""
            {...(index === 0 ? { 'data-panel-first': '' } : {})}
          >
            {t(base.language, choice.label)}
          </button>
        ))}
      </div>
    </CallPanelFrame>
  );
}
