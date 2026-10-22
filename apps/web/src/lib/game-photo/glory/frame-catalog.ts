import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import { gloryFramesFor, type GloryFrameOfferPack } from '@meeshy/shared/utils/game/glory-frames';
import { isGloryAtmosphere, type GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import type { FramePackDetail, FramePackSummary } from '@/lib/api/packs-glory-frame';
import type { ApiResult } from '@/lib/api/http';

import { parseGloryFrameContract, type GloryFrame } from './frame-spec';

/**
 * **LE CATALOGUE DES CADRES DE GLOIRE INSTALLÉS** (#10159, § 5.5) — lu par le
 * port générique des packs (`lib/api/packs-glory-frame.ts` : `/packs/glory-frame/installed`
 * puis le détail de chaque pack) et par le magasin (le contrat adressé par
 * contenu, `readPackAssetJson`), validé par le schéma partagé : un cadre
 * malformé tombe seul, un contrat illisible fait tomber son pack seul. Face à
 * un ANCIEN serveur, 404 ⇒ catalogue vide ⇒ carte simple, sans erreur.
 *
 * Le choix du cadre pour une étape est LA loi partagée (`gloryFramesFor`,
 * L4) : ce module ne décide rien, il lui remet le catalogue dans la forme
 * qu'elle lit et prend son `preselected`. L'atmosphère du compte viendra de
 * `game.photo` (L10b) ; `null` en attendant, la loi propose l'Afrique
 * éternelle, installée par défaut.
 */

export type GloryCatalogPorts = {
  readonly installed: () => Promise<ApiResult<readonly FramePackSummary[]>>;
  readonly detail: (slug: string) => Promise<ApiResult<FramePackDetail>>;
  readonly readJson: (ref: PackAssetRef) => Promise<unknown>;
};

export type GloryCatalogPack = GloryFrameOfferPack & { readonly byId: ReadonlyMap<string, GloryFrame>; readonly version: number };

export type GloryCatalog = {
  readonly packs: readonly GloryCatalogPack[];
  /** Les slugs installés : ce que la loi lit comme `installed`. */
  readonly installed: ReadonlySet<string>;
};

export const EMPTY_CATALOG: GloryCatalog = { packs: [], installed: new Set() };

const collectionsOf = (frames: readonly GloryFrame[]): readonly string[] => [...new Set(frames.map((frame) => frame.collection))];

async function packOf(summary: FramePackSummary, ports: GloryCatalogPorts): Promise<GloryCatalogPack | null> {
  const detail = await ports.detail(summary.slug).catch(() => null);
  if (detail === null || !detail.ok) return null;
  const parsed = parseGloryFrameContract(await ports.readJson(detail.data.contract).catch(() => null));
  if (parsed === null) return null;
  const frames = parsed.contract.frames;
  return {
    slug: summary.slug,
    atmosphere: atmosphereOf(frames),
    collections: collectionsOf(frames),
    frames,
    byId: new Map(frames.map((frame) => [frame.id, frame])),
    version: detail.data.version,
  };
}

/**
 * L'atmosphère d'un pack se lit sur son REGISTRE (`packs.json`), que le résumé
 * servi ne porte pas encore : on la déduit de ses collections, dont les slugs
 * sont ceux des atmosphères — sauf l'Afrique éternelle, qui en porte deux
 * (`savane`, `royaumes`, § 5.2). Un pack hors atmosphère (`moments`, `tresor`)
 * rend `null`, ce que la loi attend de lui.
 */
const AFRICA_COLLECTIONS: readonly string[] = ['savane', 'royaumes'];

const atmosphereOf = (frames: readonly GloryFrame[]): GloryAtmosphere | null => {
  const collection = frames[0]?.collection;
  if (collection === undefined) return null;
  if (AFRICA_COLLECTIONS.includes(collection)) return 'afrique';
  return isGloryAtmosphere(collection) ? collection : null;
};

/** Les packs installés et lisibles ; vide (jamais une erreur) quand le serveur ne connaît pas les packs. */
export async function loadGloryCatalog(ports: GloryCatalogPorts): Promise<GloryCatalog> {
  const listed = await ports.installed().catch(() => null);
  if (listed === null || !listed.ok) return EMPTY_CATALOG;
  const packs = (await Promise.all(listed.data.map((summary) => packOf(summary, ports)))).filter((pack): pack is GloryCatalogPack => pack !== null);
  return { packs, installed: new Set(packs.map((pack) => pack.slug)) };
}

export type GloryFramePick = { readonly pack: GloryCatalogPack; readonly frame: GloryFrame };

/** Le cadre que la loi présélectionne pour une étape ; `null` : carte simple. */
export function pickGloryFrame(catalog: GloryCatalog, input: { readonly stepId: string; readonly atmosphere: GloryAtmosphere | null; readonly lastChosen: string | null }): GloryFramePick | null {
  const offer = gloryFramesFor({ ...input, catalog: catalog.packs, installed: catalog.installed });
  const ref = offer.preselected;
  if (ref === null) return null;
  const pack = catalog.packs.find((candidate) => candidate.slug === ref.pack);
  const frame = pack?.byId.get(ref.frameId);
  return pack === undefined || frame === undefined ? null : { pack, frame };
}
