# Itération 141i — Analyse UI/UX iOS : `MessageEffectModifiers` (palette SSOT + VoiceOver décoratif)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`) — indépendante des pistes Web/Android.
**Fichier cible** : `apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift`
**Surface** : Effets visuels de message (long-press → réaction éphémère) — appearance one-shot (Shake/Zoom/Explode/Waoo), overlays de particules (Confetti/Fireworks/Explode/Waoo), effets persistants (Glow/Pulse/Rainbow/Sparkle). Appliqués via l'extension `messageEffects(_:hasPlayedAppearance:)`.

## Contexte routine

La traîne Dynamic Type est **taris** : les candidats nommés par le pointeur 140i (`AttachmentLoadingTile`, `ConversationDashboardView`, `InviteFriendsSheet`, `StatsTimelineChart`, `SecurityVerificationView`) sont **tous soldés** — chaque `.font(.system(size:))` restant y est déjà **figé & commenté** (glyphes bornés par conteneurs de taille fixe, labels d'axe Charts, doctrine 84i/86i) ou déjà migré `MeeshyFont.relative`. 141i bascule donc sur la **passe state-of-the-art** annoncée par 140i (« hexes inline vs tokens au tarissement »).

- Au démarrage 141i : branche resynchronisée sur `main` HEAD (`efedb69e4`, post-#2029). 140i (`MessageViewsDetailView`) **déjà mergé** dans `main` → branche redémarrée depuis `origin/main`.
- Numéro **141i** choisi (> 140i, plus haut label iOS soldé).
- Cible choisie car : self-contained (10 `ViewModifier`/`View` de présentation pure, aucune logique métier), **seul fichier iOS** portant encore des couleurs de marque en **hex inline** (`Color(hex: "#…")`) au lieu des tokens `MeeshyColors`.

## État avant

- **3 sites** codaient la couleur de marque en dur au lieu du token palette :
  - `FireworksOverlay` : `[Color(hex: "#6366F1"), Color(hex: "#818CF8"), …]` (étincelles signature indigo)
  - `ExplodeOverlay` : `RadialGradient(colors: [Color(hex: "#6366F1").opacity(0.4), .clear], …)`
  - `GlowEffect` : `shadow(color: Color(hex: "#6366F1").opacity(…))` (halo persistant)
  → Viole le **Single Source of Truth** couleur (design system iOS : « New code MUST use the Indigo scale or semantic names »). Un futur re-brand ne se propagerait pas à ces effets signature.
- **VoiceOver** : les overlays de particules sont purement décoratifs (`.allowsHitTesting(false)`) mais **non masqués**. `WaooOverlay` rend un `Image(systemName: "star.fill")` → **VoiceOver l'annoncerait** (« étoile »). Confetti/Fireworks/Explode sont des formes sans label (ignorées par défaut) mais non explicitement masquées.

## Changements (1 fichier, tokenisation palette + trait a11y déclaratif)

### Palette — 3/3 hex inline → tokens `MeeshyColors` (0 changement visuel)
`Color(hex: "#6366F1")` → `MeeshyColors.indigo500` et `Color(hex: "#818CF8")` → `MeeshyColors.indigo400`.
**Byte-for-byte identiques** : `MeeshyColors.indigo500 = Color(hex: "6366F1")`, `indigo400 = Color(hex: "818CF8")` (source : `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift:11-12`). Rendu strictement inchangé ; seule la source de vérité change.
- `import MeeshyUI` ajouté (module exportant `MeeshyColors` ; déjà importé par le fichier frère `AttachmentLoadingTile` du même dossier → import valide dans le target app).
- **Laissés décoratifs à dessein** (NON tokenisés) : `ConfettiOverlay` (`.red/.blue/.green/.yellow/.purple/.orange/.pink` — confettis festifs arc-en-ciel), `RainbowEffect` (dégradé arc-en-ciel), `WaooEffect`/`WaooOverlay` (`.yellow`/`.orange` — étoile chaude). Ce ne sont pas des couleurs de marque.

### VoiceOver — 4 overlays décoratifs masqués
`.accessibilityHidden(true)` sur `ConfettiOverlay`, `FireworksOverlay`, `ExplodeOverlay`, `WaooOverlay`. Lacune réelle comblée : la `star.fill` de `WaooOverlay` n'est plus annoncée ; les particules ne fragmentent plus le parcours VoiceOver de la bulle qu'elles décorent.

## Hors-scope (documenté, NON changé)
- Logique d'animation (timings, `withAnimation`, spawn de particules) — intacte.
- `ShakeEffect`/`ZoomEffect`/`ExplodeEffect`/`WaooEffect`/`PulseEffect`/`RainbowEffect`/`SparkleEffect`/`GlowEffect`/`PulseEffect` : ViewModifiers enveloppant `content` (la bulle) — ne peuvent pas être masqués globalement (masquerait la bulle) ; leurs overlays internes (Canvas/stroke) sont sans label → ignorés par VoiceOver. Laissés tels quels.
- `WaooOverlay` `.font(.system(size: 30))` sur l'étoile : glyphe décoratif dimension fixe → figé (doctrine 86i), désormais `accessibilityHidden`.
- Aucune clé i18n neuve, aucun test neuf (parité doctrine sweep 99i/135i–140i).

## Vérification
- Tokenisation palette + trait a11y déclaratif, **0 logique modifiée, 0 clé i18n neuve, 0 test neuf**.
- Compte : 3 hex inline → tokens (2 distincts, indigo500 ×3 + indigo400 ×1) ; 4 `.accessibilityHidden(true)` ajoutés ; `import MeeshyUI` ajouté. `grep 'Color(hex:'` sur le fichier = **0 occurrence restante**. ✅
- Tokens byte-identiques aux hex remplacés → **zéro régression visuelle** en clair comme en sombre.
- Gate = CI `iOS Tests` (SwiftUI ne compile pas sous Linux → CI seule autorité).

## Annotation continuité (à ne plus re-flagger)
- ⚠️ **`MessageEffectModifiers` = SOLDÉ 141i** (palette + VoiceOver). Les couleurs de marque sont tokenisées ; confetti/rainbow/star restent décoratives à dessein ; les 4 overlays de particules sont `accessibilityHidden`.
- **Base de départ 142i : `main` HEAD.** La traîne Dynamic Type `.system(size:)` est **taris** (reliquats tous figés+commentés). Pistes 142i+ : (a) **suite passe palette/SSOT** — auditer `.green`/`.red`/`.orange` littéraux vs tokens sémantiques (`success`/`error`/`warning`), checkmark `#4ADE80` → `success` s'il subsiste ; (b) revues HIG/UX ciblées d'un flux (empty/error/loading states, une action primaire par écran) ; (c) extraction de composants dupliqués (cards/rows/badges) au tarissement palette.
