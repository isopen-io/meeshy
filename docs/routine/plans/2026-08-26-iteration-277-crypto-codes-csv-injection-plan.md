# Plan — Itération 277 : codes OOB cryptographiques + neutralisation d'injection CSV

## Objectifs

Fermer deux surfaces de sécurité du gateway :
1. Remplacer `Math.random` par un CSPRNG sur les quatre sites de codes de
   vérification hors-bande (CWE-338), depuis une source unique.
2. Neutraliser l'injection de formule CSV (CWE-1236) dans l'export RGPD.

## Modules affectés

- `services/gateway/src/utils/verification-code.ts` — NOUVEAU, source unique.
- `services/gateway/src/services/PhonePasswordResetService.ts`
- `services/gateway/src/services/PhoneTransferService.ts`
- `services/gateway/src/services/AuthService.ts`
- `services/gateway/src/routes/users/contact-change.ts`
- `services/gateway/src/routes/me/export.ts` — `toCsv` exporté + neutralisation.
- Tests : `__tests__/unit/utils/verification-code.test.ts`,
  `__tests__/unit/routes/data-export-csv-injection.test.ts`.

## Phases d'implémentation

1. **RED** — `verification-code.test.ts` (import du helper absent) et
   `data-export-csv-injection.test.ts` (`toCsv` non exporté). Prouvés rouges.
2. **GREEN A** — `generateNumericCode(length = 6)` via `crypto.randomInt` ;
   les quatre sites délèguent ; import ajouté.
3. **GREEN B** — `toCsv` exporté, garde `/^[=+\-@\t\r]/` → préfixe `'` avant la
   citation structurelle existante.
4. **Witness de régression** — les quatre sites ne portent plus `Math.random`.
5. **Validation** — suites neuves + suites auth/export existantes + `tsc`.

## Dépendances

Aucune. `crypto.randomInt` est natif Node ; `import crypto from 'crypto'` déjà
présent sur les quatre sites A.

## Risques estimés

Faible. A préserve l'espace exact `[100000, 999999]`. B ne touche que les
cellules à premier caractère déclencheur ; cellules bénignes inchangées
(vérifié). Aucune signature publique ni forme de réponse changée.

## Stratégie de rollback

Revert du commit : les fichiers reviennent à l'état `main`, sans effet de bord
(dist non committé, régénéré par la CI).

## Critères de validation

- 17 tests neufs RED→GREEN.
- 305 tests des suites auth/password-reset/phone-transfer/export verts.
- `tsc --noEmit` du gateway : 0 erreur.

## Statut de complétion

**COMPLÉTÉ.** Helper + 4 sites + `toCsv` + 2 suites livrés et validés côté
TypeScript (bun/jest, `tsc`). iOS/Android non concernés.

## Suivi des progrès

- [x] RED prouvé (deux suites).
- [x] Helper CSPRNG + 4 sites repointés.
- [x] Neutralisation CSV + export de `toCsv`.
- [x] Witness de régression (4 sites sans `Math.random`).
- [x] Non-régression + typecheck verts.

## Améliorations futures (hors périmètre, une issue chacune)

- Cap de réactions TOCTOU (5 sites) — rendre l'écriture atomique
  (`updateMany` conditionnel / transaction), consolider en un helper.
- Cache `GeoIPService` non borné — planifier `cleanGeoCache` (`setInterval` +
  `unref()`), borne LRU, delete-on-read.
- Éviction de la map anti-spam mentions par ancienneté d'activité, pas par ordre
  d'insertion.
