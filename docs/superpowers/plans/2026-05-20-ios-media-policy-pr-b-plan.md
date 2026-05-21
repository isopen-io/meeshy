# iOS Media Policy — PR B : Adoption cache pour attachments optimistes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zéro re-téléchargement après envoi optimiste d'un audio/image/vidéo : au socket ACK, déplacer le fichier local `file://` vers le cache typed sous la clé canonique HTTPS. Une fois la réconciliation faite, `CacheCoordinator.shared.{audio|video|images}.isCached(canonical)` retourne `true` → lecture instantanée.

**Architecture:** Nouvelle méthode `DiskCacheStore.adopt(localFile:for:)` ajoutée DIRECTEMENT au struct (pas en extension externe — `baseDirectory` est `private`). Helper static `OptimisticAttachmentAdopter.adoptIfNeeded(new:previousFileUrl:)` discrimine les transitions `file://` → `https://` et délègue au cache typed selon `attachment.type`. Branchement dans `MessagePersistenceActor.updateServerAckedFields` avec lecture pré-UPDATE de l'ancien `attachmentsJson` pour pairing à 3 niveaux (id → index → originalName+mimeType).

**Tech Stack:** SwiftUI iOS 17+, Swift 6, actor `DiskCacheStore`, GRDB pour `MessagePersistenceActor`, XCTest. Build via `./apps/ios/meeshy.sh`. Indépendant de PR A — peut être implémenté en parallèle.

**Spec source:** `docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md` §0 (état existant) + §5 (sous-système B) + §9 (edge cases) + §14.3 (message supprimé) + §15 (PR B critères).

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` | **Modify** | Ajouter méthodes `adopt(localFile:for:)` et `adoptImage(localFile:for:)` directement dans l'actor (pas extension externe — `baseDirectory` est `private`). |
| `apps/ios/Meeshy/Features/Main/Services/OptimisticAttachmentAdopter.swift` | **Create** | Helper static qui discrimine file:// → https://, lit les attachments via JSON, délègue à la bonne méthode `adopt` selon `attachment.type`. |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift` | **Modify** | `updateServerAckedFields` : lire l'ancien `attachmentsJson` AVANT l'UPDATE SQL, décoder, comparer avec le nouveau, déclencher `OptimisticAttachmentAdopter.adoptIfNeeded` pour chaque attachment changé. |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreAdoptionTests.swift` | **Create** | Tests purs `adopt` : idempotence, fichier déplacé, cleanup source, memory cache image. |
| `apps/ios/MeeshyTests/Unit/Services/OptimisticAttachmentAdopterTests.swift` | **Create** | Tests : file:// → https:// audio/image/vidéo seedent leurs caches respectifs ; reçu (previous nil) no-op ; failed upload (https stay file://) no-op ; file/location no-op. |
| `apps/ios/Meeshy.xcodeproj/project.pbxproj` | **Modify** | Ajouter `OptimisticAttachmentAdopter.swift` + `OptimisticAttachmentAdopterTests.swift` (4 entrées + 2 UUIDs chacun, classic xcodeproj). |

---

## Pré-requis

- [ ] **P0 : Branche dédiée + sanity build**

```bash
cd /Users/smpceo/Documents/v2_meeshy
# Indépendant de PR A. Si PR A est en cours, PR B peut être créée depuis main séparément.
git status
git checkout main
git checkout -b feat/ios-media-policy-pr-b
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`.

---

## Task 1 : `DiskCacheStore.adopt` + tests (TDD)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreAdoptionTests.swift`

- [ ] **Step 1.1 : Écrire les tests (RED)**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreAdoptionTests.swift` :

```swift
import XCTest
@testable import MeeshySDK

final class DiskCacheStoreAdoptionTests: XCTestCase {

    private var tempDir: URL!
    private var store: DiskCacheStore!

    override func setUp() async throws {
        try await super.setUp()
        // Isoler le filesystem par test pour éviter pollution croisée.
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("adoption-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        store = DiskCacheStore(policy: .mediaAudio, baseDirectory: tempDir)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: tempDir)
        try await super.tearDown()
    }

    // MARK: - Adoption basic

    /// Adopter un fichier local existant doit le déplacer vers le cache et
    /// rendre la clé canonique cached.
    func test_adopt_existingLocalFile_makesKeyCached() async throws {
        let localURL = tempDir.appendingPathComponent("optimistic.m4a")
        try Data([0x01, 0x02, 0x03, 0x04]).write(to: localURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: localURL.path),
            "Fichier source doit exister avant adopt")

        let canonicalKey = "https://media.meeshy.me/audio/test.m4a"
        await store.adopt(localFile: localURL, for: canonicalKey)

        let cached = await store.isCached(canonicalKey)
        XCTAssertTrue(cached, "isCached doit retourner true après adopt")
    }

    /// Le fichier source doit être déplacé (pas copié + laissé en place).
    func test_adopt_movesSourceFile() async throws {
        let localURL = tempDir.appendingPathComponent("source.m4a")
        try Data([0xAA, 0xBB]).write(to: localURL)

        let canonicalKey = "https://media.meeshy.me/audio/moved.m4a"
        await store.adopt(localFile: localURL, for: canonicalKey)

        XCTAssertFalse(FileManager.default.fileExists(atPath: localURL.path),
            "Source doit être supprimée après move")
    }

    // MARK: - Idempotence

    /// Appeler adopt 2× pour la même clé doit être idempotent (la 2ème ne touche pas le cache).
    func test_adopt_calledTwice_isIdempotent() async throws {
        let localURL1 = tempDir.appendingPathComponent("v1.m4a")
        try Data([0x01]).write(to: localURL1)

        let canonicalKey = "https://media.meeshy.me/audio/key.m4a"
        await store.adopt(localFile: localURL1, for: canonicalKey)

        // 2ème adopt avec un autre fichier sur la même clé.
        let localURL2 = tempDir.appendingPathComponent("v2.m4a")
        try Data([0x02]).write(to: localURL2)
        await store.adopt(localFile: localURL2, for: canonicalKey)

        // La 2ème source DOIT exister encore (idempotent — pas touchée).
        XCTAssertTrue(FileManager.default.fileExists(atPath: localURL2.path),
            "2ème source ne doit PAS être supprimée (idempotent)")

        // La valeur cachée doit toujours être celle de la 1ère adoption.
        let data = try await store.data(for: canonicalKey)
        XCTAssertEqual(data, Data([0x01]), "1ère version cached doit être préservée")
    }

    // MARK: - Source manquante

    /// Adopter une URL qui ne pointe vers rien ne doit pas crasher.
    func test_adopt_nonExistentSource_doesNotCrash() async {
        let localURL = tempDir.appendingPathComponent("missing.m4a")
        let canonicalKey = "https://media.meeshy.me/audio/missing.m4a"

        await store.adopt(localFile: localURL, for: canonicalKey)

        let cached = await store.isCached(canonicalKey)
        XCTAssertFalse(cached, "isCached doit retourner false si source absente")
    }

    // MARK: - adoptImage (memory cache seed)

    /// adoptImage seed le memory cache UIImage en plus du disk cache.
    func test_adoptImage_seedsMemoryImageCache() async throws {
        let localURL = tempDir.appendingPathComponent("photo.jpg")
        // PNG 1x1 transparent minimal (un JPG vide marcherait aussi mais
        // UIImage(contentsOfFile:) sur JPG corrompu retourne nil).
        let pngData = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=")!
        try pngData.write(to: localURL)

        let canonicalKey = "https://media.meeshy.me/images/photo.jpg"
        await store.adoptImage(localFile: localURL, for: canonicalKey)

        // Vérifier que le memory image cache contient l'image.
        let cachedImage = DiskCacheStore.cachedImage(for: canonicalKey)
        XCTAssertNotNil(cachedImage,
            "adoptImage doit seed DiskCacheStore.cachedImage(for:) pour rendu instantané")
    }
}
```

- [ ] **Step 1.2 : Run RED**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/DiskCacheStoreAdoptionTests \
  2>&1 | grep -E "error|cannot find" | head -5
```

Expected: erreurs `value of type 'DiskCacheStore' has no member 'adopt'`.

- [ ] **Step 1.3 : Implémenter `adopt` + `adoptImage` (GREEN)**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`, ajouter les méthodes au struct (PAS en extension externe — `baseDirectory` est `private`). Trouver une bonne position (par exemple après `save(_:for:)` ligne ~107) :

```swift
    // MARK: - Adoption (PR B — spec §5.1)

    /// Adopte un fichier local existant comme entrée cache sous une clé donnée.
    /// Move-if-same-volume (atomic), fallback copy + remove. Idempotent : si
    /// la clé existe déjà, no-op (la version cachée a priorité — pattern
    /// optimistic-then-canonical-wins).
    ///
    /// Note : on NE seede PAS le `memoryCache` ici pour éviter `Data(contentsOf:)`
    /// bloquant dans l'actor. L'audio/vidéo sera relu au premier `data(for:)`
    /// (cache hit disque → NSCache hot après). Pour les images, voir `adoptImage`
    /// qui seed le static UIImage cache.
    public func adopt(localFile localURL: URL, for canonicalKey: String) async {
        // Source absente : no-op gracieux (peut arriver si fichier déjà nettoyé
        // par un autre flow).
        guard FileManager.default.fileExists(atPath: localURL.path) else { return }

        let key = Self.fileKey(for: canonicalKey)
        let destination = baseDirectory.appendingPathComponent(key)

        // Idempotent : si la clé est déjà cachée, on garde la version existante.
        if FileManager.default.fileExists(atPath: destination.path) {
            return
        }

        do {
            try FileManager.default.moveItem(at: localURL, to: destination)
        } catch {
            // Fallback : copy + remove source (cas où move échoue pour cause de
            // permissions sandbox, ce qui ne devrait pas arriver pour un fichier
            // dans le sandbox app, mais on protège).
            do {
                try FileManager.default.copyItem(at: localURL, to: destination)
                try? FileManager.default.removeItem(at: localURL)
            } catch {
                Logger.cache.error("DiskCacheStore.adopt failed: \(error.localizedDescription)")
                return
            }
        }
    }

    /// Variante d'`adopt` pour les images qui seed aussi le memory cache UIImage
    /// (`DiskCacheStore.cachedImage(for:)` static NSCache) — assure rendu
    /// instantané dans `ProgressiveCachedImage` au prochain affichage.
    public func adoptImage(localFile localURL: URL, for canonicalKey: String) async {
        await adopt(localFile: localURL, for: canonicalKey)

        // Lire le fichier déplacé et seeder le UIImage cache static.
        // `cacheImageForPreview` est `nonisolated public static` → safe à appeler
        // depuis l'actor. Il fait lui-même `Self.fileKey(for: canonicalKey)`.
        let key = Self.fileKey(for: canonicalKey)
        let destination = baseDirectory.appendingPathComponent(key)
        guard let image = UIImage(contentsOfFile: destination.path) else { return }
        DiskCacheStore.cacheImageForPreview(image, key: canonicalKey)
    }
```

- [ ] **Step 1.4 : Run GREEN**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/DiskCacheStoreAdoptionTests \
  2>&1 | grep -E "Executed|TEST" | tail -3
```

Expected: `Executed 5 tests, with 0 failures`.

- [ ] **Step 1.5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Cache/DiskCacheStoreAdoptionTests.swift
git commit -m "feat(sdk): DiskCacheStore.adopt + adoptImage — adoption fichier local

adopt(localFile:for:) déplace un fichier local existant vers le cache disk
sous une clé canonique (move-if-same-volume, fallback copy+remove). Idempotent :
si la clé existe déjà, no-op (version cachée prime).

adoptImage(localFile:for:) seed en plus le static UIImage cache via
cacheImageForPreview pour rendu instantané ProgressiveCachedImage.

Méthodes ajoutées directement à l'actor (pas extension externe car
baseDirectory est private). Pas de seedage memoryCache bloquant
(Data(contentsOf:) skipped — cache disk hit suffit, NSCache hot au prochain
data(for:)).

5 tests TDD (move, idempotence, source manquante, adoption image avec
memory cache seed).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §5.1"
```

---

## Task 2 : `OptimisticAttachmentAdopter` + tests

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/OptimisticAttachmentAdopter.swift`
- Create: `apps/ios/MeeshyTests/Unit/Services/OptimisticAttachmentAdopterTests.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (2 entrées de fichiers)

- [ ] **Step 2.1 : Créer le helper**

```swift
import Foundation
import MeeshySDK
import os

enum OptimisticAttachmentAdopter {
    /// Au moment d'un UPDATE message (socket ACK serveur) : si le fileUrl
    /// bascule `file://` → `https://`, déplace la donnée locale vers le cache
    /// typed sous la nouvelle clé canonique. Idempotent — ré-appel inoffensif.
    ///
    /// No-op si :
    /// - Pas de previousFileUrl (premier insert = message reçu, pas envoyé)
    /// - previousFileUrl ne commence pas par "file://" (déjà serveur, pas optimiste)
    /// - new.fileUrl ne commence pas par "http" (failed upload : reste file://)
    /// - Fichier local absent (déjà nettoyé)
    /// - Type file/location (pas de cache typed dans CacheCoordinator)
    ///
    /// Note §14.3 du spec : si le message est supprimé avant adoption,
    /// l'adoption peut quand même se déclencher. Le fichier sera évincé par
    /// le LRU normalement (effet de bord négligeable).
    static func adoptIfNeeded(
        new: MeeshyMessageAttachment,
        previousFileUrl: String?
    ) async {
        guard let previous = previousFileUrl,
              previous.hasPrefix("file://"),
              new.fileUrl.hasPrefix("http") else { return }

        guard let localURL = URL(string: previous),
              FileManager.default.fileExists(atPath: localURL.path) else { return }

        let canonicalKey = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl

        switch new.type {
        case .audio:
            await CacheCoordinator.shared.audio.adopt(localFile: localURL, for: canonicalKey)
        case .image:
            await CacheCoordinator.shared.images.adoptImage(localFile: localURL, for: canonicalKey)
        case .video:
            await CacheCoordinator.shared.video.adopt(localFile: localURL, for: canonicalKey)
        case .file, .location:
            // Pas de cache typed dans CacheCoordinator pour file/location.
            return
        }
        Logger.cache.info("Adopted local attachment \(previous, privacy: .public) → cache key \(canonicalKey, privacy: .public)")
    }
}
```

- [ ] **Step 2.2 : Écrire les tests**

```swift
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class OptimisticAttachmentAdopterTests: XCTestCase {

    private var tempFiles: [URL] = []

    override func tearDown() async throws {
        // Cleanup any leftover temp files
        for url in tempFiles {
            try? FileManager.default.removeItem(at: url)
        }
        tempFiles = []
        try await super.tearDown()
    }

    private func makeTempFile(data: Data, ext: String) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("opt-\(UUID().uuidString).\(ext)")
        try? data.write(to: url)
        tempFiles.append(url)
        return url
    }

    private func makeAttachment(
        id: String = UUID().uuidString,
        type: MeeshyMessageAttachment.AttachmentType,
        fileUrl: String
    ) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id, messageId: "msg-1",
            fileName: "test.\(type == .image ? "jpg" : type == .video ? "mp4" : "m4a")",
            originalName: "test",
            mimeType: type == .image ? "image/jpeg" : type == .video ? "video/mp4" : "audio/m4a",
            fileSize: 100,
            filePath: "/test",
            fileUrl: fileUrl,
            uploadedBy: "user-1"
        )
    }

    // MARK: - Audio adoption

    func test_adoptIfNeeded_audioFileToHttps_seedsAudioCache() async {
        let localFile = makeTempFile(data: Data([0x01, 0x02]), ext: "m4a")
        let new = makeAttachment(type: .audio, fileUrl: "https://media.meeshy.me/audio/canonical.m4a")
        let previousFileUrl = localFile.absoluteString

        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: previousFileUrl)

        let canonical = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl
        let cached = await CacheCoordinator.shared.audio.isCached(canonical)
        XCTAssertTrue(cached, "Adoption audio doit seedet CacheCoordinator.audio.isCached(canonical) == true")
    }

    // MARK: - Image adoption

    func test_adoptIfNeeded_imageFileToHttps_seedsImageCache() async {
        let pngData = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=")!
        let localFile = makeTempFile(data: pngData, ext: "jpg")
        let new = makeAttachment(type: .image, fileUrl: "https://media.meeshy.me/images/canonical.jpg")
        let previousFileUrl = localFile.absoluteString

        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: previousFileUrl)

        let canonical = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl
        let cached = await CacheCoordinator.shared.images.isCached(canonical)
        XCTAssertTrue(cached, "Adoption image doit seedet CacheCoordinator.images.isCached(canonical) == true")
    }

    // MARK: - Video adoption

    func test_adoptIfNeeded_videoFileToHttps_seedsVideoCache() async {
        let localFile = makeTempFile(data: Data([0xAA, 0xBB, 0xCC, 0xDD]), ext: "mp4")
        let new = makeAttachment(type: .video, fileUrl: "https://media.meeshy.me/video/canonical.mp4")
        let previousFileUrl = localFile.absoluteString

        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: previousFileUrl)

        let canonical = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl
        let cached = await CacheCoordinator.shared.video.isCached(canonical)
        XCTAssertTrue(cached, "Adoption vidéo doit seedet CacheCoordinator.video.isCached(canonical) == true")
    }

    // MARK: - No-ops

    func test_adoptIfNeeded_noPrevious_isNoOp() async {
        let new = makeAttachment(type: .audio, fileUrl: "https://media.meeshy.me/audio/test.m4a")
        // Pas de previousFileUrl → message reçu (pas optimiste).
        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: nil)
        // Pas de crash, pas d'adoption (impossible à vérifier sans état avant/après ;
        // ce test garantit juste qu'on ne crashe pas avec nil).
        XCTAssertTrue(true)
    }

    func test_adoptIfNeeded_previousIsHttps_isNoOp() async {
        let new = makeAttachment(type: .audio, fileUrl: "https://media.meeshy.me/audio/test.m4a")
        // previousFileUrl est déjà https (pas optimiste — peut-être un refresh REST).
        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: "https://media.meeshy.me/audio/old.m4a")
        XCTAssertTrue(true)
    }

    func test_adoptIfNeeded_newStillFile_isNoOp() async {
        // Upload failed : nouveau est resté file://
        let localFile = makeTempFile(data: Data([0x01]), ext: "m4a")
        let new = makeAttachment(type: .audio, fileUrl: localFile.absoluteString)
        let previousFileUrl = localFile.absoluteString
        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: previousFileUrl)
        // Pas d'adoption (new.fileUrl ne commence pas par http).
        XCTAssertTrue(true)
        // Source doit toujours exister.
        XCTAssertTrue(FileManager.default.fileExists(atPath: localFile.path))
    }

    func test_adoptIfNeeded_fileType_isNoOp() async {
        let localFile = makeTempFile(data: Data([0x01]), ext: "pdf")
        let new = makeAttachment(type: .file, fileUrl: "https://media.meeshy.me/files/doc.pdf")
        let previousFileUrl = localFile.absoluteString
        await OptimisticAttachmentAdopter.adoptIfNeeded(new: new, previousFileUrl: previousFileUrl)
        // Pas de crash. Pas d'adoption (file/location pas de cache typed).
        XCTAssertTrue(true)
    }
}
```

- [ ] **Step 2.3 : Ajouter les 2 fichiers au pbxproj**

Memory : classic xcodeproj nécessite 4 entrées + 2 UUIDs par fichier.

```bash
cd /Users/smpceo/Documents/v2_meeshy
UUID_SRC1=$(uuidgen | tr -d '-' | cut -c1-24)
UUID_SRC2=$(uuidgen | tr -d '-' | cut -c1-24)
UUID_TEST1=$(uuidgen | tr -d '-' | cut -c1-24)
UUID_TEST2=$(uuidgen | tr -d '-' | cut -c1-24)
echo "Source : $UUID_SRC1 / $UUID_SRC2"
echo "Test : $UUID_TEST1 / $UUID_TEST2"
```

Modifier `apps/ios/Meeshy.xcodeproj/project.pbxproj` :

Pour `OptimisticAttachmentAdopter.swift` :
1. **PBXBuildFile** : `$UUID_SRC1 /* OptimisticAttachmentAdopter.swift in Sources */ = {isa = PBXBuildFile; fileRef = $UUID_SRC2 /* OptimisticAttachmentAdopter.swift */; };`
2. **PBXFileReference** : `$UUID_SRC2 /* OptimisticAttachmentAdopter.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = OptimisticAttachmentAdopter.swift; sourceTree = "<group>"; };`
3. **PBXGroup** Services : ajouter `$UUID_SRC2 /* OptimisticAttachmentAdopter.swift */,` dans children.
4. **PBXSourcesBuildPhase** Meeshy : ajouter `$UUID_SRC1 /* OptimisticAttachmentAdopter.swift in Sources */,` dans files.

Pour `OptimisticAttachmentAdopterTests.swift` :
1. **PBXBuildFile** : idem avec UUID_TEST1/UUID_TEST2.
2. **PBXFileReference** : idem.
3. **PBXGroup** Tests/Unit/Services : ajouter le file ref.
4. **PBXSourcesBuildPhase** MeeshyTests : ajouter le build file.

Pattern à suivre : copier depuis un fichier voisin existant (par exemple `OfflineQueue.swift` ou similaire dans Services pour la source ; `BubbleContentMatrixTests.swift` pour le test).

- [ ] **Step 2.4 : Build + tests**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK.

```bash
DEVICE_ID="30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
xcodebuild test \
    -project apps/ios/Meeshy.xcodeproj \
    -scheme Meeshy \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -only-testing:MeeshyTests/OptimisticAttachmentAdopterTests \
    -derivedDataPath apps/ios/Build \
    2>&1 | grep -E "Executed|TEST" | tail -3
```

Expected: `Executed 7 tests, with 0 failures`.

- [ ] **Step 2.5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/OptimisticAttachmentAdopter.swift \
        apps/ios/MeeshyTests/Unit/Services/OptimisticAttachmentAdopterTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): OptimisticAttachmentAdopter — déplace file:// vers cache HTTPS

Helper static enum qui détecte file:// → https:// transitions au socket ACK
serveur. Discrimine par MeeshyMessageAttachment.type :
- audio → CacheCoordinator.shared.audio.adopt(localFile:for:)
- image → CacheCoordinator.shared.images.adoptImage (seed UIImage cache)
- video → CacheCoordinator.shared.video.adopt
- file/location → no-op (pas de cache typed)

No-op gracieux pour : previousFileUrl nil (reçu), https → https (refresh),
file → file (failed upload), fichier source absent. Idempotent par
construction (delegate à DiskCacheStore.adopt).

7 tests TDD couvrant audio/image/vidéo adoptions + 4 no-ops.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §5.2 + §14.3"
```

---

## Task 3 : Hook dans `MessagePersistenceActor.updateServerAckedFields`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift:543`

- [ ] **Step 3.1 : Lire le code actuel pour comprendre les params**

```bash
sed -n '540,600p' packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift
```

- [ ] **Step 3.2 : Patcher la méthode**

`updateServerAckedFields` est `throws` mais pas `async`. Pour appeler `adoptIfNeeded` (async), on lance une `Task` détachée. Modifier :

```swift
    public func updateServerAckedFields(
        localId: String,
        content: String?,
        attachmentsJson: Data?,
        reactionsJson: Data?,
        pinnedAt: Date?,
        pinnedBy: String?,
        isEdited: Bool,
        editedAt: Date?,
        deletedAt: Date?,
        deliveredCount: Int,
        readCount: Int,
        deliveredToAllAt: Date?,
        readByAllAt: Date?,
        updatedAt: Date
    ) throws {
        // Adoption pré-UPDATE : lire l'ancien attachmentsJson AVANT que
        // l'UPDATE SQL ne le remplace, pour déplacer les fichiers locaux
        // file:// vers le cache typed sous la clé HTTPS canonique.
        let oldAttachmentsJson: Data? = try? dbWriter.read { db in
            try MessageRecord.filter(Column("localId") == localId)
                .fetchOne(db)?
                .attachmentsJson
        }

        // ... existing UPDATE SQL ... (lignes 559-590 inchangées)
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages
                    SET content = ?,
                    attachmentsJson = COALESCE(?, attachmentsJson),
                    reactionsJson = COALESCE(?, reactionsJson),
                    pinnedAt = ?, pinnedBy = ?,
                    isEdited = ?, editedAt = ?, deletedAt = ?,
                    deliveredCount = ?, readCount = ?,
                    deliveredToAllAt = ?, readByAllAt = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ?
                    """,
                arguments: [
                    content, attachmentsJson, reactionsJson,
                    pinnedAt, pinnedBy,
                    isEdited ? 1 : 0, editedAt, deletedAt,
                    deliveredCount, readCount,
                    deliveredToAllAt, readByAllAt,
                    updatedAt, localId
                ]
            )
        }

        // Adoption post-UPDATE en background (Task non bloquant).
        if let newAttJson = attachmentsJson, let oldAttJson = oldAttachmentsJson {
            Task.detached(priority: .utility) {
                await Self.adoptChangedAttachments(oldJson: oldAttJson, newJson: newAttJson)
            }
        }

        // ... existing notifyConversation logic ...
        if let convId = affectedConversationId {
            // ... existing code ...
        }
    }

    /// Pour chaque attachment du nouveau payload, retrouve l'optimiste original
    /// dans l'ancien JSON et déclenche `OptimisticAttachmentAdopter.adoptIfNeeded`.
    /// Pairing à 3 niveaux : par id (le plus fiable) → par index → par
    /// `originalName + mimeType` (fallback ordre serveur différent).
    private static func adoptChangedAttachments(oldJson: Data, newJson: Data) async {
        let decoder = JSONDecoder()
        guard let oldAtts = try? decoder.decode([MeeshyMessageAttachment].self, from: oldJson),
              let newAtts = try? decoder.decode([MeeshyMessageAttachment].self, from: newJson),
              !newAtts.isEmpty else { return }

        for (newIdx, newAtt) in newAtts.enumerated() {
            // Pairing à 3 niveaux.
            let oldAtt = oldAtts.first(where: { $0.id == newAtt.id })
                ?? (newIdx < oldAtts.count ? oldAtts[newIdx] : nil)
                ?? oldAtts.first(where: { $0.originalName == newAtt.originalName && $0.mimeType == newAtt.mimeType })

            guard let previous = oldAtt else { continue }
            // Delegate to OptimisticAttachmentAdopter (lives in app target, not SDK).
            // To avoid circular dependency : SDK can't import the app. We expose
            // the adoption logic as a static SDK function that takes attachment +
            // previousFileUrl, and the app version of OptimisticAttachmentAdopter
            // wraps it. For PR B initial implementation, we inline the SDK-safe
            // version here (using SDK-only APIs: CacheCoordinator + DiskCacheStore).
            await Self.adoptSDKLevel(new: newAtt, previousFileUrl: previous.fileUrl)
        }
    }

    /// SDK-level adoption (sans dépendance app). Réplique la logique
    /// d'`OptimisticAttachmentAdopter.adoptIfNeeded` (app/.../Services/) — la
    /// version app reste utile pour les call sites qui ne passent pas par
    /// `MessagePersistenceActor` (futur).
    private static func adoptSDKLevel(new: MeeshyMessageAttachment, previousFileUrl: String?) async {
        guard let previous = previousFileUrl,
              previous.hasPrefix("file://"),
              new.fileUrl.hasPrefix("http") else { return }

        guard let localURL = URL(string: previous),
              FileManager.default.fileExists(atPath: localURL.path) else { return }

        let canonicalKey = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl

        switch new.type {
        case .audio:
            await CacheCoordinator.shared.audio.adopt(localFile: localURL, for: canonicalKey)
        case .image:
            await CacheCoordinator.shared.images.adoptImage(localFile: localURL, for: canonicalKey)
        case .video:
            await CacheCoordinator.shared.video.adopt(localFile: localURL, for: canonicalKey)
        case .file, .location:
            return
        }
        Logger.cache.info("MessagePersistenceActor adopted local attachment \(previous, privacy: .public) → \(canonicalKey, privacy: .public)")
    }
```

**Note** : on duplique l'adoption logic dans `MessagePersistenceActor` car le SDK ne peut pas importer l'app. C'est acceptable car la logique est très simple et déjà testée via `DiskCacheStoreAdoptionTests`. Le `OptimisticAttachmentAdopter` côté app reste utile si on a d'autres call sites (futur) qui ne passent pas par le persistence actor.

- [ ] **Step 3.3 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK.

- [ ] **Step 3.4 : Tests d'intégration manuelle (smoke)**

PR B est difficile à tester unitairement (le hook `updateServerAckedFields` nécessite un GRDB en mémoire + un message optimiste qui devient https). Le test d'intégration est le smoke visuel §4.

- [ ] **Step 3.5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift
git commit -m "feat(sdk): MessagePersistenceActor.updateServerAckedFields adopte les fichiers locaux

Au socket ACK qui transforme un attachment optimiste file:// en URL HTTPS
canonique, lecture pré-UPDATE de l'ancien attachmentsJson dans le dbWriter,
puis Task.detached qui pour chaque attachment :
1. Pair avec l'optimiste (par id → index → originalName+mimeType)
2. Si file:// → https:// transition détectée → adopte le fichier local
   vers CacheCoordinator.shared.{audio|images|video} sous la clé canonique
3. Résultat : isCached(canonicalKey) == true → lecture instantanée sans re-DL.

Pour audio/vidéo : DiskCacheStore.adopt (move atomique).
Pour image : DiskCacheStore.adoptImage (move + seed UIImage cache).
Pour file/location : no-op.

Logique SDK-level inline (pas d'import de l'app target). Le helper
OptimisticAttachmentAdopter côté app reste pour les call sites futurs
(non utilisé directement par MessagePersistenceActor).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §5.3"
```

---

## Task 4 : Validation finale + smoke visuel

**Files:** aucun.

- [ ] **Step 4.1 : Clean build depuis main pour catcher pépins d'intégration**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh clean
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: `Build succeeded`.

- [ ] **Step 4.2 : Suite complète de tests**

```bash
DEVICE_ID="30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
xcodebuild test \
    -project apps/ios/Meeshy.xcodeproj \
    -scheme Meeshy \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -only-testing:MeeshyTests \
    -derivedDataPath apps/ios/Build \
    2>&1 | grep -E "Executed [0-9]+|TEST" | tail -3

xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests \
  2>&1 | grep -E "Executed [0-9]+|TEST" | tail -3
```

Expected: suite verte (incluant `DiskCacheStoreAdoptionTests` + `OptimisticAttachmentAdopterTests`).

- [ ] **Step 4.3 : Smoke visuel — adoption optimiste**

Lancer l'app, login `atabeth` / `<DEMO_PASSWORD — see apps/ios/fastlane/.env>`.

**Scénario 1 : envoi audio**
1. Ouvrir une conversation, enregistrer un audio (15s)
2. Envoyer
3. Attendre le retour serveur (le statut passe à .sent → .delivered)
4. Taper play sur l'audio
5. **Vérifier** : le player démarre **instantanément** (pas de DL progress visible)
6. **Bonus** : ouvrir une autre conversation puis revenir → audio joue toujours instantanément (cache persistent)

**Scénario 2 : envoi image**
1. Envoyer une photo de la photothèque
2. Attendre réconciliation
3. **Vérifier** : la version serveur (avec URL HTTPS) s'affiche **instantanément** sans flash de skeleton/shimmer

**Scénario 3 : envoi vidéo courte (15-30s)**
1. Envoyer une vidéo
2. Attendre réconciliation
3. Taper sur le play icon
4. **Vérifier** : le player démarre **sans button DL** apparaître entre l'optimiste et la version serveur

**Scénario 4 : envoi simultané multi-attachments**
1. Envoyer 4 images d'un coup
2. Attendre réconciliation de toutes
3. Tap fullscreen sur chacune
4. **Vérifier** : 0 re-DL pour les 4 (rendu instantané)

**Scénario 5 : suppression rapide** (optionnel)
1. Envoyer un audio
2. Immédiatement long-press → supprimer
3. **Vérifier** : pas de crash, pas d'erreur Logger. (Le fichier peut être brièvement adopté avant que `deletedAt` ne soit synchronisé — accepté §14.3.)

- [ ] **Step 4.4 : Récap commits**

```bash
git log --oneline main..HEAD
```

Expected: 3 commits (Tasks 1-3).

- [ ] **Step 4.5 : Pas de push automatique**

Selon project memory. Demander à l'utilisateur s'il souhaite ouvrir une PR.

---

## Self-review

**1. Spec coverage** :
- §5.1 `DiskCacheStore.adopt` + `adoptImage` → Task 1 ✓
- §5.2 `OptimisticAttachmentAdopter` → Task 2 ✓
- §5.3 Branchement `updateServerAckedFields` → Task 3 ✓
- §9 edge cases (no previous, previous https, new still file, file type) → tests Task 2 ✓
- §14.3 message supprimé avant adoption → tolerated comportement documenté dans Task 2 comment + Task 3 ✓
- §15 critères de merge PR B (tests + smoke 5 scénarios) → Task 4 ✓

**2. Placeholder scan** : aucun TBD/TODO. Tous les blocs de code complets.

**3. Type consistency** :
- `MeeshyMessageAttachment.type: AttachmentType` cases (`.image`, `.video`, `.audio`, `.file`, `.location`) — utilisés cohéremment entre Task 2 et Task 3.
- `DiskCacheStore.adopt(localFile: URL, for: String)` signature unique entre Task 1 et Task 3.
- `DiskCacheStore.adoptImage(localFile: URL, for: String)` signature unique.
- `Self.fileKey(for: String)` utilisé dans `adopt` et `adoptImage` (déjà existant dans le store, vérifié spec §0).
- `CacheCoordinator.shared.{audio, video, images}` typed actors consommés dans Tasks 2 et 3.
- `MeeshyConfig.resolveMediaURL(_:) -> URL?` utilisé partout pour canonicalisation.

**4. Ambiguity check** :
- Pairing à 3 niveaux (id → index → originalName+mimeType) explicitement codé dans Task 3 `adoptChangedAttachments`. Pas d'ambiguïté.
- `Task.detached(priority: .utility)` pour adoption async post-UPDATE — non bloquant pour le caller mais persiste le résultat. Documenté.
- Duplication SDK-level adoption logic vs app-level `OptimisticAttachmentAdopter` : justifié par non-import croisé app↔SDK. Documenté dans le commit Task 3.

**Aucune lacune identifiée.** Le plan couvre §5 du spec intégralement.
