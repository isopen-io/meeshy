# Plan — Iteration-186i — OnboardingView contrôle de pagination accessible

**Base** : `main` HEAD `9d41333` · **Branche** : `claude/laughing-thompson-qdzrzc`

## Objectif
Rendre le contrôle de pagination custom d'`OnboardingView` accessible à VoiceOver
(actuellement muet car il remplace les points natifs supprimés), et retirer le
bruit VoiceOver de l'aperçu démo décoratif de la slide 4.

## Étapes
1. [x] Sync branche sur `main` HEAD ; vérifier absence de collision d'essaim
   (`list_pull_requests` : aucune PR ne touche `OnboardingView`).
2. [x] Ajouter la clé `onboarding.pages.a11y` au catalogue `Localizable.xcstrings`
   en 5 langues (de/en/es/fr/pt-BR), format `Page %1$lld … %2$lld`, insertion
   textuelle ciblée (préserve l'ordre/formatage Xcode). Revalider JSON.
3. [x] `pageIndicators` : `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel(pageIndicatorA11yLabel)` +
   `.accessibilityAdjustableAction` (increment/decrement bornés → `goToPage`).
4. [x] Extraire `pageIndicatorA11yLabel` (computed) et `goToPage(_:)`
   (anim spring + haptique, réutilise l'existant).
5. [x] `mockConversationPreview` : `.accessibilityHidden(true)`.
6. [x] Revue statique Swift (exhaustivité switch, format `%lld`, symboles).
7. [x] Docs analyse + plan + tracking.
8. [ ] Commit + push branche.
9. [ ] Gate CI iOS Tests.

## Contraintes respectées
- Mono-fichier Swift + 1 clé i18n ; 0 logique, 0 réseau, 0 test neuf, 0 changement visuel.
- Composant app-side (écran produit) — pas de touche SDK.
- Reduce Motion des orbes déjà géré en amont (`FloatingAnimation`).

## Risques
- iOS non buildable en local (Linux) → validation par CI. Mitigé par revue
  statique et réutilisation de symboles/patterns déjà présents dans le fichier.
