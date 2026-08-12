# Plan d'implémentation — Iteration 174

## Objectifs
Corriger le faux négatif de `looksLikePhoneNumber` sur le format téléphonique
local NANP à parenthèse de tête (`(555) 123-4567`), sans élargir la
désambiguïsation email/username.

## Modules affectés
- `services/gateway/src/utils/normalize.ts` (`looksLikePhoneNumber`, 1 ligne).
- `services/gateway/src/__tests__/unit/utils/normalize.test.ts` (+6 tests).

## Phases
1. **RED** — ajouter les tests de classification à parenthèse de tête + les
   garde-fous d'anti-régression (séparateur en tête, lettres, < 6 chiffres).
2. **GREEN** — étendre l'ancre de position 0 : `[+\d]` → `[+\d(]`.
3. **Validation** — `jest utils/normalize.test` (131/131). RED prouvé sur
   l'ancienne regex.

## Dépendances
Aucune. Fonction pure ; `libphonenumber-js` déjà présent.

## Risques estimés
Négligeable — un caractère de regex, entièrement couvert par tests. Cohérence
downstream vérifiée (aucune nouvelle classe de sortie pour `normalizePhoneNumber`).

## Stratégie de rollback
`git revert` du commit unique (code + tests + docs groupés).

## Critères de validation
- Suite `normalize.test` verte.
- CI gateway verte post-push.

## Statut
- [x] Phase 1 (RED)
- [x] Phase 2 (GREEN)
- [x] Phase 3 (validation locale)
- [ ] CI verte (post-push)

## Améliorations futures
- `normalizePhoneNumber` renvoie un E.164 formaté même `isValid=false` ; une
  itération ultérieure pourrait gater sur `isValid` — mais cela changerait des
  tests existants (`001234567890123456` → `+1234567890123456`) et sort du
  périmètre de ce correctif ciblé.
