# Iteration 48 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 47 (« Source unique du formatage de durée horloge — F25c », mergée dans `main` :
PR #1141 / `2742372c`). Les 2 dernières réimplémentations inline web de `formatDuration`
(`MessageComposer.tsx`, `VideoPlayer.tsx`) délèguent désormais au canonique `formatClock` via le
wrapper `apps/web/utils/audio-formatters.ts`.

La continuité iter 47 désignait **F25a** (validation d'email web laxiste → canonique RFC 5322)
comme prochain candidat, *après validation que la bascule ne casse aucun flux*. Le scout iter 48 a
mené cette validation et l'a trouvée **sûre** sur les surfaces concernées.

Surfaces testables sur ce runner :
- **shared vitest** : `email-validator` (canonique RFC 5322) couvert ; baseline verte.
- **web jest** : `utils/__tests__/xss-protection.test.ts` (bloc `isValidEmail`), `magic-link.service.test.ts`.

## Cartographie — validation d'email web (F25a)

Source de vérité canonique : `packages/shared/utils/email-validator.ts` → `isValidEmail` (RFC 5322
simplifié, rejette `user@domain` sans TLD, `test@.com`, `@example.com`, borne 255 car., trim+lower,
gère `null`/`undefined`). Déjà importé par `validation.ts` (Zod `emailSchema`) et les hooks
d'inscription web.

| # | Emplacement | Forme | Importeurs prod | Statut |
|---|-------------|-------|-----------------|--------|
| Canonique | `packages/shared/utils/email-validator.ts` | RFC 5322 strict | `validation.ts`, `use-register-form.ts`, `use-registration-validation.ts` | **SSOT** |
| R1 | `apps/web/app/auth/magic-link/page.tsx:154` | local `isValidEmail` laxiste `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | la page elle-même (pré-envoi du magic link) | **réimplémentation laxiste** |
| R2 | `apps/web/utils/xss-protection.ts:287` | export `isValidEmail` laxiste (même regex + borne 254) | **AUCUN** (seul son propre test l'importe) | **réimplémentation laxiste, morte en prod** |

### Pourquoi la bascule est sûre ici (vs le report iter 47)

Le report iter 47 craignait un **changement de comportement** (le canonique rejette des emails
auparavant acceptés). Le scout iter 48 montre que ce risque ne se matérialise sur **aucune** des
deux surfaces :

- **R1 magic-link** : la validation est **pré-envoi** d'un lien magique. Le canonique ne rejette
  que des emails structurellement invalides (`user@domain` sans TLD, `test@.com`) — qui **ne
  pourraient de toute façon jamais recevoir** de lien. Resserrer ici = meilleur feedback immédiat,
  zéro email livrable perdu. Et cela **aligne** la page sur les flux d'inscription qui utilisent
  déjà le canonique (cohérence). Aucun test de la page n'assert le comportement laxiste
  (`magic-link.service.test.ts` teste le service, pas le composant).
- **R2 xss-protection** : **zéro importeur de production** (grep exhaustif : seul
  `xss-protection.test.ts` l'importe). Le bloc de test `isValidEmail` n'utilise que des cas où
  laxiste et canonique **concordent** (valides : `test@example.com`, `user.name@example.com`,
  `user+tag@example.co.uk` ; invalides : `not-an-email`, `@example.com`, `user@`,
  `user space@example.com`, `''` ; trop long : 262 car.). Le canonique passe **tous** ces cas →
  test vert sans modification. Délégation = dédup pure, aucun caller prod affecté.

## Constat secondaire — dernière horloge inline (F25c-suite)

`apps/web/app/auth/magic-link/page.tsx:148` `formatCountdown` :
```ts
const formatCountdown = useCallback((seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}, []);
```
`MAGIC_LINK_EXPIRY_SECONDS = 600` (10 min) et le countdown ne fait que **décrémenter vers 0** →
toujours `< 1 h`, entrée entière. Sortie **byte-identique** à `formatClock(seconds)` (le wrapper web
`formatDuration` de `audio-formatters`) : `${mins}` non-paddé + `:` + `pad2(secs)`. C'est la
**dernière** réimplémentation inline d'horloge web échappée au lot F25c (iter 47). Délégation
byte-identique en usage réel, strictement plus correcte aux bords (NaN/négatif → `0:00`).

## Décision iter 48 — lot « Source unique de la validation d'email web (F25a) + dernière horloge inline »

Périmètre concentré sur un seul fichier de flux d'auth (`magic-link/page.tsx`) + le purge du
laxiste mort (`xss-protection.ts`) :

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `magic-link/page.tsx` : supprimer le `isValidEmail` local laxiste, importer `isValidEmail` du canonique `@meeshy/shared/utils/email-validator` | Validation plus stricte (pré-envoi), aligne sur l'inscription ; aucun email livrable perdu |
| B | `xss-protection.ts` : `isValidEmail` délègue au canonique (réexport) | Dédup pure ; zéro caller prod ; test xss-protection vert (cas concordants) |
| C | `magic-link/page.tsx` : `formatCountdown` délègue à `formatDuration` (`@/utils/audio-formatters`, wrapper du canonique `formatClock`) | Dédup horloge ; byte-identique (countdown ≤ 600 s) ; clôt F25c |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F25b | Validateurs téléphone (web simple + web robuste + gateway) | MOYEN | Stratégies hétérogènes (regex vs libphonenumber country-aware) ; façade à concevoir |
| F24b | `formatFileSize` locale-aware gateway FR | FAIBLE | Change l'arrondi de contenu push visible |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit sémantique + backfill |

## Gain estimé global
Source unique de la **validation d'email côté web** : les 2 réimplémentations laxistes restantes
(R1 magic-link en prod, R2 xss-protection morte) délèguent au canonique RFC 5322. La validation
pré-envoi du magic link rejette désormais les emails structurellement invalides, cohérente avec
l'inscription. La dernière horloge inline web (`formatCountdown`) délègue au canonique `formatClock`,
clôturant définitivement le lot F25c. Couvert par la gate shared vitest (`email-validator`,
`formatClock`) + web jest (`xss-protection`, `magic-link.service`).
