/**
 * LA CARTE DE TOUS MES PROCHES EN UN APPEL (#19202) — la composition de
 * `GET /relations/locations?include=blood,ended`.
 *
 * - `items` : les partages temporaires en cours, exactement comme avant ;
 * - `blood` : le dernier point de chaque Sang qui me consent l'historique (`bloodLocationMap.ts`),
 *   seulement si `include` le demande ET que le drapeau de la position du Sang m'admet — sinon le
 *   champ n'existe pas, et rien n'est lu ;
 * - `ended` : les partages qui me visaient, terminés depuis moins d'un jour, sans position — moins
 *   ceux dont la personne est déjà sur la carte.
 *
 * L'emprise filtre les points Sang sur la position servie, comme les partages. Sans `include`, la
 * réponse est celle qu'un ancien client lisait.
 */
import type {
  SharedLocationBloodItem,
  SharedLocationEndedItem,
  SharedLocationSnapshot,
  SharedLocationSnapshotIncludes,
} from '@meeshy/shared/types/shared-location';
import { withinBbox, type SharedLocationBbox } from './sharedLocationRelay';

export type RelativesMapSources = {
  readonly snapshot: () => Promise<SharedLocationSnapshot>;
  readonly blood: () => Promise<readonly SharedLocationBloodItem[]>;
  readonly ended: () => Promise<readonly SharedLocationEndedItem[]>;
  /** Le drapeau de la position du Sang pour le LECTEUR (`bloodLocationEnabledFor`). */
  readonly bloodEnabled: boolean;
};

export async function composeRelativesMap(
  sources: RelativesMapSources,
  options: { readonly bbox?: SharedLocationBbox; readonly include: SharedLocationSnapshotIncludes },
): Promise<SharedLocationSnapshot> {
  const withBlood = options.include.blood && sources.bloodEnabled;
  const [snapshot, blood, ended] = await Promise.all([
    sources.snapshot(),
    withBlood ? sources.blood() : Promise.resolve(null),
    options.include.ended ? sources.ended() : Promise.resolve(null),
  ]);
  const shownBlood = blood?.filter((point) => withinBbox(point, options.bbox)) ?? null;
  const onMap = new Set([...snapshot.items.map((item) => item.userId), ...(blood ?? []).map((point) => point.userId)]);
  return {
    items: snapshot.items,
    ...(shownBlood === null ? {} : { blood: shownBlood }),
    ...(ended === null ? {} : { ended: ended.filter((entry) => !onMap.has(entry.userId)) }),
  };
}
