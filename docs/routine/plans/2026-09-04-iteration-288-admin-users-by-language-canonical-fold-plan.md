# Plan — Itération 288 : `usersByLanguage` de l'admin replie ses codes canoniques

## Objectifs
Corriger la fragmentation des comptes d'utilisateurs par langue dans
`GET /api/admin/languages/stats` : replier les variantes région-taguées / casse
mixte de `systemLanguage` sur leur code canonique, en additionnant les comptes,
via la SSOT `normalizeLanguageForDedup`.

## Modules affectés
- `services/gateway/src/routes/admin/languages.ts` — import + `reduce` de
  `usersLanguageMap`.
- `services/gateway/src/__tests__/unit/routes/admin/languages-extra.test.ts` —
  témoins de repli / idempotence.

## Phases
1. **RED** — ajouter les témoins : repli `fr`/`fr-FR`/`FR` → `{ fr: 107 }`,
   idempotence sur codes canoniques, forme `fr_FR`. Prouver l'échec contre
   l'implémentation verbatim.
2. **GREEN** — importer `normalizeLanguageForDedup`, clé le `reduce` sur le code
   canonique et ADDITIONNER (`acc[key] = (acc[key] ?? 0) + count`).
3. **Validation** — `languages-extra` + `languages-routes` + `tsc --noEmit`.

## Dépendances
Aucune. `normalizeLanguageForDedup` existe déjà (`packages/shared`).

## Risques estimés
Très faibles. Repli déterministe, convergence seule, idempotent sur codes
canoniques. Aucune requête Prisma ni schéma modifié — le groupBy reste sur
`systemLanguage`, le repli s'applique à son résultat.

## Stratégie de rollback
Revert du commit unique — modification locale d'un `reduce`, sans état ni
migration.

## Critères de validation
- Témoin RED contre l'ancien code, GREEN après correctif.
- Suites `languages-extra` + `languages-routes` vertes.
- Gateway `tsc --noEmit` EXIT=0.

## Statut
COMPLÉTÉ — implémenté, validé, prêt à merger sur `dev`.

## Améliorations futures
`admin/broadcasts.ts` : filtre de ciblage `where.systemLanguage.in` (ligne 276)
sur valeurs verbatim (ne se corrige PAS par simple canonicalisation du filtre —
les lignes stockées sont verbatim) ; groupBy de rapport (ligne 316) fragmenté
comme celui corrigé ici — à replier au prochain passage. Nature : requête Prisma /
ciblage, à traiter en issue propre.
