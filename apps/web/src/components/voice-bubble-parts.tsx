import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { AudioOnDemandNotice } from '@/lib/view/use-audio-on-demand';
import { voiceFileLabel } from '@/lib/view/voice-file-name';

import { Glyph } from './glyph';

/**
 * LES DEUX PIÈCES DE LA BULLE VOCALE MODERNE — le nom du fichier (tronqué au
 * milieu, masqué pour un vocal enregistré) et la zone « Transcrire », qui
 * demande la transcription à la demande (`useAudioOnDemand`) avec son état en
 * cours et son échec. Extraites de `attachment-blocks.tsx` pour le garder
 * sous budget.
 */
export function VoiceFileName({ originalName }: { readonly originalName: string }) {
  const label = voiceFileLabel(originalName);
  if (label === null) return null;
  return (
    <span data-voice-filename title={originalName.trim()} className="block min-w-0 truncate text-mini opacity-70">
      {label}
    </span>
  );
}

export function VoiceTranscribeZone({
  language,
  busy,
  notice,
  onTranscribe,
}: {
  readonly language: InterfaceLanguage;
  readonly busy: boolean;
  readonly notice: AudioOnDemandNotice | null;
  readonly onTranscribe: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-voice-transcribe
        aria-busy={busy}
        disabled={busy}
        onClick={onTranscribe}
        className="tap-target-22 flex items-center gap-1 rounded-chip px-2 text-mini font-semibold"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', opacity: busy ? 0.6 : 1 }}
      >
        <Glyph name="microphone" size={14} />
        <span>{translate(language, busy ? 'media.audio.transcribing' : 'media.audio.transcribe')}</span>
      </button>
      <span role="status" data-voice-transcribe-notice className="text-mini opacity-80">
        {notice !== null && !busy ? translate(language, notice) : null}
      </span>
    </div>
  );
}
