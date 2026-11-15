import * as z from 'zod/mini';

import { WORLD_ENTRY_HANDOFF_KEY, WORLD_ENTRY_HANDOFF_TTL_MS } from '@/landing/world-entry';
import type { GuestEntry } from '@/routes/chat-join-guest';

/**
 * LE JETON DE PASSAGE DE LA LANDING, CÔTÉ JONCTION (#10094, amendement de D-186).
 *
 * L'adresse `/chat/:link?mode=anonymous&name=…&language=…` se fabrique de
 * n'importe où. Sans garde, un lien piégé ferait entrer un visiteur, sous un
 * nom choisi par un tiers, dans n'importe quelle conversation à lien de
 * partage — une action FORCÉE. La création sans geste n'a donc lieu que si
 * l'onglet porte le jeton que le script de la landing y a posé à l'instant
 * (`landing-boot.ts`, `WORLD_ENTRY_HANDOFF_KEY`) : même lien, même nom, même
 * langue que l'adresse, daté de moins de `WORLD_ENTRY_HANDOFF_TTL_MS`.
 *
 * Le jeton est LU ET EFFACÉ en un seul passage, qu'il concorde ou non : il ne
 * sert qu'une fois. Tout le reste — jeton absent, périmé, daté du futur, mal
 * formé, pour un autre lien, un autre nom ou une autre langue, stockage refusé
 * — rend `false` : le formulaire s'ouvre pré-rempli et attend le geste.
 */
export type HandoffStorage = Pick<Storage, 'getItem' | 'removeItem'>;

const handoffSchema = z.object({
  link: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1)),
  language: z.string().check(z.minLength(1)),
  at: z.int(),
});

export function takeLandingHandoff(input: {
  readonly storage: () => HandoffStorage;
  readonly link: string;
  readonly entry: GuestEntry;
  readonly now: number;
}): boolean {
  try {
    const storage = input.storage();
    const raw = storage.getItem(WORLD_ENTRY_HANDOFF_KEY);
    storage.removeItem(WORLD_ENTRY_HANDOFF_KEY);
    if (raw === null) return false;
    const parsed = handoffSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return false;
    const token = parsed.data;
    const age = input.now - token.at;
    return (
      age >= 0 &&
      age <= WORLD_ENTRY_HANDOFF_TTL_MS &&
      token.link === input.link &&
      token.name === input.entry.nickname &&
      token.language === input.entry.language
    );
  } catch {
    return false;
  }
}
