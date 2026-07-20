# Plan d'implémentation — Iteration 185

## Objectifs
Corriger `normalizeName` dans `services/gateway/src/utils/name-similarity.ts` pour
préserver les lettres/chiffres Unicode, afin que `compareFullNames` retourne
`'exact'` pour deux identités identiques écrites en script non-latin
(cyrillique/arabe/CJK) et `'similar'`/`'different'` correctement pour les cas
proches / non liés — restaurant l'équité de la proposition de récupération de compte.

## Modules affectés
- `services/gateway/src/utils/name-similarity.ts` (1 ligne : classe de caractères
  de conservation `[^a-z0-9]` → `[^\p{L}\p{N}]` + flag `u`).
- `services/gateway/src/__tests__/unit/utils/name-similarity.test.ts` (nouveaux cas
  non-latins).

## Phases d'implémentation
1. **RED** — Ajouter au fichier de test :
   - cyrillique identique → `'exact'`
   - cyrillique non lié → `'different'`
   - arabe identique → `'exact'`
   - CJK identique → `'exact'`
   - cyrillique typo proche → `'similar'`
   - parité ASCII préservée (accent latin toujours `'exact'`).
   Vérifier l'échec sur le code actuel.
2. **GREEN** — Modifier `normalizeName` : `.replace(/[^\p{L}\p{N}]+/gu, ' ')`.
3. **REFACTOR** — Aucun besoin (une ligne). Vérifier les commentaires de la
   fonction restent exacts.
4. **Validation** — `test:coverage` gateway (jest) : suite complète verte.

## Dépendances
Aucune. Module pur sans état, un seul call site (flux récupération).

## Risques estimés
Très faible. Le fix élargit la conservation aux lettres Unicode sans altérer le
folding d'accent latin (assuré en amont par NFD + `\p{M}`). La garde chaîne-vide
demeure correcte pour les entrées non-normalisables.

## Stratégie de rollback
Revert du commit unique (1 ligne + tests). Aucun état persistant, aucune migration.

## Critères de validation
- Nouveaux tests non-latins : RED avant, GREEN après.
- Suite `name-similarity.test.ts` existante inchangée et verte.
- Suite gateway complète : aucune régression.

## Statut de complétion
- [x] Analyse rédigée
- [x] Plan rédigé
- [x] RED (tests non-latins échouent sur main : 4 fail — Cyrillic/Arabic/CJK exact + Cyrillic typo)
- [x] GREEN (fix appliqué : `[^\p{L}\p{N}]+/gu` — 15/15 name-similarity verts)
- [x] Validation gateway (28 suites unit/utils, 912 tests verts, aucune régression)
- [ ] Commit + push + PR

## Améliorations futures (backlog)
- `rate-limiter.ts` : aligner docstring « Sliding window » sur l'implémentation
  fenêtre-fixe, OU implémenter une vraie fenêtre glissante si le burst-frontière
  est un risque réel.
- `notification-strings.ts` : distinguer `zh-Hant`/`zh-Hans` si une variante
  traditionnelle est un jour ajoutée à `NOTIFICATION_LANGUAGES`.
