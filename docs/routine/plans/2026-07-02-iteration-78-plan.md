# Iteration 78 — Plan d'implémentation (2026-07-02)

## Objectifs
Rendre `parseMentions` fidèle à sa promesse de « résolution exacte » : supprimer les 3 classes de
faux positifs (préfixe displayName, suffixe displayName, `@` interne d'adresse e-mail) qui
déclenchent des notifications de mention vers les mauvais utilisateurs.

## Modules affectés
- `packages/shared/utils/mention-parser.ts` (prod, 1 fichier)
- `packages/shared/__tests__/mention-parser.test.ts` (tests de régression)

## Phases
1. **RED** — Ajouter 6 cas de régression encodant le comportement exact voulu (faux positifs → `[]`,
   ponctuation/casse toujours acceptées). Vérifier qu'ils échouent sur le code actuel.
2. **GREEN** — Ajouter frontières Unicode gauche+droite à la regex displayName (flag `u`, construite
   une fois), frontière gauche `(?<!\w)` à la regex username, garde displayName non vide.
3. **REFACTOR** — Extraire les constantes de frontière, dédupliquer la construction test/replace.
4. **VALIDATION** — `vitest run mention-parser.test.ts` (22/22), aucune régression sur les 16 cas
   existants.

## Dépendances
Aucune. Fichier isolé, indépendant des PR ouvertes (#1344, #1346).

## Risques estimés
Faible. Lookbehind/`\p{L}` supportés par Node 22 (V8). `escapeRegex` n'échappe que des caractères
de syntaxe → aucun *identity escape* invalide sous flag `u`.

## Stratégie de rollback
`git revert` du commit unique — fichier isolé, aucune migration ni changement d'API.

## Critères de validation
- [ ] 6 tests neufs verts + 16 existants verts.
- [ ] `tsc` type-check du fichier OK (suite verte).

## Statut de complétion
- [ ] Implémenté
- [ ] Validé
- [ ] Mergé

## Améliorations futures
- Unifier les 3 copies du cache `conversationId` (F44) en une SSOT bornée.
- Ajouter sweep + borne au `participant-lookup-cache` (F45).
