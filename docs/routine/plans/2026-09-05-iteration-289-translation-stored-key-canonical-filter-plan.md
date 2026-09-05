# Plan — Itération 289 : filtre bande-passante des traductions canonicalise la clé stockée (#5234)

## Objectifs
Fermer la moitié symétrique de #5108 : canonicaliser la CLÉ STOCKÉE (pas seulement
le code demandé) dans les trois filtres de bande passante des traductions, via une
SSOT unique.

## Modules affectés
- `packages/shared/utils/language-normalize.ts` — nouvelle SSOT `makeLanguageFilter`.
- `services/gateway/src/utils/translation-transformer.ts` — filtre texte REST.
- `services/gateway/src/routes/conversations/messages-list-query.ts` — filtre audio REST.
- `services/gateway/src/socketio/utils/message-payload-filter.ts` — filtre socket.
- Tests : `packages/shared/__tests__/language-normalize.test.ts`,
  `services/gateway/src/utils/__tests__/translation-transformer.test.ts`,
  `services/gateway/src/socketio/utils/__tests__/message-payload-filter.test.ts`.

## Phases
1. **RED** — témoins `makeLanguageFilter` (shared) + clé régionale stockée servie
   (transformer + payload-filter). ✅ prouvé (6 + 2 rouges).
2. **GREEN** — implémenter `makeLanguageFilter` ; router les trois filtres. ✅
3. **REFACTOR** — doc-comments alignés (matching canonicalisé des deux côtés). ✅

## Dépendances
`normalizeLanguageForDedup` (existant). Aucune migration, aucun changement de schéma.

## Risques estimés
Très faible : idempotent sur codes déjà canoniques ; empty-check préservé
(`null`). Ne change de comportement que pour une clé non-canonique, rattrapée.

## Stratégie de rollback
Revert du commit unique. Aucun état persisté touché.

## Critères de validation
- vitest shared vert, jest gateway (filtres + consommateurs) vert.
- `tsc --noEmit` gateway ET shared EXIT=0.
- Aucun `.toLowerCase()` de matching de langue-set dans les trois filtres.

## Statut : LIVRÉ
Commit unique, `Closes #5234`.

## Améliorations futures
- Balayer d'autres consommateurs de langues verbatim non couverts (iOS/Android
  n'ont pas d'équivalent `makeLanguageFilter` — ouvrir une issue si une jumelle
  divergente y apparaît).
- `getTranslationFromJSON` porte sa propre résolution verbatim-puis-casse
  (single-key, pas set) — cohérente avec le reader `MessageTranslationService` ;
  candidat à unification ultérieure si un troisième single-key resolver apparaît.
