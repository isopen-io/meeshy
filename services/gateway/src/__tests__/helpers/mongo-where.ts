/**
 * Un double Prisma qui ÉVALUE un `where` contre des documents MongoDB, en
 * honorant la seule règle que les doubles ordinaires ne peuvent pas exprimer :
 * **un champ ABSENT n'est pas un champ à `null`.**
 *
 * Prisma n'écrit pas les champs optionnels qu'on ne lui donne pas. Un
 * `DateTime?` jamais renseigné n'a donc AUCUNE clé dans le document, et le
 * filtre `{ champ: null }` — qui se traduit par une égalité — ne l'apparie pas.
 * Ce piège a vidé le feed en production (`services/posts/softDelete.ts`) et a
 * fait no-op 100 % des bascules média d'appel (`CallService.initiateCall`).
 *
 * Un test qui compare la clause reçue à celle qu'il attend passe aussi bien avec
 * une clause juste qu'avec une clause fausse — il ne vérifie que sa propre
 * copie, et c'est ainsi que ce piège traverse des suites vertes. Ici, les lignes
 * sont des objets nus : une clé absente de l'objet est absente du document, et
 * c'est le RÉSULTAT de la lecture qui parle.
 *
 * Le sous-ensemble supporté est celui des filtres de soft-state de ce dépôt.
 * Toute autre forme jette : un filtre dont ce double ne sait rien doit faire
 * échouer le test, jamais passer en l'ignorant.
 */
export type MongoDocument = Record<string, unknown>;

const has = (row: MongoDocument, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(row, key);

export function matchesMongoWhere(row: MongoDocument, where: MongoDocument | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as MongoDocument[]).some((branch) => matchesMongoWhere(row, branch));
    }
    if (key === 'AND') {
      return (condition as MongoDocument[]).every((branch) => matchesMongoWhere(row, branch));
    }
    if (key === 'NOT') {
      return !matchesMongoWhere(row, condition as MongoDocument);
    }

    // Le coeur de ce double : `{ champ: null }` exige la clé PRÉSENTE et nulle.
    if (condition === null) return has(row, key) && row[key] === null;

    if (typeof condition === 'object' && !(condition instanceof Date)) {
      return matchesFieldFilter(row, key, condition as MongoDocument);
    }

    return has(row, key) && row[key] === condition;
  });
}

function matchesFieldFilter(row: MongoDocument, key: string, filter: MongoDocument): boolean {
  return Object.entries(filter).every(([operator, operand]) => {
    if (operator === 'isSet') return has(row, key) === operand;
    if (operator === 'equals') {
      if (operand === null) return has(row, key) && row[key] === null;
      return has(row, key) && sameValue(row[key], operand);
    }
    if (operator === 'not') {
      if (operand === null) return has(row, key) && row[key] !== null;
      return !has(row, key) || !sameValue(row[key], operand);
    }
    if (operator === 'gt' || operator === 'lt') {
      const value = row[key];
      if (!(value instanceof Date) || !(operand instanceof Date)) return false;
      return operator === 'gt'
        ? value.getTime() > operand.getTime()
        : value.getTime() < operand.getTime();
    }
    if (operator === 'in') {
      return has(row, key) && (operand as unknown[]).some((candidate) => sameValue(row[key], candidate));
    }
    throw new Error(`double Mongo: opérateur non supporté « ${key}.${operator} »`);
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

/**
 * `findFirst` sur une collection en mémoire, avec la sémantique ci-dessus.
 * Rend `null` quand rien n'apparie — exactement ce que Prisma rend.
 */
export function findFirstIn<T extends MongoDocument>(rows: readonly T[]) {
  return (args: { where?: MongoDocument }): Promise<T | null> =>
    Promise.resolve(rows.find((row) => matchesMongoWhere(row, args?.where)) ?? null);
}

/**
 * `updateMany` sur une collection en mémoire : ne mute rien, rend le `count` de
 * Prisma et laisse le test lire QUELLES lignes auraient été touchées.
 */
export function updateManyIn<T extends MongoDocument>(rows: readonly T[]) {
  const touched: T[] = [];
  const updateMany = (args: { where?: MongoDocument }): Promise<{ count: number }> => {
    const matched = rows.filter((row) => matchesMongoWhere(row, args?.where));
    touched.push(...matched);
    return Promise.resolve({ count: matched.length });
  };
  return { updateMany, touched };
}
