/**
 * Lire avec prudence ce que le journal d'audit a gravé (#8876, § 6.2).
 *
 * `AdminAuditLog.changes` et `AdminAuditLog.metadata` sont des JSON
 * STRINGIFIÉS écrits par une douzaine de mains différentes, en au moins quatre
 * formes. La console ne peut pas les deviner : elle reçoit ici une forme
 * UNIQUE, et ce qui ne se lit pas devient `null` plutôt qu'une erreur.
 *
 * ## Ce qui ne sort JAMAIS de ce module
 *
 * - toute valeur dont la CLÉ ressemble à un secret (mot de passe, jeton, clé,
 *   code, empreinte) — quel que soit le lecteur : un journal d'audit n'est pas
 *   un endroit où relire un secret, même pour celui qui l'a posé ;
 * - sans `canViewSensitiveData`, les coordonnées (`email`, `phoneNumber`,
 *   `pendingEmail`, `pendingPhoneNumber`) ;
 * - de `metadata`, tout sauf `reason` : les autres clés sont libres, donc
 *   inconnues, donc non servies.
 *
 * Le masquage descend DANS les valeurs structurées : un secret enfoui dans
 * l'objet d'un champ `settings` partirait sinon en clair à travers la
 * sérialisation JSON du champ.
 */

export type AuditChangeEntry = {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
};

export const AUDIT_MASK = '•••';

const SECRET_KEY = /password|secret|token|hash|code|key/i;
const CONTACT_KEYS: ReadonlySet<string> = new Set(['email', 'phonenumber', 'pendingemail', 'pendingphonenumber']);
const MAX_ENTRIES = 50;
const MAX_VALUE_LENGTH = 500;
const MAX_DEPTH = 4;

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const lastSegment = (field: string): string => field.split('.').pop() ?? field;

const isContactKey = (field: string): boolean => CONTACT_KEYS.has(lastSegment(field).toLowerCase());

const clip = (text: string): string =>
  text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;

const parseJson = (raw: string | null | undefined): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Un secret se reconnaît à sa clé ; une coordonnée aussi, pour qui n'a pas le droit de la lire. */
const isMaskedKey = (key: string, canSeeContacts: boolean): boolean =>
  SECRET_KEY.test(key) || (!canSeeContacts && isContactKey(key));

function redact(value: unknown, canSeeContacts: boolean, depth: number): unknown {
  if (depth > MAX_DEPTH) return AUDIT_MASK;
  if (Array.isArray(value)) return value.map((item) => redact(item, canSeeContacts, depth + 1));
  if (!isPlain(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      isMaskedKey(key, canSeeContacts) ? AUDIT_MASK : redact(inner, canSeeContacts, depth + 1),
    ])
  );
}

function show(value: unknown, canSeeContacts: boolean): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return clip(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return clip(JSON.stringify(redact(value, canSeeContacts, 0)));
  } catch {
    return null;
  }
}

const hasAny = (source: Plain, keys: readonly string[]): boolean => keys.some((key) => key in source);

const BEFORE_KEYS = ['before', 'from'] as const;
const AFTER_KEYS = ['after', 'to'] as const;

const pick = (source: Plain, keys: readonly string[]): unknown => {
  const found = keys.find((key) => key in source);
  return found === undefined ? null : source[found];
};

const entry = (field: string, before: unknown, after: unknown, canSeeContacts: boolean): AuditChangeEntry => {
  const masked = isMaskedKey(field, canSeeContacts);
  const serve = (value: unknown): string | null => {
    const shown = show(value, canSeeContacts);
    return masked && shown !== null ? AUDIT_MASK : shown;
  };
  return { field, before: serve(before), after: serve(after) };
};

const sameValue = (before: unknown, after: unknown): boolean =>
  JSON.stringify(before ?? null) === JSON.stringify(after ?? null);

/** `{ before: {…}, after: {…} }` — chaque champ qui a bougé. */
function fromSnapshots(before: unknown, after: unknown, canSeeContacts: boolean): AuditChangeEntry[] {
  if (isPlain(before) || isPlain(after)) {
    const left = isPlain(before) ? before : {};
    const right = isPlain(after) ? after : {};
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((field) => !sameValue(left[field], right[field]))
      .map((field) => entry(field, left[field], right[field], canSeeContacts));
  }
  return [entry('value', before, after, canSeeContacts)];
}

function fromArray(items: readonly unknown[], canSeeContacts: boolean): AuditChangeEntry[] {
  return items.flatMap((item): AuditChangeEntry[] => {
    if (!isPlain(item)) return [];
    const field = [item.field, item.name, item.key, item.path].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate !== ''
    );
    if (field === undefined) return [];
    return [entry(field, pick(item, BEFORE_KEYS), pick(item, AFTER_KEYS), canSeeContacts)];
  });
}

function fromRecord(record: Plain, canSeeContacts: boolean): AuditChangeEntry[] {
  const keys = Object.keys(record);
  const snapshotForm = keys.length > 0 && keys.every((key) => key === 'before' || key === 'after');
  if (snapshotForm) return fromSnapshots(record.before, record.after, canSeeContacts);

  return keys.map((field) => {
    const value = record[field];
    const isChange = isPlain(value) && (hasAny(value, BEFORE_KEYS) || hasAny(value, AFTER_KEYS));
    return isChange
      ? entry(field, pick(value, BEFORE_KEYS), pick(value, AFTER_KEYS), canSeeContacts)
      : entry(field, null, value, canSeeContacts);
  });
}

/**
 * Les changements d'une ligne, sous UNE forme. `null` quand la ligne n'en porte
 * pas ou qu'on ne sait pas les lire — jamais une exception.
 */
export function readAuditChanges(
  raw: string | null | undefined,
  options: { readonly canSeeContacts: boolean }
): readonly AuditChangeEntry[] | null {
  const parsed = parseJson(raw);
  const entries = Array.isArray(parsed)
    ? fromArray(parsed, options.canSeeContacts)
    : isPlain(parsed)
      ? fromRecord(parsed, options.canSeeContacts)
      : [];
  return entries.length === 0 ? null : entries.slice(0, MAX_ENTRIES);
}

/** Le motif écrit par l'administrateur — la seule clé de `metadata` que la console sert. */
export function readAuditReason(raw: string | null | undefined): string | null {
  const parsed = parseJson(raw);
  if (!isPlain(parsed)) return null;
  const { reason } = parsed;
  return typeof reason === 'string' && reason.trim() !== '' ? clip(reason) : null;
}
