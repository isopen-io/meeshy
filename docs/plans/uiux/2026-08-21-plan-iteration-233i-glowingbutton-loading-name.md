# Plan — Iteration-233i : `GlowingButton` garde son nom pendant l'attente

**Analyse** : `docs/analyses/uiux/2026-08-21-iteration-233i-glowingbutton-loading-name.md`
**Base** : `main` HEAD `3e64afaa` · **Branche** : `claude/intelligent-noether-kana7q` (re-lancée fraîche)

## Objectif

Le CTA principal de l'inscription doit rester nommé — et annoncer son attente —
au moment où il déclenche la création de compte.

## Étapes

- [x] Resync sur `origin/main` HEAD `3e64afaa` (post-merge 232i #3241) ; numéro 233i choisi strictement au-dessus du plus haut mergé (232i) ; collision essaim vérifiée (`list_pull_requests` : 0 PR iOS ouverte).
- [x] **Écarter le carry-over `unit.members` avec sa raison** : `memberCountDisplay` rend `"199+"` (chaîne, pas entier) quand l'effectif est plafonné → un des 4 sites ne peut pas alimenter une règle plurielle depuis un nombre ; décision de conception non validable sans simulateur.
- [x] Balayer les composants montés jamais audités : `ConversationAnimatedBackground` est correctement neutralisé (rien à faire) ; `OnboardingAnimations` héberge 2 composants interactifs jamais audités.
- [x] Constater le défaut : sous `isLoading`, le label de `GlowingButton` n'est plus qu'un `ProgressView` → nom accessible perdu sur le CTA d'inscription.
- [x] Poser `.accessibilityLabel(title)` (le nom survit au basculement, Voice Control continue de matcher) et `.accessibilityValue(isLoading ? … : "")` (l'attente est un ÉTAT, pas un nom).
- [x] Hisser l'annonce en `static var loadingAccessibilityValue` réutilisant la clé existante `loading.message` (7 locales) — 1 point de vérité, testable hors hôte SwiftUI, 0 clé neuve.
- [x] Ajouter `OnboardingGlowingButtonAccessibilityTests` — 3 gardes de source bornées au corps de `GlowingButton` + 1 assertion de comportement réel sur la résolution localisée.
- [x] Vérifier caractère par caractère que les 3 chaînes assertées matchent le source.
- [x] Ajouter les 4 entrées `pbxproj` (leçon 230i : sans elles, suite verte par omission en local).
- [x] Documenter analyse + plan + pointeur de tracking.
- [ ] Gate réel : CI iOS Tests.

## Non-fait, et pourquoi

- **`InteractiveProgressBar`** (le voisin dans le même fichier) : 3 défauts réels
  constatés et documentés — boutons anonymes, position portée par la seule
  couleur, cibles de 5–8 pt contre 44 pt HIG. Non traité **délibérément** : le
  correctif suppose un arbitrage produit (`RegistrationStep` n'expose aucun nom
  d'étape court — `funHeader` est de la prose) et corriger la cible tactile
  change la hauteur de la barre, donc le rendu. À faire sur simulateur.
- **`unit.members` dispersé** : cas plafonné `"199+"` à trancher.
- **Tap de ligne VoiceOver du picker de transfert** : carry-over, simulateur.

## Empreinte

| | |
|---|---|
| Fichier production | 1 (`OnboardingAnimations.swift`, +9 lignes) |
| Fichier test | 1 neuf (4 assertions) |
| Clés i18n neuves | **0** (réutilise `loading.message`) |
| Fichiers pbxproj | 1 (4 entrées ajoutées) |
| Changement visuel | **0** (modifiers additifs) |
| Logique / réseau / SDK | 0 |
