# Plan — Iteration 215 : en-tête de conversation directe → SSOT `getUserDisplayName`

## Objectifs
Éliminer le dernier site de résolution de nom d'affichage **`username`-first** de
la couche conversation web : l'en-tête de conversation directe
(`use-participant-info.ts`). Converger sur le SSOT `getUserDisplayNameOrNull`,
comme #2311/#2313/#2317.

## Modules affectés
- `apps/web/components/conversations/header/use-participant-info.ts` (production)
- `apps/web/__tests__/components/conversations/header/use-participant-info.test.ts` (nouveau)
- `docs/routine/analyses/2026-07-26-iteration-215-analyse.md`
- `docs/routine/plans/2026-07-26-iteration-215-plan.md`

## Phases d'implémentation
1. **RED** — écrire `use-participant-info.test.ts` : 6 cas via `renderHook`
   (`participantInfo.name`), dont 3 régressions prouvées (nom réel > handle,
   firstName-seul > handle, displayName espaces-seul → nom réel). ✅ 3 fails observés.
2. **GREEN** — importer `getUserDisplayNameOrNull` ; remplacer les 3 chaînes
   inline (branches participants / conversation.participants / members) par
   `const name = getUserDisplayNameOrNull(user)`. ✅ 6/6 verts.
3. **Nettoyage TS test** — remplacer les casts `as Participant` par
   `as unknown as Participant` et introduire un type local `TestUser` (champs
   nullables) pour autoriser `null` dans les fixtures. ✅ 0 erreur tsc dans le test.
4. **Validation** — sweep `components/conversations/` (30 suites / 586). ✅
5. **Docs + commit + push + PR**.

## Dépendances
Aucune. Le SSOT `getUserDisplayNameOrNull` existe et est déjà consommé (≥ 6 sites).
`packages/shared/dist` doit être construit (tsc) pour la résolution `@meeshy/shared`
en test.

## Risques estimés
**Faibles.** Substitution logique équivalente sur les chemins bien-formés ;
changement de comportement circonscrit aux chemins buggés. Aucun schéma/API/i18n.

## Stratégie de rollback
Révert du commit unique. Fichier isolé, aucun consommateur externe modifié.

## Critères de validation
- `use-participant-info.test.ts` 6/6 (3 RED prouvés).
- `components/conversations/` 30 suites / 586 tests, 0 échec.
- `tsc --noEmit` : 0 nouvelle erreur (baseline production `unknown`-access inchangée).

## Statut de complétion
**Terminé** — RED → GREEN → validation OK. En attente merge.

## Suivi de progression
- [x] Analyse rédigée
- [x] Plan rédigé
- [x] Test RED (3 fails prouvés)
- [x] Correctif GREEN (6/6)
- [x] Nettoyage TS du test
- [x] Sweep non-régression (586/586)
- [x] Commit + push
- [ ] PR ouverte / mergée

## Améliorations futures
Voir « Future improvements » de l'analyse 215 :
1. `getUserDisplayName` → `getUserDisplayNameOrNull(user) ?? fallback` (micro-dedup, sûr).
2. `transformers.service.ts:181-197` : préserver `regionalLanguage`/`customDestinationLanguage` bruts.
3. `use-contacts-v2.ts:53` / `transform-conversation.ts:120` : convergence `languageCode`
   **seulement après** clarification sémantique (participant vs consommé).
