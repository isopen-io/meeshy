import { useEffect, useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  audioTrimUntouched,
  decodeAudioFile,
  MINIMUM_AUDIO_WINDOW,
  trimmedAudioFileName,
  trimmedWav,
  type AudioWindow,
  type DecodedAudio,
} from '@/lib/media/audio-trim';
import { previewUrlFor } from '@/lib/send/attachment-preview-url';
import type { PendingAttachment } from '@/lib/send/attachments';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * **« ÉDITER » UN AUDIO EN ATTENTE : LE COUPER** (#9136, miroir de
 * `MeeshyAudioEditorView` iOS) — un son n'a pas de scène ; il garde son
 * éditeur, qui en garde la fenêtre choisie (début, fin). « Terminé » rend la
 * pièce coupée à sa place ; une fenêtre qui couvre tout le son la laisse telle
 * quelle. ✕ ou Échap referment sans rien changer.
 */
const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds * 10) / 10);
  return `${Math.floor(whole / 60)}:${(whole % 60).toFixed(1).padStart(4, '0')}`;
};

const RANGE_STYLE = { accentColor: 'var(--color-ios-brand)' } as const;

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
  const [kept, setKept] = useState<AudioWindow | null>(null);
  useEffect(() => {
    let live = true;
    void decode(attachment.file).then((audio) => {
      if (!live) return;
      if (audio === null) return setFailed(true);
      setDecoded(audio);
      setKept({ start: 0, end: audio.length / audio.sampleRate });
    });
    return () => {
      live = false;
    };
  }, [attachment.file, decode]);

  const total = decoded === null ? 0 : decoded.length / decoded.sampleRate;
  const finish = () => {
    if (decoded === null || kept === null || audioTrimUntouched(kept, total)) return onCancel();
    onDone(new File([trimmedWav(decoded, kept)], trimmedAudioFileName(attachment.name), { type: 'audio/wav' }));
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
        <audio src={url} controls className="w-full" />
        {failed ? <p role="alert" className="text-caption">{translate(lang, 'story.studio.retouch.failed')}</p> : null}
        {kept !== null && total > MINIMUM_AUDIO_WINDOW ? (
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
                onInput={(event) => setKept({ ...kept, start: Math.min(Number(event.currentTarget.value), kept.end - MINIMUM_AUDIO_WINDOW) })}
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
                onInput={(event) => setKept({ ...kept, end: Math.max(Number(event.currentTarget.value), kept.start + MINIMUM_AUDIO_WINDOW) })}
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
