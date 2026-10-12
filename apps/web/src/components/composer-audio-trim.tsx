import { useEffect, useRef, useState, type ReactNode } from 'react';

import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { AUDIO_GAIN, audioEditUntouched, editedWav, untouchedAudioEdit, volumePercent, type AudioEdit } from '@/lib/media/audio-edit';
import { decodeAudioFile, MINIMUM_AUDIO_WINDOW, trimmedAudioFileName, type DecodedAudio } from '@/lib/media/audio-trim';
import { previewUrlFor } from '@/lib/send/attachment-preview-url';
import type { PendingAttachment } from '@/lib/send/attachments';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * **« ÉDITER » UN AUDIO EN ATTENTE** (#9136, miroir de
 * `MeeshyAudioEditorView` iOS) — un son n'a pas de scène ; il garde son
 * éditeur. Ses outils suivent l'ordre d'iOS (Rogner, Volume — #9164), un seul
 * panneau ouvert à la fois ; chaque réglage reste posé d'un outil à l'autre,
 * et « Terminé » les cuit ENSEMBLE dans la pièce rendue à sa place. Rien de
 * réglé la laisse telle quelle. ✕ ou Échap referment sans rien changer.
 */
type AudioTool = 'trim' | 'volume';

const AUDIO_TOOLS: readonly AudioTool[] = ['trim', 'volume'];

const TOOL_KEY = {
  trim: 'story.studio.audioEdit.tool.trim',
  volume: 'story.studio.audioEdit.tool.volume',
} as const satisfies Record<AudioTool, InterfaceCatalogKey>;

const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds * 10) / 10);
  return `${Math.floor(whole / 60)}:${(whole % 60).toFixed(1).padStart(4, '0')}`;
};

const RANGE_STYLE = { accentColor: 'var(--color-ios-brand)' } as const;

function ToolButton({ on, tool, onPress, children }: { readonly on: boolean; readonly tool: AudioTool; readonly onPress: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-audio-tool={tool}
      onClick={onPress}
      className="min-h-11 flex-1 whitespace-nowrap rounded-xl px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        outlineColor: 'var(--color-ios-brand)',
        color: on ? '#fff' : 'var(--color-ios-ink)',
        backgroundColor: on ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
      }}
    >
      {children}
    </button>
  );
}

function VolumePanel({ lang, gain, onGain }: { readonly lang: InterfaceLanguage; readonly gain: number; readonly onGain: (gain: number) => void }) {
  const percent = volumePercent(gain);
  const label = percent === null ? translate(lang, 'story.studio.audioEdit.volume.normal') : translate(lang, 'story.studio.camera.flash.intensityValue', { percent: String(percent) });
  return (
    <div className="flex flex-col items-center gap-2">
      <label className="flex w-full items-center gap-3">
        <span className="sr-only">{translate(lang, 'story.studio.audioEdit.tool.volume')}</span>
        <input
          type="range"
          data-audio-volume
          min={AUDIO_GAIN.min}
          max={AUDIO_GAIN.max}
          step={AUDIO_GAIN.step}
          value={gain}
          aria-valuetext={label}
          onInput={(event) => onGain(Number(event.currentTarget.value))}
          className="h-11 flex-1"
          style={RANGE_STYLE}
        />
      </label>
      <p className="text-caption font-semibold tabular-nums" aria-live="polite" style={{ color: 'var(--color-ios-brand)' }}>
        {label}
      </p>
    </div>
  );
}

export default function ComposerAudioTrim({
  attachment,
  onDone,
  onCancel,
  decode = decodeAudioFile,
}: {
  readonly attachment: PendingAttachment;
  readonly onDone: (file: File) => void;
  readonly onCancel: () => void;
  /** Injectable pour les témoins ; la production décode par Web Audio. */
  readonly decode?: (file: Blob) => Promise<DecodedAudio | null>;
}) {
  useBackDismiss(onCancel, { escape: true });
  const lang = currentInterfaceLanguage();
  const url = previewUrlFor(attachment.localId, attachment.file);
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null);
  const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<AudioEdit | null>(null);
  const [tool, setTool] = useState<AudioTool>('trim');
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let live = true;
    void decode(attachment.file).then((audio) => {
      if (!live) return;
      if (audio === null) return setFailed(true);
      setDecoded(audio);
      setEdit(untouchedAudioEdit(audio.length / audio.sampleRate));
    });
    return () => {
      live = false;
    };
  }, [attachment.file, decode]);

  const gain = edit?.gain ?? 1;
  useEffect(() => {
    if (player.current !== null) player.current.volume = Math.min(1, gain);
  }, [gain]);

  const total = decoded === null ? 0 : decoded.length / decoded.sampleRate;
  const kept = edit?.window ?? null;
  const finish = () => {
    if (decoded === null || edit === null || audioEditUntouched(edit, total)) return onCancel();
    onDone(new File([editedWav(decoded, edit)], trimmedAudioFileName(attachment.name), { type: 'audio/wav' }));
  };

  return (
    <div
      data-composer-audio-trim
      role="dialog"
      aria-modal="true"
      aria-label={translate(lang, 'story.studio.audioTrim.title')}
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
    >
      <div className="glass flex w-full max-w-md flex-col gap-3 rounded-[22px] p-4" style={{ color: 'var(--color-ios-ink)' }}>
        <h2 className="text-body font-bold">{translate(lang, 'story.studio.audioTrim.title')}</h2>
        <audio ref={player} src={url} controls className="w-full" />
        {failed ? <p role="alert" className="text-caption">{translate(lang, 'story.studio.retouch.failed')}</p> : null}
        {edit !== null ? (
          <div className="flex gap-2" role="group" aria-label={translate(lang, 'story.studio.audioTrim.title')}>
            {AUDIO_TOOLS.map((name) => (
              <ToolButton key={name} tool={name} on={tool === name} onPress={() => setTool(name)}>
                {translate(lang, TOOL_KEY[name])}
              </ToolButton>
            ))}
          </div>
        ) : null}
        {edit !== null && tool === 'volume' ? <VolumePanel lang={lang} gain={edit.gain} onGain={(next) => setEdit({ ...edit, gain: next })} /> : null}
        {edit !== null && kept !== null && tool === 'trim' && total > MINIMUM_AUDIO_WINDOW ? (
          <>
            <p className="text-caption" aria-live="polite">
              {translate(lang, 'story.studio.trim.kept', { kept: clock(kept.end - kept.start), total: clock(total) })}
            </p>
            <label className="flex items-center gap-3">
              <span className="w-14 text-caption font-bold uppercase">{translate(lang, 'story.studio.trim.start')}</span>
              <input
                type="range"
                data-audio-trim-start
                min={0}
                max={total}
                step={0.1}
                value={kept.start}
                aria-valuetext={clock(kept.start)}
                onInput={(event) => setEdit({ ...edit, window: { ...kept, start: Math.min(Number(event.currentTarget.value), kept.end - MINIMUM_AUDIO_WINDOW) } })}
                className="h-11 flex-1"
                style={RANGE_STYLE}
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="w-14 text-caption font-bold uppercase">{translate(lang, 'story.studio.trim.end')}</span>
              <input
                type="range"
                data-audio-trim-end
                min={0}
                max={total}
                step={0.1}
                value={kept.end}
                aria-valuetext={clock(kept.end)}
                onInput={(event) => setEdit({ ...edit, window: { ...kept, end: Math.max(Number(event.currentTarget.value), kept.start + MINIMUM_AUDIO_WINDOW) } })}
                className="h-11 flex-1"
                style={RANGE_STYLE}
              />
            </label>
          </>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" data-audio-trim-cancel onClick={onCancel} className="min-h-11 rounded-full px-4 text-body font-semibold">
            {translate(lang, 'common.close')}
          </button>
          <button
            type="button"
            data-audio-trim-done
            onClick={finish}
            disabled={decoded === null}
            className="min-h-11 rounded-full px-5 text-body font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-ios-brand)' }}
          >
            {translate(lang, 'story.studio.retouch.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
