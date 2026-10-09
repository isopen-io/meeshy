import { useEffect, useRef, useState } from 'react';

import type { LoadedCardSources } from '@/lib/export/message-card-media-load';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { motionDurationOf, type CardOutput } from '@/lib/export/message-card-output';
import type { CardSource } from '@/lib/export/message-card-paint';
import type { MessageCardMediaItem } from '@/lib/export/message-card-subject';
import { translateExportCard, type ExportCardCatalogKey } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Pill } from './thread-export-controls';

/**
 * **LES PIXELS DES MÉDIAS ET L'EXPORT ANIMÉ D'« IMAGINE »** (#8693).
 *
 * `useCardSources` va chercher, UNE fois par atelier, les images des médias
 * de la carte (image, image d'attente d'une vidéo) : l'aperçu se peint d'abord
 * sans elles (un cadre neutre à leur place), puis se repeint quand elles
 * arrivent — jamais une attente blanche. Celles qui n'arrivent pas sont
 * NOMMÉES, et `MediaFailure` le dit avec « Réessayer ».
 *
 * `OutputPicker` offre, avant d'enregistrer, ce que les médias PEINTS
 * permettent (#9236) : Image · GIF · Vidéo pour une vidéo montrée, Image ·
 * Vidéo pour un audio.
 * `recordMotion` fabrique le GIF ou la vidéo à la demande — son moteur
 * (`message-card-motion.ts`) n'est chargé qu'à ce moment.
 */

export type SourcesLoader = (items: readonly MessageCardMediaItem[]) => Promise<LoadedCardSources>;

export const defaultSourcesLoader: SourcesLoader = async (items) => {
  const [{ loadCardSources, browserDecodeImage }, { fetchCardMediaBlob }] = await Promise.all([import('@/lib/export/message-card-media-load'), import('@/lib/export/message-card-fetch')]);
  const decodeImage = browserDecodeImage(window);
  return loadCardSources(items, {
    fetchBlob: fetchCardMediaBlob,
    doc: document,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    ...(decodeImage === undefined ? {} : { decodeImage }),
  });
};

/**
 * Les sources par rang, et leur VERSION — elle entre dans la clé de l'aperçu et
 * des vignettes. `failed` nomme les médias VISUELS dont les pixels ne sont pas
 * arrivés (un chargeur qui échoue en bloc les nomme tous) ; `retry` relance le
 * chargement (#8901) : un cadre vide muet se lisait « pas de pièce ».
 */
export function useCardSources(
  items: readonly MessageCardMediaItem[],
  load: SourcesLoader,
): { readonly sources: readonly (CardSource | null)[]; readonly version: number; readonly loading: boolean; readonly failed: readonly string[]; readonly retry: () => void } {
  const [state, setState] = useState<{ readonly ids: string; readonly sources: readonly (CardSource | null)[]; readonly version: number; readonly failed: readonly string[] }>({ ids: '', sources: [], version: 0, failed: [] });
  const [loading, setLoading] = useState(items.length > 0);
  const [attempt, setAttempt] = useState(0);
  const ids = items.map((item) => item.id).join('|');
  useEffect(() => {
    if (items.length === 0) {
      setLoading(false);
      return;
    }
    let live = true;
    let dispose: (() => void) | null = null;
    setLoading(true);
    void load(items)
      .then((loaded) => {
        dispose = loaded.dispose;
        if (!live) {
          loaded.dispose();
          return;
        }
        setState((current) => ({ ids, sources: loaded.sources, version: current.version + 1, failed: loaded.failed }));
      })
      .catch(() => {
        if (!live) return;
        const visual = items.filter((item) => item.card.kind !== 'audio').map((item) => item.id);
        setState((current) => ({ ids, sources: [], version: current.version + 1, failed: visual }));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, attempt]);
  /* Les pixels d'AUTRES médias (une composition qui change, #9687) ne se peignent jamais aux places des nouveaux. */
  const current = state.ids === ids;
  return {
    sources: current ? state.sources : [],
    version: state.version,
    failed: current ? state.failed : [],
    loading: loading || (!current && items.length > 0),
    retry: () => setAttempt((attempted) => attempted + 1),
  };
}

/** « Un média n'a pas pu se charger » + « Réessayer » — jamais un cadre vide muet (#8901). */
export function MediaFailure({ language, count, onRetry }: { readonly language: InterfaceLanguage; readonly count: number; readonly onRetry: () => void }) {
  if (count === 0) return null;
  const message = count === 1 ? translateExportCard(language, 'export.card.media.failed.one') : translateExportCard(language, 'export.card.media.failed.other', { count: String(count) });
  return (
    <div role="alert" data-export-media-failed="" className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 pb-1 text-center text-caption">
      <span style={{ color: 'var(--color-error)' }}>{message}</span>
      <button
        type="button"
        data-export-media-retry=""
        onClick={onRetry}
        className="rounded-full px-3 font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
      >
        {translateExportCard(language, 'export.card.media.retry')}
      </button>
    </div>
  );
}

const OUTPUT_LABEL = {
  image: 'export.card.output.image',
  gif: 'export.card.output.gif',
  video: 'export.card.output.video',
} as const satisfies Readonly<Record<CardOutput, ExportCardCatalogKey>>;

export function OutputPicker({ language, outputs, output, onOutput }: { readonly language: InterfaceLanguage; readonly outputs: readonly CardOutput[]; readonly output: CardOutput; readonly onOutput: (output: CardOutput) => void }) {
  if (outputs.length < 2) return null;
  const label = translateExportCard(language, 'export.card.output');
  return (
    <div role="radiogroup" aria-label={label} data-export-outputs="" className="relative flex items-center justify-center gap-2 px-3 pt-2">
      <span aria-hidden="true" className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </span>
      {outputs.map((candidate) => (
        <Pill key={candidate} role="radio" pressed={candidate === output} onClick={() => onOutput(candidate)} data={{ 'data-export-output': candidate }}>
          {translateExportCard(language, OUTPUT_LABEL[candidate])}
        </Pill>
      ))}
    </div>
  );
}

export type MotionRecorder = (params: {
  readonly input: MessageCardInput;
  readonly sources: readonly (CardSource | null)[];
  readonly output: Exclude<CardOutput, 'image'>;
  readonly item: MessageCardMediaItem;
  readonly index: number;
}) => Promise<Blob | null>;

/** Le moteur par défaut : le média temporel en blob, puis le GIF ou la vidéo de la carte. */
export const defaultMotionRecorder: MotionRecorder = async ({ input, sources, output, item, index }) => {
  const [{ fetchCardMediaBlob }, motion] = await Promise.all([import('@/lib/export/message-card-fetch'), import('@/lib/export/message-card-motion')]);
  const blob = await fetchCardMediaBlob(item.url, item.id);
  if (blob === null) return null;
  const url = URL.createObjectURL(blob);
  const kind = item.card.kind === 'audio' ? 'audio' : 'video';
  const mediaDurationMs = item.card.kind === 'audio' ? item.card.durationMs : null;
  const track = { url, kind, index: kind === 'video' ? index : null } as const;
  try {
    const durationMs = motionDurationOf({ output, mediaDurationMs });
    return output === 'gif' ? await motion.recordCardGif({ input, sources, track, durationMs }) : await motion.recordCardVideo({ input, sources, track, durationMs });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Le média temporel qui anime la carte, PARMI CEUX QU'ELLE PEINT (#9236) : la
 * première vidéo montrée, sinon le son — jamais une vidéo que la carte ne
 * montre pas. `painted` : leurs rangs dans `items` (`paintedMediaIndexes`).
 */
export function temporalItemOf(items: readonly MessageCardMediaItem[], painted: readonly number[]): { readonly item: MessageCardMediaItem; readonly index: number } | null {
  const shown = painted.flatMap((index) => {
    const item = items[index];
    return item === undefined ? [] : [{ item, index }];
  });
  return shown.find((entry) => entry.item.card.kind === 'video') ?? shown.find((entry) => entry.item.card.kind === 'audio') ?? null;
}

/** Un export animé déjà fabriqué se réutilise : un second geste (partage expiré) ne refilme rien. */
export function useMotionCache(): { readonly get: (key: string) => Blob | undefined; readonly set: (key: string, blob: Blob) => void } {
  const cache = useRef(new Map<string, Blob>());
  return {
    get: (key) => cache.current.get(key),
    set: (key, blob) => {
      cache.current.clear();
      cache.current.set(key, blob);
    },
  };
}
