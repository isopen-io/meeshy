import { useEffect, useRef, useState } from 'react';

import { BACKDROP_VEIL_DEFAULT, BACKDROP_VEIL_MAX } from '@/lib/export/message-card-layout';
import type { CardSource } from '@/lib/export/message-card-paint';
import { SCROLL_SPEEDS, scrollDurationLabel, scrollSpeedLabel, type ScrollSpeed } from '@/lib/export/message-card-scroll';
import { translateExportCard } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Pill, REST } from './thread-export-controls';

/**
 * **LE FOND CHOISI ET LA VIDÉO QUI DÉFILE D'« IMAGINE »** (#18672, #18671,
 * miroir de `MessageCardBackdropRow` et `MessageCardScrollRow` d'iOS).
 *
 * Une photo ou une vidéo de l'appareil se pose sous la carte, voilée de sa
 * palette pour que le texte reste lisible ; le voile se règle. Elle ne quitte
 * jamais l'appareil : ses pixels ne servent qu'à peindre. Une carte trop
 * longue pour son format, ou posée sur une vidéo, s'enregistre en vidéo :
 * on y règle la vitesse du défilement, de ×0,5 à ×3, et on lit la durée.
 */

export type ChosenBackdropState = {
  readonly id: number;
  readonly url: string;
  readonly kind: 'image' | 'video';
  readonly source: CardSource | null;
  /** La durée d'une vidéo choisie, en millisecondes — `null` : une photo, ou inconnue. */
  readonly durationMs: number | null;
};

const durationOf = (source: CardSource): number | null => {
  const seconds = 'duration' in source && typeof source.duration === 'number' ? source.duration : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
};

/** Les pixels d'un fond choisi : la photo décodée, ou la première image de la vidéo. */
export type BackdropLoader = (file: Blob, url: string, kind: 'image' | 'video') => Promise<CardSource | null>;

export const defaultBackdropLoader: BackdropLoader = async (file, url, kind) => {
  if (kind === 'video') return (await import('@/lib/export/message-card-media-load')).videoAt(url, document, 0);
  return typeof createImageBitmap === 'function' ? createImageBitmap(file) : null;
};

export function useChosenBackdrop(params: {
  readonly load: BackdropLoader;
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
}): {
  readonly backdrop: ChosenBackdropState | null;
  readonly failed: boolean;
  readonly veil: number;
  readonly pick: (file: File) => void;
  readonly remove: () => void;
  readonly setVeil: (veil: number) => void;
} {
  const [backdrop, setBackdrop] = useState<ChosenBackdropState | null>(null);
  const [failed, setFailed] = useState(false);
  const [veil, setVeil] = useState(BACKDROP_VEIL_DEFAULT);
  const latest = useRef(0);
  const shown = useRef<string | null>(null);
  const release = (url: string | null) => {
    if (url !== null) params.revokeObjectURL(url);
  };
  useEffect(() => () => release(shown.current), []);

  const pick = (file: File) => {
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
    if (kind === null) {
      setFailed(true);
      return;
    }
    const id = latest.current + 1;
    latest.current = id;
    const url = params.createObjectURL(file);
    void params
      .load(file, url, kind)
      .catch(() => null)
      .then((source) => {
        if (latest.current !== id) {
          release(url);
          return;
        }
        if (source === null) {
          release(url);
          setFailed(true);
          return;
        }
        release(shown.current);
        shown.current = url;
        setFailed(false);
        setBackdrop({ id, url, kind, source, durationMs: kind === 'video' ? durationOf(source) : null });
      });
  };

  const remove = () => {
    latest.current += 1;
    release(shown.current);
    shown.current = null;
    setFailed(false);
    setBackdrop(null);
  };

  return { backdrop, failed, veil, pick, remove, setVeil };
}

/** « Photo ou vidéo en fond » — puis « Changer le fond », « Retirer le fond » et le voile. */
export function BackdropRow({
  language,
  chosen,
  failed,
  veil,
  onPick,
  onRemove,
  onVeil,
}: {
  readonly language: InterfaceLanguage;
  readonly chosen: boolean;
  readonly failed: boolean;
  readonly veil: number;
  readonly onPick: (file: File) => void;
  readonly onRemove: () => void;
  readonly onVeil: (veil: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pickLabel = translateExportCard(language, chosen ? 'export.card.backdrop.change' : 'export.card.backdrop.pick');
  return (
    <div data-export-backdrop="" className="flex w-full flex-col gap-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          hidden
          data-export-backdrop-file=""
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file !== undefined) onPick(file);
          }}
        />
        <button
          type="button"
          data-export-backdrop-pick=""
          onClick={() => input.current?.click()}
          className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, ...REST }}
        >
          {pickLabel}
        </button>
        {chosen ? (
          <button
            type="button"
            data-export-backdrop-remove=""
            onClick={onRemove}
            className="inline-flex shrink-0 items-center rounded-full px-4 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, ...REST }}
          >
            {translateExportCard(language, 'export.card.backdrop.remove')}
          </button>
        ) : null}
        {failed ? (
          <span role="alert" data-export-backdrop-failed="" className="text-caption" style={{ color: 'var(--color-error)' }}>
            {translateExportCard(language, 'export.card.backdrop.failed')}
          </span>
        ) : null}
      </div>
      {chosen ? (
        <label className="flex items-center gap-3 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateExportCard(language, 'export.card.backdrop.veil')}
          <input
            type="range"
            data-export-backdrop-veil=""
            min={0}
            max={BACKDROP_VEIL_MAX}
            step={0.05}
            value={veil}
            onInput={(event) => onVeil(Number(event.currentTarget.value))}
            className="min-h-[44px] flex-1"
          />
        </label>
      ) : null}
    </div>
  );
}

/** La vitesse du défilement et la durée qu'elle donne — sous « Enregistrer en », quand la vidéo est choisie. */
export function ScrollRow({
  language,
  speed,
  durationS,
  onSpeed,
}: {
  readonly language: InterfaceLanguage;
  readonly speed: ScrollSpeed;
  readonly durationS: number;
  readonly onSpeed: (speed: ScrollSpeed) => void;
}) {
  const label = translateExportCard(language, 'export.card.scroll.speed');
  return (
    <div data-export-scroll="" className="relative flex flex-col gap-1.5 px-3 pt-2">
      <p className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-2)' }}>
        <span>{translateExportCard(language, 'export.card.scroll.title')}</span>
        <span data-export-scroll-duration="" aria-label={`${translateExportCard(language, 'export.card.scroll.duration')} ${scrollDurationLabel(durationS, language)}`}>
          {scrollDurationLabel(durationS, language)}
        </span>
      </p>
      <div role="radiogroup" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
        {SCROLL_SPEEDS.map((candidate) => (
          <Pill key={candidate} role="radio" pressed={candidate === speed} onClick={() => onSpeed(candidate)} data={{ 'data-export-scroll-speed': String(candidate) }}>
            {scrollSpeedLabel(candidate, language)}
          </Pill>
        ))}
      </div>
    </div>
  );
}
