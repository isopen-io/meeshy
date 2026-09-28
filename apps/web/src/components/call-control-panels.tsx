import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { CALL_REACTION_EMOJIS, type CallReactionEmoji } from '@meeshy/shared/types/call-control-law';
import type { CallRecordingKind } from '@meeshy/shared/types/call-recording';

import { callActions } from '@/lib/calls/call-actions';
import { callRecording } from '@/lib/calls/call-recording-live';
import { translateCallControls as t } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **DEUX PANNEAUX DU `(…)`** (#8439, #8437) — la palette « Réagir » (les huit
 * réactions de la passerelle, `CALL_REACTION_EMOJIS`) et le choix de ce qu'on
 * enregistre (« Audio seul » · « Audio et vidéo »). Ils montent au-dessus de la
 * pilule comme le panneau des effets, dans le même verre sombre.
 *
 * Réagir ne ferme pas la palette : on enchaîne ; ma réaction s'affiche aussitôt
 * (`engine-controls.ts`), et le débit est tenu par le moteur. Choisir un
 * enregistrement ferme le panneau et part à la passerelle, qui recueille
 * l'accord de tous. « Audio et vidéo » n'est offert que là où le navigateur
 * sait filmer un canevas (`captureStream`).
 *
 * Chunk à part (`budgets.json` › `call_control_panels`), chargé au premier
 * appui : il n'importe RIEN de l'écran d'appel (`call_overlay`,
 * `dynamic_only`) — son identifiant et le glyphe de Fermer lui sont remis.
 */

type PanelBase = {
  readonly id: string;
  readonly closeGlyph: ReactNode;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
};

const ITEM = 'grid place-items-center rounded-full transition-transform hover:bg-white/10 focus-visible:bg-white/15 active:scale-90 motion-reduce:transition-none';

function Panel({ id, title, closeGlyph, language, onClose, children, data }: PanelBase & { readonly title: string; readonly children: ReactNode; readonly data: Readonly<Record<`data-${string}`, string>> }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[data-panel-first]')?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  return (
    <div ref={panel} id={id} role="dialog" aria-labelledby={titleId} onKeyDown={onKeyDown} className="glass-call-prominent mx-auto flex w-[min(calc(100%-2rem),24rem)] flex-col gap-2 rounded-[28px] p-3 text-white" {...data}>
      <div className="flex items-center justify-between gap-2 pl-2">
        <h2 id={titleId} className="text-body font-semibold">
          {title}
        </h2>
        <button type="button" aria-label={t(language, 'callControls.close')} title={t(language, 'callControls.close')} onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none">
          {closeGlyph}
        </button>
      </div>
      {children}
    </div>
  );
}

export function CallReactionPalette({ react = callActions.react, ...base }: PanelBase & { readonly react?: (emoji: CallReactionEmoji) => void }) {
  return (
    <Panel {...base} title={t(base.language, 'callControls.react.palette')} data={{ 'data-call-react-panel': '' }}>
      <div role="group" aria-label={t(base.language, 'callControls.react.palette')} className="grid grid-cols-4 justify-items-center gap-1">
        {CALL_REACTION_EMOJIS.map((emoji, index) => (
          <button
            key={emoji}
            type="button"
            aria-label={t(base.language, 'callControls.react.send', { emoji })}
            onClick={() => react(emoji)}
            className={`${ITEM} size-14 text-[1.9rem] leading-none`}
            data-call-react={emoji}
            {...(index === 0 ? { 'data-panel-first': '' } : {})}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

export const canRecordVideo = (): boolean =>
  typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && typeof MediaRecorder !== 'undefined';

const CHOICES: readonly { readonly kind: CallRecordingKind; readonly label: 'callControls.record.audio' | 'callControls.record.video'; readonly detail: 'callControls.record.audioDetail' | 'callControls.record.videoDetail'; readonly icon: string }[] = [
  { kind: 'audio', label: 'callControls.record.audio', detail: 'callControls.record.audioDetail', icon: '🎙️' },
  { kind: 'video', label: 'callControls.record.video', detail: 'callControls.record.videoDetail', icon: '🎬' },
];

export function CallRecordChoice({ request = (kind) => void callRecording.request(kind), videoAvailable = canRecordVideo(), ...base }: PanelBase & { readonly request?: (kind: CallRecordingKind) => void; readonly videoAvailable?: boolean }) {
  return (
    <Panel {...base} title={t(base.language, 'callControls.record.title')} data={{ 'data-call-record-choice': '' }}>
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
            className="flex min-h-14 w-full items-center gap-3 rounded-[20px] px-3 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/15 disabled:opacity-40 motion-reduce:transition-none"
            data-call-record-kind={choice.kind}
            {...(index === 0 ? { 'data-panel-first': '' } : {})}
          >
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-[1.3rem]" style={{ background: 'rgb(255 255 255 / 0.12)' }}>
              {choice.icon}
            </span>
            <span className="flex flex-col">
              <span className="text-body font-semibold">{t(base.language, choice.label)}</span>
              <span className="text-mini" style={{ color: 'rgba(255,255,255,0.72)' }}>
                {t(base.language, choice.detail)}
              </span>
            </span>
          </button>
        );
      })}
    </Panel>
  );
}
