# Plan — Itération 285 : retrait du hook web `useMessageTranslations` (jumelle divergente morte)

## Objectifs

Supprimer le résolveur de contenu message web mort et divergent
(`use-message-translations.ts`, résolution rang-1-seul + repli original), rewirer
son unique consommateur vers la SSOT `@/utils/user-language-preferences`, sans
toucher au chemin de rendu vivant.

## Modules affectés

- `apps/web/hooks/use-message-translations.ts` (supprimé)
- `apps/web/hooks/index.ts` (export retiré)
- `apps/web/components/common/bubble-stream-page.tsx` (rewiring SSOT, 3 sites)
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` (supprimé)
- `apps/web/scripts/analyze-unused-hooks.ts`, `analyze-hooks-detailed.ts` (entrées mortes)
- `apps/web/components/conversations/conversation-item/__tests__/message-formatting.test.tsx` (commentaire)

## Phases

1. **Recensement** — prouver que les 4 méthodes de résolution du hook sont mortes
   (grep : seul le test du hook les référence) et que le consommateur ne destructure
   que les 2 délégateurs. ✅
2. **Rewiring** — `bubble-stream-page` importe `resolveUserPreferredLanguage` /
   `getUserLanguagePreferences` depuis `@/lib/bubble-stream-modules` (qui ré-exporte
   déjà la SSOT) ; passer `user` en argument aux 3 sites. ✅
3. **Suppression** — retirer le hook, son export de barrique, son fichier de test. ✅
4. **Nettoyage** — entrées mortes des scripts d'analyse, commentaire pendant. ✅
5. **Validation** — jest (hooks + suites touchées), cliquet de dette de types. ✅

## Dépendances

Aucune. Les cycles 283/284 (SSOT de descente vivante) sont déjà sur `main`.

## Risques estimés

- **Régression de rendu du fil streaming** : nulle — le rendu passe par
  `ConversationMessages`/`use-message-display`, pas par le hook supprimé.
- **Barrique `@/hooks`** : aucun autre consommateur du symbole retiré (grep clean).
- **Cliquet de dette de types** : delta nul mesuré (1184 → 1184).

## Stratégie de rollback

`git revert` du commit unique. Aucun changement de schéma, d'API, ni de format
persistant.

## Critères de validation

- Aucune référence vivante à `useMessageTranslations` / `use-message-translations`.
- `npx jest __tests__/hooks` vert (120 suites).
- `scripts/check-type-debt.sh --self-test && scripts/check-type-debt.sh` vert, dette
  inchangée.

## Statut d'achèvement

**Terminé.** Toutes les phases livrées et validées dans ce lot.

## Suivi / améliorations futures

- Cliquet « toute surface web de contenu descend le prisme ordonné » (méthode, non
  planifié).
- `use-stream-translation.ts` : `userLanguages` sans locale appareil (stats only) —
  à trancher.
