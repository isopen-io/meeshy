import * as z from 'zod/mini';

import { EXPIRATION_AT, MAX_USES_CEILING, type MyShareLink, type ShareLinkExpiration, type ShareLinkPatch, type ShareLinkPolicy } from '@/lib/api/links';

/**
 * **L'ÉDITION D'UN LIEN D'INVITATION** (#7797) — le brouillon de la page du
 * créateur, et le corps de `PATCH /api/v1/links/:linkId` qu'il produit.
 *
 * **Le brouillon part de ce que le lien EST** (`editDraftOf`), et **seul ce
 * qui a CHANGÉ part** (`validateEditDraft`) : renvoyer tout le lien écraserait
 * une modification faite ailleurs entre la lecture et l'envoi, et rendrait un
 * « Enregistrer » sans changement coûteux pour rien.
 *
 * **« Compte requis » éteint les trois exigences voisines**, comme à la
 * création (`validateShareLinkDraft`) : ce qui part est ce qui s'applique.
 */

export type ShareLinkExpirationChoice = 'keep' | ShareLinkExpiration;

export type ShareLinkEditDraft = {
  readonly name: string;
  readonly description: string;
  readonly expiration: ShareLinkExpirationChoice;
  readonly limitUses: boolean;
  readonly maxUses: number;
  readonly limitConcurrent: boolean;
  readonly maxConcurrent: number;
  readonly requireAccount: boolean;
  readonly requireNickname: boolean;
  readonly requireEmail: boolean;
  readonly requireBirthday: boolean;
  readonly allowAnonymousMessages: boolean;
  readonly allowAnonymousImages: boolean;
  readonly allowAnonymousFiles: boolean;
  readonly allowViewHistory: boolean;
  readonly allLanguages: boolean;
  readonly languages: readonly string[];
};

export type EditDraftField = 'maxUses' | 'maxConcurrent' | 'languages';

export type EditDraftValidation = { readonly ok: true; readonly patch: ShareLinkPatch } | { readonly ok: false; readonly field: EditDraftField };

const DEFAULT_MAX_USES = 100;
const DEFAULT_MAX_CONCURRENT = 50;

const Bounded = z.number().check(z.refine((value) => Number.isInteger(value) && value >= 1 && value <= MAX_USES_CEILING));

export function editDraftOf(link: MyShareLink, policy: ShareLinkPolicy): ShareLinkEditDraft {
  return {
    name: link.name ?? '',
    description: link.description ?? '',
    expiration: link.expiresAt === null ? 'never' : 'keep',
    limitUses: link.maxUses !== null,
    maxUses: link.maxUses ?? DEFAULT_MAX_USES,
    limitConcurrent: policy.maxConcurrentUsers !== null,
    maxConcurrent: policy.maxConcurrentUsers ?? DEFAULT_MAX_CONCURRENT,
    requireAccount: policy.requireAccount,
    requireNickname: policy.requireNickname,
    requireEmail: policy.requireEmail,
    requireBirthday: policy.requireBirthday,
    allowAnonymousMessages: policy.allowAnonymousMessages,
    allowAnonymousImages: policy.allowAnonymousImages,
    allowAnonymousFiles: policy.allowAnonymousFiles,
    allowViewHistory: policy.allowViewHistory,
    allLanguages: policy.allowedLanguages.length === 0,
    languages: policy.allowedLanguages,
  };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((code) => b.includes(code));

/** Une valeur ne part que si elle diffère de ce que le lien porte. L'assertion
 * est celle d'une clé CALCULÉE : `K` borne la clé aux champs du corps et
 * `next` au type de SA valeur, ce que TypeScript ne sait pas relier seul. */
const changed = <K extends keyof ShareLinkPatch>(key: K, next: NonNullable<ShareLinkPatch[K]> | null, current: unknown): ShareLinkPatch =>
  next === current ? {} : ({ [key]: next } as ShareLinkPatch);

function expiresAtOf(choice: ShareLinkExpirationChoice, now: Date): string | null | undefined {
  if (choice === 'keep') return undefined;
  return EXPIRATION_AT[choice](now)?.toISOString() ?? null;
}

export function validateEditDraft(draft: ShareLinkEditDraft, link: MyShareLink, policy: ShareLinkPolicy, now: Date): EditDraftValidation {
  if (draft.limitUses && !Bounded.safeParse(draft.maxUses).success) return { ok: false, field: 'maxUses' };
  if (draft.limitConcurrent && !Bounded.safeParse(draft.maxConcurrent).success) return { ok: false, field: 'maxConcurrent' };
  const languages = [...new Set(draft.languages.map((code) => code.trim().toLowerCase()).filter((code) => code !== ''))].sort();
  if (!draft.allLanguages && languages.length === 0) return { ok: false, field: 'languages' };

  const expiresAt = expiresAtOf(draft.expiration, now);
  const allowedLanguages = draft.allLanguages ? [] : languages;
  const account = draft.requireAccount;
  return {
    ok: true,
    patch: {
      ...changed('name', draft.name.trim(), link.name ?? ''),
      ...changed('description', draft.description.trim(), link.description ?? ''),
      ...(expiresAt === undefined ? {} : changed('expiresAt', expiresAt, link.expiresAt)),
      ...changed('maxUses', draft.limitUses ? draft.maxUses : null, link.maxUses),
      ...changed('maxConcurrentUsers', draft.limitConcurrent ? draft.maxConcurrent : null, policy.maxConcurrentUsers),
      ...changed('requireAccount', account, policy.requireAccount),
      ...changed('requireNickname', draft.requireNickname && !account, policy.requireNickname),
      ...changed('requireEmail', draft.requireEmail && !account, policy.requireEmail),
      ...changed('requireBirthday', draft.requireBirthday && !account, policy.requireBirthday),
      ...changed('allowAnonymousMessages', draft.allowAnonymousMessages, policy.allowAnonymousMessages),
      ...changed('allowAnonymousImages', draft.allowAnonymousImages, policy.allowAnonymousImages),
      ...changed('allowAnonymousFiles', draft.allowAnonymousFiles, policy.allowAnonymousFiles),
      ...changed('allowViewHistory', draft.allowViewHistory, policy.allowViewHistory),
      ...(sameSet(allowedLanguages, policy.allowedLanguages) ? {} : { allowedLanguages }),
    },
  };
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value);

/** Le lien tel que le cache le peint AU GESTE — le miroir local du `PATCH`. */
export function patchedLink(link: MyShareLink, patch: ShareLinkPatch): MyShareLink {
  const { name, description, expiresAt, maxUses, ...policy } = patch;
  return {
    ...link,
    ...(name === undefined ? {} : { name: blankToNull(name) }),
    ...(description === undefined ? {} : { description: blankToNull(description) }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(maxUses === undefined ? {} : { maxUses }),
    policy: link.policy === null ? null : { ...link.policy, ...policy },
  };
}
