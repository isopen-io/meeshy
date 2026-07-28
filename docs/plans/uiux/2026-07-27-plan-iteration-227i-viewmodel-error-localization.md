# Plan — Iteration 227i

**Date** : 2026-07-27 · **Base** : `main` HEAD `913d8cc90`
**Surface** : messages d'erreur publiés par les ViewModels

## Point de départ

Piste (a) de 225i, qui imposait de **mesurer avant de prédire**. Le premier
balayage (motif `error = "`) donne 5 occurrences ; le motif élargi à
`errorMessage` en donne **11 sur 3 ViewModels**. La mesure initiale sous-estimait
le défaut d'un facteur 2.

## Objectifs

1. Localiser les 11 messages d'erreur (dont 3 non accentués).
2. Localiser les **3 replis français** de `TwoFactorSetupView` — sans quoi seul
   le chemin « le ViewModel a parlé » est couvert.
3. **Généraliser la garde de 225i** : balayer tous les `*ViewModel.swift` au lieu
   de nommer deux fichiers.

## Étapes

1. 11 sites → `String(localized:defaultValue:bundle:)`.
2. 11 clés neuves × 7 locales.
3. Replis de vue → **mêmes clés** que le ViewModel.
4. `ViewModelErrorLocalizationTests` : balayage app-wide + locales + repli.
5. Vérifier le **ratchet de backlog** d'un autre agent (plafond 1 606).

## Non-objectifs

- Ne pas toucher `LocalizationConsistencyTests` (détenu par #2369/#2411).
- Ne pas traiter les appels `String(localized:)` multi-lignes (#2411).
