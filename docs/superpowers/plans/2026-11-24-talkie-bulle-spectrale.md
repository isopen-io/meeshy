# Talkie en bulle spectrale : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** pendant le talkie, la voix vit en bulle spectrale (120 bandes, du grave chaud à l'aigu froid) autour du grand avatar du profil, avec « ● 0:04 » dessous. En conversation, elle vit en orbe sur le bouton talkie de l'en-tête. Dans les deux sens, la voix part et arrive à un volume normalisé.

**Architecture :**
- Deux briques pures sur le fil audio, `TalkieSpectrumAnalyzer` (FFT `vDSP`) et `TalkieVoiceLeveler` (gain automatique + limiteur).
- Elles alimentent un registre de bandes PAR PERSONNE (`TalkieVoiceStage`), lu à chaque image par une vue `Canvas`.
- La forme est une loi pure (`TalkieBubbleLaw`), testée sans vue.
- Le hero du profil, qui vit dans le SDK, reçoit la bulle par une décoration injectée (`ProfileHeroVoice`, même motif que `ProfileRelationPill`).

**Tech Stack :** Swift 6, SwiftUI (`Canvas`, `TimelineView`), Accelerate (`vDSP`), AVFoundation, XCTest.

**Spec :** `docs/superpowers/specs/2026-11-24-talkie-bulle-spectrale-design.md` (lire ses « Décisions du porteur après relecture », qui priment). Issue #20531. Branche `claude/talkie-bulle-spectrale-20531`, worktree `/Users/smpceo/Documents/v2_meeshy-partage-aw`.

## Global Constraints

- iOS 16 à 26, un seul dessin `Canvas` (aucun shader Metal).
- **Bandes :** 120, en échelle logarithmique de 80 Hz à 8 000 Hz, fenêtre de Hann, FFT de 1 024 échantillons. Une bande plus étroite qu'une case de FFT est interpolée.
- **Lissage par bande :** attaque 0,55, retombée 0,12 (`TalkieWaveLaw.attack` / `.release`). Plancher −50 dBFS (`TalkieWaveLaw.floorDecibels`).
- **Gain :**
  - cible −16 dBFS en moyenne quadratique, plafond +18 dB ;
  - montée en environ 300 ms, descente en environ 20 ms ;
  - sous −50 dBFS, le gain est gelé, puis redescend vers 0 dB en 1 s ;
  - limiteur doux à −1 dBFS, aucun échantillon au-delà.
- **Amplitude de la bulle :** un paramètre de l'hôte. Profil : 35 % du rayon de l'avatar. En-tête : la place libre de la rangée. La bulle part du bord EXTÉRIEUR de l'anneau de story et du cadre (`AvatarRingGeometry.spill`).
- **Couleurs :** jetons `MeeshyColors` seulement (`orange500`, `amber500`, `cyan`, `blue500`…), jamais un hexa local (garde `check-accent-color-hardcoding.mjs`).
- **Fil audio :** aucune allocation en régime établi (tampons préparés à l'ouverture) ; aucune FFT sur le fil principal ; la vue ne se re-rend pas pour chaque tampon (lecture sans publication, comme `TalkieLevelMeter`).
- **Réduire les animations :** un cercle dont seule l'épaisseur du trait suit le volume, rafraîchi au plus toutes les 100 ms.
- **Fichiers et fonctions :** 1 200 lignes au plus par fichier, 80 lignes au plus par fonction.
- **Dépôt :**
  - commits en français, `Refs #20531`, AUCUNE ligne `Co-Authored-By` ;
  - nouveaux fichiers inscrits par `xcodegen generate` (pbxproj commité) ;
  - tests nommés `test_{méthode}_{condition}_{attendu}`, dans `apps/ios/MeeshyTests/Unit/Talkie/`.
- **Gardes à rejouer avant chaque poussée iOS :** `apps/ios/scripts/check_house_rules.sh`, `check_cohesion_budget.sh`, `check_test_registration.sh`, `node scripts/check-accent-color-hardcoding.mjs`, `node scripts/check-verbosity-native.mjs`.

## Review Focus

1. **Deux voix en même temps** : la bulle de A ne bouge jamais au son de B (registre par personne). Le test est dans la tâche 3.
2. **Route qui change pendant la voix** (écouteurs branchés ou débranchés) : le gain ne saute pas et rien n'écrête. Le test est dans la tâche 2 (la continuité d'état entre deux tampons).
3. **Tampon de taille inattendue** (512, 4 096, ou un dernier tampon partiel) : l'analyseur ne plante pas et rend 120 valeurs finies. Le test est dans la tâche 1.
4. **Fin de voix** : la bulle redevient un cercle en moins de 300 ms, le registre se vide, et la bande d'écoute réapparaît. Le test est dans la tâche 3 (`reset`) et la tâche 4 (silence ⇒ cercle).
5. **Entrée NaN ou infinie** venue d'un décodeur : rien ne se propage dans les bandes ni dans le gain. Les tests sont dans les tâches 1 et 2.

---

### Task 1 : analyser la voix en 120 bandes avec `vDSP`

**Files :**
- Create : `apps/ios/Meeshy/Features/Talkie/TalkieSpectrumAnalyzer.swift`
- Test : `apps/ios/MeeshyTests/Unit/Talkie/TalkieSpectrumAnalyzerTests.swift`

**Interfaces :**
- Produces : `nonisolated final class TalkieSpectrumAnalyzer`, avec :
  - `init(sampleRate: Double, fftSize: Int = 1024)` ;
  - `static let bandCount = 120` ;
  - `func bands(_ samples: UnsafeBufferPointer<Float>) -> [Float]`, qui rend 120 valeurs dans 0…1, 0 au plancher de −50 dBFS et 1 à pleine échelle ;
  - `static func bandIndex(frequency: Double) -> Int`.

  Les tampons internes sont alloués dans `init`. Le tableau rendu est réutilisé : le constructeur choisit entre une copie et un tampon de sortie préparé.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - `test_bands_sine200Hz_peaksInItsBand` : une sinusoïde de 200 Hz à 48 kHz, 1 024 échantillons. `argmax(bands) == bandIndex(frequency: 200)`.
  - `test_bands_sine4kHz_peaksInItsBand` : même chose à 4 000 Hz.
  - `test_bands_silence_allZero` : 1 024 zéros donnent 120 zéros.
  - `test_bands_partialBuffer_returns120Finite` : 300 échantillons donnent 120 valeurs finies dans 0…1 (complétées de zéros).
  - `test_bands_nanInput_returns120Finite` : un tampon contenant des NaN et des infinis donne 120 valeurs finies.
  - `test_bandIndex_logScale_endsMatch` : 80 Hz donne 0, 8 000 Hz donne 119, et l'index est monotone.
- [ ] **Step 2 :** lancer `./apps/ios/meeshy.sh test` en se limitant à cette classe. Attendu : échec de compilation, le type n'existe pas.
- [ ] **Step 3 : implémenter.**
  - `vDSP.FFT` (ou `vDSP_fft_zrip`), avec `vDSP.multiply` par une fenêtre de Hann préparée.
  - Magnitudes, puis dB (`vDSP.convert(amplitude:toDecibels:zeroReference:)`).
  - Pour chaque bande, le maximum des cases qu'elle couvre. Une bande qui ne couvre aucune case prend l'interpolation linéaire des deux cases voisines.
  - Les valeurs non finies sont remplacées par 0 avant la FFT.
- [ ] **Step 4 :** relancer la classe. Attendu : PASS.
- [ ] **Step 5 : commit.** `xcodegen generate`, puis `git add` des fichiers et du pbxproj. Message : « Le talkie analyse la voix en 120 bandes de fréquence (vDSP) », avec `Refs #20531`.

### Task 2 : normaliser le volume, gain automatique et limiteur doux

**Files :**
- Create : `apps/ios/Meeshy/Features/Talkie/TalkieVoiceLeveler.swift`
- Test : `apps/ios/MeeshyTests/Unit/Talkie/TalkieVoiceLevelerTests.swift`

**Interfaces :**
- Produces : `nonisolated final class TalkieVoiceLeveler`, avec :
  - `init(sampleRate: Double)` ;
  - `func process(_ samples: UnsafeMutableBufferPointer<Float>)`, qui travaille sur place et garde son état entre deux tampons ;
  - `var currentGainDecibels: Float { get }` ;
  - `static let targetDecibels: Float = -16`, `maxGainDecibels: Float = 18`, `ceilingDecibels: Float = -1`.

- [ ] **Step 1 : écrire les tests qui échouent.** Signal : des tampons de 1 024 échantillons à 48 kHz, enchaînés sur 2 s.
  - `test_process_quietSpeech_risesTowardTarget` : une sinusoïde à −40 dBFS. Après 2 s, la moyenne quadratique de sortie est entre −19 et −13 dBFS, et `currentGainDecibels <= 18`.
  - `test_process_loudSignal_neverExceedsCeiling` : une sinusoïde à 0 dBFS. Aucun échantillon de sortie au-delà de −1 dBFS (0,891).
  - `test_process_silenceBelowFloor_doesNotAmplifyNoise` : 1 s de parole à −30 dBFS, puis 2 s de bruit à −60 dBFS. À la fin, `currentGainDecibels < 1`.
  - `test_process_stateCarriesAcrossBuffers_noJump` : la même sinusoïde en tampons de 1 024 puis de 512. Le gain ne saute pas de plus de 1 dB d'un tampon à l'autre.
  - `test_process_nanInput_outputsFinite` : la sortie est finie, et le gain aussi.
- [ ] **Step 2 :** lancer la classe. Attendu : FAIL.
- [ ] **Step 3 : implémenter.**
  - Gain lissé par coefficients de temps (montée 300 ms, descente 20 ms), calculés depuis `sampleRate` et la taille du tampon.
  - Sous −50 dBFS, le gain est gelé, puis décroît vers 0 dB en 1 s.
  - `vDSP.multiply(gain)`.
  - Limiteur doux : une courbe `tanh` au-dessus de −6 dBFS, bornée à −1 dBFS.
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 : commit.** Message : « La voix du talkie part à un volume normalisé, sans souffle ni écrêtage », avec `Refs #20531`.

### Task 3 : le registre des voix par personne, branché au micro et au lecteur

**Files :**
- Create : `apps/ios/Meeshy/Features/Talkie/TalkieVoiceStage.swift`
- Modify : `apps/ios/Meeshy/Features/Talkie/TalkieMicCapture.swift`. Le tap du micro passe par le gain AVANT l'encodeur, puis l'analyseur pousse dans le registre sous le destinataire.
- Modify : `apps/ios/Meeshy/Features/Talkie/TalkieVoicePlayer.swift`. Chaque fragment décodé passe par un gain par voix et un analyseur par voix avant `scheduleBuffer`, et le résultat est poussé sous l'expéditeur. Le tap unique sur `voicesMixer` (`startMetering` / `stopMetering`) est retiré, et `booster.globalGain` ne reçoit plus de +6 dB.
- Modify : `apps/ios/Meeshy/Features/Talkie/TalkieOutputPlan.swift`. Il garde la redirection vers le haut-parleur, mais `gainDecibels` vaut toujours 0.
- Modify : `apps/ios/MeeshyTests/Unit/Talkie/TalkieOutputPlanTests.swift`, pour la nouvelle attente : gain 0.
- Modify : `apps/ios/Meeshy/Features/Talkie/TalkieSender.swift`. `begin` et `end` posent et retirent la voix sortante dans le registre (le destinataire et l'heure de début).
- Test : `apps/ios/MeeshyTests/Unit/Talkie/TalkieVoiceStageTests.swift`

**Interfaces :**
- Consumes : `TalkieSpectrumAnalyzer.bands(_:)` et `TalkieVoiceLeveler.process(_:)`.
- Produces :
  - `nonisolated enum TalkieVoiceDirection: Sendable, Equatable { case outgoing, incoming }` ;
  - `nonisolated final class TalkieVoiceStage: Sendable`, avec :
    - `static let shared`, la SEULE instance de prod, injectable dans les tests ;
    - `func begin(userId: String, direction: TalkieVoiceDirection, at: Date)` ;
    - `func push(userId: String, bands: [Float])`, qui applique le lissage attaque/retombée bande par bande ;
    - `func end(userId: String)`, qui remet les bandes à zéro et retire la voix ;
    - `func bands(for userId: String) -> [Float]`, 120 zéros si la personne n'a pas de voix en cours ;
    - `func startedAt(for userId: String) -> Date?` ;
    - `func direction(for userId: String) -> TalkieVoiceDirection?`.

    Les lectures se font sans publication (`Locked`, comme `TalkieLevelMeter`).
  - `@MainActor final class TalkieVoiceStageObserver: ObservableObject`, qui publie SEULEMENT l'ensemble des userId en cours et sa direction (au début et à la fin), jamais les bandes.
  - Le spectre de l'en-tête (`TalkieHeaderLiveBar`) n'a plus de lecteur une fois la tâche 6 faite. `TalkieLevelMeter.outgoing` / `.incoming` sont retirés à la tâche 6 avec leurs derniers lecteurs.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - `test_push_twoSpeakers_bandsStayPerPerson` : on pousse des bandes pleines pour A et nulles pour B. `bands(for: B)` est entièrement nul.
  - `test_end_clearsBandsAndDirection` : après `end`, on obtient 120 zéros, `direction == nil` et `startedAt == nil`.
  - `test_push_smoothing_attackFastReleaseSlow` : on pousse 1 puis 0. La 1re lecture vaut 0,55, la suivante 0,55 × (1 − 0,12).
  - `test_bands_unknownUser_returns120Zeros`.
  - `test_outputPlan_speaker_noLongerBoosts` (dans `TalkieOutputPlanTests`) : `gainDecibels == 0`, et `routesToSpeaker` est inchangé.
- [ ] **Step 2 :** lancer les classes. Attendu : FAIL.
- [ ] **Step 3 : implémenter le registre, puis le brancher.**
  - **Micro :** les deux briques sont créées à l'ouverture, avec le `sampleRate` du format d'entrée. Chaque tampon passe d'abord par le gain (sur place), puis va à l'encodeur, puis à l'analyseur.
  - **Lecteur :** les briques sont stockées dans `Voice`, et le registre est alimenté sous `TalkieSpeaker.fromUserId`. Le lecteur doit donc apprendre le `fromUserId` de chaque `talkieId` : c'est `TalkieCenter`, qui le connaît, qui le passe à `prepare` (nouveau paramètre `fromUserId: String`).
- [ ] **Step 4 :** relancer toutes les classes de `Unit/Talkie`. Attendu : PASS. Ensuite, `./apps/ios/meeshy.sh build` doit être vert.
- [ ] **Step 5 : commit.** Message : « Chaque voix du talkie a ses propres bandes, et la réception normalise comme l'envoi », avec `Refs #20531`.

### Task 4 : la forme de la bulle, une loi pure

**Files :**
- Create : `apps/ios/Meeshy/Features/Talkie/TalkieBubbleLaw.swift`
- Test : `apps/ios/MeeshyTests/Unit/Talkie/TalkieBubbleLawTests.swift`

**Interfaces :**
- Produces :
  - `nonisolated struct TalkieBubbleGeometry: Equatable, Sendable`, avec `baseRadius: CGFloat` (le bord extérieur de l'anneau ou du cadre) et `maxAmplitude: CGFloat` ;
  - `nonisolated enum TalkieBubbleLaw`, avec :
    - `static func tips(bands: [Float], geometry: TalkieBubbleGeometry, center: CGPoint) -> [CGPoint]`, qui rend 120 points. La bande i est à l'angle `2π·i/120 − π/2` (le grave en haut, et l'on tourne dans le sens horaire vers l'aigu), au rayon `baseRadius + maxAmplitude·bands[i]` ;
    - `static func outline(tips: [CGPoint]) -> Path`, une Catmull-Rom FERMÉE convertie en courbes de Bézier cubiques ;
    - `static func reducedMotionStroke(level: Float) -> CGFloat`, l'épaisseur du trait (de 2 à 6 pt).

- [ ] **Step 1 : écrire les tests qui échouent.**
  - `test_tips_silence_isPerfectCircle` : toutes les distances au centre valent `baseRadius` (à 0,001 près).
  - `test_tips_bassOnly_bulgesOnlyBassSide` : les bandes 0 à 29 à 1, les autres à 0. Les points 0 à 29 sont à `baseRadius + maxAmplitude`, et les points 60 à 119 à `baseRadius`.
  - `test_tips_neverBeyondMaxAmplitude` : des bandes à 1,7 (une entrée hors bornes) sont bornées à `baseRadius + maxAmplitude`.
  - `test_outline_isClosed` : le chemin commence et finit au même point.
- [ ] **Step 2 :** lancer la classe. Attendu : FAIL.
- [ ] **Step 3 :** implémenter (bandes bornées à 0…1, Catmull-Rom de tension 0,5 par défaut).
- [ ] **Step 4 :** relancer. Attendu : PASS.
- [ ] **Step 5 : commit.** Message : « La bulle du talkie : un cercle au silence, une forme qui suit chaque bande », avec `Refs #20531`.

### Task 5 : la vue `TalkieVoiceBubble`

**Files :**
- Create : `apps/ios/Meeshy/Features/Talkie/TalkieVoiceBubble.swift`

**Interfaces :**
- Consumes : `TalkieVoiceStage.bands(for:)` et `TalkieBubbleLaw`.
- Produces : `struct TalkieVoiceBubble: View`, avec `init(userId: String, geometry: TalkieBubbleGeometry, stage: TalkieVoiceStage = .shared)`.
  - Elle dessine :
    - le trait du contour en `AngularGradient`, de `MeeshyColors.orange500` (le grave) à `amber500`, puis `cyan`, puis `blue500` (l'aigu), en rebouclant sur `orange500` ;
    - le remplissage du même dégradé à une opacité de 0,18 ;
    - les 120 rayons, du `baseRadius` jusqu'au contour, à une opacité de 0,6.
  - Elle tourne dans un `TimelineView(.animation(minimumInterval: reduceMotion ? 0.1 : nil))` + `Canvas`. Sous « réduire les animations », c'est un cercle dont l'épaisseur vient de `reducedMotionStroke(level:)`, où `level` est la moyenne des bandes.
  - `accessibilityHidden(true)`.
  - `struct TalkieVoiceClock: View`, avec `init(userId: String, stage: TalkieVoiceStage = .shared)`, affiche « ● 0:04 » : un point rouge (`MeeshyColors.error`) qui clignote (fixe sous « réduire les animations »), et le temps depuis `startedAt`, rafraîchi chaque seconde. Il n'affiche rien quand `startedAt` est absent.

- [ ] **Step 1 :** pas de test de vue. La loi est testée à la tâche 4. Ajouter un `#Preview` avec un registre factice qui pousse des bandes sinusoïdales.
- [ ] **Step 2 :** `./apps/ios/meeshy.sh build`. Attendu : BUILD SUCCEEDED.
- [ ] **Step 3 :** lancer `node scripts/check-accent-color-hardcoding.mjs` puis `apps/ios/scripts/check_house_rules.sh`. Attendu : verts.
- [ ] **Step 4 : commit.** Message : « La bulle spectrale et le compteur du talkie », avec `Refs #20531`.

### Task 6 : les hôtes, le hero du profil et l'orbe de l'en-tête

**Files :**
- Modify : `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileRelationSection.swift`, ou un nouveau `ProfileHeroVoice.swift` dans le même dossier. On y ajoute :
  - `public struct ProfileHeroVoice`, avec `bubble: (_ userId: String, _ baseRadius: CGFloat, _ maxAmplitude: CGFloat) -> AnyView` et `caption: (_ userId: String) -> AnyView` ;
  - la valeur d'environnement `profileHeroVoice: ProfileHeroVoice?`, par défaut `nil`.
- Modify : `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift`.
  - Dans `heroAvatar(size:)`, la bulle se pose en `.background`, centrée, AVANT `.avatarRing`. Le `baseRadius` vaut le rayon extérieur rendu par `AvatarRingGeometry` pour cette taille, et `maxAmplitude` vaut 0,35 × size/2. Seulement si `profileHeroVoice != nil`, `resolvedUserId != nil` et `!isCurrentUser`.
  - `caption` se pose entre l'avatar et le nom, sans réserver de hauteur quand il est vide.
  - Le mini-avatar replié reçoit la bulle avec `maxAmplitude = 0,35 × miniSize/2`.
- Modify : `apps/ios/Meeshy/MeeshyApp.swift`, pour `.environment(\.profileHeroVoice, …)` à côté de `\.profileRelationPill` (ligne 544). La bulle est `TalkieVoiceBubble`, et le caption est `TalkieVoiceClock`, rendu seulement quand `TalkieVoiceStage.shared.direction(for:)` vaut `.outgoing`.
- Modify : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/AvatarListeningBand.swift` (ou son hôte `AvatarListeningSource.swift`). Un nouvel environnement `avatarListeningSuppressed: Bool` la cache. L'app le pose à `true` sur le hero tant qu'une voix est en cours pour ce userId (via `TalkieVoiceStageObserver`).
- Modify : `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ConversationHeaderTalkieButton.swift`.
  - L'orbe (`TalkieVoiceBubble`) est posée en `.background` du bouton, avec `baseRadius` = demi-taille du glyphe et `maxAmplitude` = (hauteur de la rangée − taille du bouton) / 2.
  - Elle apparaît pour une voix sortante vers ce pair, et aussi pour une voix entrante de ce pair.
  - Le bouton ne publie plus `TalkieHeaderLiveKey`.
- Modify : `apps/ios/Meeshy/Features/Main/Views/ConversationExpandedHeaderBand.swift`. Il ne cède plus l'identité au talkie (retirer `YieldingToTalkie` et sa lecture de `TalkieHeaderLiveKey`).
- Delete : `apps/ios/Meeshy/Features/Talkie/TalkieHeaderLiveBar.swift`, et dans `TalkieHeaderBarLaw.swift` tout ce qui ne sert plus qu'à lui (`TalkieLevelMeter`, `TalkieLevelReading` / `Metering` s'ils n'ont plus de lecteur). Adapter `apps/ios/MeeshyTests/Unit/Talkie/TalkieHeaderTests.swift` : retirer les tests de la barre étendue, et garder ceux des lois encore utilisées.
- Test : `apps/ios/MeeshyTests/Unit/Talkie/TalkieVoiceHostTests.swift`

**Interfaces :**
- Consumes : `TalkieVoiceBubble`, `TalkieVoiceClock`, `TalkieVoiceStageObserver`, `TalkieBubbleGeometry`.
- Produces : `nonisolated enum TalkieVoiceHostLaw`, avec :
  - `static func headerOrb(buttonSize: CGFloat, rowHeight: CGFloat) -> TalkieBubbleGeometry` ;
  - `static func profileHero(outerRingRadius: CGFloat, avatarSize: CGFloat) -> TalkieBubbleGeometry`.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - `test_headerOrb_neverExceedsRow` : `baseRadius + maxAmplitude <= rowHeight / 2`.
  - `test_profileHero_amplitudeIs35PercentOfRadius` : `maxAmplitude == 0.35 * avatarSize / 2`, et `baseRadius == outerRingRadius`.
- [ ] **Step 2 :** lancer la classe. Attendu : FAIL.
- [ ] **Step 3 :** implémenter la loi et les quatre hôtes ci-dessus.
- [ ] **Step 4 :** `xcodegen generate`, `./apps/ios/meeshy.sh build`, puis tous les tests de `Unit/Talkie` et du SDK touchés (`swift test --filter Profile` dans `packages/MeeshySDK`). Attendu : verts.
- [ ] **Step 5 :** les cinq gardes des Global Constraints, sur l'arbre courant. Attendu : vertes.
- [ ] **Step 6 : commit.** Message : « La voix du talkie vit autour de l'avatar du profil et en orbe sur le bouton de la conversation », avec `Refs #20531`.

### Task 7 : preuve sur l'arbre fusionné, la CI et l'appareil réel

- [ ] **Step 1 :** `git fetch origin dev`, puis fusionner `origin/dev` dans la branche, en gardant les corrections de `dev`. Rejouer `xcodegen generate`, le build, les suites touchées et les cinq gardes. Pousser.
- [ ] **Step 2 :** sur une branche figée `ci/verdict-<sha10>`, lancer `gh workflow run ios.yml --ref ci/verdict-<sha10>` et `gh workflow run "iOS SDK" --ref …`. Attendu : verts.
- [ ] **Step 3 :** installer sur l'iPhone du porteur (`MEESHY_DEVICE_ID="Services CEO i16pm" ./apps/ios/meeshy.sh device`, staging). Mesurer :
  - les images par seconde pendant 10 s de parole (Instruments, Animation Hitches) ;
  - le temps par tampon sur le fil audio (signpost autour de `bands` + `process`).

  Les consigner dans #20531.
- [ ] **Step 4 :** ouvrir les issues des miroirs web et Android (bulle, orbe, gain), sous le milestone 293, et les citer dans #20531.
