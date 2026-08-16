/**
 * Ce qu'un `PATCH` a VRAIMENT demandé de changer.
 *
 * ## Le piège
 *
 * `ZodObject.partial()` enveloppe chaque champ dans `optional()` mais ne lui
 * retire pas son `default()`. Parser un corps partiel contre un schéma défaillé
 * rend donc le schéma ENTIER, garni de ses valeurs par défaut :
 *
 * ```ts
 * const S = z.object({ a: z.boolean().default(true), b: z.boolean().default(true) });
 * S.partial().parse({ b: false });   // → { a: true, b: false }, PAS { b: false }
 * ```
 *
 * Toute fusion de la forme `{ ...existant, ...validé }` est alors inerte : le
 * second terme couvre le premier de bout en bout, et un `PATCH` d'un seul champ
 * remet silencieusement tous les autres à leur défaut. Le symptôme ne ressemble
 * pas à sa cause — l'appelant a envoyé un champ, le serveur en a écrit trente.
 *
 * ## Pourquoi le corps, et pas le schéma
 *
 * Après coup, rien dans la sortie de Zod ne distingue un défaut injecté d'une
 * valeur envoyée qui lui ressemble : `{ a: true }` a la même forme dans les deux
 * cas. La seule source qui dise ce que l'appelant a NOMMÉ est son corps de
 * requête. On garde donc la validation de Zod — types, énumérations, bornes,
 * clés inconnues écartées — et on ne retient que les clés que le corps porte.
 *
 * Déballer les `ZodDefault` du schéma serait l'autre voie : elle demande de
 * parcourir des `_def` internes, casse à chaque nouvelle enveloppe (`nullable`,
 * `catch`, `pipe`) et ne dit toujours rien des clés imbriquées.
 */

/**
 * Réduit une sortie Zod aux clés de premier niveau que le corps mentionne.
 *
 * Ne descend PAS dans les objets imbriqués : aucun des schémas qui l'utilisent
 * n'en porte aujourd'hui. Le jour où l'un en portera, la fusion profonde sera
 * une décision à prendre ici, une seule fois.
 */
export function submittedKeysOnly<T extends Record<string, unknown>>(
  validated: T,
  body: unknown
): Partial<T> {
  const sent =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    Object.entries(validated).filter(([key]) => key in sent)
  ) as Partial<T>;
}
