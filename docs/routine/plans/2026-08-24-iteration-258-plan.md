# Plan — Itération 258 : SSOT du prédicat ObjectId (`isValidMongoId`) à travers le gateway

## Objectifs

Éliminer les huit copies du littéral `/^[0-9a-fA-F]{24}$/` du code runtime du
gateway en les rebranchant sur la SSOT existante `isValidMongoId`
(`@meeshy/shared/utils/conversation-helpers`), sans aucun changement de
comportement.

## Modules affectés

- **Neuf** : `services/gateway/src/utils/object-id.ts` (`assertValidObjectId`).
- **Test neuf** : `services/gateway/src/utils/__tests__/object-id.test.ts`.
- **Garde triplée rebranchée** : `services/ReactionService.ts`,
  `services/PostReactionService.ts`, `services/CommentReactionService.ts`.
- **Prédicat booléen rebranché** : `routes/anonymous.ts`,
  `routes/links/utils/link-helpers.ts`, `routes/links/utils/prisma-queries.ts`,
  `services/messaging/forwardAdmission.ts`, `utils/conversation-id-cache.ts`.

## Phases

1. **RED** — écrire `object-id.test.ts` (6 cas) contre un module absent.
2. **GREEN** — `assertValidObjectId(id, label)` déléguant à `isValidMongoId`,
   message `Invalid ${label} ID format: ${id.substring(0, 20)}`.
3. **Rebranchement garde** — supprimer `OBJECT_ID_REGEX` des trois services,
   réduire `validate*Id` à une délégation ; call sites inchangés.
4. **Rebranchement prédicat** — remplacer les cinq `.test(x)` / `OBJECT_ID_RE`
   inline par `isValidMongoId(x)` ; supprimer les deux constantes locales.
5. **Validation** — tsc + suites concernées + balayage anti-régression du littéral.

## Dépendances

Aucune. `isValidMongoId` est déjà exporté et testé.

## Risques estimés

- Négligeable — prédicat identique à la source. Seul risque : un site où l'input
  n'est pas garanti `string` → mitigé par tsc (exit 0) et les gardes `!id`/`x &&`
  en amont.

## Stratégie de rollback

Réinliner `/^[0-9a-fA-F]{24}$/` aux huit sites, supprimer `object-id.ts` + test.

## Critères de validation

- object-id 6/6 ; réaction (services+handlers) 429/429 ; forwardAdmission +
  conversation-id-cache + object-id 33/33 ; share/link/anonymous 741/741.
- `tsc --noEmit` gateway exit 0.
- Zéro littéral ObjectId restant dans les 8 fichiers touchés.
- CI verte sur la PR.

## Statut de complétion

- [x] Phases 1–5 réalisées et validées localement.
- [ ] CI verte (gate réel bun/lint).

## Suivi / futures itérations

- Consolider les deux `normalizeConversationId` (twin plus large : cache +
  résolution Prisma).
- Cluster Zod `CommonSchemas.mongoId` (6 fichiers) — lot distinct, change le
  message d'erreur servi, décision de contrat requise.
- Durcissement optionnel du footgun `substring` sur entrée nullish (comportement
  actuel préservé).
