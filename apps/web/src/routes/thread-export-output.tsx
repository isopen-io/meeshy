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
 * arrivent — jamais une attente blanche.
 *
 * `OutputPicker` offre, avant d'enregistrer, ce que le contenu permet :
 * Image · GIF · Vidéo pour une vidéo, Image · Vidéo pour un audio.
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

/** Les sources par rang, et leur VERSION — elle entre dans la clé de l'aperçu et des vignettes. */
export function useCardSources(items: readonly MessageCardMediaItem[], load: SourcesLoader): { readonly sources: readonly (CardSource | null)[]; readonly version: number; readonly loading: boolean } {
  const [state, setState] = useState<{ readonly sources: readonly (CardSource | null)[]; readonly version: number }>({ sources: [], version: 0 });
  const [loading, setLoading] = useState(items.length > 0);
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
        setState((current) => ({ sources: loaded.sources, version: current.version + 1 }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return { ...state, loading };
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

/** Le média temporel qui anime la carte : la première vidéo, sinon le premier audio. */
export function temporalItemOf(items: readonly MessageCardMediaItem[]): { readonly item: MessageCardMediaItem; readonly index: number } | null {
  const video = items.findIndex((item) => item.card.kind === 'video');
  const index = video !== -1 ? video : items.findIndex((item) => item.card.kind === 'audio');
  const item = items[index];
  return item === undefined ? null : { item, index };
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
