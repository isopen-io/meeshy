# Iteration 48 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique de la validation d'email web (F25a) + dernière horloge inline (F25c-suite) » :
faire déléguer les 2 réimplémentations laxistes restantes de `isValidEmail`
(`magic-link/page.tsx` en prod, `xss-protection.ts` morte) au canonique RFC 5322
`@meeshy/shared/utils/email-validator`, et la dernière horloge inline web (`formatCountdown`) au
canonique `formatClock` via le wrapper `audio-formatters`.

## Pré-requis runner (parité CI)
- [ ] `cd packages/shared && bun run build` (tsc) → `dist/` présent (résolution des imports `@meeshy/shared`).
- [ ] Baselines : shared vitest `email-validator` vert ; web jest `xss-protection`,
      `magic-link.service` verts.

## Étapes (délégation à des SSOT déjà testées — pas de nouveau RED shared)

### Phase A — `apps/web/app/auth/magic-link/page.tsx` (email)
- [ ] Supprimer le `const isValidEmail = (email: string) => { ... }` local (l.154-156).
- [ ] Ajouter `import { isValidEmail } from '@meeshy/shared/utils/email-validator';` en tête.
- [ ] Call-site `handleSubmit` (l.169 `if (!isValidEmail(trimmedEmail))`) inchangé.

### Phase B — `apps/web/utils/xss-protection.ts` (email)
- [ ] Remplacer le corps de `isValidEmail` par une délégation au canonique
      (réexport `import { isValidEmail as canonicalIsValidEmail }` puis `return canonicalIsValidEmail(...)`,
      en conservant la signature `(email: string | null | undefined)`).
- [ ] `node_modules/.bin/jest utils/__tests__/xss-protection.test.ts` → bloc `isValidEmail` vert
      (cas concordants : valides `test@example.com`/`user.name@example.com`/`user+tag@example.co.uk`,
      invalides `not-an-email`/`@example.com`/`user@`/`user space@example.com`/`''`, trop long 262 car.).

### Phase C — `apps/web/app/auth/magic-link/page.tsx` (horloge)
- [ ] Supprimer le `formatCountdown` inline (l.148-152, `useCallback`).
- [ ] Ajouter `import { formatDuration } from '@/utils/audio-formatters';`.
- [ ] Remplacer les call-sites `formatCountdown(...)` par `formatDuration(...)`.

### Phase D — Vérification & livraison
- [ ] `tsc --noEmit` web : aucun nouveau type error sur les 2 fichiers touchés.
- [ ] Suites web jest affectées vertes ; shared vitest `email-validator` inchangé.
- [ ] Commit + push `claude/sharp-wozniak-kthrl5` ; CI verte (checks code-relevant) ;
      **merge dans main** (squash).

## Hors périmètre (consigné dans l'analyse)
F25b (téléphone — façade), F24b (FR file-size), F2/F10/F21 (staging/backfill).

## Continuité
Iter 49+ : **F25b** (façade de validation téléphone : unifier web simple + web robuste + gateway
sur libphonenumber country-aware) ; sinon nouveau scout (avatar-color/initials, slug/url,
groupBy/chunk, sanitize). F2/F10/F21 dès qu'une fenêtre staging/backfill existe.

## Incidents de merge (parallélisme multi-agents)
- À surveiller : un commit parallèle pourrait réintroduire un `isValidEmail`/`formatCountdown` local
  dans `magic-link/page.tsx`. En cas de conflit, restaurer les délégations (email→canonique,
  horloge→wrapper).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — magic-link email → canonique (`@meeshy/shared/utils/email-validator`). `isValidEmail`
      local laxiste supprimé.
- [x] Phase B — xss-protection email → canonique (réexport `canonicalIsValidEmail`).
      `xss-protection.test.ts` bloc `isValidEmail` **vert** (cas concordants), 59/59 avec magic-link.service.
- [x] Phase C — magic-link `formatCountdown` → `formatDuration` (wrapper `audio-formatters` du
      canonique `formatClock`). `useCallback` retiré de l'import (plus utilisé).
- [x] Phase D — `xss-protection` + `magic-link.service` **59/59** verts ; `tsc --noEmit` web :
      **aucune** erreur référençant les fichiers touchés (baseline préexistante inchangée) ; commit + push.
