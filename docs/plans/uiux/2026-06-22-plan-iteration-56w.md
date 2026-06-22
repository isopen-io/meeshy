# Plan — Itération 56w (web)

## Base
- Repartir de `main` HEAD `603ada4` (post-merge #768 iter-54wb + #769 iter-55w).
- Branche de travail : `claude/practical-fermat-y3ci31-56w`.

## Objectif
Solder le reliquat borné du cluster 53w : i18n des deux dialogues modaux FR
figés (`AttachmentDeleteDialog`, `PhoneExistsModal`) — rupture Prisme
Linguistique sur surfaces visibles (dont une surface d'entrée critique : flow
d'inscription).

## Étapes
1. [x] `locales/{en,fr,es,pt}/attachments.json` → bloc `deleteDialog` (6 clés).
2. [x] `AttachmentDeleteDialog.tsx` → `useI18n('attachments')` + 6 `t()`.
3. [x] `locales/{en,fr,es,pt}/auth.json` → bloc `register.wizard.phoneExistsModal`
   (15 clés).
4. [x] `PhoneExistsModal.tsx` → 15 `t()` (hook `useI18n('auth')` déjà présent).
5. [x] Vérif parité clés ×4 locales + validité JSON (8 fichiers).
6. [x] Annoter analyses + `branch-tracking.md`.
7. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg de `t()` pour chaînes simples (anti-flash, leçon 50w).
- Clés à paramètre (`{phone}`, `{seconds}`) : params seuls (signature t() exclusive).
- Diffs locale strictement additifs (round-trip JSON, aucune clé existante touchée).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (57w+)
`ReelPlayer`/feed (large), `app/settings/loading.tsx` (server component → i18n
server-side), console.error FR (logs dev), `next-themes` orphelin.
</content>
