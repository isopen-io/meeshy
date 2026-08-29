/**
 * Constantes de pagination/poids partagées par les QUATRE collections de
 * `/sync`, et le découpage par budget d'octets — extrait de `routes/sync.ts`
 * (issue #4171, critère 5g).
 */

/** Plafond de LIGNES par page, par collection — inchangé depuis A3.1. */
export const MAX_ITEMS_PER_COLLECTION = 1000;

/**
 * Plafond de POIDS d'une page `/sync`, en octets, appliqué au flux `changed`
 * de CHAQUE collection.
 *
 * Le cap de 1000 est un plafond de LIGNES, et il a suffi tant qu'une ligne
 * pesait ses six champs scalaires. Depuis que `syncMessageSelect` rend un
 * message RENDABLE, la ligne porte `translations` (une copie du contenu PAR
 * langue du Prisme), `metadata`, `reactionSummary`, le bloc expéditeur, et ses
 * pièces jointes avec leurs propres `transcription`/`translations`. Toutes ces
 * tailles sont écrites par l'utilisateur, aucune par le schéma : le poids d'une
 * page n'a donc plus AUCUNE borne, et 1000 lignes peuvent faire quelques
 * kilo-octets comme plusieurs dizaines de mégaoctets.
 *
 * La conséquence n'est pas seulement de la bande passante. `/sync` est le canal
 * de RATTRAPAGE : il est appelé au retour de veille, en cellulaire, par un
 * appareil qui vient de se reconnecter — c'est-à-dire dans le pire contexte
 * réseau que l'application connaisse. Et la réponse est matérialisée trois fois
 * côté serveur (les lignes Prisma, le `JSON.stringify` de l'ETag, la
 * sérialisation Fastify) avant de partir.
 *
 * Le mécanisme d'arrêt anticipé, lui, existe déjà et n'attendait qu'un second
 * critère : `truncated: true` + `nextCursor` + watermark tenu à `since`. Le
 * budget ne fait que l'armer sur le poids en plus du nombre.
 *
 * 512 Ko de JSON non compressé — de l'ordre de 50 à 100 Ko sur le fil après
 * gzip. La borne est délibérément prise sur le JSON NON compressé : c'est la
 * grandeur que le serveur peut mesurer sans sérialiser deux fois, et c'est
 * aussi celle qui gouverne la mémoire du client au décodage.
 *
 * ## Le budget est PAR COLLECTION, pas divisé entre elles (issue #4171, critère 1)
 *
 * `collections=conversations,messages,reactions,participants` en un seul appel
 * peut donc peser jusqu'à 4×512 Ko non compressé dans le pire cas — un choix,
 * pas un oubli, pour trois raisons :
 *
 * 1. **Rétrocompatibilité stricte.** `collections=messages` seul est le SEUL
 *    usage qui existe aujourd'hui dans ce dépôt (aucun appelant, mais le
 *    contrat existant ne doit pas changer de sens — critère 6). Diviser 512 Ko
 *    par le nombre de collections demandées aurait réduit le budget de
 *    `messages` à 128 Ko dès qu'un client la combine à trois autres — une
 *    régression sur la SEULE collection qui a un contrat aujourd'hui.
 * 2. **Le pire cas théorique n'est pas le cas pratique.** Une ligne de
 *    `conversations`, `reactions` ou `participants` ne porte ni traductions,
 *    ni pièces jointes, ni métadonnées libres — elle pèse un ordre de grandeur
 *    de moins qu'une ligne `messages`. Atteindre 512 Ko sur l'une de ces trois
 *    collections demande donc un nombre de lignes bien supérieur à ce que le
 *    plafond de 1000 lignes laisse déjà passer en pratique.
 * 3. **Le mécanisme de repli existe déjà, à la maille COLLECTION.** Un client
 *    qui veut un plafond plus serré n'a qu'à demander MOINS de collections par
 *    appel — `collections=` est composable, et `truncated`/`nextCursor` par
 *    collection permettent déjà de paginer une collection lourde seule. Un
 *    budget global inter-collections (mesurer la somme AVANT de servir) reste
 *    un suivi possible si l'usage réel le justifie — non fait ici : rien
 *    aujourd'hui n'appelle `/sync` avec plusieurs collections à la fois
 *    (critère 6), donc rien ne mesure ce besoin.
 */
export const SYNC_MAX_PAGE_BYTES = 512 * 1024;

/** Au-delà de ce nombre d'évènements manqués, le delta temporel ne suffit plus. */
export const GAP_THRESHOLD = 10_000;

/**
 * Coupe `rows` au plus long préfixe qui tient dans `maxBytes`.
 *
 * Trois propriétés, et aucune n'est décorative :
 *
 * - **Un préfixe, jamais une sélection.** Les lignes sont déjà triées par le
 *   keyset `(updatedAt, id)`. Ne garder qu'un PRÉFIXE est ce qui permet au
 *   curseur de reprendre exactement derrière la dernière ligne livrée ; écarter
 *   une ligne lourde « au milieu » pour en faire tenir deux légères ferait un
 *   trou qu'aucune position keyset ne saurait réclamer.
 *
 * - **Au moins une ligne, TOUJOURS.** Un message plus lourd à lui seul que le
 *   budget rendrait sinon une page vide accompagnée de `truncated: true` et
 *   d'un curseur inchangé — c'est-à-dire la même requête, indéfiniment. Le
 *   rattrapage ne progresserait plus jamais, et le seul symptôme côté client
 *   serait une synchronisation qui tourne sans rien appliquer. Dépasser le
 *   budget d'une ligne est le moindre mal ; ne plus avancer n'en est pas un.
 *
 * - **La ligne qui franchit la borne est EXCLUE, pas incluse.** Autrement le
 *   budget serait un plancher déguisé.
 *
 * Le coût de mesure est borné par le budget lui-même : on s'arrête au premier
 * dépassement, donc on ne sérialise jamais plus de `maxBytes` + une ligne —
 * là où la page entière représentait, elle, un `JSON.stringify` non borné.
 * La mesure porte sur la ligne Prisma et non sur les octets finaux du fil
 * (`fast-json-stringify` applique encore le schéma de réponse par-dessus) :
 * c'est une approximation par excès du même ordre de grandeur, ce qu'un budget
 * demande, là où une comptabilité exacte imposerait de sérialiser deux fois.
 *
 * Partagée par les QUATRE collections (issue #4171) — la fonction est
 * générique et ne connaît rien du contenu de `T`.
 */
export function trimToByteBudget<T>(
  rows: readonly T[],
  maxBytes: number,
): { page: T[]; truncated: boolean } {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    total += Buffer.byteLength(JSON.stringify(rows[i]), 'utf8');
    if (total <= maxBytes) continue;
    const kept = Math.max(i, 1);
    return { page: rows.slice(0, kept), truncated: kept < rows.length };
  }
  return { page: [...rows], truncated: false };
}

/**
 * Collections que `/sync` sait rendre — élargie par l'issue #4171 de
 * `['messages']` (A3.1, pilote) à quatre collections. Le refus explicite d'une
 * collection INCONNUE (`UNSUPPORTED_COLLECTION`, `routes/sync/index.ts`) est
 * ce que ce tableau protège : l'élargir est le SEUL geste qui ouvre une
 * collection, jamais un défaut permissif ailleurs dans le parseur.
 */
export const SUPPORTED_COLLECTIONS = ['conversations', 'messages', 'reactions', 'participants'] as const;

export type SyncCollectionName = (typeof SUPPORTED_COLLECTIONS)[number];
