/**
 * Un Prisma FIDÈLE, en mémoire — pas un jeu de doubles `jest.fn()` qui rend ce
 * que le témoin lui dicte.
 *
 * `__tests__/unit/routes/conversation-receipts.test.ts` mesure la porte avec
 * `MessageReadStatusService` MOQUÉ (`FROZEN_COUNT` constant, #7345 note du
 * cadrage) : il prouve que la route relaie ce que le service rend, jamais que
 * le service calcule juste. Ce module rejoue les MÊMES clauses `where` que le
 * code réel (égalité, `not`, `in`, `gt`/`gte`/`lt`/`lte`, `OR`, la forme
 * composite `{ nom_de_clé_unique: { champA, champB } }` que Prisma synthétise
 * pour une contrainte `@@unique`) sur une collection JS — sans process Mongo,
 * indisponible dans ce bac à sable (ni `docker`, ni `mongod`, ni
 * `mongodb-memory-server` au dépôt). C'est un compromis assumé : il exerce la
 * VRAIE logique de filtrage du service et de la route, jamais stub, mais reste
 * un DOUBLE — la preuve finale reste la recette sur staging (réelle Mongo) que
 * la spec du chantier prescrit.
 *
 * Porte UNIQUEMENT les opérateurs et les formes réellement rencontrés dans
 * `MessageReadStatusService` / `routes/conversations/receipts.ts` (grep fait
 * avant d'écrire ce fichier) — jamais un mini-ORM générique.
 */

type Where = Record<string, unknown>;

const OPERATOR_KEYS = new Set([
  'not', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'equals', 'contains', 'mode', 'isSet',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);

const isOperatorObject = (value: Record<string, unknown>): boolean =>
  Object.keys(value).some((key) => OPERATOR_KEYS.has(key));

/**
 * Prisma synthétise le `where` d'une contrainte composite (`@@unique`) en
 * `{ nomDeLaContrainte: { champA, champB } }`. Aucun champ de nos modèles ne
 * porte lui-même un objet en valeur directe hors opérateur — la distinction
 * « objet-opérateur / enveloppe composite » suffit donc à aplatir sans ambiguïté.
 */
function flattenWhere(where?: Where | null): Where {
  if (!where) return {};
  const flat: Where = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR' || key === 'AND') {
      flat[key] = value;
      continue;
    }
    if (isPlainObject(value) && !isOperatorObject(value)) {
      Object.assign(flat, value);
      continue;
    }
    flat[key] = value;
  }
  return flat;
}

const toComparable = (value: unknown): number | string =>
  value instanceof Date ? value.getTime() : (value as number | string);

/**
 * ABSENT n'est pas `null` — la règle de MongoDB, et le piège que ce dépôt a
 * payé quatre fois en production (`utils/prisma-unset.ts`). Prisma n'écrit pas
 * les colonnes optionnelles qu'on ne lui donne pas au `create` : une entrée
 * créée par la LIVRAISON n'a pas de clé `readAt` du tout, et le filtre
 * d'égalité `{ readAt: null }` ne l'apparie PAS. Un double qui apparierait les
 * deux états rendrait VERT un chemin rouge en production — exactement ce qui
 * s'est produit sur #7345, où le témoin de bout en bout ne voyait pas le
 * `updateMany` write-once rater ses cinq lignes.
 *
 * `{ champ: { isSet: false } }` est l'autre moitié du prédicat `unsetOrNull` :
 * elle, et elle seule, apparie l'absence.
 */
function matchCondition(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  if (isPlainObject(condition)) {
    if ('isSet' in condition) return condition.isSet === true ? value !== undefined : value === undefined;
    if ('not' in condition) {
      const negated = condition.not;
      if (negated === null) return value !== null && value !== undefined;
      return !matchCondition(value, negated);
    }
    if ('in' in condition) return (condition.in as unknown[]).includes(value);
    if ('notIn' in condition) return !(condition.notIn as unknown[]).includes(value);
    if ('gt' in condition) return value != null && toComparable(value) > toComparable(condition.gt);
    if ('gte' in condition) return value != null && toComparable(value) >= toComparable(condition.gte);
    if ('lt' in condition) return value != null && toComparable(value) < toComparable(condition.lt);
    if ('lte' in condition) return value != null && toComparable(value) <= toComparable(condition.lte);
    if ('equals' in condition) return value === condition.equals;
    return false;
  }
  return value === condition;
}

function matchesWhere(doc: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Where[]).some((sub) => matchesWhere(doc, sub));
    if (key === 'AND') return (condition as Where[]).every((sub) => matchesWhere(doc, sub));
    return matchCondition(doc[key], condition);
  });
}

function applyData(doc: Record<string, unknown>, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value)) {
      if ('increment' in value) { doc[key] = ((doc[key] as number) ?? 0) + (value.increment as number); continue; }
      if ('decrement' in value) { doc[key] = ((doc[key] as number) ?? 0) - (value.decrement as number); continue; }
      if ('push' in value) { doc[key] = [...((doc[key] as unknown[]) ?? []), value.push]; continue; }
      if ('set' in value) { doc[key] = value.set; continue; }
    }
    doc[key] = value;
  }
}

function sortRows<T extends Record<string, unknown>>(rows: T[], orderBy?: Record<string, 'asc' | 'desc'>): T[] {
  if (!orderBy) return rows;
  const [[field, direction]] = Object.entries(orderBy);
  const sorted = [...rows].sort((a, b) => {
    const av = toComparable(a[field] as never);
    const bv = toComparable(b[field] as never);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return direction === 'desc' ? sorted.reverse() : sorted;
}

/**
 * `select` PROJETTE, et une colonne absente du document ressort `null` — pas
 * `undefined`. C'est ce que rend le client Prisma, et c'est ce qui rend le
 * piège de #7345 si difficile à voir : côté JS la colonne a l'air d'un `null`
 * ordinaire, côté requête elle n'existe pas. Un double qui rendrait `undefined`
 * ferait échouer le code au MAUVAIS endroit (le filtre JS au lieu du `where`),
 * donc prouverait le bon symptôme par le mauvais mécanisme.
 */
function project<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, boolean>
): Record<string, unknown> {
  if (!select) return { ...row };
  const projected: Record<string, unknown> = {};
  for (const [field, wanted] of Object.entries(select)) {
    if (wanted !== true) continue;
    projected[field] = row[field] ?? null;
  }
  return projected;
}

let idCounter = 1;
/** Un id de la forme d'un ObjectId Mongo — `OBJECT_ID_RE` du service le vérifie. */
export const nextFakeObjectId = (): string => (idCounter++).toString(16).padStart(24, '0');

class FakeModel {
  constructor(private readonly rows: Record<string, unknown>[]) {}

  async findFirst(
    args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'>; select?: Record<string, boolean> } = {}
  ) {
    const matched = sortRows(this.rows.filter((r) => matchesWhere(r, flattenWhere(args.where))), args.orderBy);
    return matched[0] ? project(matched[0], args.select) : null;
  }

  async findUnique(args: { where?: Where; select?: Record<string, boolean> } = {}) {
    const found = this.rows.find((r) => matchesWhere(r, flattenWhere(args.where)));
    return found ? project(found, args.select) : null;
  }

  async findMany(
    args: {
      where?: Where;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
      select?: Record<string, boolean>;
    } = {}
  ) {
    let matched = sortRows(this.rows.filter((r) => matchesWhere(r, flattenWhere(args.where))), args.orderBy);
    if (typeof args.take === 'number') matched = matched.slice(0, args.take);
    return matched.map((r) => project(r, args.select));
  }

  async count(args: { where?: Where } = {}) {
    return this.rows.filter((r) => matchesWhere(r, flattenWhere(args.where))).length;
  }

  async create(args: { data: Record<string, unknown> }) {
    const doc = { id: nextFakeObjectId(), ...args.data };
    this.rows.push(doc);
    return { ...doc };
  }

  async createMany(args: { data: Record<string, unknown> | Record<string, unknown>[] }) {
    const items = Array.isArray(args.data) ? args.data : [args.data];
    for (const item of items) this.rows.push({ id: nextFakeObjectId(), ...item });
    return { count: items.length };
  }

  async update(args: { where?: Where; data: Record<string, unknown> }) {
    const doc = this.rows.find((r) => matchesWhere(r, flattenWhere(args.where)));
    if (!doc) {
      const error: Error & { code?: string } = new Error('Record not found');
      error.code = 'P2025';
      throw error;
    }
    applyData(doc, args.data);
    return { ...doc };
  }

  async updateMany(args: { where?: Where; data: Record<string, unknown> }) {
    const matched = this.rows.filter((r) => matchesWhere(r, flattenWhere(args.where)));
    for (const doc of matched) applyData(doc, args.data);
    return { count: matched.length };
  }

  async upsert(args: { where?: Where; create: Record<string, unknown>; update: Record<string, unknown> }) {
    const existing = this.rows.find((r) => matchesWhere(r, flattenWhere(args.where)));
    if (existing) {
      applyData(existing, args.update);
      return { ...existing };
    }
    const doc = { id: nextFakeObjectId(), ...args.create };
    this.rows.push(doc);
    return { ...doc };
  }

  async deleteMany(args: { where?: Where } = {}) {
    const before = this.rows.length;
    const kept = this.rows.filter((r) => !matchesWhere(r, flattenWhere(args.where)));
    this.rows.length = 0;
    this.rows.push(...kept);
    return { count: before - kept.length };
  }
}

/**
 * Le store : une collection JS par nom de modèle Prisma, créée à la volée.
 * Un modèle jamais seedé (préférences de confidentialité, liens de partage…)
 * répond comme une collection VIDE — ce que serait une base fraîche pour ces
 * tables — au lieu de faire planter le test avec un `undefined.findMany`.
 */
export class FakePrismaStore {
  private readonly collections = new Map<string, Record<string, unknown>[]>();

  private rowsFor(model: string): Record<string, unknown>[] {
    let rows = this.collections.get(model);
    if (!rows) {
      rows = [];
      this.collections.set(model, rows);
    }
    return rows;
  }

  /** Insère un document déjà formé (id compris) — pour le montage du scénario. */
  seed(model: string, doc: Record<string, unknown>): void {
    this.rowsFor(model).push({ ...doc });
  }

  /** Lecture directe de l'état — pour les assertions « boîte blanche » (curseur…). */
  rows(model: string): readonly Record<string, unknown>[] {
    return this.rowsFor(model);
  }

  /** Le client à passer aux constructeurs de service/route — `as any` au site d'appel. */
  asPrismaClient(): unknown {
    const store = this;
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          return new FakeModel(store.rowsFor(prop));
        },
      }
    );
  }
}
