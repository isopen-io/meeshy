import { useEffect, useMemo, useRef, useState } from 'react';

import { parseLens, type Lens } from '@meeshy/shared/types/lens-format';

import { loadLensFiles, lensAssetsOf, NO_LENS_FILES, type LensFileDeps, type LensFiles } from '@/lib/meeshy-lens/lens-files';
import { browserLensFileDeps } from '@/lib/meeshy-lens/lens-files-browser';
import type { LensSettings } from '@/lib/meeshy-lens/lens-stage';

import { lensDocumentOf, lensDraftFiles, lensDraftProblems, type DraftLayer, type LensDraft } from './lens-draft';
import { assetAddressOf, type Digest } from './submission';

/**
 * **CE QUE L'APERÇU JOUE D'UN BROUILLON** (W16, #11322) — la lens se voit
 * avant d'être finie : une couche complète se joue, celle qui attend encore
 * son image ou son texte se tait, et un brouillon sans nom ni signature se
 * joue quand même. La lens passe par `parseLens`, la loi que le peintre lit ;
 * ses fichiers sont lus et décodés par `loadLensFiles` — rechargés seulement
 * quand les fichiers nommés changent, jamais à chaque lettre — et les images
 * remplacées sont relâchées.
 */
const PREVIEW_NAME = 'lens';

const layerComplete = (layer: DraftLayer, addresses: ReadonlyMap<File, string>): boolean => {
  if (layer.kind === 'sticker' || layer.kind === 'lut') return layer.file !== null && addresses.has(layer.file);
  return layer.kind !== 'text' || layer.text.trim() !== '';
};

export function previewLensOf(draft: LensDraft, context: { readonly addresses: ReadonlyMap<File, string>; readonly today: string }): Lens | null {
  const layers = draft.layers.filter((layer) => layerComplete(layer, context.addresses));
  if (layers.length === 0) return null;
  const playable: LensDraft = {
    ...draft,
    name: draft.name.trim() === '' ? PREVIEW_NAME : draft.name,
    author: draft.author.trim() === '' ? PREVIEW_NAME : draft.author,
    surfaces: ['capture'],
    endsOn: lensDraftProblems(draft).includes('window') ? draft.startsOn : draft.endsOn,
    layers,
  };
  const parsed = parseLens(lensDocumentOf(playable, context));
  return parsed.status === 'ok' ? parsed.lens : null;
}

const closeImages = (files: LensFiles): void => Object.values(files.images).forEach((image) => image.close());

export function useLensPreview({
  draft,
  today,
  language,
  digest,
  fileDeps = browserLensFileDeps,
}: {
  readonly draft: LensDraft;
  readonly today: string;
  readonly language: string;
  readonly digest?: Digest;
  readonly fileDeps?: (read: LensFileDeps<ImageBitmap>['read']) => LensFileDeps<ImageBitmap>;
}): LensSettings | null {
  const known = useRef(new Map<File, string>());
  const [addresses, setAddresses] = useState<ReadonlyMap<File, string>>(() => new Map());
  const files = lensDraftFiles(draft);
  const pending = files.filter((file) => !known.current.has(file));

  useEffect(() => {
    if (pending.length === 0) return;
    let alive = true;
    void Promise.all(pending.map(async (file) => [file, await assetAddressOf(file, digest)] as const)).then((entries) => {
      entries.forEach(([file, address]) => known.current.set(file, address));
      if (alive) setAddresses(new Map(known.current));
    });
    return () => {
      alive = false;
    };
  }, [pending.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|'), digest]);

  const lens = useMemo(() => previewLensOf(draft, { addresses, today }), [draft, addresses, today]);
  const refs = lens === null ? '' : [...lensAssetsOf(lens).luts, ...lensAssetsOf(lens).images].join('|');
  const [loaded, setLoaded] = useState<LensFiles>(NO_LENS_FILES);

  useEffect(() => {
    if (lens === null || refs === '') {
      setLoaded(NO_LENS_FILES);
      return;
    }
    const byAddress = new Map([...addresses].map(([file, address]) => [address, file] as const));
    let alive = true;
    void loadLensFiles(lens, fileDeps(async (asset) => byAddress.get(asset) ?? null)).then((next) => (alive ? setLoaded(next) : closeImages(next)));
    return () => {
      alive = false;
    };
  }, [refs]);

  /* Les images remplacées se relâchent APRÈS que l'aperçu a reposé les nouvelles : le moteur en garde une copie, son repli du fil principal les lit encore une image. */
  useEffect(() => () => void setTimeout(() => closeImages(loaded), 0), [loaded]);

  return useMemo<LensSettings | null>(() => (lens === null ? null : { lens, languages: [language], level: 'full', files: loaded }), [lens, language, loaded]);
}
