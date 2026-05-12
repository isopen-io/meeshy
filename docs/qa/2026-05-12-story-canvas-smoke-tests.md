# Story Canvas — Smoke Tests Manuels (10 scénarios)

**Version** : 2026-05-12
**Build cible** : main `e05e146b` ou ultérieur
**Référence** : Plan A `docs/superpowers/plans/2026-05-09-story-canvas-reader-migration-and-repost.md` Task 30 Step 3 + spec mère `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md`

## Pré-requis

- Simulator iPhone 16 Pro (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`)
- Build via `./apps/ios/meeshy.sh run` (le build inclut le merge Plan B + StoryBackdropCapture + glass UI chromes)
- Credentials de test : **atabeth** / `pD5p1ir9uxLUf2X2FpNE`
- Connexion gateway active sur `gate.meeshy.me` (ou local 3000)

## Pré-test : sanity check de boot

| | Étape | Attendu | Constaté |
|---|---|---|---|
| 0.1 | `./apps/ios/meeshy.sh run` | Build succeed + app launched + log stream active | ✅ Vérifié 2026-05-12 (commit `e05e146b`, build 19-65s) |
| 0.2 | Écran d'accueil après boot | Feed conversations rendu sans crash, carousel stories visible en haut, recherche en bas | ✅ Vérifié — screenshot `apps/ios/screenshots/meeshy_20260512_083841.png` |

Si 0.1 ou 0.2 échoue, **stop** : régression introduite par les commits récents, faire un `git bisect` sur la chain `31b2ad28..HEAD`.

## ⚠️ Path actuellement non testable depuis l'UI

**Export video pipeline (Phase 4 + Plan B + Step 2 backdrop côté export)** est wired dans le code mais **aucun call site UI ne l'invoque**. Concrètement :

- Aucun bouton "Exporter en vidéo" n'existe dans le composer ou le menu story
- `StoryPublishService` n'appelle pas `StoryExporter.export()` — toutes les stories sont publiées via le path asset legacy (snapshot PNG + JSON effects)
- `StoryAVCompositor` ne s'instancie qu'à travers `StoryExporter.customVideoCompositorClass`, donc lui aussi reste inerte en runtime

**Conséquence pour QA** : les scénarios listés couvrent uniquement le **live preview** côté composer/viewer. La fidélité du rendu à l'export (B1 synthetic track, B2 SSIM, B3 cache, StoryBackdropCapture export-side) est **validée par tests automatisés uniquement**, pas testable manuellement aujourd'hui.

Le wiring publish→exporter est documenté dans `docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md` (plan ~5.5 jours, reporté post-launch par décision projet). Quand ce sprint sera exécuté, un **scénario 13 — Video export end-to-end** sera ajouté à cette checklist.

Tant que ce sprint n'est pas exécuté : ne pas chercher de bouton "Export" ou de Story marquée "video" dans l'UI — le path n'existe pas en runtime.

---

## Scénarios

### 1. Full-screen viewer — multi-slide progression

**Objectif** : valider la navigation slide-par-slide dans le viewer fullscreen + audio + transitions intra-slide + dismiss.

**Pré-conditions** :
- Au moins une story avec ≥ 2 slides existe dans le feed (créer via composer si besoin).
- Story doit contenir au moins 1 slide avec audio + 1 slide avec une transition (filter, opening, ou clipTransition).

**Étapes** :
1. Tap sur l'avatar story dans le carousel feed
2. Le viewer fullscreen s'ouvre sur slide 0
3. Attendre la fin du slide 0 (progress bar en haut) — passage automatique au slide 1
4. Vérifier que l'audio joue de la slide 0 puis transitionne à celui de la slide 1
5. Vérifier que les éléments animés (text, sticker keyframes) se rejouent au début de chaque slide
6. Swipe down ou tap "×" pour dismiss

**Attendu** :
- ⚠️ Pas de crash
- Progression slide N → N+1 sans gel
- Audio enchaîne sans pop ni overlap
- Transitions visuelles fluides (60fps minimum)
- Dismiss revient au feed avec carousel mis à jour (story marquée vue)

**Bugs connus à surveiller** :
- Aucun audio entendu → check `ReaderAudioMixer.duckingEnabled` et `fadeOut` (Plan A Task 13)
- Glace au passage de slide → backdrop capture potentiellement (depuis `60737121`)

---

### 2. Embed cell feed — story repost autoplay muted

**Objectif** : valider que les stories repostées en feed s'autoplay mute, 9:16 aspect, tap → fullscreen.

**Pré-conditions** :
- Une story doit avoir été repostée par un autre utilisateur (via "Partager en story" du menu kebab).

**Étapes** :
1. Faire défiler le feed jusqu'à trouver une cellule repost story (`StoryRepostEmbedCell`)
2. Vérifier qu'elle se lance automatiquement en mute (icône speaker barré visible)
3. Vérifier l'aspect-ratio 9:16 (portrait)
4. Tap sur la cellule → ouverture viewer fullscreen avec audio actif

**Attendu** :
- Autoplay sans tap utilisateur
- Mute symbol clear (icône speaker barré dans le coin)
- Tap zone large (toute la cellule) pour accessibility
- Fullscreen ouvre la story complète multi-slide

---

### 3. Composer repost — embed plays with audio, mute during Pro Timeline preview

**Objectif** : valider le mode repost dans `UnifiedPostComposer` + intégration `StoryReaderRepresentable`.

**Pré-conditions** :
- Story publique d'un autre user (à reposter).

**Étapes** :
1. Ouvrir story → kebab menu → "Éditer et republier en post"
2. Le composer ouvre avec l'embed story visible (mute = false, audio actif)
3. Tester swipe pour parcourir les slides — audio doit suivre
4. Ouvrir le Pro Timeline preview depuis le composer (si feature exposée) → l'embed story passe en mute
5. Fermer le Pro Timeline preview → audio reprend
6. Taper du texte + tap Publier

**Attendu** :
- Embed story rendu correctement (canvas + audio actif par défaut)
- Mute toggle propre durant Pro Timeline preview
- Bannière "X items repositioned" affichée si la story source a des items en bas du canvas (clamping 9:16 → 1:1)
- Publish succeed → toast "Publié"
- `Logger.stories` log line `repost.import slide=... texts=... media=... clamped=N` (vérifier via Console.app filtré `subsystem:me.meeshy.app category:stories`)

**Bugs connus** :
- Pas de bannière clamping alors qu'attendu → vérifier `onStoryImported` callback est bien passé (commit `1df5a0ab`)

---

### 4. Multilingue — switch app language → re-display translated text

**Objectif** : Prisme Linguistique : changement de langue système → contenu story se re-traduit.

**Pré-conditions** :
- User configuré avec `systemLanguage = "fr"`, `regionalLanguage = "en"`
- Story avec textObject ayant traductions `{fr: "Bonjour", en: "Hello"}`

**Étapes** :
1. Ouvrir story → vérifier texte affiché en français
2. Settings → Languages → permuter `systemLanguage` à "en"
3. Retour story (re-tap depuis carousel)
4. Vérifier que le texte affiche désormais "Hello"

**Attendu** :
- Affichage immédiat dans la nouvelle langue (pas de redémarrage app requis)
- Si traduction manquante pour la langue active → fallback `regionalLanguage` puis original

---

### 5. Audio — background music + voice-over startTime + ducking + fadeOut

**Objectif** : `ReaderAudioMixer` complet (Plan A Tasks 12-14).

**Pré-conditions** :
- Story avec backgroundAudio (musique) + voice attachment (TTS ou enregistré)
- Voice startTime = 3.0s

**Étapes** :
1. Lancer story
2. À t=0 : musique commence à volume nominal
3. À t=3.0s : voice-over démarre → musique doit être duckée (volume réduit ~30%)
4. À fin voice-over : musique revient à volume nominal
5. Dismiss story → fadeOut audio (0.5s par défaut)

**Attendu** :
- Voice-over démarre exactement à t=3.0s (±100ms tolérance)
- Ducking audible et propre (pas de pop)
- FadeOut audible (pas de coupe sèche)

---

### 6. Backgrounds — color / gradient / image / video

**Objectif** : `StoryBackgroundLayer` 4 modes (Plan A Tasks 7-11).

**Pré-conditions** : 4 stories de test, une par mode.

**Étapes** :
1. Ouvrir chaque story
2. Vérifier rendu fond

**Attendu** :
- **Color** : fond uni de la couleur configurée (`background = "#FF6347"` par exemple)
- **Gradient** : dégradé 2 ou 3 couleurs avec direction correcte
- **Image** : photo avec `backgroundTransform` (scale, offset, rotation) appliqués
- **Video** : looper continu via `AVPlayerLooper`, sans flash entre boucles, audio mute

**Bugs connus** :
- Background video qui flash entre les boucles → vérifier `AVPlayerLooper` configuration (Task 10)

---

### 7. Filter — story avec `effects.filter` set

**Objectif** : `StoryFilteredLayer` Metal compute kernels (Phase 3 + Plan A Task 19).

**Pré-conditions** : story avec `effects.filter = .vintage` ou `.bwContrast`.

**Étapes** :
1. Ouvrir story
2. Vérifier que le canvas a le filtre appliqué (visible sur toutes les zones, dont les médias)

**Attendu** :
- **Vintage** : teinte sépia + vignette radiale
- **BW Contrast** : conversion luminance + courbe S
- Slider d'intensité (si exposé) → effet temps-réel sans freeze

---

### 8. Keyframes — animated text/sticker

**Objectif** : `StoryRenderer.applyKeyframes` (Plan A Task 15).

**Pré-conditions** : story avec textObject ou sticker ayant `keyframes: [...]` avec changements position/scale/rotation/opacity dans le temps.

**Étapes** :
1. Ouvrir story
2. Observer l'élément animé du début à la fin du slide

**Attendu** :
- Animation fluide sans saccade
- Interpolation cubique entre keyframes (pas linéaire visible)
- Si `Reduce Motion` activé dans Settings → coupure binaire (pas d'animation)

---

### 9. ClipTransitions — crossfade entre clips vidéo

**Objectif** : `StoryRenderer.clipTransitionOpacity` (Plan A Task 16).

**Pré-conditions** : story slide avec ≥ 2 video clips et `clipTransitions = [{from: 0, to: 1, type: .crossfade, duration: 0.5}]`.

**Étapes** :
1. Ouvrir story
2. Observer la jonction entre clip 0 et clip 1

**Attendu** :
- Crossfade visible (0.5s) — alpha clip 0 décroît tandis que clip 1 croît
- Audio crossfade en parallèle si configuré

---

### 10. Opening — reveal/fade au début du slide

**Objectif** : `StoryRenderer.applyOpening` (Plan A Task 17).

**Pré-conditions** : story avec `effects.opening = .reveal(direction: .top, duration: 0.8)` ou `.fade(duration: 0.5)`.

**Étapes** :
1. Ouvrir story
2. Observer le premier 1s du premier slide

**Attendu** :
- **Reveal** : balayage depuis la direction configurée (top/bottom/left/right)
- **Fade** : opacity 0 → 1 lissée sur la durée
- Effet joué UNE seule fois (pas re-déclenché sur replay du même slide)

---

## Scénarios bonus — features récentes (post Plan A)

### 11. Glass text background — `StoryTextBackgroundStyle.glass`

**Objectif** : valider la chaîne complète `StoryBlurFilter` (MPS GPU) → `StoryBackdropCapture` → `StoryGlassBackdropLayer.applyMPSPath` + fallback CAFilter.

**Pré-conditions** : composer ouvert sur un nouveau slide.

**Étapes** :
1. Composer → ajouter un texte avec couleur claire (`MeeshyColors.indigo50`)
2. Sélectionner le texte → ouvrir le panel font style
3. Dans `TextBackgroundStylePicker` → tap "Verre" (chip glass)
4. Observer le rendu : flou gaussian visible derrière le texte
5. Déplacer le texte sur le canvas → le flou suit la position
6. Modifier le radius (si exposé) → flou plus/moins intense

**Attendu** :
- Glass surface visible derrière le texte (frosted look)
- Pas de crash, pas de halo "double-texte"
- Si Metal indisponible → fallback CAFilter (`UIVisualEffectView` style) — toujours visuellement plausible

**Logs à surveiller** (Console.app, subsystem `me.meeshy.app`) :
- Pas d'erreur `MPS` ni `CIImage`
- Backdrop capture fire 1x par tick canvas (visible via instrumentation si activée)

### 12. Glass UI chromes — design consistency

**Objectif** : valider que tous les chromes story adoptent `.ultraThinMaterial` aligné sur le menu d'appel (commit `59b90364`).

**Étapes** :
1. Composer → ouvrir successivement : Filter picker, Sticker picker, Font style picker, Music picker, Audio panel, Text editor
2. Vérifier que chaque panel a :
   - Background `.ultraThinMaterial`
   - Coins arrondis 16pt
   - Header avec icône SF Symbol + dégradé brand indigo + titre rounded font
3. Comparer avec `VideoFilterControlView` lors d'un appel actif

**Attendu** : cohérence visuelle complète entre story chromes et call menu

---

## Reporting

Après exécution, remplir :

| Scénario | Date | Build | Tester | Pass | Notes |
|----------|------|-------|--------|------|-------|
| 1 — Viewer | | | | ☐ | |
| 2 — Embed | | | | ☐ | |
| 3 — Repost composer | | | | ☐ | |
| 4 — Multilingue | | | | ☐ | |
| 5 — Audio | | | | ☐ | |
| 6 — Backgrounds | | | | ☐ | |
| 7 — Filter | | | | ☐ | |
| 8 — Keyframes | | | | ☐ | |
| 9 — ClipTransitions | | | | ☐ | |
| 10 — Opening | | | | ☐ | |
| 11 — Glass text | | | | ☐ | |
| 12 — Glass chromes | | | | ☐ | |

Pour un fail : créer une issue GitHub avec `story-canvas` + `qa-smoke-test` labels, attacher screenshot + crash log (`xcrun simctl spawn 30BF... log show --last 5m --predicate 'process == "Meeshy"'`).

---

## Automation future

Ces scénarios devraient être convertis en `XCUITest` au fur et à mesure pour intégrer dans CI. Les hooks d'automation existent déjà :
- `MeeshyUITests/Story/*` pour les tests unitaires
- `StoryBackdropCaptureCIImageReadbackTests` montre le pattern pour tests d'intégration Metal/CIImage
- `meeshy.sh test --ui` (à câbler) pour run UI tests

Conversions prioritaires (ROI le plus haut) :
1. #1 Viewer multi-slide — déjà couvert partiellement par `StoryReaderRepresentable` unit tests
2. #11 Glass text — déjà couvert par `StoryBackdropCaptureCIImageReadbackTests` + `StoryTextBackgroundStyleTests`
3. #4 Multilingue — `StoryRendererLanguagesTests` couvre la logique, manque l'intégration UI

Les scénarios #5 (audio), #9 (clip transitions), #10 (opening) sont les plus difficiles à automatiser : nécessitent capture audio + analyse spectrogramme + comparaison de frames vidéo.
