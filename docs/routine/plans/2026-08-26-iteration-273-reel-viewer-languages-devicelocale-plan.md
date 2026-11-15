# Itération 273 — Plan : descendre le Prisme complet pour l'affinité de langue du reel viewer

## Objectifs

Faire consulter à `PostFeedService.getViewerLanguages` les QUATRE rangs du Prisme
(deviceLocale comprise) en déléguant à la SSOT `resolveUserLanguagesOrdered`, de
sorte que le signal `viewerLanguage` du classement des reels soit vivant même
pour un lecteur dont le seul signal de langue est la locale appareil.

## Modules affectés

- `services/gateway/src/services/PostFeedService.ts` — `getViewerLanguages`
  (select + descente), import.
- `services/gateway/src/services/posts/reelAffinity.ts` — doc-comment de
  `ReelAffinityContext.viewerLanguages`.
- `services/gateway/src/__tests__/unit/services/PostFeedService.test.ts` — 2 tests.
- `docs/routine/{analyses,plans}/…` — cette analyse + ce plan.

## Phases d'implémentation

1. **RED** — deux témoins sur `getReels` : boost device-locale + `select`
   contenant `deviceLocale`. Prouvés rouges contre le code actuel. ✅
2. **GREEN** — déléguer à `resolveUserLanguagesOrdered` + charger `deviceLocale`.
   `map(normalizeLanguageForDedup)` pour l'égalité d'espace de comparaison. ✅
3. **Doc** — corriger le doc-comment de `viewerLanguages`. ✅
4. **Validation** — suites PostFeed/reelAffinity + `tsc` gateway. ✅

## Dépendances

Aucune. `resolveUserLanguagesOrdered` et `User.deviceLocale` existent déjà.

## Risques estimés

Très faibles. Best-effort (try/catch → `Set` vide). Idempotent sur codes
canoniques. Aucun changement de forme de réponse ni de contrat de fil.

## Stratégie de rollback

Révert du commit — méthode isolée, aucun effet de bord persistant.

## Critères de validation

- 88/88 `PostFeedService.test.ts`, 54/54 reelAffinity, `tsc` 0 erreur.
- RED prouvé avant GREEN.

## Statut d'achèvement

FAIT (branche `claude/brave-archimedes-etkznk`).

## Suivi progressif / améliorations futures

- La famille AUDIO du Prisme (`resolveAutoLanguage` web + `AudioTrackLanguageResolver`
  iOS + `resolveTranslatedAudio` Android) reste la dernière descente réécrite à la
  main, avec une comparaison `.toLowerCase()` (sans strip région) au lieu de la
  canonicalisation SSOT. Web et iOS y sont en parité entre eux ; toute évolution
  doit toucher les TROIS clients ensemble — non traité ici faute de pouvoir
  compiler/tester iOS et Android dans ce conteneur.
- La préférence UTILISATEUR `autoTranslateEnabled` (rendue écrivable au commit
  `5f47a89`, affichée en toggle dans `language-settings.tsx`) n'est consommée par
  AUCUN gate d'affichage/traduction (seul `Conversation.autoTranslateEnabled`
  gate). Câbler ce toggle est une décision PRODUIT (elle touche la philosophie
  « traduction automatique par défaut » du Prisme) — à instruire avec le porteur,
  pas en autonomie.
