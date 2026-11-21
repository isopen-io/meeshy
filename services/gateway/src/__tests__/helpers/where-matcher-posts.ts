/**
 * Un évaluateur des filtres Prisma/Mongo que les compteurs de publications
 * composent — juste les opérateurs qu'ils emploient. Un double de `post.count`
 * qui rendrait un nombre fixe accepterait une requête SANS audience : celui-ci
 * applique la requête, et un filtre retiré fait monter le nombre.
 */
type Row = Readonly<Record<string, unknown>>;

const isOperatorObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

const sameValue = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

const matchesField = (value: unknown, condition: unknown): boolean => {
  if (!isOperatorObject(condition)) return sameValue(value, condition);
  return Object.entries(condition).every(([op, arg]) => {
    switch (op) {
      case 'isSet':
        return (value !== undefined) === arg;
      case 'equals':
        return arg === null ? value === null : sameValue(value, arg);
      case 'gt':
        return value instanceof Date && arg instanceof Date && value.getTime() > arg.getTime();
      case 'in':
        return (arg as readonly unknown[]).some((v) => sameValue(v, value));
      case 'notIn':
        return !(arg as readonly unknown[]).some((v) => sameValue(v, value));
      case 'has':
        return Array.isArray(value) && value.includes(arg);
      case 'not':
        return !matchesField(value, arg);
      default:
        throw new Error(`opérateur non pris en charge par le double : ${op}`);
    }
  });
};

export const matchesPostWhere = (row: Row, where: unknown): boolean => {
  if (where === undefined || where === null) return true;
  return Object.entries(where as Row).every(([key, condition]) => {
    if (key === 'AND') return (condition as readonly unknown[]).every((c) => matchesPostWhere(row, c));
    if (key === 'OR') return (condition as readonly unknown[]).some((c) => matchesPostWhere(row, c));
    if (key === 'NOT') return !matchesPostWhere(row, condition);
    return matchesField(row[key], condition);
  });
};
