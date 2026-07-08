# Iteration 124 — Plan d'implémentation (2026-07-07)

## Objectives
Corriger deux écarts de résolution de langue dans `apps/web/hooks/use-message-translations.ts`, tous deux
touchant le Prisme Linguistique :
1. **HIGH** — cache de traduction insensible à la langue préférée (contenu figé après switch de langue).
2. **MEDIUM** — duplicat divergent de `getUserLanguagePreferences` (pas de lowercase, ajout
   inconditionnel d'un `systemLanguage` possiblement `undefined`).

## Affected modules
- `apps/web/hooks/use-message-translations.ts` (production)
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` (tests)
- SSOT consommée (inchangée) : `apps/web/utils/user-language-preferences.ts`

## Implementation phases
- **P1 — Clé de cache** : calculer `preferredLanguage = resolveUserPreferredLanguage()` avant la clé,
  l'ajouter en suffixe (`…:${message.updatedAt}:${preferredLanguage}`), réutiliser la valeur plus bas
  (supprimer l'appel dupliqué). ✅
- **P2 — Délégation SSOT** : remplacer la copie locale de `getUserLanguagePreferences` par
  `getUserLanguagePreferencesUtil(currentUser)` (import ajouté). ✅
- **P3 — Tests** : ajouter 5 cas (2 pour la clé de cache : re-résolution après switch + stabilité
  intra-langue ; 3 pour la délégation : lowercase, systemLanguage absent, pas de demande redondante). ✅
- **P4 — Validation** : RED→GREEN sur le cas clé de cache, suite complète verte, `tsc` propre. ✅

## Dependencies
Aucune nouvelle dépendance. `getUserLanguagePreferences` et `resolveUserPreferredLanguage` existent déjà
dans l'util canonique.

## Estimated risks
Très faibles. Aucun changement d'API publique du hook. La délégation renvoie des résultats identiques
pour les codes lowercase (couverts par la suite existante) ; elle ne corrige que les cas casse-mixte /
`undefined`. La dimension langue ajoutée à la clé ne dégrade pas le hit-rate intra-langue.

## Rollback strategy
Revert du commit unique. Les deux changements sont isolés au hook + son test — aucun effet de bord
ailleurs (le hook ne modifie que du contenu d'affichage local).

## Validation criteria
- [x] 43/43 tests `use-message-translations.test.tsx`.
- [x] RED confirmé sans la langue dans la clé (échec du cas switch), GREEN avec.
- [x] `tsc --noEmit` : aucune erreur sur le fichier modifié.
- [x] `bun.lock` restauré (pas de churn de lockfile dans la PR).

## Completion status
**COMPLETE** — implémenté, testé (RED→GREEN), documenté. Prêt à merge.

## Progress tracking
- [x] P1 clé de cache
- [x] P2 délégation SSOT
- [x] P3 tests (+5)
- [x] P4 validation

## Future improvements
Voir backlog de l'analyse iter 124 : **F89** (HIGH — anonymes contournent la garde d'appartenance
conversation dans participant-resolver/LocationHandler/StatusHandler ; cycle dédié, zone realtime à
forte densité de PR), **F90** (MEDIUM — recherche translation-body tronquée à 200 lignes + pagination
qui s'arrête trop tôt), **F91** (LOW — `typing:stop` jamais émis au disconnect d'un anonyme).
