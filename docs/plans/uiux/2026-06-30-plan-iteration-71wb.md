# Plan de correction — Itération 71wb (web)

**Date** : 2026-06-30 · **Périmètre** : `apps/web` exclusivement · **Branche** : `claude/practical-fermat-j40nub`
**Analyse liée** : `docs/analyses/uiux/2026-06-30-iteration-71wb.md`

## Objectif
Solder le dernier résidu de l'anti-pattern i18n `t('clé') || 'fallback FR'` dans le **flux de
récupération de compte** (2 hooks), sans nouvelle clé i18n, en appliquant la forme anti-flash
`t('clé', 'EN exacte')` (leçon 50w).

## Étapes (✅ réalisées)
1. ✅ `hooks/use-recovery-submission.ts` : élargir le type du prop `t` à `(key, fallback?)`.
2. ✅ `hooks/use-recovery-submission.ts:56` : `t('magicLink.success.title', 'Magic Link Sent!')`.
3. ✅ `hooks/use-recovery-submission.ts:61` : `t('magicLink.errors.rateLimited', 'Too many attempts. Please try again in about an hour.')`.
4. ✅ `hooks/use-recovery-flow.ts:80` : `t('phoneReset.errors.tokenExpired', 'Session expired. Please start over.')`.
5. ✅ Test `__tests__/hooks/use-recovery-submission-i18n.test.ts` (2 cas anti-flash).
6. ✅ `jest` ciblé : 2 suites / 44 tests passed (incl. non-régression modal).

## Critères d'acceptation
- ✅ 0 occurrence `t()||'…'` résiduelle dans les 2 hooks.
- ✅ Valeurs de secours = anglais mot-pour-mot de `en/auth.json` (parité 4 locales conservée, 0 clé neuve).
- ✅ Tests verts ; non-régression `account-recovery-modal` préservée.
- ⏳ CI `Quality (bun)` verte + merge `main`.

## Gate CI
Gater sur la suite ciblée (`use-recovery-submission-i18n` + `account-recovery-modal`) et `Quality (bun)`.
**Ne pas** gater sur `Test web` global (rouge pré-existant, suites auth périmées — cf. branch-tracking)
ni `Test shared` (régression zod v4 hors-scope web).
