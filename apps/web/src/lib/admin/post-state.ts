import { adminPostStateOf, type AdminPostState } from '@meeshy/shared/types/admin-publication-states';

import { asRecord } from '@/lib/api/admin';

/**
 * **L'ÉTAT D'UNE PUBLICATION ET SON AUDIENCE** (#8876) — deux lectures que la
 * passerelle ne fait pas pour nous.
 *
 * - La passerelle ne sert ni « retirée » ni « expirée » : elle sert `deletedAt`
 *   et `expiresAt`. Une story expirée n'est PAS supprimée — elle a fini sa vie
 *   (20 h pour une story, 1 h pour un statut) — et l'administrateur doit voir la
 *   différence : l'une a été retirée par quelqu'un, l'autre s'est éteinte.
 * - Trois audiences (`PRIVATE`, `ONLY`, `EXCEPT`) sont choisies par l'auteur
 *   pour UNE poignée de personnes : la LISTE plate de toutes les publications
 *   de la plateforme n'en lit pas le texte (la fiche, oui, pour qui modère).
 *
 * Fonctions PURES : importées par le décodeur de la liste et par l'écran.
 */
export type PostStateCode = AdminPostState;

export const RESTRICTED_POST_VISIBILITIES = ['PRIVATE', 'ONLY', 'EXCEPT'] as const;

export function isRestrictedVisibility(visibility: string | null | undefined): boolean {
  const code = visibility?.trim().toUpperCase() ?? '';
  return RESTRICTED_POST_VISIBILITIES.some((restricted) => restricted === code);
}

/**
 * L'EFFET IMMÉDIAT du retrait sur la fiche en cache (mise à jour optimiste) : la
 * date de retrait est posée d'avance, comme la passerelle l'écrira. `useAdminAction`
 * le défait si elle refuse et relit la fiche de toute façon. Un cache qui n'est
 * pas une fiche est rendu tel quel.
 */
export function withPostRemoved(cached: unknown, at: string): unknown {
  const fiche = asRecord(cached);
  return fiche === null ? cached : { ...fiche, deletedAt: at };
}

/**
 * Un seul état prioritaire, la définition PARTAGÉE avec la passerelle (#10392,
 * `adminPostStateOf`) : supprimée > hors ligne (retrait de modération) > expirée >
 * privée > publiée. L'instant exact de l'expiration compte comme expiré ; une date
 * illisible ne fabrique AUCUN état (on ne prétend pas qu'une story s'est éteinte
 * sur la foi d'une chaîne qu'on ne sait pas lire). Une ligne qui ne porte ni
 * l'audience ni le retrait (fiche d'un ancien serveur) se lit comme avant.
 */
export function postStateOf(
  facts: {
    readonly deletedAt?: string | null;
    readonly expiresAt?: string | null;
    readonly moderationHiddenAt?: string | null;
    readonly visibility?: string | null;
  },
  now: Date,
): PostStateCode {
  return adminPostStateOf(
    {
      visibility: facts.visibility ?? '',
      deletedAt: facts.deletedAt ?? null,
      expiresAt: facts.expiresAt ?? null,
      moderationHiddenAt: facts.moderationHiddenAt ?? null,
    },
    now,
  );
}
