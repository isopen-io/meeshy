// Le contexte d'une exécution : le sel, les comptes de recette, et ce qui tient
// les RELATIONS (valeur réelle → valeur synthétique) et le filtre d'IDENTITÉ
// (les mots du pseudo, du nom, de l'adresse de chaque compte).
//
// Aucune valeur réelle n'y est gardée en clair : une valeur réelle n'y vit que
// sous son EMPREINTE salée (HMAC-SHA256 du sel). C'est ce qui permet de la
// persister dans le manifeste et de reprendre une exécution interrompue sans
// perdre ni les relations ni le filtre (anonymize-database/state.mjs).

import { createHmac } from 'node:crypto';

const RELATION_FAMILIES = Object.freeze(['username', 'email', 'phone', 'packSlug']);

export const normalizePhone = (value) => (typeof value === 'string' ? value.replace(/[^\d+]/g, '') : value);

const NORMALIZE = Object.freeze({
  username: (v) => String(v).toLowerCase(),
  email: (v) => String(v).toLowerCase(),
  phone: (v) => normalizePhone(String(v)),
  packSlug: (v) => String(v),
});

/** Les mots d'une valeur : lettres et chiffres séparés, casse chameau coupée, trois caractères au moins. */
export function identityTokens(value) {
  if (typeof value !== 'string') return [];
  const split = value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').toLowerCase();
  return (split.match(/\p{L}+|\p{N}+/gu) ?? []).filter((w) => w.length >= 3);
}

export function newContext({ salt, keepLogins = [], hashRandomPassword, issuePassword = async () => null }) {
  const print = (family, value) => createHmac('sha256', salt).update(`${family}\u0000${value}`).digest('hex').slice(0, 32);
  const relations = Object.fromEntries(RELATION_FAMILIES.map((f) => [f, new Map()]));
  const identity = new Set();
  const ctx = {
    salt,
    startedAt: null,
    keepLogins: new Set(keepLogins),
    keptUsernames: new Set(),
    missingKeepLogins: [],
    users: new Map(),
    keptCredentials: [],
    hashRandomPassword,
    issuePassword,
    relations,
    identity,
    /** Retient « valeur réelle → valeur synthétique » sous l'empreinte de la valeur réelle. */
    remember(family, real, synthetic) {
      if (real === null || real === undefined || real === '') return;
      relations[family].set(print(family, NORMALIZE[family](real)), synthetic);
    },
    recall(family, real) {
      if (real === null || real === undefined || real === '') return undefined;
      return relations[family].get(print(family, NORMALIZE[family](real)));
    },
    noteIdentity(...values) {
      values.flatMap(identityTokens).forEach((w) => identity.add(print('word', w)));
    },
    namesSomeone(value) {
      return identity.size > 0 && identityTokens(value).some((w) => identity.has(print('word', w)));
    },
  };
  return ctx;
}
