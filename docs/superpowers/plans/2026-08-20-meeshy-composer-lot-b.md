# Lot B — Noyau SDK : modèle v3, pont de rendu, ScenePlayer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le SDK décode CanvasV3, le convertit dans les DEUX sens (publication/migration : runtime→v3 ; rendu : v3→runtime), migre les brouillons v1 one-shot, expose `MeeshyScenePlayer(document:mode:)` en REFACTORANT le moteur existant (jamais en le réécrivant), et promeut le résolveur d'annonce audio (provenance + existence).

**Architecture:** Le moteur de rendu (`StoryCanvasUIView`, `StoryTextLayer`, encre par métriques, `computedTotalDuration()`) reste INTACT : il consomme les structs runtime actuels (`StoryEffects`). Un pont bidirectionnel `CanvasV3 ⇄ StoryEffects` isole le nouveau format ; `MeeshyScenePlayer` est une View SDK à paramètres opaques (pureté SDK) qui enveloppe l'hôte canvas existant.

**Tech Stack:** Swift 6, SPM, Swift Testing (modèles purs) + XCTest (UI target), scheme `MeeshySDK-Package`.

**Spec:** `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§C1, §C2 miroir, §B3.3-6, décision « refactor pas réécriture »).

## Global Constraints

- Plancher **iOS 16** — aucune API au-dessus sans `@available` + repli (aucune n'est requise dans ce lot).
- Pureté SDK : paramètres opaques, aucun singleton produit, aucune règle « quand faire X ».
- Gate : `cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5'` — vert avant chaque commit ; attendre le lock xcodebuild d'une session voisine (boucle `pgrep -x xcodebuild`).
- Commits par chemins explicites ; ne JAMAIS toucher `apps/ios/project.yml` ni `project.pbxproj` (lot C fermera).
- Interdit : `@ViewBuilder` génériques imbriqués sur le chemin du player (piège profondeur-de-type, garde de source en T5).
- Les fixtures de `packages/shared/fixtures/canvas-v3/` sont la source de vérité — lues par `#filePath` (patron établi des tests du dépôt).

---

### Task B1: Modèles Swift `CanvasV3` + décodage des fixtures

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/CanvasV3DecodingTests.swift`

**Interfaces:**
- Produces (GELÉ pour C/D/E) : `CanvasV3 { v, scenes, sound? }`, `SceneV3`, `ObjectV3 { id, kind, anchor, plane, z, transform, timing?, locale?, payload }`, `ObjectKind` (7 cas actifs + `.reserved(String)` décodé sans crash), `ObjectAnchor { .free(x:y:) | .band(.top|.bottom) }`, `Plane { .bg .content .fg }`, `BackgroundSoundV3 { source: .original | .library(soundId), volume, bounds? }`, `KeyframeV3`.
- Consumes: fixtures A2.

- [ ] **Step 1: Test rouge (Swift Testing)**

```swift
import Testing
import Foundation
@testable import MeeshySDK

/// Décode les fixtures GELÉES du lot A — la source de vérité inter-lots.
struct CanvasV3DecodingTests {
    private func fixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent() // Story/, Models/
            .deletingLastPathComponent().deletingLastPathComponent() // MeeshySDKTests/, Tests/
            .deletingLastPathComponent()                             // MeeshySDK/
            .deletingLastPathComponent()                             // packages/ → racine? NON :
        // packages/MeeshySDK → packages ; puis shared/fixtures/canvas-v3
        return try Data(contentsOf: url
            .appendingPathComponent("shared/fixtures/canvas-v3/\(name).json"))
    }

    @Test func minimalTextDecodes() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("minimal-text"))
        #expect(doc.v == 3)
        #expect(doc.scenes.count == 1)
        #expect(doc.scenes[0].objects[0].kind == .text)
        #expect(doc.scenes[0].objects[0].locale == "fr")
    }

    @Test func reelFixture_bandsAndOriginalSound() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("reel-16x9-bands"))
        let anchors = doc.scenes[0].objects.map(\.anchor)
        #expect(anchors.contains(.band(.top)))
        #expect(anchors.contains(.band(.bottom)))
        #expect(doc.sound?.source == .original)
        #expect(doc.scenes[0].timelineDuration == 12.0)
    }

    @Test func librarySound_carriesProvenanceAndBounds() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("post-carousel-sound-library"))
        #expect(doc.sound?.source == .library(soundId: "snd_nuits_ete"))
        #expect(doc.sound?.bounds?.start == 2)
    }

    @Test func timingNil_meansFollowsTheSlide() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("minimal-text"))
        #expect(doc.scenes[0].objects[0].timing == nil)  // O4 — piste fantôme
    }

    @Test func reservedKind_decodesWithoutCrash_asReserved() throws {
        let json = #"{"v":3,"scenes":[{"id":"s","objects":[{"id":"o","kind":"interactive","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"fg","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{}}]}]}"#
        let doc = try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        #expect(doc.scenes[0].objects[0].kind == .reserved("interactive"))
    }

    @Test func roundTripsThroughCodable() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("story-3-slides"))
        let re = try JSONDecoder().decode(CanvasV3.self, from: JSONEncoder().encode(doc))
        #expect(re == doc)
    }
}
```
(Note chemin : ajuster le nombre de `deletingLastPathComponent()` au premier run — le test échoue avec un message de chemin clair, c'est voulu ; le figer ensuite.)

- [ ] **Step 2: Rouge** — types absents.
- [ ] **Step 3: Implémenter les modèles** — `Equatable+Codable+Sendable`, `payload: [String: JSONValue]` (réutiliser le type JSON existant du SDK s'il y en a un — chercher `JSONValue`/`AnyCodable` dans `MeeshySDK/Models` et suivre le patron trouvé ; sinon créer `CanvasJSONValue` enum Codable minimal dans le même fichier). `ObjectKind: Codable` custom : les 7 actifs par rawValue, tout autre → `.reserved(raw)` à l'ENCODAGE ré-émis tel quel (le SDK ne perd jamais un kind réservé qu'un futur serveur accepterait). `ObjectAnchor`/`SoundSource` en `discriminatedUnion` manuel sur `t` (pattern `init(from:)` + `encode(to:)` comme les modèles socket du dépôt).
- [ ] **Step 4: Vert** (scheme package, `-only-testing:MeeshySDKTests/CanvasV3DecodingTests`).
- [ ] **Step 5: Commit** (chemins : les 2 fichiers).

---

### Task B2: Conversion Swift bidirectionnelle `StoryEffects ⇄ CanvasV3`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3Migration.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/CanvasV3MigrationTests.swift`

**Interfaces:**
- Produces: `CanvasV3.init(migrating effects: StoryEffects)` (publication/brouillons : v1→v3, MÊMES règles que la table §C2 — golden partagé) et `StoryEffects.init(rendering document: CanvasV3, sceneIndex: Int)` (rendu : v3→runtime, consommé par B4/T5 et par l'export existant).
- Consumes: fixtures `v1-legacy-full.json` + golden `.v3.json` (A3).

- [ ] **Step 1: Tests rouges**

```swift
import Testing
import Foundation
@testable import MeeshySDK

struct CanvasV3MigrationTests {
    // fixture(_:) : même helper de chemin que CanvasV3DecodingTests.

    @Test func v1FixtureMigratesToTheSharedGolden() throws {
        let legacy = try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-full"))
        let migrated = CanvasV3(migrating: legacy)
        let golden = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        #expect(migrated == golden) // le MÊME golden que le convertisseur gateway
    }

    @Test func renderingBridge_reconstructsTheRuntimeFamilies() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        let fx = StoryEffects(rendering: doc, sceneIndex: 0)
        #expect(fx.textObjects.count == 1)
        #expect(fx.textObjects[0].textStyle == "retro")
        #expect(fx.stickerObjects?.count == 1)
        #expect(fx.locationObjects.count == 1)
        #expect(fx.audioPlayerObjects?.count == 1)
        #expect(fx.backgroundAudioId == "snd_nuits_ete")
        #expect(fx.backgroundAudioVolume == 0.6)
        #expect(fx.timelineDuration == 9.5)
    }

    @Test func roundTrip_v3_runtime_v3_isStableOnCoveredFields() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        let back = CanvasV3(migrating: StoryEffects(rendering: doc, sceneIndex: 0))
        #expect(back == doc)
    }

    @Test func originalSound_mapsFromOwnVoiceTrack() throws {
        var fx = StoryEffects()
        fx.voiceAttachmentId = "att-1"
        #expect(CanvasV3(migrating: fx).sound?.source == .original)
    }
}
```

- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** les deux inits en MIROIR STRICT de `storyEffectsV3.ts` (A3) — mêmes défauts (`scale:1, opacity:1, z: fallback`), même sort pour `slideDuration` (ignoré) et `musicTrackId` (ignoré), `canvasAspectRatio` absorbé. Le pont de rendu inverse remet chaque kind dans sa famille (payload → champs nommés) ; les ancres `.band` deviennent des positions `y` normalisées (`top → 0.08`, `bottom → 0.92`) le temps que le moteur apprenne les bandes — CONSTANTES nommées, documentées comme provisoires.
- [ ] **Step 4: Vert.** — **Step 5: Commit.**

---

### Task B3: Migration one-shot des brouillons (`StoryDraftStore`)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift`
- Test: étendre `packages/MeeshySDK/Tests/MeeshyUITests/StoryDraftStoreTests.swift`

- [ ] **Step 1: Test rouge** — seeder une ligne de brouillon dont `effects_json` est le blob v1 fixture ; recharger via l'API publique du store ; attendre : le brouillon rendu porte un blob v3 (décodable en `CanvasV3`) ET la ligne persistée a été réécrite (relecture brute = v3). Un brouillon déjà v3 ressort intact.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — au point de LECTURE du store (une seule fonction charge `effects_json` — la trouver et intervenir LÀ, pas aux appels) : si le JSON n'a pas `"v":3`, décoder en `StoryEffects`, convertir via `CanvasV3(migrating:)`, réencoder, PERSISTER, retourner. Échec de conversion ⇒ retourner le brouillon tel quel (tolérance, jamais de perte).
- [ ] **Step 4: Vert.** — **Step 5: Commit.**

---

### Task B4: `MeeshyScenePlayer` — la View SDK à trois modes

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/MeeshyScenePlayer.swift`
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer/ScenePlayerMode.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/ScenePlayerModeTests.swift`

**Interfaces (GELÉES pour C/D/E):**
```swift
public enum ScenePlayerMode: Equatable { case reader, preview, card }
public struct ScenePlayerConfig: Equatable {
    public let startsPaused: Bool     // preview/card : né en pause (invariant)
    public let isMuted: Bool          // card : muet (règle du fil)
    public let loops: Bool            // card : boucle
    public let showsChrome: Bool      // reader seul
}
public struct MeeshyScenePlayer: View {
    public init(document: CanvasV3,
                mode: ScenePlayerMode,
                sceneIndex: Binding<Int>,
                isPlaying: Binding<Bool>,
                accentColorHex: String)
}
```

- [ ] **Step 1: Test rouge sur la RÈGLE (pure)** — `ScenePlayerConfig(mode:)` : `.reader → startsPaused false… showsChrome true` ; `.preview → startsPaused true, muted false, chrome false` ; `.card → paused true, muted true, loops true, chrome false`. Trois assertions par mode. (Les invariants « né en pause » des modes non-reader sont ICI, testables sans monter de vue.)
- [ ] **Step 2: Rouge.** 
- [ ] **Step 3: Implémenter** — `MeeshyScenePlayer.body` = l'hôte canvas EXISTANT nourri par `StoryEffects(rendering: document, sceneIndex:)` (B2) + la config du mode. Chercher le représentable hôte actuel (celui que le reader monte — `StoryCanvasUIView` via son wrapper) et l'envelopper ; AUCUNE réécriture de rendu. Paramètres opaques uniquement (pureté SDK : l'accent arrive en hex, pas de ThemeManager).
- [ ] **Step 4: Garde de source anti-profondeur** — test XCTest lisant le fichier (patron `strippingComments` du dépôt) : interdit `#available` en cascade et `func …<Content: View>` imbriqués dans ScenePlayer/* ; exige que `body` référence l'hôte UIKit existant (le nom trouvé au Step 3, littéral dans l'assertion).
- [ ] **Step 5: Vert (scheme package).** — **Step 6: Commit.**

---

### Task B5: Annonce audio — provenance + existence (résolveur promu)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioChipDisplay.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/BackgroundAudioAnnouncementTests.swift`

**Interfaces (GELÉES pour E/F):**
```swift
public enum BackgroundAudioAnnouncement: Equatable {
    case none                                   // pas de piste ⇒ RIEN (loi 5)
    case original                               // ♫〰
    case credit(title: String, username: String, duration: TimeInterval?) // « titre · @pseudo · M:SS »
}
public extension AudioChipDisplay {
    static func backgroundAnnouncement(sound: BackgroundSoundV3?,
                                       libraryTitle: String?,
                                       libraryUsername: String?,
                                       libraryDuration: TimeInterval?) -> BackgroundAudioAnnouncement
}
```

- [ ] **Step 1: Tests rouges** — `nil → .none` (existence) ; `.original → .original` ; `.library` + métadonnées → `.credit(...)` ; `.library` sans métadonnées résolues → `.credit(title:"", username:"", duration:nil)` N'EST PAS acceptable : attendre `.original`? NON — attendre `.credit` avec titre vide interdit : la règle est `.none`?… Décision de spec (B3.4) : une œuvre empruntée S'ATTRIBUE — si les métadonnées manquent encore (cache froid), le résolveur rend `.credit(title: "♫", username: "", duration: nil)` ? Trop flou. TRANCHER dans le test : métadonnées absentes ⇒ `.original` est FAUX (mentirait sur la provenance) ⇒ retourner `.none` est FAUX (la piste existe) ⇒ le contrat est : `sound != nil` et source library sans métadonnées ⇒ `.credit(title: "", …)` et la VUE affiche alors la note+onde en attendant la résolution — écrire exactement ce test avec ce commentaire, c'est le contrat de repli.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** dans le style du fichier (lire `AudioChipDisplay.resolve` existant d'abord — même vocabulaire, même forme). Fonction PURE : aucune requête, les métadonnées arrivent en paramètres (le lot E les résout).
- [ ] **Step 4: Vert.** — **Step 5: Commit.**

---

### Task B6: Gate final du lot

- [ ] Scheme `MeeshySDK-Package` COMPLET vert (les deux cibles de test).
- [ ] `./apps/ios/meeshy.sh build` — l'app compile contre le SDK modifié (aucun fichier app touché par ce lot ; si un appel casse, c'est une régression d'API : corriger le SDK, pas l'app).
- [ ] Commit final éventuel. Le lot merge DEUXIÈME (après A).

## Self-review (fait à l'écriture du plan)

- Couverture spec : §C1 (B1), §C2 miroir + golden partagé (B2), brouillons O2/A′ (B3), ScenePlayer + invariants nés-en-pause (B4), B3.4-5 provenance/existence (B5). ✓
- Cohérence de types avec le lot A : noms `CanvasV3/SceneV3/ObjectV3/BackgroundSoundV3/KeyframeV3` identiques ; golden UNIQUE partagé. ✓
- Zéro placeholder : chaque étape code porte du code ou une instruction exécutable précise. ✓
- Point laissé à l'exécutant SANS ambiguïté : le nom exact de l'hôte canvas (B4 Step 3) se lit dans le code au moment T — l'assertion de garde le fige ensuite. ✓
