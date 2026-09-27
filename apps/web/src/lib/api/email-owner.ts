import * as z from 'zod/mini';

/**
 * LE DÉTENTEUR MASQUÉ D'UNE ADRESSE DÉJÀ PRISE (#8214, contrat du 2026-09-27)
 * — `emailOwner` posé à la racine d'un `409 EMAIL_TAKEN`, masqué comme
 * `phoneOwnerInfo` (`maskDisplayName`, `maskUsername`). Il permet à
 * l'inscription de demander « Est-ce vous ? » sans rien révéler de plus.
 *
 * `zod/mini`, jamais un schéma de `@meeshy/shared` : le chunk « zod » est à
 * quelques octets de son budget.
 */
const WireEmailOwner = z.object({
  maskedDisplayName: z.string(),
  maskedUsername: z.string(),
  avatar: z.optional(z.nullable(z.string())),
});

export type EmailOwner = {
  readonly maskedDisplayName: string;
  readonly maskedUsername: string;
  readonly avatar: string | null;
};

/** `null` quand la charge est absente ou mal formée — l'écran retombe alors
 * sur « Un compte existe déjà » et la récupération (ancienne passerelle). */
export function decodeEmailOwner(raw: unknown): EmailOwner | null {
  const parsed = WireEmailOwner.safeParse(raw);
  if (!parsed.success) return null;
  return {
    maskedDisplayName: parsed.data.maskedDisplayName,
    maskedUsername: parsed.data.maskedUsername,
    avatar: parsed.data.avatar ?? null,
  };
}
