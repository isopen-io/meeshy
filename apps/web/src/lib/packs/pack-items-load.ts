import type { ConversationsDeps } from '@/lib/api/conversations';
import { loadDetailOf, type PackPort } from '@/lib/api/packs';
import { shopPackPort, type ShopPack } from '@/lib/api/packs-shop';
import { decodeDesignPackSummary, type DesignPackSummary } from '@/lib/profile-decor/pack-summary';

import { contractDecorItems, embeddedDecorItems, type DecorDomain, type DecorItem } from './decor-items';

/**
 * **CHARGER LES ÉLÉMENTS D'UN PACK DE DÉCOR** (#16267) — embarqué : lu dans le
 * catalogue, sans réseau, sans poids. Servi : le détail du pack
 * (`/packs/<domaine>/<slug>`) donne l'adresse de son contrat, chargé à la
 * demande (adressé par contenu, empreinte vérifiée par le chargeur). Un
 * détail en échec ou un contrat illisible REJETTE : la fiche le dit et offre
 * « Réessayer », jamais une grille vide qui ferait croire à un pack vide.
 */

export type PackItems = {
  readonly items: readonly DecorItem[];
  readonly embedded: boolean;
  /** Ce que pèse le pack à télécharger ; `null` pour un pack embarqué. */
  readonly bytes: number | null;
  /** L'adresse `<sha16>.json` du contrat d'un pack servi ; `null` pour un embarqué. */
  readonly contract: string | null;
};

export const packItemsQueryKey = (domain: DecorDomain, slug: string): readonly unknown[] => ['pack', domain, slug, 'items'];

const detailPort = (domain: DecorDomain): PackPort<ShopPack, ShopPack, DesignPackSummary> => ({ ...shopPackPort(domain), decodeDetail: decodeDesignPackSummary(domain) });

export async function loadPackItems(params: {
  readonly domain: DecorDomain;
  readonly slug: string;
  readonly deps: ConversationsDeps;
  readonly loadContract: (src: string) => Promise<unknown>;
  readonly signal?: AbortSignal;
}): Promise<PackItems> {
  const { domain, slug, deps } = params;
  const embedded = embeddedDecorItems(domain, slug);
  if (embedded !== null) return { items: embedded, embedded: true, bytes: null, contract: null };
  const detail = await loadDetailOf(detailPort(domain), { ...deps, ...(params.signal === undefined ? {} : { signal: params.signal }) }, slug);
  if (!detail.ok) throw new Error(detail.error);
  const contract = detail.data.contract;
  if (contract === null) throw new Error('PACK_WITHOUT_CONTRACT');
  const items = contractDecorItems(domain, slug, await params.loadContract(contract.src));
  if (items.length === 0) throw new Error('PACK_CONTRACT_UNREADABLE');
  return { items, embedded: false, bytes: detail.data.downloadBytes?.story ?? contract.bytes, contract: contract.src };
}
