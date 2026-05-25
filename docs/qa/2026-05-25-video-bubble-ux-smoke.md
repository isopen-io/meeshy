# QA Smoke — Video bubble UX hardening (2026-05-25)

**Spec :** `docs/superpowers/specs/2026-05-25-video-bubble-ux-hardening-design.md`
**Plan :** `docs/superpowers/plans/2026-05-25-video-bubble-ux-hardening-plan.md`
**Branche :** `feat/ios-video-bubble-ux-hardening`

Tests manuels à exécuter sur device réel (pas simulateur — PIP et AirPlay nécessitent un device) avant merge.

## Setup

- Compte test : `atabeth` (cf `apps/ios/fastlane/.env`)
- Conversation cible : ouvrir une conversation contenant au moins une vidéo portrait (9:16) et une vidéo paysage (16:9). Si absente, en envoyer une fraîche via le composer.

## Section 1 — Aspect ratio (bandes noires)

- [ ] Ouvrir la conversation, scroller jusqu'à la vidéo portrait. **Attendu :** la bulle remplit l'aspect ratio portrait, pas de bandes noires sur les côtés. Premier affichage cold cache peut montrer un flash <200ms — acceptable.
- [ ] Quitter la conversation, revenir. **Attendu :** la même vidéo portrait s'affiche INSTANTANÉMENT avec le bon ratio (cache hit).
- [ ] Vidéo paysage 16:9 : pas de régression — la bulle reste paysage, aucun ratio bizarre.

## Section 2 — Retour thumbnail

- [ ] Tap play sur une vidéo. Attendre 5 secondes. Tap pause. **Attendu :** contrôles restent visibles, surface reste mountée sur la frame courante, l'utilisateur peut reprendre via tap play.
- [ ] Tap play sur une vidéo. Pendant la lecture, scroller la conversation pour faire sortir la bulle de l'écran. Scroller en arrière pour la revoir. **Attendu :** la bulle affiche le thumbnail + bouton play, PAS la dernière frame jouée.
- [ ] Tap play sur une vidéo courte (≤10 s). Laisser jouer jusqu'à la fin. **Attendu :** snap automatique vers le thumbnail + bouton play replay quand la vidéo finit.

## Section 3 — Bouton vitesse inline

- [ ] Tap play sur une vidéo. **Attendu :** capsule "1×" visible en top-RIGHT de la bulle (à côté du bouton expand top-LEFT).
- [ ] Tap sur la capsule vitesse. **Attendu :** cycle 1× → 1.25× → 1.5× → 1.75× → 2× → 1× avec haptic léger à chaque tap, vitesse de lecture suit immédiatement.

## Section 4 — Fullscreen

### 4a : contrôles visibles dès l'entrée

- [ ] Tap sur le bouton expand d'une vidéo inline. **Attendu :** fullscreen s'ouvre AVEC les contrôles immédiatement visibles : top bar (close + filename + share + save), center (±10s + play/pause), mini-toolbar (mute + loop + pip + airplay), bottom (seekbar + time + speed row).
- [ ] Tap n'importe où sur la vidéo en fullscreen. **Attendu :** les contrôles se cachent (auto-hide) ; second tap = ré-apparaissent.

### 4b : nouveaux contrôles

- [ ] **Mute :** tap l'icône haut-parleur dans la mini-toolbar. **Attendu :** son coupé, icône passe à `speaker.slash.fill` avec halo accent. Retap = son revient. État persiste si on ouvre une autre vidéo.
- [ ] **Loop :** tap l'icône `repeat`. **Attendu :** halo accent activé. Vidéo courte qui finit → relance automatiquement depuis 0. Détap loop avant la fin = comportement par défaut (stop + close fullscreen ou retour thumbnail).
- [ ] **PIP :** tap l'icône `pip.enter`. **Attendu :** mini-fenêtre PIP flotte au coin écran ; l'app retourne en background. Tap PIP de retour dans l'OS = retour fullscreen Meeshy. (Sur simulateur le bouton est disabled — comportement attendu.)
- [ ] **AirPlay :** tap l'icône AirPlay. **Attendu :** picker système iOS s'ouvre listant les devices disponibles (Apple TV, HomePod, etc.). Sélection diffuse la vidéo.
- [ ] **Speed row :** tap successivement les 5 chips 1× / 1.25× / 1.5× / 1.75× / 2×. **Attendu :** chip active passe en accent + scale 1.08, vitesse appliquée immédiatement.
- [ ] **Skip ±10s :** tap les boutons ←10s / 10s→. **Attendu :** seek immédiat de ±10s depuis la position courante.
- [ ] **Close + share + save :** tester les 3 boutons top bar.

### 4c : interaction loop + close

- [ ] Fullscreen : activer loop. Tap close (X). Ré-ouvrir la même vidéo en inline. Tap play, laisser finir. **Attendu :** PAS de loop en inline (la bulle retombe sur thumbnail). `manager.shouldLoop` doit être reset à false sur close fullscreen.

## Diagnostics

Si un point fail :
1. Vérifier les logs : `./apps/ios/meeshy.sh logs | grep -i "video\|player\|asset"`
2. Reproduire en mode debug avec breakpoint dans `_InlineRenderer.teardown` ou `SharedAVPlayerManager.release`.
3. Capturer screenshot/vidéo + ouvrir une issue avec le numéro du point QA failé.
