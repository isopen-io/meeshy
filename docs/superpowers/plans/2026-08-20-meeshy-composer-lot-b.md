# Lot B — Noyau SDK : modèle v3, pont de rendu, ScenePlayer — Implementation Plan (rév. 2 après revue Fable)

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
- **B1 démarre après la Task A2 (fixtures) ; B2 démarre après la Task A3 (golden gelé)** — dépendances déclarées, pas de parallélisme A/B sur ces tâches.

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
        #expect(fx.textObjects[0].sourceLanguage == "fr")            // locale → sourceLanguage (C6)
        #expect(fx.textObjects[0].translations?["en"] == "Hi")       // le Prisme survit au pont
        #expect(fx.stickerObjects?.count == 2)                       // st1 + '✨' racine (G3)
        #expect(fx.stickerObjects?[0].baseSize == 300)               // champ vivant (U21)
        #expect(fx.voiceTranscriptions?.map(\.language) == ["fr", "en"])  // karaoké (C7)
        // Clés v1 RÉELLES (revue Fable n°3) : place est un OBJET SharedPlace
        // requis, l'audio référence PostMedia par postMediaId.
        #expect(fx.locationObjects.count == 1)
        #expect(fx.locationObjects[0].place.name == "Douala")
        #expect(fx.audioPlayerObjects?.count == 1)
        #expect(fx.audioPlayerObjects?[0].postMediaId == "64b0000000000000000000aa")
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
- [ ] **Step 3: Implémenter** les deux inits en MIROIR STRICT de `storyEffectsV3.ts` (A3) — mêmes défauts (`scale:1, opacity:1, z: fallback`), même sort pour `slideDuration` (ignoré) et `musicTrackId` (ignoré), `canvasAspectRatio` absorbé **avec le REMAP des ancres `.free` dans le rect letterboxé (U20 — même formule que le convertisseur gateway, le golden partagé l'atteste)** ; les règles rév. 4 de la table §C2 valent ici aussi : `translations`/`sourceLanguage` (C6), `voiceTranscriptions → sound.transcriptions` (C7), champs vivants du sticker (U21), `filter`/racine (G3). Le pont de rendu inverse remet chaque kind dans sa famille (payload → champs nommés) ; les ancres `.band` deviennent des positions `y` normalisées (`top → 0.08`, `bottom → 0.92`) le temps que le moteur apprenne les bandes — CONSTANTES nommées, documentées comme provisoires.
- [ ] **Step 4: Vert.** — **Step 5: Commit.**

---

### Task B3: Migration one-shot des brouillons (`StoryDraftStore`)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift`
- Test: étendre `packages/MeeshySDK/Tests/MeeshyUITests/StoryDraftStoreTests.swift`

**Contrat (revue Fable n°9-10)** : l'API publique du store CONTINUE de rendre
des `StoryEffects` (le type de `StorySlide.effects` ne change pas) ; c'est la
PERSISTANCE qui passe v3. Et il y a DEUX points de lecture d'`effects_json` —
le chargement des slides (`:717`) ET `firstSlideEffects` (`:974`, titre/fond
des cartes) : les deux passent par UN décodeur privé partagé, sinon la
migration vide silencieusement le second.

- [ ] **Step 1: Tests rouges** —
  1. seeder une ligne dont `effects_json` est le blob v1 fixture ; recharger :
     `slides[0].effects.textObjects[0].text == "Salut"` (le contenu SURVIT) ;
  2. relecture SQL brute : le JSON persisté commence par `{"v":3` ;
  3. `firstSlideEffects(draftId:)` rend des effets NON vides après migration
     (le deuxième point de lecture ne se fait pas vider) ;
  4. un brouillon déjà v3 ressort intact, sans réécriture.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — extraire un décodeur privé unique
  `decodeSlideEffects(_ json: String) -> StoryEffects?` : si le JSON porte
  `"v":3` → décoder `CanvasV3` puis `StoryEffects(rendering:sceneIndex:0)`
  (pont B2) ; sinon décodage legacy actuel. Les DEUX sites (`:717` et `:974`)
  l'appellent. La migration one-shot (réencodage v3 persisté) se fait au
  chargement des slides ; échec de conversion ⇒ ligne laissée telle quelle
  (tolérance, jamais de perte).
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
    public let startsPaused: Bool     // TOUS les modes : né en pause (invariant du dépôt)
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

- [ ] **Step 1: Test rouge sur la RÈGLE (pure)** — `ScenePlayerConfig(mode:)` : `.reader → startsPaused TRUE, showsChrome true` (l'invariant « canvas né en pause » du dépôt vaut POUR LE READER : la lecture démarre par la commande du viewer — « 4 chemins relancent la lecture » — jamais à la naissance ; revue Fable n°4) ; `.preview → startsPaused true, muted false, chrome false` ; `.card → paused true, muted true, loops true, chrome false`. Trois assertions par mode : les TROIS modes naissent en pause.
- [ ] **Step 2: Rouge.** 
- [ ] **Step 3: Implémenter** — `MeeshyScenePlayer.body` = l'hôte canvas EXISTANT nourri par `StoryEffects(rendering: document, sceneIndex:)` (B2) + la config du mode. Chercher le représentable hôte actuel (celui que le reader monte — `StoryCanvasUIView` via son wrapper) et l'envelopper ; AUCUNE réécriture de rendu. Paramètres opaques uniquement (pureté SDK : l'accent arrive en hex, pas de ThemeManager). **Deux lois du contrat (spec rév. 4)** : O16 — le kind `media` porteur en LECTURE joue via `SharedAVPlayerManager` (clé = identité du média ; jamais d'AVPlayer privé, qui perdrait continuité, télémétrie WatchSample et arbitrage PlaybackCoordinator — les players privés du canvas de COMPOSITION, eux, restent) ; C6 — la résolution des `translations` d'un texte suit l'ordre du Prisme du lecteur, JAMAIS `translations.first` (règle critique du dépôt).
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
    case none                                   // pas de piste ⇒ RIEN (B3.5)
    case original                               // ♫〰 — si et seulement si piste propre
    case credit(title: String?, username: String?, duration: TimeInterval?)
    // métadonnées nil = marquee générique « ♫ — » : la forme CRÉDIT ne
    // dégénère JAMAIS en note+onde (provenance, B3.4)
}
public extension AudioChipDisplay {
    static func backgroundAnnouncement(sound: BackgroundSoundV3?,
                                       libraryTitle: String?,
                                       libraryUsername: String?,
                                       libraryDuration: TimeInterval?) -> BackgroundAudioAnnouncement
}
```

- [ ] **Step 1: Tests rouges** — la signature devient `.credit(title: String?, username: String?, duration: TimeInterval?)` et les quatre cas sont : `nil → .none` (existence, B3.5) ; `.original → .original` (♫〰) ; `.library` + métadonnées → `.credit("Nuits d'été", "sam", 15)` ; `.library` SANS métadonnées (cache froid) → `.credit(nil, nil, nil)` — la FORME crédit est conservée : la vue rend alors un marquee générique « ♫ — », JAMAIS la note+onde, qui signifierait « son original » et mentirait sur la provenance (B3.4, « si et seulement si » — revue Fable n°11).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** dans le style du fichier (lire `AudioChipDisplay.resolve` existant d'abord — même vocabulaire, même forme). Fonction PURE : aucune requête, les métadonnées arrivent en paramètres (le lot E les résout).
- [ ] **Step 4: Vert.** — **Step 5: Commit.**

---

### Task B7: Décodage du FIL v3 — le point d'étranglement client (trou inter-lots fermé)

**Contexte** : après le lot A, le fil sert du v3 dans `storyEffects` — mais
`StoryItem`/`APIPost` décodent ce champ en `StoryEffects` (struct v1, tout en
`decodeIfPresent`) : un blob v3 donnerait un runtime VIDE, silencieusement.
Aucun lot ne possédait ce point. Il est ici : le miroir client du
`withMentions` serveur.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` (`StoryEffects.init(from:)` + propriété `canvasV3`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/Story/CanvasV3WireDecodingTests.swift`

**Interfaces:**
- Produces: `StoryEffects.canvasV3: CanvasV3?` — `nil` pour un blob legacy ; renseigné quand le fil a servi du v3 (le lot E s'en sert pour `MeeshyScenePlayer(document:)`). Les consommateurs LEGACY (viewer, export) continuent de lire les familles runtime, reconstruites par le pont B2 — AUCUN site d'appel ne change.

**La règle d'encodage (revue Fable n°1-2, BLOQUANTS)** : `encode(to:)` encode
**TOUJOURS v3, migré du runtime COURANT** (`CanvasV3(migrating: self)`), jamais
depuis un `canvasV3` mémorisé. Deux défauts mortels tombaient sinon : une
composition NEUVE (canvasV3 nil) partait en familles legacy et prenait le 426 de
SON PROPRE serveur (`PostService.createStory:479` encode `sanitizedEffects` tel
quel — vérifié) ; et une story ÉDITÉE ré-encodait le document d'origine,
perdant les éditions en silence (PUT + autosave brouillon). Avec la règle,
TOUS les écrivains existants (création, édition, autosave `StoryDraftStore:349`)
émettent v3 sans qu'aucun site d'appel ne change — et l'aperçu du socle (C2)
lit exactement ce que la publication enverra, par construction.
`canvasV3` reste un SNAPSHOT DE LECTURE (le document tel que le fil l'a servi,
pour `MeeshyScenePlayer(document:)`) — jamais une source d'encodage.

- [ ] **Step 1: Tests rouges** — (1) décoder un JSON `StoryEffects` dont le
  contenu est la fixture `v1-legacy-full.v3.json` : `textObjects[0].text ==
  "Salut"` (le pont a rempli le runtime) ET `canvasV3?.sound?.source ==
  .library(soundId: "snd_nuits_ete")` ; (2) décoder le blob v1 fixture :
  comportement INCHANGÉ, `canvasV3 == nil` ; (3) **une composition FRAÎCHE**
  (`StoryEffects()` + un texte) encode un JSON qui porte `"v":3` — le cas du
  426-par-son-propre-serveur ; (4) **mutation** : décoder v3, MUTER le runtime
  (`textObjects[0].text = "Edité"`), réencoder ⇒ le JSON v3 porte « Edité »
  (jamais le document d'origine) ; (5) round-trip v3 sans mutation : stable.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — décodage : en tête de
  `StoryEffects.init(from decoder:)` (init custom vérifié, `:1721`), ajouter
  `case v` aux CodingKeys ; si `decodeIfPresent(Int.self, forKey: .v) == 3`,
  décoder `CanvasV3(from: decoder)` puis `self = StoryEffects(rendering: doc,
  sceneIndex: 0)` ; `self.canvasV3 = doc` ; return. Encodage :
  `CanvasV3(migrating: self).encode(to: encoder)` — inconditionnel.
  RISQUE NOMMÉ (aucun précédent in-repo de double container sur un même
  `Decoder`) : si Foundation refuse au premier run, repli CONSIGNÉ — décoder le
  champ en `Data`/JSON brut au niveau des modèles PARENTS (APIPost/StoryItem)
  et re-décoder en deux passes ; le test (1) reste le juge.
- [ ] **Step 4: Vert.** — [ ] **Step 5: Commit.**

---

### Task B6: Gate final du lot

- [ ] Scheme `MeeshySDK-Package` COMPLET vert (les deux cibles de test).
- [ ] `./apps/ios/meeshy.sh build` — l'app compile contre le SDK modifié (aucun fichier app touché par ce lot ; si un appel casse, c'est une régression d'API : corriger le SDK, pas l'app).
- [ ] Commit final éventuel. Le lot merge DEUXIÈME (après A).

## Self-review (rév. 2 — constats Fable intégrés)

n°2-3 : assertions B2 alignées sur les clés v1 réelles (place objet, postMediaId) —
la fixture corrigée du lot A décode sans throw. n°9-10 : B3 réécrit — deux points
de lecture couverts par un décodeur unique, l'API publique garde StoryEffects, la
persistance passe v3, la survie du titre est testée. n°11 : le repli de B5 reste
en forme crédit, jamais note+onde. n°17 : dépendances B1←A2 et B2←A3 déclarées.

## Self-review initial (rév. 1)

- Couverture spec : §C1 (B1), §C2 miroir + golden partagé (B2), brouillons O2/A′ (B3), ScenePlayer + invariants nés-en-pause (B4), B3.4-5 provenance/existence (B5). ✓
- Cohérence de types avec le lot A : noms `CanvasV3/SceneV3/ObjectV3/BackgroundSoundV3/KeyframeV3` identiques ; golden UNIQUE partagé. ✓
- Zéro placeholder : chaque étape code porte du code ou une instruction exécutable précise. ✓
- Point laissé à l'exécutant SANS ambiguïté : le nom exact de l'hôte canvas (B4 Step 3) se lit dans le code au moment T — l'assertion de garde le fige ensuite. ✓

---

# Addendum rév. 3 — Rattrapage revue Opus (2026-08-20), tâches B8a–B8f

**Contexte.** La revue finale (rapport intégral : `tasks/composer-lot-b-revue-opus.md`,
23 constats vérifiés un à un par l'orchestrateur — n°1/2/3/7/12/18 reconfirmés sur
pièces) a une racine : B7 encode TOUJOURS v3 alors que le pont n'a pas de logement
pour tout ce que `StoryEffects` porte. Le gate B6 est VERT (2 cibles + build app)
mais le lot NE MERGE PAS avant fermeture des bloquants n°1–4 et des majeurs.

**Arbitrages tranchés (opposables) :**
1. **Le payload est le logement** — `ObjectV3.payload` est permissif PAR CONTRAT
   (`canvas-v3.ts:50`, `z.record(z.string(), z.unknown())`) : toute perte par-objet
   se ferme en émettant/restituant les clés vivantes dans le payload. AUCUN
   changement de schéma pour cela.
2. **Extensions de contrat à 3 côtés** (Zod shared + convertisseur TS + Swift),
   petites et additives : `BackgroundSound.variants?` (miroir de
   `backgroundAudioVariants`, type calqué sur `StoryAudioVariant` réel),
   `SceneV3.thumbHash?: string`. Fixtures NOUVELLES additives (le golden gelé
   `v1-legacy-full.v3.json` ne bouge PAS ; le gel A2/A3 tient).
3. **O3 réaligné** : `scenes` devient `.optional()` dans le Zod (min(1) conservé
   quand présent) ; pont Swift ET convertisseur TS n'émettent `scenes` que s'il
   existe au moins un objet — « jamais de cadre vide » (constat 19, mirroré).
4. **Mémos wire par-objet** (runtime, non-encodés legacy, non persistés hors pont) :
   `wireBandEdge` (top/bottom) et `wireTimingEnd` préservent `.band` et
   `timing.end` à l'aller-retour d'un document servi (constats 11, 15). Réémission
   fidèle au réencodage.
5. **Brouillon JAMAIS lossy** (constats 4, 6) : grâce aux points 1–2 le v3 persisté
   est complet ; `canvasAspectRatio` de composition se range en MÉTA de slide du
   store (précédent établi par B7 pour thumbHash local). Test juge : round-trip
   v1 → load → relecture, comparaison CHAMP À CHAMP des familles runtime.
6. **O16 réalisé, pas déclaré** (constats 7, 8) : les layers (`StoryBackgroundLayer`,
   `StoryMediaLayer`) acceptent un `playerProvider` opaque injecté (pureté SDK) ;
   le chemin LECTURE (ScenePlayer/reader) fournit un provider adossé à
   `SharedAVPlayerManager` (clé = identité du média, `carrierMediaIdentity` enfin
   branché) ; le canvas de COMPOSITION garde ses players privés. `ScenePlayerConfig`
   est CÂBLÉE : né-en-pause forcé à l'apparition, `loops`/`showsChrome` consommés.
   La garde de source teste le SIGNAL (provider requis sur le chemin lecture),
   plus seulement l'enveloppe.
7. **Miroir TS harmonisé** (constats 12, 13, 14, 16) : branche `drawing`
   (strokes + data base64) dans `storyEffectsV3.ts` ; côté Swift : z de repli =
   compteur d'insertion (comme TS) pour TOUTES les familles ; sticker SANS
   heuristique `anchorPoint` fabriquée (émettre uniquement les clés vivantes
   réelles) ; clés média conditionnelles à la TS (muted explicite sinon dérivé
   volume<=0, jamais émises par défaut).
8. **Résilience v3** (constat 10) : décodage lossy PAR OBJET (un `ObjectV3`
   malformé est sauté, la scène survit) + `do/catch` aux deux sites nus de
   `FeedModels` (`:296`, `:714`) miroir du catch de `PostModels:290`. Prédicat
   Swift `v >= 3` (constat 18).
9. **Résolveur audio unique côté SDK** (constat 9) : `AudioForegroundChip`
   (SDK MeeshyUI) passe par `backgroundAnnouncement` ; `resolve` délègue ou
   disparaît. Les appelants APP (`StoryViewerView` ×2) restent au lot E — ligne
   P0 dédiée pour que la dette soit visible.
10. **Nettoyages** : `toJSON()` supprimé + les 3 suites qui l'assertaient
    rebranchées sur l'encodage v3 réel (constat 20) ; commentaire faux de
    `StoryDraftStoreTests` corrigé (21) ; ligne spec « precision conservée »
    RETIRÉE (22, ligne morte des deux côtés) ; kinds réservés + plafonds Zod :
    comportement actuel DOCUMENTÉ comme voulu (17, le serveur juge).
11. **thumbHash au fil** (constat 23) : émis dans `SceneV3.thumbHash` par le pont
    (depuis le runtime de slide) et par le TS (depuis le blob v1).

### Task B8a — Contrat étendu + convertisseur TS harmonisé (gateway/shared)
**Files:** `packages/shared/types/canvas-v3.ts`,
`services/gateway/src/services/posts/storyEffectsV3.ts`,
fixtures NOUVELLES `packages/shared/fixtures/canvas-v3/v1-legacy-rich.json` +
`.v3.json` (drawing strokes+data, audio complet soundId/volume/waveform, média
aspectRatio+pivot, stickers anchorPoint présent/absent, variants TTS, thumbHash),
tests gateway existants étendus.
Couvre les arbitrages 2, 3, 7, 11 côté TS/Zod. Gate : suites gateway bun vertes
(`canvasV3.schema`, `canvasV3.fixtures`, `storyEffectsV3*`) + tsc. Rouge d'abord
(nouvelle fixture + assertions), puis implémentation.

### Task B8b — Pont Swift enrichi (payloads complets + mémos wire)
**Files:** `CanvasV3.swift` (variants, thumbHash, scenes optionnel, v>=3 accepté
au décodage du document), `CanvasV3Migration.swift`, `StoryModels.swift` (mémos),
`CanvasV3MigrationTests.swift` + tests sur la NOUVELLE fixture riche partagée.
Couvre 1, 2, 3, 4 (mémos), 7 côté Swift, 11. Test juge : migration Swift de
`v1-legacy-rich.json` == golden partagé `.v3.json` (les DEUX convertisseurs sur la
MÊME fixture) + round-trip document→runtime→document stable sur band/end/reserved.

### Task B8c — Résilience v3 + prédicat
**Files:** `CanvasV3.swift` (décodage lossy par objet), `StoryModels.swift:1746`
(`>= 3`), `FeedModels.swift:296,714` (catch), tests
`CanvasV3WireDecodingTests` + `StoryDecodingResilienceTests` (jumelle v3 recréée).
Couvre 8 (arbitrage), constats 10, 18.

### Task B8d — Brouillon jamais lossy
**Files:** `StoryDraftStore.swift` (méta canvasAspectRatio), `StoryDraftStoreTests`
(round-trip champ à champ : audio complet, drawing, variants, ratio, thumbHash).
Couvre 5. DÉPEND de B8b.

### Task B8e — O16 réalisé + config câblée
**Files:** `StoryBackgroundLayer.swift`, `StoryMediaLayer.swift` (playerProvider
injecté), `StoryReaderRepresentable`/hôte (transmission), `MeeshyScenePlayer.swift`
(provider SharedAVPlayerManager, config câblée, né-en-pause forcé),
`ScenePlayerModeTests.swift` (garde SIGNAL). Couvre 6 ; constats 7, 8.

### Task B8f — Nettoyages + P0 refondu + gate complet
`toJSON()` supprimé + 3 suites rebranchées ; commentaire B3 ; AudioForegroundChip
promu ; spec : ligne precision retirée + arbitrages consignés (§C2) ; P0 :
dénominateur 51→57 (6 tâches B8), lignes B8 ajoutées, en-tête lot B honnête
(« gate vert, rattrapage revue intégré ») ; gate FINAL : scheme complet 2 cibles +
build app + suites gateway bun. Couvre 9, 10 (arbitrages), constats 20–22.

**Ordre : B8a → B8b → (B8c ∥ B8d) → B8e → B8f.** Chaque tâche : TDD strict,
DoD vérifié, P0 au même commit que son gate (les tâches B8 s'ajoutent à la planche
dès B8f ; avant cela le commit de gate cite l'addendum).
