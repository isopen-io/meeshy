/**
 * Ce que montrait le partage quand « Montrer votre position réelle ? » a été posée (#20248, iso
 * `SharedLocationPointReplacement.swift`, #20127) : son démarrage servi et ceux qui voient le point choisi. La
 * confirmation ne vaut que pour CE partage-là : un autre démarrage, ou une personne ajoutée depuis (un autre appareil du
 * compte), et la question se repose avec la liste à jour. Une personne sortie entre la question et la réponse ne la rend
 * pas caduque : elle ne verra rien du tout.
 */
export type SharedLocationPointReplacement = {
  /** Le démarrage que la passerelle a nommé ; `null` : aucun, ou une passerelle qui ne le dit pas. */
  readonly startedAt: string | null;
  /** En minuscules, sans doublon. */
  readonly recipientIds: readonly string[];
};

export type SharedLocationReplacementAudience = { readonly named: readonly string[]; readonly others: number };

const NAMED_AT_MOST = 3;

export const pointReplacementOps = {
  of: ({ startedAt, recipientIds }: { readonly startedAt: string | null; readonly recipientIds: readonly string[] }): SharedLocationPointReplacement => ({
    startedAt,
    recipientIds: [...new Set(recipientIds.map((id) => id.toLowerCase()))].sort(),
  }),

  /** Une réponse donnée à `asked` vaut-elle encore devant le partage `current` ? */
  isCovered: (current: SharedLocationPointReplacement, asked: SharedLocationPointReplacement): boolean =>
    current.startedAt === asked.startedAt && current.recipientIds.every((id) => asked.recipientIds.includes(id)),

  /** Ceux que la question nomme, dans l'ordre des noms connus (un nom vide ne nomme personne, #20308) ; les autres, inconnus d'ici compris, se comptent. */
  audience: (asked: SharedLocationPointReplacement, known: readonly { readonly userId: string; readonly name: string }[]): SharedLocationReplacementAudience => {
    const named = known
      .map(({ userId, name }) => ({ id: userId.toLowerCase(), name: name.trim() }))
      .filter(({ id, name }) => name.length > 0 && asked.recipientIds.includes(id))
      .filter(({ id }, index, all) => all.findIndex((other) => other.id === id) === index)
      .slice(0, NAMED_AT_MOST)
      .map(({ name }) => name);
    return { named, others: asked.recipientIds.length - named.length };
  },
};
