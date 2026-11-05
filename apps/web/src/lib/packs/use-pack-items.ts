import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { appearanceNames, type AppearanceNames } from '@/lib/profile-decor/catalog';
import { sharedContractLoader } from '@/lib/profile-decor/use-decor-designs';

import { embeddedDecorItems, otherProposals, type DecorDomain, type DecorItem } from './decor-items';
import { loadPackItems, packItemsQueryKey, type PackItems } from './pack-items-load';

/**
 * **LES ÉLÉMENTS D'UN PACK, À LA DEMANDE** (#16267) — un pack embarqué est prêt
 * au premier rendu (`initialData`) ; un pack servi se charge quand sa fiche ou
 * son plein écran s'ouvre, et reste en cache pour la session (son contrat est
 * adressé par contenu, donc immuable).
 */

export type PackRef = { readonly domain: DecorDomain; readonly slug: string };

const embeddedData = (ref: PackRef): PackItems | undefined => {
  const items = embeddedDecorItems(ref.domain, ref.slug);
  return items === null ? undefined : { items, embedded: true, bytes: null, contract: null };
};

const optionsOf = (ref: PackRef, deps: ConversationsDeps) => {
  const initialData = embeddedData(ref);
  return {
    queryKey: packItemsQueryKey(ref.domain, ref.slug),
    queryFn: ({ signal }: { readonly signal: AbortSignal }) => loadPackItems({ ...ref, deps, signal, loadContract: (src) => sharedContractLoader().load(src) }),
    staleTime: Infinity,
    retry: false,
    ...(initialData === undefined ? {} : { initialData }),
  };
};

export function usePackItems(ref: PackRef, deps: ConversationsDeps) {
  return useQuery(optionsOf(ref, deps));
}

const PROPOSAL_PACKS = 6;
const PROPOSAL_ITEMS = 12;

/** Les éléments des AUTRES packs du même domaine — embarqués d'abord prêts, servis à leur arrivée. */
export function useProposals(params: { readonly current: PackRef; readonly packs: readonly PackRef[]; readonly deps: ConversationsDeps }): readonly DecorItem[] {
  const { current, packs, deps } = params;
  const neighbours = packs.filter((pack) => pack.domain === current.domain && pack.slug !== current.slug).slice(0, PROPOSAL_PACKS);
  const results = useQueries({ queries: neighbours.map((ref) => optionsOf(ref, deps)) });
  const ready = results.flatMap((result) => result.data?.items ?? []);
  const signature = ready.map((item) => `${item.pack}/${item.key}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la signature primitive résume la liste
  return useMemo(() => otherProposals({ domain: current.domain, pack: current.slug, candidates: ready, limit: PROPOSAL_ITEMS }), [signature, current.domain, current.slug]);
}

/** Le nom affiché d'un élément dans la langue de l'interface ; sa clé tant que les noms ne sont pas là. */
export const decorItemName = (names: AppearanceNames | null, item: DecorItem): string => {
  const table = item.domain === 'avatar-ring' ? names?.rings : item.domain === 'banner-frame' ? names?.frames : names?.designs;
  return table?.[item.key] ?? item.key;
};

export function useAppearanceNames(language: InterfaceLanguage): AppearanceNames | null {
  const [names, setNames] = useState<AppearanceNames | null>(null);
  useEffect(() => {
    let live = true;
    void appearanceNames(language)
      .then((loaded) => live && setNames(loaded))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [language]);
  return names;
}
