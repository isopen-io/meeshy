# Iteration-172i — MagicLinkView : alignement marque Indigo + structure VoiceOver

**Date** : 2026-07-19
**Écran** : `apps/ios/Meeshy/Features/Main/Views/MagicLinkView.swift`
**Surface** : Connexion par lien magique (auth) — étape saisie email + étape attente.
**Type** : Design-system (couleur figée → token de marque) + Accessibilité (VoiceOver).

## Contexte

`MagicLinkView` est déjà très propre côté typographie : toutes les polices utilisent
`MeeshyFont.relative` (Dynamic Type), les héros décoratifs (`wand.and.stars` 56pt,
`envelope.open.fill` 48pt) sont figés par doctrine (84i/87i, ≥40pt) et masqués à
VoiceOver, et toutes les chaînes passent par `String(localized:defaultValue:bundle:)`.

Trois déficits subsistaient, tous non-typographiques :

### 1. Couleur figée hors-marque `Color(hex: "8B5CF6")` (×2)
Le violet `#8B5CF6` (Tailwind violet-500) était codé en dur pour :
- la teinte de l'icône `envelope.fill` du champ email (opacity 0.7),
- la bordure du champ email en focus (opacity 0.6).

Ce violet **n'est pas un token de la marque**. La doctrine iOS (`apps/ios/CLAUDE.md`
§ Design System) impose : « New code MUST use the Indigo scale or semantic names »
et « Avoid fixed colors. Prefer semantic system colors ». La signature Meeshy est
l'**Indigo** (`#6366F1` → `#4338CA`). Le violet cassait la cohérence chromatique de
l'écran (le reste de la vue — CTA, compteur, drapeau email — utilise déjà
`MeeshyColors.indigo400/600`). Seul autre usage de `8B5CF6` dans l'app : `RootView`
(menu Découvrir, hors périmètre — accent distinct assumé).

### 2. Champ email : label VoiceOver = placeholder
Le `TextField` n'avait pas de `.accessibilityLabel` explicite → VoiceOver lisait le
placeholder `nom@exemple.com` comme **nom du champ**, ce qui est trompeur (un exemple
de valeur n'est pas un libellé de rôle). L'icône `envelope.fill` adjacente était de
plus focalisable comme bruit (aucun `.accessibilityHidden`).

### 3. Étape attente : lecture fragmentée + compteur nu
- Le sous-titre « Un lien de connexion a été envoyé à » et l'adresse email étaient
  **deux arrêts de focus VoiceOver distincts** (siblings du VStack parent, espacés de
  `xxl`), lus séparément et détachés l'un de l'autre.
- Le compteur d'expiration `Text(formattedCountdown)` (« 1:30 ») n'avait **aucun
  label** : VoiceOver annonçait un « 1:30 » brut sans contexte de rôle.

## Correctifs (1 fichier, 0 logique, 0 test)

1. **`Color(hex: "8B5CF6")` ×2 → `MeeshyColors.indigo400`** (`.opacity()` préservées).
   Retire la couleur figée hors-marque, aligne l'écran sur la signature Indigo.
   `indigo400` (`#818CF8`) est le token interactif clair déjà utilisé ailleurs dans la vue.
2. **Icône `envelope.fill` → `.accessibilityHidden(true)`** (glyphe décoratif du champ).
3. **`TextField` → `.accessibilityLabel("Adresse email")`** (clé `auth.magiclink.email.a11yLabel`,
   défaut FR inline) — remplace le placeholder-comme-label.
4. **Groupe sous-titre + email → `VStack(spacing: xs)` + `.accessibilityElement(children: .combine)`** :
   VoiceOver lit une unité cohérente « Un lien de connexion a été envoyé à nom@exemple.com ».
   Bénéfice visuel secondaire : la paire liée est resserrée (4pt) au lieu de `xxl`, sans
   toucher l'espacement du reste de l'étape.
5. **Compteur → `.accessibilityLabel("Le lien expire dans") + .accessibilityValue(formattedCountdown)`**
   (clé `auth.magiclink.countdown.a11yLabel`) — annonce contextualisée au lieu d'un « 1:30 » nu.

3 clés i18n neuves en `defaultValue` inline (pas d'édit `.xcstrings`) :
`auth.magiclink.email.a11yLabel`, `auth.magiclink.countdown.a11yLabel`.

## Vérification
- `grep 8B5CF6 MagicLinkView.swift` → 0 (violet éradiqué de la vue).
- Aucun test ne référence `MagicLinkView` (seul `LoginView` la présente) → 0 contention.
- Logique inchangée : validation email, countdown task, requête `AuthService.requestMagicLink`,
  cancel/onDisappear non touchés.
- Gate = CI `ios-tests` (compile Xcode 26.1.1 / run simu 18.2).

## SOLDÉ
- **⚠️ `MagicLinkView` couleur de marque + VoiceOver structure SOLDÉ** : violet figé remplacé
  par token Indigo, label champ email posé, groupe email+sous-titre combiné, compteur labellisé.
  Héros décoratifs figés volontairement (doctrine ≥40pt). Ne plus reprendre.
