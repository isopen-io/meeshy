# Plan Iteration-172i — MagicLinkView

**Base** : `main` HEAD `612872b`
**Branche** : `claude/laughing-thompson-ks1h8d`
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift` (1 fichier)

## Objectif
Éradiquer la couleur figée hors-marque `#8B5CF6` (violet) de l'écran de connexion par
lien magique au profit du token Indigo, et compléter la structure VoiceOver (champ email,
groupe de confirmation, compteur d'expiration).

## Étapes
1. [x] `Color(hex: "8B5CF6").opacity(0.7)` (icône email) → `MeeshyColors.indigo400.opacity(0.7)` + `.accessibilityHidden(true)`.
2. [x] `TextField` email → `.accessibilityLabel("Adresse email")`.
3. [x] `Color(hex: "8B5CF6").opacity(0.6)` (bordure focus) → `MeeshyColors.indigo400.opacity(0.6)`.
4. [x] Sous-titre + email (étape attente) → `VStack(spacing: xs)` + `.accessibilityElement(children: .combine)`.
5. [x] Compteur d'expiration → `.accessibilityLabel + .accessibilityValue(formattedCountdown)`.
6. [x] Vérifier 0 résidu `8B5CF6`, 0 test référençant la vue.
7. [ ] Commit + push, CI `ios-tests` verte.

## Risque
Minime — 1 fichier, 0 logique, 0 dépendance de test. Le changement de teinte violet→indigo
est un alignement de marque assumé (doctrine Design System). Gate = CI `ios-tests`.
