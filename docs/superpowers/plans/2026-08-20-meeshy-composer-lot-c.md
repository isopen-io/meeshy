# Lot C — Composer chrome, intentions, rupture client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul composer visible (plateau · scène · socle permanent), ouvert déjà réglé par son intention ; la porte de mise à jour forcée ; le collage d'image et « Mes stickers » ; l'Étagère étendue.

**Architecture:** Le chrome est APP-side (`Features/Main/Composer/` nouveau) et ENVELOPPE le composer SDK existant (`StoryComposerView`) — on ne réécrit pas l'atelier, on lui donne son meuble. `ComposerIntent` est un modèle pur testé à sec. La rupture client vit en deux moitiés : l'en-tête + la détection 426 dans `APIClient` (SDK, fichier possédé par CE lot), la porte bloquante dans l'app.

**Tech Stack:** SwiftUI, XCTest, `meeshy.sh test`.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§D lot C, §B1 O2/O3/O6/O8/O9, §B3, P4/P5/P9 des planches).

## Global Constraints

- Plancher **iOS 16** ; `PasteButton` (16+) est la SEULE lecture du presse-papiers (O9).
- Fichiers POSSÉDÉS (règle worktree) : `apps/ios/Meeshy/Features/Main/Composer/*` (nouveau), `MyStoriesView.swift`, `RootView.swift`/`RootViewComponents.swift` (points d'entrée seulement), SDK : `Networking/APIClient.swift`, `MeeshyUI/Story/StoryComposerView+Canvas.swift` (geste d'appui long UNIQUEMENT — B possède `Canvas/`, D possède `Timeline/` : pas de chevauchement).
- `project.pbxproj`/`project.yml` : CE lot merge DERNIER et régénère (`xcodegen generate`) — les fichiers de test neufs de C sont enregistrés là, jamais avant.
- Toute UI neuve passe les 4 gardes du dépôt : catalogue 7 langues, clés mortes, RTL, `==` manuel sur les vues Equatable.
- Consomme (gelé) : `MeeshyScenePlayer(document:mode:)` + `ScenePlayerConfig` (B4), `StoryEffects.canvasV3` (B7), contrat 426 racine + `GET /app/min-version` (A5/A6).
- Mood (S3), repost et édition de story GARDENT leurs composers actuels — ce lot route, il ne migre pas ces trois chemins.

---

### Task C1: `ComposerIntent` — l'intention est un modèle pur

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerIntentTests.swift`

**Interfaces:**
- Produces (gelé pour C2/C3) :

```swift
enum ComposerOrigin: Equatable {
    case storyTray, feedComposer, reelTab, moodChip
    case repost(ofPostId: String), edit(postId: String), draft(id: String), share
}
struct ComposerProfile: Equatable {
    let initialFormat: PostFormat           // .story/.post/.reel/.status
    let showsSlides: Bool                   // R et M : false
    let showsTimeline: Bool                 // M : false
    let opensWith: ComposerOpening          // .cameraReady/.keyboardOnContent/.videoCameraReady/.moodGrid/...
    let allowsCapture: Bool                 // repost : false
    let routesToLegacy: LegacyComposer?     // .statusComposer (mood) / .repostComposer / .storyEdit — S3 & périmètre v1
}
enum ComposerProfile { static func profile(for origin: ComposerOrigin) -> ComposerProfile }
```

- [ ] **Step 1: Tests rouges** — la table de P5, un cas par porte : `.storyTray → (.story, cameraReady, slides:true)` ; `.feedComposer → (.post, keyboardOnContent)` ; `.reelTab → (.reel, videoCameraReady, slides:false)` ; `.moodChip → routesToLegacy == .statusComposer` (S3 : rien ne change pour le mood) ; `.repost → allowsCapture == false, routesToLegacy == .repostComposer` ; `.edit → routesToLegacy == .storyEdit` ; `.draft/.share → (.post modifiable)`. Huit tests, noms `test_profile_<origin>_<attente>`.
- [ ] **Step 2: Rouge** (types absents). **Step 3:** implémenter la table — un `switch` exhaustif, AUCUNE logique au-delà (les profils sont des données). **Step 4: Vert** (`-only-testing:MeeshyTests/ComposerIntentTests`). **Step 5: Commit.**

---

### Task C2: Le meuble — plateau, scène, socle permanent

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerPlateau.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerPlateauTests.swift` + garde de source `MeeshyComposerHostGuardTests.swift`

**Interfaces:**
- Produces : `MeeshyComposerHost(intent: ComposerIntent)` — l'unique porte visible. `PlateauTint { .noir, .indigoProfond, .violetProfond }` persisté `@AppStorage("composer.plateau.tint")` (O6).

- [ ] **Step 1: Tests rouges** — (1) `PlateauTint` : 3 cas, hex exacts (`#000000`, `#1E1B4B` = indigo950 du système, `#2E1065`), défaut `.indigoProfond` ; (2) garde de source sur `MeeshyComposerHost` : contient `StoryComposerView(` (il ENVELOPPE l'atelier SDK — anti-réécriture), contient `MeeshyScenePlayer` avec `.preview` (l'œil du socle EST le lecteur), contient les trois zones dans l'ordre `audience`→`preview`→`publish` et AUCUN `hidden`/retrait conditionnel sur le socle (loi 5 : le socle ne bouge jamais).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — structure du host :

```swift
struct MeeshyComposerHost: View {
    let intent: ComposerIntent
    @AppStorage("composer.plateau.tint") private var tint: PlateauTint = .indigoProfond
    var body: some View {
        // routesToLegacy → présentation du composer historique, rien d'autre (C1)
        VStack(spacing: 0) {
            composerSurface        // StoryComposerView (SDK) — la scène vit dedans
            socle                  // JAMAIS conditionnel
        }
        .background(tint.color.ignoresSafeArea())
    }
    private var socle: some View {
        HStack(spacing: 10) {
            audienceChip           // réutilise le picker 6 niveaux existant du composer
            previewEye             // sheet → MeeshyScenePlayer(document: draftDocument, mode: .preview, …)
            Spacer()
            publishButton          // appelle le chemin d'envoi EXISTANT du format (S2)
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
    }
}
```
Le `draftDocument` de l'aperçu vient de `CanvasV3(migrating: viewModel.currentEffects)` (B2) — l'aperçu lit CE que la publication enverra.
- [ ] **Step 4: Vert + les 4 gardes UI** (clés du socle dans le catalogue 7 langues ; RTL ; `==`). **Step 5: Commit.**

---

### Task C3: Les portes — chaque entrée fixe l'intention

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/StoryTrayActions.swift` (porte `.storyTray` — l'état `StoryViewModel.showStoryComposer` reste le déclencheur, la présentation racine documentée y pointe le host)
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` (porte `.feedComposer` : `showFullComposer`)
- Modify: point d'entrée réels (bouton « + » de l'onglet) → `.reelTab`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerEntryGuardTests.swift` (source)

- [ ] **Step 1: Tests rouges (source)** — les trois sites présentent `MeeshyComposerHost(intent:)` avec la BONNE origine ; le chip mood présente TOUJOURS `StatusComposerView` (S3, assertion négative : le fichier mood ne référence pas le host) ; plus AUCUN site ne présente `StoryComposerView` NU hors du host (grep source : seule occurrence autorisée = dans `MeeshyComposerHost.swift`).
- [ ] **Step 2: Rouge. Step 3:** câbler les trois portes. **Step 4: Vert + `meeshy.sh build`. Step 5: Commit.**

---

### Task C4: La rupture client — en-tête, 426, porte bloquante

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/UpgradeGateView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (bootstrap `.task` ligne ~721 + présentation de la porte)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/AppVersionHeaderTests.swift` + `apps/ios/MeeshyTests/Unit/Composer/UpgradeGateTests.swift`

**Interfaces:**
- Produces : header `X-App-Version` = `CFBundleShortVersionString` sur TOUTE requête (le point unique qui pose déjà `Authorization`) ; `Notification.Name.meeshyUpgradeRequired` postée par APIClient quand une réponse est `426` (userInfo : `minVersion`, `storeUrl` lus À LA RACINE du corps — contrat A5) ; `UpgradeGateView` plein écran, non-fermable, bouton App Store.

- [ ] **Step 1: Tests rouges** — SDK : `AppVersionHeader.value()` rend le short version du bundle (non vide, format `x.y[.z]`) ; `AppVersionHeader.isBelow(floor:)` — MÊME algorithme que le gateway (`1.0.5 < 1.2.0`, plancher vide ⇒ jamais en-dessous) ; parsing du corps 426 (fixture JSON racine `{ success:false, code:"UPGRADE_REQUIRED", minVersion:"1.2.0", storeUrl:"…" }` → les deux champs extraits). App : garde de source — `RootView` monte `UpgradeGateView` en `fullScreenCover` piloté par l'observation de `.meeshyUpgradeRequired` OU par la comparaison bootstrap (`GET /app/min-version`), et la porte n'a AUCUN bouton de fermeture.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — dans le funnel unique d'APIClient (celui qui pose `Authorization`) : `request.setValue(AppVersionHeader.value(), forHTTPHeaderField: "X-App-Version")` ; dans le chemin d'erreur, si `statusCode == 426` : décoder `{minVersion, storeUrl}` (racine) et poster la notification AVANT de jeter `MeeshyError.server`. Bootstrap : dans le `.task` de RootView, `GET /app/min-version` (best-effort, silencieux en échec réseau) → compare → poste la même notification.
- [ ] **Step 4: Vert** (scheme SDK pour la moitié SDK, `meeshy.sh test` pour l'app). **Step 5: Commit.**

---

### Task C5: Collage + « Mes stickers » (récents, LOCAL, zéro sync)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/StickerLibraryStore.swift`
- Create: `apps/ios/Meeshy/Features/Main/Composer/PasteIntoComposer.swift` (rangée PasteButton + grille récents)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift` (point d'injection de la rangée — possédé par C)
- Test: `apps/ios/MeeshyTests/Unit/Composer/StickerLibraryStoreTests.swift` + `PasteIntoComposerGuardTests.swift`

**Interfaces & décision v1 (consignée)** : un sticker image POSÉ entre dans la scène comme **média premier plan** (`fgMediaItem`, chemin existant de bout en bout : pose → upload → `mediaIds` → claim O8). Le kind v3 `sticker{mediaId}` sera produit quand le composer écrira le v3 nativement — post-v1, noté. La BIBLIOTHÈQUE, elle, est locale : `DiskCacheStore(policy:baseDirectory:)` dédié (LRU 64 Mo), PNG ≤ 512 px (downsample ImageIO AVANT `UIImage`).

- [ ] **Step 1: Tests rouges** — store : `add(image:) → recents()` le rend en tête ; ajout au-delà du budget évince le plus ancien (LRU) ; `remove(id:)` ; les PNG stockés font ≤ 512 px côté long (relire et mesurer). Garde de source : `PasteIntoComposer` contient `PasteButton(` et NE contient AUCUN accès `UIPasteboard.general.image`/`.images` (O9 — seule l'affordance `hasImages` est permise) ; l'injection dans `+Canvas` passe par la rangée, pas par un picker maison.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** —

```swift
// PasteIntoComposer.swift — le bouton système est la SEULE lecture (O9)
PasteButton(payloadType: UIImage.self) { images in
    guard let image = images.first else { return }
    let sticker = StickerImport.downsampled(image, maxSide: 512)   // ImageIO
    Task { await StickerLibraryStore.shared.add(sticker) }
    onPaste(sticker)   // → fgMediaItem du composer (chemin existant)
}
```
La grille « Mes stickers » (récents, appui long = retirer) alimente le même `onPaste`.
- [ ] **Step 4: Vert + gardes UI.** **Step 5: Commit.**

---

### Task C6: Appui long = capture

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift`
- Test: garde de source dans `apps/ios/MeeshyTests/Unit/Composer/LongPressCaptureGuardTests.swift`

- [ ] **Step 1: Test rouge (source)** — le canvas porte un `LongPressGesture(minimumDuration: 0.45)` (le seuil du reader, un seul vocabulaire) qui déclenche `showCameraCapture = true`, gardé par `viewModel.canAddMedia` et par le profil (`allowsCapture`). Périmètre v1 CONSIGNÉ dans le test : l'appui long OUVRE la capture (relâcher-photo/maintenir-vidéo vivent DANS `CameraView`, inchangée).
- [ ] **Step 2-5:** rouge → geste (`simultaneousGesture`, ne vole pas le tap-texte ni le swipe existants — les deux gardes de source du fichier restent vertes) → vert → commit.

---

### Task C7: L'Étagère — MyStoriesView + file d'envoi + archive

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/EtagereSectionsTests.swift`

- [ ] **Step 1: Tests rouges** — le modèle de sections (pur) : `sections(published:drafts:queued:archived:)` rend l'ordre FILE → BROUILLONS → PUBLIÉES → ARCHIVE, masque les sections vides, et une entrée de file porte son état (`sending/retrying`). La source de la file est `StoryPublishQueue` EXISTANTE (lecture seule ici).
- [ ] **Step 2-5:** rouge → sections branchées sur l'existant (Published/Drafts déjà rendus — vérifié à l'écran ; on AJOUTE, on ne déplace pas) → vert + gardes → commit.

---

### Task C8: Gate final — et fermeture du chantier

- [ ] `xcodegen generate` puis `./apps/ios/meeshy.sh test` COMPLET (les classes de test neuves de C sont enregistrées — la garde d'orphelins doit être verte).
- [ ] Captures avant/après : tray→composer, feed→composer, socle, collage, porte 426 (plancher armé en local).
- [ ] CE LOT MERGE DERNIER (pbxproj).
