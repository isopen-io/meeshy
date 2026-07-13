# Lifting Liquid Glass du lecteur vidéo plein écran

Date : 2026-07-11
Statut : approuvé (user « go »)
Périmètre : galerie média conversation + player plein écran des bulles (composant transport partagé). Les contrôles inline dans les bulles (`_InlineOverlayControls`) sont HORS périmètre.

## Problèmes constatés (état actuel)

1. **Double contrôleur** : vidéo attachée en pause dans la galerie →
   `GalleryVideoPage.playOrDownloadButton` (64 pt, centre) ET
   `VideoTransportControls.playPauseButton` (72 pt, centre) + skips ±10 s
   s'affichent empilés. Cause : le bouton poster est gaté sur
   `!isPlayerActive` (= pas en lecture) au lieu de `!isPlayerAttached`
   (= player pas encore chargé sur cette URL).
   Fichier : `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`.
2. **Chrome pré-Liquid Glass** : X (`xmark.circle.fill` blanc), save
   (`Circle().fill(.white.opacity(0.2))`), boutons transport en
   `.ultraThinMaterial` + overlays manuels. Le projet possède déjà
   `.adaptiveGlass` / `.adaptiveGlassProminent` / `AdaptiveGlassContainer`
   (`packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveGlass.swift`)
   — vrai `glassEffect` iOS 26, fallback material iOS 16–25 — utilisé
   nulle part dans le lecteur vidéo.
3. **Invasif** : `VideoTransportControls` empile en bas jusqu'à 4 rangées :
   mini-toolbar (mute/loop/PiP/AirPlay) + seek bar + timecodes + 5 chips de
   vitesse.

## Design cible

### A. Un seul contrôleur
- `GalleryVideoPage` : le bouton poster central (lire/télécharger) ne
  s'affiche que si `!isPlayerAttached`. Une fois le player attaché
  (lecture OU pause), seul `VideoTransportControls` pilote play/pause.
- Le bouton poster passe en Liquid Glass : cercle `.adaptiveGlass` teinté
  accent (remplace le duo ultraThinMaterial + fill accent). États
  télécharger/progression inchangés.

### B. `VideoTransportControls` (SDK — partagé galerie + plein écran bulle)
- **Centre** : `AdaptiveGlassContainer` avec ⏪10 · ▶︎/⏸ · ⏩10.
  Skips : cercles 52 pt `.adaptiveGlass` neutres. Play/pause : cercle
  64 pt `.adaptiveGlass(tint: accent, interactive: true)`.
- **Bas — une seule barre** : capsule `.adaptiveGlass` contenant, dans
  l'ordre : temps écoulé (mono 12) · scrubber (hit-area ≥ 32 pt,
  `highPriorityGesture` conservé — fix historique contre le pan du pager)
  · durée totale · bouton mute (si `.mute`) · AirPlay (si `.airplay`) ·
  menu ⋯ (si `.speed`, `.loop` ou `.pip` présents).
- **Menu ⋯** (`Menu` SwiftUI, rendu glass système sur iOS 26) :
  - Picker « Vitesse » 1×/1,25×/1,5×/1,75×/2× lié à `manager.playbackSpeed` ;
  - Toggle « Boucle » lié à `manager.shouldLoop` ;
  - Action « Picture in Picture » (`manager.startPip()`/`stopPip()`),
    désactivée si non supporté.
- **Supprimés de l'écran** (déplacés, pas retirés) : rangée mini-toolbar,
  rangée chips vitesse, rangée timecodes séparée.
- **API `ControlSet` inchangée** (OptionSet identique, aucune nouvelle
  option, aucun call site modifié). Le mapping devient : `.mute`/`.airplay`
  → barre ; `.speed`/`.loop`/`.pip` → menu ⋯ ; `.playPause`/`.scrubber`/
  `.duration` → comme aujourd'hui.
- Helper pur testable `TransportLayout` (même fichier) :
  `barControls(from:)` / `menuControls(from:)` / `showsMenuButton(for:)`.

### C. Chrome galerie + top bar plein écran
- Galerie (`controlsOverlay`) : X → glyphe `xmark` dans cercle 40 pt
  `.adaptiveGlass` ; compteur n/N → capsule `.adaptiveGlass` (garde
  `contentTransition(.numericText())`) ; save → cercle 40 pt
  `.adaptiveGlass`, états progress/idle inchangés.
- `_FullscreenOverlayControls.topBar` (close/nom fichier/share/save) :
  cercles `.adaptiveGlass` à la place des `Color.white.opacity(0.2)`.
- Métadonnées bas (avatar/nom/date/dimensions) : inchangées.
- Règle d'ordre : `.adaptiveGlass` s'applique APRÈS le sizing
  (`.frame`), jamais après un élargisseur de hit-area (leçon bug header
  2026-07-11).

## Non-régression (intouchés)
- `SharedAVPlayerManager` (états, PiP, release URL-gated), handoff PiP au
  swipe-down, `release(urlString:)` au changement de page et au dismiss,
  prefetch voisins, save flow (`MediaSaveCoordinator`), gestes de dismiss
  vertical, `MediaScrubbingPreferenceKey` (inline, hors périmètre).
- Accessibilité : labels existants conservés ; le menu ⋯ reçoit
  `accessibilityLabel("Plus d'options")` ; chaque item de menu garde un
  label parlant.
- Aucun effet visuel supprimé (règle projet) : tout ce qui quitte l'écran
  reste accessible via le menu ⋯.

## Tests (TDD)
1. `MeeshyUITests` (SDK) : tests purs de `TransportLayout` — répartition
   barre/menu pour les sets `[.playPause, .scrubber, .duration, .speed,
   .mute, .pip]` (galerie), `fullscreenDefault`, sets sans items de menu
   (pas de bouton ⋯), set vide.
2. `MeeshyTests` (app) : source-guard sur le gating `isPlayerAttached` du
   bouton poster (pattern `HeaderCallButtonsViewTests.headerSource()`).
3. Tests `MeeshyVideoPlayerControlSetTests` existants : inchangés (API
   stable) — doivent rester verts.
4. Vérification visuelle simulateur : galerie (poster → lecture → pause →
   contrôles masqués) + plein écran bulle, captures avant/après.
