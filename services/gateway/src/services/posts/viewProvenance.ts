import {
  OPEN_ORIGIN_UNKNOWN,
  isOpenOrigin,
  isViewProvenance,
  type OpenOrigin,
  type ViewProvenance,
} from '@meeshy/shared/types/content-reach';
import type { PostBreakdownIncrements } from './postCounters';

/**
 * Ce qu'un écran DÉTAIL dit de la vue qu'il compte (#10483, demande du porteur
 * 2026-10-13) : l'écran (`surface`), la PROVENANCE (listing, notification,
 * lien partagé, lien de suivi, externe, direct) et, pour une vue de listing,
 * l'ORIGINE (le listing tapé). Tout est facultatif : un ancien client n'envoie
 * rien, et une valeur hors des énumérations n'est jamais rangée.
 */
export type ViewContext = {
  readonly surface?: string;
  readonly provenance?: ViewProvenance;
  readonly origin?: OpenOrigin;
};

/** Le contexte tel qu'il se range — l'origine ne vaut que pour une vue de listing. */
export function normalizedViewContext(context: ViewContext = {}): ViewContext {
  const provenance = isViewProvenance(context.provenance) ? context.provenance : undefined;
  const origin = provenance === 'listing' && isOpenOrigin(context.origin) ? context.origin : undefined;
  return {
    ...(context.surface ? { surface: context.surface } : {}),
    ...(provenance ? { provenance } : {}),
    ...(origin ? { origin } : {}),
  };
}

/** Les champs de la PREMIÈRE ligne d'un lecteur (`PostView`, `AnonymousPostOpen`). */
export function viewProvenanceRow(context: ViewContext = {}): { readonly provenance?: string; readonly origin?: string } {
  const { provenance, origin } = normalizedViewContext(context);
  return { ...(provenance ? { provenance } : {}), ...(origin ? { origin } : {}) };
}

/** Les ventilations qu'une vue COMPTÉE ajoute au post. */
export function viewBreakdowns(context: ViewContext = {}): PostBreakdownIncrements | undefined {
  const { provenance, origin } = normalizedViewContext(context);
  if (!provenance) return undefined;
  return {
    viewCountByProvenance: { [provenance]: 1 },
    ...(origin ? { listingViewCountByOrigin: { [origin]: 1 } } : {}),
  };
}

/** La clé d'un engagement d'ouverture : son origine, ou `other` quand elle est inconnue. */
export const openOriginKey = (origin: unknown): string => (isOpenOrigin(origin) ? origin : OPEN_ORIGIN_UNKNOWN);
