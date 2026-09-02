/**
 * La forme d'une issue Zod telle qu'elle part SUR LE FIL, et le dépouillement
 * qui la produit.
 *
 * ## Pourquoi ce fichier existe
 *
 * `fast-json-stringify` retire toute propriété que le schéma de réponse ne
 * déclare pas. Un handler qui calcule le détail d'un refus, le passe à
 * `sendError`, et ne l'a pas déclaré, le voit **effacé au dernier mètre** :
 * l'appelant reçoit `{"error":"VALIDATION_ERROR","message":"VALIDATION_ERROR"}`
 * et n'a aucun recours. C'est le défaut de #4487, et il s'est reproduit tel
 * quel sur les préférences (#4589) — deux fois le même silence, parce que la
 * déclaration vivait en local dans une route et ne pouvait pas être reprise.
 *
 * ## La forme est celle de Zod, RÉELLE et non supposée
 *
 * `path` est un **tableau** ; une clé refusée par `strict()` laisse `path`
 * VIDE et nomme la clé dans **`keys`**. Les deux faits ont été mesurés, pas
 * déduits — un schéma qui déclarerait `path` en `string` effacerait
 * silencieusement le seul champ que le client peut lire pour se corriger.
 */
export const zodIssueSchema = {
  type: 'object',
  properties: {
    code: {
      type: 'string',
      description: 'Code Zod : invalid_type, unrecognized_keys, too_small…',
    },
    path: { type: 'array', items: { type: 'string' }, description: 'Chemin du champ fautif' },
    keys: {
      type: 'array',
      items: { type: 'string' },
      description: 'Clés refusées quand `path` est vide (unrecognized_keys)',
    },
    message: { type: 'string', description: 'Message Zod, déjà lisible' },
  },
} as const;

/** Ce que porte une issue Zod, une fois dépouillée pour le fil. */
export type IssueServie = {
  readonly code: string;
  readonly path: readonly string[];
  readonly keys?: readonly string[];
  readonly message: string;
};

/**
 * Dépouille les issues d'une `ZodError` pour le fil.
 *
 * Site UNIQUE : les deux familles de routes qui refusent un corps (consents,
 * préférences) doivent servir la même forme, sinon un client apprend à lire
 * l'une et reste aveugle à l'autre.
 */
export function issuesServies(issues: ReadonlyArray<unknown>): IssueServie[] {
  return issues.map((brut) => {
    const issue = brut as { code: string; path: unknown[]; message: string; keys?: string[] };
    return {
      code: issue.code,
      path: (issue.path ?? []).map(String),
      ...('keys' in issue && Array.isArray(issue.keys) ? { keys: issue.keys } : {}),
      message: issue.message,
    };
  });
}
