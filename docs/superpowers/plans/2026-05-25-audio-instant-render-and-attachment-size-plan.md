# Audio Instant Render + Attachment Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éliminer le pop-in ~1s des transcriptions/traductions audio à l'ouverture d'une conversation, afficher la taille de fichier sur les bubbles audio non téléchargés (parité avec la vidéo), et vérifier que l'image fait pareil.

**Architecture:** 3 couches indépendantes : (a) iOS — atomiser l'hydratation messages+metadata pour qu'aucun await ne s'intercale entre la pose des messages et celle des dictionnaires de transcription/traduction ; (b) Gateway — centraliser la sérialisation socket des messages pour que `transcription` et `translations` soient toujours présents dans `message:new` et nouveau event `message:attachment-updated` pour les enrichissements async (Whisper/TTS) ; (c) iOS Audio UI — étendre `AudioAvailability.downloading` avec bytes, étendre `AudioPlayerView.playButtonLabel` pour afficher la taille, créer `AudioAvailabilityResolver` app-side (porté de `VideoAvailabilityResolver`) et le brancher dans `BubbleAttachmentView`.

**Tech Stack:** SwiftUI / Swift 6 / iOS 16+ (apps/ios + packages/MeeshySDK), Fastify 5 + TypeScript / Prisma 6 + MongoDB (services/gateway), Socket.IO 4.8, shared types (packages/shared).

**Référence spec :** `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`.

---

## Lot A — SDK Audio : enum enrichi, label taille, resolver, wiring

### Task A1: Enrichir `AudioAvailability.downloading` avec bytes

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift` (créer si absent)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift` (ou ajouter au fichier existant) :

```swift
import Testing
@testable import MeeshySDK

@Suite("AudioAvailability")
struct AudioAvailabilityTests {
    @Test("resolve returns .ready when local file exists")
    func resolveLocalReady() {
        let result = AudioAvailability.resolve(isLocalFile: true, localFileExists: true, isServerCached: false)
        #expect(result == .ready)
    }

    @Test("resolve returns .needsDownload when local file missing")
    func resolveLocalMissing() {
        let result = AudioAvailability.resolve(isLocalFile: true, localFileExists: false, isServerCached: false)
        #expect(result == .needsDownload)
    }

    @Test("resolve returns .ready for server-cached non-local")
    func resolveServerCached() {
        let result = AudioAvailability.resolve(isLocalFile: false, localFileExists: false, isServerCached: true)
        #expect(result == .ready)
    }

    @Test("downloading preserves bytes for label rendering")
    func downloadingCarriesBytes() {
        let state: AudioAvailability = .downloading(progress: 0.48, downloadedBytes: 408_000, totalBytes: 870_400)
        guard case .downloading(let p, let dl, let total) = state else {
            Issue.record("expected .downloading case")
            return
        }
        #expect(p == 0.48)
        #expect(dl == 408_000)
        #expect(total == 870_400)
    }

    @Test("downloading convenience init defaults bytes to 0")
    func downloadingConvenienceDefaults() {
        let state: AudioAvailability = .downloading(progress: 0.3)
        guard case .downloading(let p, let dl, let total) = state else {
            Issue.record("expected .downloading case")
            return
        }
        #expect(p == 0.3)
        #expect(dl == 0)
        #expect(total == 0)
    }
}
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/AudioAvailabilityTests -derivedDataPath apps/ios/Build -quiet`

Expected: ÉCHEC sur `downloadingCarriesBytes` et `downloadingConvenienceDefaults` (cases inattendus / surcharges manquantes).

- [ ] **Step 3: Implémenter la modif minimale**

Remplacer le contenu de `packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift` :

```swift
import Foundation

/// Disponibilité de lecture d'un audio dans une bulle de message.
/// Pilote l'état du bouton de tête de `AudioPlayerView` :
/// `.ready` → play, `.needsDownload` → bouton télécharger,
/// `.downloading` → anneau de progression + label « 410 KB / 850 KB ».
public enum AudioAvailability: Equatable, Sendable {
    /// Jouable immédiatement : fichier local présent OU audio en cache.
    case ready
    /// Audio serveur pas encore en cache : un téléchargement est requis.
    case needsDownload
    /// Téléchargement en cours.
    /// - `progress` dans [0, 1] ; 0 = indéterminé.
    /// - `downloadedBytes` / `totalBytes` permettent au label de rendre
    ///   « 410 KB / 850 KB » côté `AudioPlayerView`. Mettre à 0 quand
    ///   inconnu — le label retombe alors sur la simple progress.
    case downloading(progress: Double, downloadedBytes: Int64, totalBytes: Int64)

    /// Convenience init backward-compatible — anciens call sites qui ne
    /// connaissent pas le poids continuent à compiler sans changement.
    public static func downloading(progress: Double) -> AudioAvailability {
        .downloading(progress: progress, downloadedBytes: 0, totalBytes: 0)
    }

    /// Résout la disponibilité « au repos » (hors téléchargement actif) à
    /// partir de faits déjà collectés. Fonction pure : testable sans I/O.
    /// - Parameters:
    ///   - isLocalFile: l'URL de l'attachment utilise le schéma `file://`.
    ///   - localFileExists: le fichier local existe sur le disque.
    ///   - isServerCached: l'audio serveur est présent dans le cache disque.
    public static func resolve(
        isLocalFile: Bool,
        localFileExists: Bool,
        isServerCached: Bool
    ) -> AudioAvailability {
        if isLocalFile {
            return localFileExists ? .ready : .needsDownload
        }
        return isServerCached ? .ready : .needsDownload
    }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/AudioAvailabilityTests -derivedDataPath apps/ios/Build -quiet`

Expected: PASS sur les 4 tests.

- [ ] **Step 5: Vérifier qu'on n'a pas cassé les call sites existants**

Run: `grep -rn '\.downloading(progress:' packages/MeeshySDK apps/ios --include='*.swift'`

Pour chaque call site qui utilise `.downloading(progress: x)` (sans `downloadedBytes:` ni `totalBytes:`), confirmer qu'il compile encore grâce au convenience init. Aucune modif requise — la convenience static `.downloading(progress:)` couvre tous les anciens usages.

Run: `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -quiet`

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/AudioAvailability.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/AudioAvailabilityTests.swift
git commit -m "feat(sdk/audio): enrich AudioAvailability.downloading with bytes

Adds downloadedBytes + totalBytes to .downloading case for label
rendering in AudioPlayerView. Backward-compat via convenience static
\`.downloading(progress:)\` — existing call sites unchanged."
```

---

### Task A2: Afficher fileSize dans `AudioPlayerView.playButtonLabel`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` (lignes 739-785, `playButtonLabel`)
- Test: créer `packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioPlayerViewLabelTests.swift`

- [ ] **Step 1: Écrire un test pur de formatage**

Le test SwiftUI render snapshot serait fragile ici — on isole une pure helper `formattedSizeLabel(...)` testable.

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioPlayerViewLabelTests.swift` :

```swift
import Testing
@testable import MeeshyUI

@Suite("AudioPlayerView size labels")
struct AudioPlayerViewLabelTests {
    @Test("needsDownload label shows formatted size when fileSize known")
    func needsDownloadShowsSize() {
        let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: 870_400)
        #expect(label == "850 KB")
    }

    @Test("needsDownload label empty when fileSize is 0")
    func needsDownloadEmptyWhenUnknown() {
        let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: 0)
        #expect(label == "")
    }

    @Test("downloading label shows downloaded / total when bytes known")
    func downloadingShowsRatio() {
        let label = AudioPlayerView.formattedDownloadingLabel(
            downloadedBytes: 408_000, totalBytes: 870_400, fallbackFileSize: 0
        )
        #expect(label == "398 KB / 850 KB")
    }

    @Test("downloading label falls back to fileSize total when totalBytes is 0")
    func downloadingFallsBackToFileSize() {
        let label = AudioPlayerView.formattedDownloadingLabel(
            downloadedBytes: 100_000, totalBytes: 0, fallbackFileSize: 870_400
        )
        #expect(label == "98 KB / 850 KB")
    }

    @Test("downloading label empty when nothing known")
    func downloadingEmptyWhenAllZero() {
        let label = AudioPlayerView.formattedDownloadingLabel(
            downloadedBytes: 0, totalBytes: 0, fallbackFileSize: 0
        )
        #expect(label == "")
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioPlayerViewLabelTests -derivedDataPath apps/ios/Build -quiet`

Expected: ÉCHEC — les helpers `formattedNeedsDownloadLabel` et `formattedDownloadingLabel` n'existent pas encore.

- [ ] **Step 3: Ajouter les helpers purs dans `AudioPlayerView`**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, juste après la déclaration `public struct AudioPlayerView: View {` (avant la première propriété, vers ligne 274), ajouter une extension statique pure :

```swift
extension AudioPlayerView {
    /// Pure helper testable : retourne la taille formatée (« 850 KB ») ou ""
    /// quand `fileSize` est 0 (inconnu).
    nonisolated public static func formattedNeedsDownloadLabel(fileSize: Int) -> String {
        guard fileSize > 0 else { return "" }
        return AudioPlayerView.formatBytes(Int64(fileSize))
    }

    /// Pure helper testable : retourne « 398 KB / 850 KB » ou un fallback
    /// quand un des deux côtés est inconnu.
    nonisolated public static func formattedDownloadingLabel(
        downloadedBytes: Int64,
        totalBytes: Int64,
        fallbackFileSize: Int
    ) -> String {
        let total: Int64 = totalBytes > 0 ? totalBytes : Int64(fallbackFileSize)
        if total <= 0 && downloadedBytes <= 0 { return "" }
        let left = AudioPlayerView.formatBytes(downloadedBytes)
        let right = total > 0 ? AudioPlayerView.formatBytes(total) : "?"
        return "\(left) / \(right)"
    }

    /// ByteCountFormatter binaire (1024) avec arrondi entier. Reproduit le
    /// même format que `AttachmentDownloader.fmt` côté app pour cohérence
    /// visuelle entre les badges de DownloadBadgeView et les labels audio.
    nonisolated public static func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .binary
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.includesUnit = true
        formatter.includesCount = true
        formatter.zeroPadsFractionDigits = false
        return formatter.string(fromByteCount: bytes)
    }
}
```

- [ ] **Step 4: Lancer le test pour vérifier le pass**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshyUITests/AudioPlayerViewLabelTests -derivedDataPath apps/ios/Build -quiet`

Expected: PASS sur 5 tests.

> Note : si la valeur exacte retournée par `ByteCountFormatter` diverge de « 850 KB » (selon locale CI), corriger les assertions pour utiliser une valeur déterministe (par exemple `.formatter.string(fromByteCount: 870_400)` calculé dynamiquement dans l'assertion). Ne PAS hard-coder la locale.

- [ ] **Step 5: Câbler le label dans `playButtonLabel`**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, remplacer le bloc `private var playButtonLabel` (lignes ~739-785) par :

```swift
@ViewBuilder
private var playButtonLabel: some View {
    let size: CGFloat = context.isCompact ? 34 : 40
    VStack(spacing: 3) {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [accent, accent.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)
                .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

            switch availability {
            case .ready:
                if player.isLoading {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.6)
                } else {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: player.isPlaying ? 0 : 1)
                }
            case .needsDownload:
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                    .foregroundColor(.white)
            case .downloading(let progress, _, _):
                if progress > 0 {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: size * 0.5, height: size * 0.5)
                        .animation(.linear(duration: 0.2), value: progress)
                } else {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.6)
                }
            }
        }

        // Label de taille — affiché uniquement dans les états transfert.
        // .ready ne montre rien (le bubble a déjà sa durée à droite du scrubber).
        switch availability {
        case .ready:
            EmptyView()
        case .needsDownload:
            let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: attachment.fileSize)
            if !label.isEmpty {
                Text(label)
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        case .downloading(_, let downloaded, let total):
            let label = AudioPlayerView.formattedDownloadingLabel(
                downloadedBytes: downloaded,
                totalBytes: total,
                fallbackFileSize: attachment.fileSize
            )
            if !label.isEmpty {
                Text(label)
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        }
    }
}
```

> Pourquoi `VStack` autour de la `ZStack` existante : le label de taille s'empile **sous** le cercle play-button (parité visuelle avec `DownloadBadgeView.centredIdleBadge` qui empile aussi taille sous icône). Le `mainPlayer` HStack continuera à aligner le tout sur le top-left du bubble — le label de 9pt ne casse pas le layout d'une bulle vide.

> Si en QA visuelle la hauteur du label perturbe la ligne du scrubber, basculer le `alignment` du HStack `mainPlayer` (lignes 472-480) de `.center` à `.top` pour conserver le scrubber aligné au baseline du cercle.

- [ ] **Step 6: Lancer le build complet**

Run: `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -quiet`

Expected: BUILD SUCCEEDED.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift packages/MeeshySDK/Tests/MeeshyUITests/Media/AudioPlayerViewLabelTests.swift
git commit -m "feat(sdk/audio): show fileSize on AudioPlayerView playButtonLabel

Stacks formatted size under the play-button circle when availability is
.needsDownload (\"850 KB\") or .downloading (\"398 KB / 850 KB\"). Pure
helpers \`formattedNeedsDownloadLabel\` / \`formattedDownloadingLabel\` are
unit-tested in MeeshyUITests."
```

---

### Task A3: Créer `AudioAvailabilityResolver` (app-side, porté de `VideoAvailabilityResolver`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/AudioAvailabilityResolver.swift`
- Modify: `apps/ios/Meeshy/Meeshy.xcodeproj/project.pbxproj` (classic format, objectVersion 63, 4 entries + 2 UUIDs)
- Test: `apps/ios/MeeshyTests/Unit/Views/AudioAvailabilityResolverTests.swift`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/AudioAvailabilityResolverTests.swift` :

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class AudioAvailabilityResolverTests: XCTestCase {

    private func makeAttachment(url: String, fileSize: Int = 870_400) -> MessageAttachment {
        MessageAttachment(
            id: "att-1",
            messageId: "msg-1",
            type: .audio,
            fileUrl: url,
            originalName: "voice.m4a",
            mimeType: "audio/m4a",
            fileSize: fileSize,
            duration: 42_000,
            thumbnailUrl: nil,
            thumbnailColor: "#666",
            width: nil,
            height: nil,
            createdAt: Date(),
            uploadedBy: "user-1",
            transcription: nil,
            audioTranslations: nil
        )
    }

    func test_resolveStatic_localFileExists_returnsReady() async throws {
        // Arrange : crée un fichier temp pour simuler un audio local existant
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-audio-\(UUID().uuidString).m4a")
        FileManager.default.createFile(atPath: tmp.path, contents: Data([0x00]))
        defer { try? FileManager.default.removeItem(at: tmp) }

        let attachment = makeAttachment(url: tmp.absoluteString)

        // Act
        let availability = await AudioAvailabilityResolver<EmptyView>.resolveStatic(attachment)

        // Assert
        XCTAssertEqual(availability, .ready)
    }

    func test_resolveStatic_localFileMissing_returnsNeedsDownload() async {
        let missingUrl = "file:///tmp/does-not-exist-\(UUID().uuidString).m4a"
        let attachment = makeAttachment(url: missingUrl)

        let availability = await AudioAvailabilityResolver<EmptyView>.resolveStatic(attachment)

        XCTAssertEqual(availability, .needsDownload)
    }
}
```

> Le test du chemin "auto-DL démarrée selon policy" demanderait une injection de `MediaDownloadPolicyEngine` et de `NetworkConditionMonitor` qui n'est pas le pattern actuel de `VideoAvailabilityResolver`. On garde un test d'intégration léger (resolveStatic pur), suffisant pour locker le contrat principal.

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `./apps/ios/meeshy.sh test --filter AudioAvailabilityResolverTests`

Expected: BUILD FAILED — symbole `AudioAvailabilityResolver` n'existe pas.

- [ ] **Step 3: Créer `AudioAvailabilityResolver.swift`**

Créer `apps/ios/Meeshy/Features/Main/Views/AudioAvailabilityResolver.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Resolves `AudioAvailability` for a `MessageAttachment` (type `.audio`) by:
///   1. Checking local file existence for `file://` URLs.
///   2. Querying `CacheCoordinator.audio.isCached(url)` for remote URLs.
///   3. Owning an `AttachmentDownloader` and applying
///      `MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, …)` on
///      resolve — auto-démarre le DL si la policy l'autorise.
///
/// Mirrors `VideoAvailabilityResolver` 1:1, substitutions :
///   - `VideoAvailability` → `AudioAvailability`
///   - `kind: .video` → `kind: .audio`
///   - `CacheCoordinator.shared.video` → `CacheCoordinator.shared.audio`
///
/// App-side per the SDK Purity rule (`packages/MeeshySDK/CLAUDE.md`) — it
/// orchestrates SDK building blocks and encodes the Meeshy "when auto-DL
/// audio" UX decision. The SDK stays pure (atoms + services) ; the app
/// composes them.
///
/// Usage:
///   AudioAvailabilityResolver(attachment: att) { availability, onDownload in
///       AudioPlayerView(attachment: att, context: .messageBubble,
///                       accentColor: accentHex, transcription: …,
///                       translatedAudios: …,
///                       availability: availability, onDownload: onDownload)
///   }
struct AudioAvailabilityResolver<Content: View>: View {
    let attachment: MessageAttachment
    let content: (AudioAvailability, @escaping () -> Void) -> Content

    @State private var resolvedAvailability: AudioAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()

    private var availability: AudioAvailability {
        if downloader.isDownloading {
            return .downloading(
                progress: downloader.progress,
                downloadedBytes: downloader.downloadedBytes,
                totalBytes: downloader.totalBytes
            )
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    init(
        attachment: MessageAttachment,
        @ViewBuilder content: @escaping (AudioAvailability, @escaping () -> Void) -> Content
    ) {
        self.attachment = attachment
        self.content = content
    }

    var body: some View {
        content(availability) {
            downloader.start(attachment: attachment, onShare: nil)
        }
        .task(id: attachment.fileUrl) {
            resolvedAvailability = await Self.resolveStatic(attachment)
            if case .needsDownload = resolvedAvailability,
               !downloader.isDownloading,
               !downloader.isCached {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: .audio, condition: condition, prefs: prefs
                ) {
                    downloader.start(attachment: attachment, onShare: nil)
                }
            }
        }
    }

    /// Static resolver helper, testable without SwiftUI hosting.
    static func resolveStatic(_ attachment: MessageAttachment) async -> AudioAvailability {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "")
            return AudioAvailability.resolve(isLocalFile: true, localFileExists: exists, isServerCached: false)
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        return AudioAvailability.resolve(isLocalFile: false, localFileExists: false, isServerCached: cached)
    }
}
```

- [ ] **Step 4: Ajouter le fichier au project.pbxproj**

Le projet utilise le format classic (`objectVersion = 63`), pas le format synchronized groups. Il faut 4 entrées + 2 UUIDs (cf. `feedback_ios_classic_pbxproj`).

Generer 2 UUIDs (24 chars hex uppercase) — utiliser `uuidgen | tr -d '-' | head -c 24 | tr '[:lower:]' '[:upper:]'` une fois pour le PBXBuildFile et une pour le PBXFileReference.

Dans `apps/ios/Meeshy/Meeshy.xcodeproj/project.pbxproj`, ajouter :

1. **PBXBuildFile** — chercher le bloc `/* Begin PBXBuildFile section */` et ajouter une ligne (utiliser un BuildFile UUID, ex. `AB1234CDEF5678AB12340001`) :
```
		AB1234CDEF5678AB12340001 /* AudioAvailabilityResolver.swift in Sources */ = {isa = PBXBuildFile; fileRef = AB1234CDEF5678AB12340002 /* AudioAvailabilityResolver.swift */; };
```

Insérer juste après la ligne équivalente de `VideoAvailabilityResolver.swift in Sources` (cherche-la avec `grep`).

2. **PBXFileReference** — chercher `/* Begin PBXFileReference section */` et ajouter (utiliser le FileRef UUID, ex. `AB1234CDEF5678AB12340002`) :
```
		AB1234CDEF5678AB12340002 /* AudioAvailabilityResolver.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AudioAvailabilityResolver.swift; sourceTree = "<group>"; };
```

Insérer juste après la ligne équivalente de `VideoAvailabilityResolver.swift`.

3. **PBXGroup (Views)** — chercher le group qui contient `VideoAvailabilityResolver.swift` (souvent commenté `/* Views */`) et ajouter la référence :
```
				AB1234CDEF5678AB12340002 /* AudioAvailabilityResolver.swift */,
```

Juste après la ligne `VideoAvailabilityResolver.swift`.

4. **PBXSourcesBuildPhase** — chercher le sources build phase de la target `Meeshy` et ajouter le BuildFile :
```
				AB1234CDEF5678AB12340001 /* AudioAvailabilityResolver.swift in Sources */,
```

Juste après la ligne `VideoAvailabilityResolver.swift in Sources`.

> Si l'engineer est incertain, le pattern exact se vérifie en cherchant `VideoAvailabilityResolver` dans le fichier — il y a exactement 4 occurrences, une dans chaque section ci-dessus.

- [ ] **Step 5: Lancer le test pour vérifier le pass**

Run: `./apps/ios/meeshy.sh test --filter AudioAvailabilityResolverTests`

Expected: PASS sur les 2 tests, BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/AudioAvailabilityResolver.swift apps/ios/MeeshyTests/Unit/Views/AudioAvailabilityResolverTests.swift apps/ios/Meeshy/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios/audio): add AudioAvailabilityResolver for bubble audio gate

Ports VideoAvailabilityResolver 1:1 to audio. Owns an AttachmentDownloader,
resolves cache/file state on mount, applies MediaDownloadPolicyEngine
auto-DL policy (kind: .audio). App-side per SDK Purity rule.

Pairs with AudioPlayerView \`availability:\` + \`onDownload:\` API to render
the existing arrow.down.to.line + size label when DL is required."
```

---

### Task A4: Brancher `AudioAvailabilityResolver` dans `BubbleAttachmentView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift` (case `.audio`, lignes 53-67)
- Test: `apps/ios/MeeshyTests/Unit/Views/BubbleAttachmentViewAudioTests.swift` (créer)

- [ ] **Step 1: Écrire le test de wiring**

Créer `apps/ios/MeeshyTests/Unit/Views/BubbleAttachmentViewAudioTests.swift` :

```swift
import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

@MainActor
final class BubbleAttachmentViewAudioTests: XCTestCase {
    /// Sanity check : la vue audio compile en présence du resolver et
    /// expose une `body` non-vide. Ce test ne vérifie pas le rendu pixel
    /// (couvert par la QA visuelle Lot E) — il sécurise le wiring de
    /// types entre AudioAvailabilityResolver et AudioPlayerView.
    func test_bubbleAttachmentView_audioBody_compilesWithResolverWiring() {
        let attachment = MessageAttachment(
            id: "att-1",
            messageId: "msg-1",
            type: .audio,
            fileUrl: "https://example.com/voice.m4a",
            originalName: "voice.m4a",
            mimeType: "audio/m4a",
            fileSize: 870_400,
            duration: 42_000,
            thumbnailUrl: nil,
            thumbnailColor: "#666",
            width: nil,
            height: nil,
            createdAt: Date(),
            uploadedBy: "user-1",
            transcription: nil,
            audioTranslations: nil
        )

        let view = BubbleAttachmentView(
            attachment: attachment,
            isMe: false,
            isDark: false,
            accentHex: "FF6B6B"
        )

        // Forcer l'évaluation du body via un host SwiftUI in-memory.
        let host = UIHostingController(rootView: view)
        XCTAssertNotNil(host.view)
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier l'état actuel**

Run: `./apps/ios/meeshy.sh test --filter BubbleAttachmentViewAudioTests`

Expected: PASS (le test passe avant comme après la modif — c'est un guard de compilation, le but est qu'il continue de passer après le wiring).

- [ ] **Step 3: Modifier le case `.audio` dans `BubbleAttachmentView`**

Dans `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`, remplacer le bloc `case .audio:` (lignes 53-67) :

```swift
        case .audio:
            AudioAvailabilityResolver(attachment: attachment) { availability, onDownload in
                AudioPlayerView(
                    attachment: attachment,
                    context: .messageBubble,
                    accentColor: accentHex,
                    transcription: transcription,
                    translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                    onRetranscribe: {
                        Task {
                            try? await AttachmentService.shared.requestTranscription(
                                attachmentId: attachment.id, force: true
                            )
                        }
                    },
                    availability: availability,
                    onDownload: onDownload
                )
            }
```

> Note ordre des paramètres : `availability:` et `onDownload:` viennent APRÈS `onRetranscribe:` dans la signature du init de `AudioPlayerView` (cf. `AudioPlayerView.swift:367-371`). Ne pas inverser.

- [ ] **Step 4: Lancer le test pour vérifier le pass**

Run: `./apps/ios/meeshy.sh test --filter BubbleAttachmentViewAudioTests`

Expected: PASS.

- [ ] **Step 5: Lancer le build complet**

Run: `./apps/ios/meeshy.sh build`

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift apps/ios/MeeshyTests/Unit/Views/BubbleAttachmentViewAudioTests.swift
git commit -m "feat(ios/bubble): wire AudioAvailabilityResolver around AudioPlayerView

case .audio of BubbleAttachmentView now wraps AudioPlayerView in
AudioAvailabilityResolver, passing availability + onDownload through.
Previously the resolver was missing and AudioPlayerView defaulted to
\`.ready\`, masking the download-required state when auto-DL was blocked
by MediaDownloadPreferences."
```

---

## Lot B — iOS hydratation atomique (ferme la race au render initial)

### Task B1: Exposer `loadInitialSnapshot()` + `apply(records:)` sur `MessageStore`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift` (autour de `loadInitial()` ligne 270)
- Test: `apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift` (ajouter)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift` (créer le fichier si absent — sinon append un test) :

```swift
// Ajouter au @MainActor final class MessageStoreTests: XCTestCase {
func test_loadInitialSnapshot_returnsRecordsWithoutMutatingMessages() async throws {
    // Arrange : MessageStore avec un seed GRDB minimal (utiliser le helper
    // existant MessageStoreObservationHelper si présent, sinon créer
    // un MessagePersistence en mémoire avec deux MessageRecord seed).
    let (store, _) = try await makeStoreWithSeededMessages(count: 3)

    // Act : récupère le snapshot sans toucher @Published var messages
    let snapshot = await store.loadInitialSnapshot()

    // Assert : snapshot contient bien les records, mais le store n'a
    // PAS surfacé les messages dans son @Published var messages
    XCTAssertEqual(snapshot.count, 3)
    XCTAssertTrue(store.messages.isEmpty,
                  "loadInitialSnapshot must not mutate @Published messages")
}

func test_apply_publishesMessagesSynchronously() async throws {
    let (store, records) = try await makeStoreWithSeededMessages(count: 3)
    let snapshot = await store.loadInitialSnapshot()
    XCTAssertTrue(store.messages.isEmpty)

    // Act : apply sur MainActor — synchrone, pas d'await
    store.apply(records: snapshot)

    // Assert : messages publiés immédiatement
    XCTAssertEqual(store.messages.count, 3)
    XCTAssertEqual(store.messages.map(\.localId), records.map(\.localId))
}
```

> Le helper `makeStoreWithSeededMessages(count:)` doit produire un `MessageStore` connecté à un `MessagePersistence` GRDB en mémoire avec N records sérialisés en attachmentsJson incluant transcription + audioTranslations. Si le fixture n'existe pas, l'écrire dans `apps/ios/MeeshyTests/Helpers/MessageStoreFixtures.swift` en s'inspirant du pattern existant `MessageStoreObservationHelper.swift`.

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `./apps/ios/meeshy.sh test --filter MessageStoreTests/test_loadInitialSnapshot_returnsRecordsWithoutMutatingMessages`

Expected: ÉCHEC — `loadInitialSnapshot` n'existe pas.

- [ ] **Step 3: Implémenter `loadInitialSnapshot()` et `apply(records:)` dans MessageStore**

Dans `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift`, juste après la méthode `loadInitial()` (ligne 272), ajouter :

```swift
    // MARK: - Atomic Snapshot Hydration
    //
    // Splits the legacy `loadInitial()` flow into two phases so the caller
    // (ConversationViewModel) can apply messages + dependent metadata
    // (transcriptions / audio translations) in a single MainActor.run with
    // no await in between. Closes the pop-in race documented in
    // `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`.

    /// Reads the current window from GRDB OFF the MainActor and returns
    /// the records without touching `@Published var messages`. The caller
    /// is responsible for invoking `apply(records:)` synchronously on the
    /// MainActor — typically inside the same `MainActor.run` where it
    /// also hydrates dependent dictionaries.
    public func loadInitialSnapshot() async -> [MessageRecord] {
        let convId = conversationId
        let reader = persistence.reader
        let mode = windowMode
        let anchor = windowAnchor
        let initialWindow = Self.initialWindowSize

        let records = await Task.detached(priority: .userInitiated) { () -> [MessageRecord] in
            (try? fetchMessageWindow(
                reader: reader, convId: convId, mode: mode,
                anchor: anchor, initialWindowSize: initialWindow
            )) ?? []
        }.value

        return records
    }

    /// Synchronously publishes the previously-fetched records into the
    /// store. Recomputes sections and clears the local id index — exactly
    /// like `refreshFromDB` did when it set `messages` directly. Safe to
    /// call from a single `MainActor.run`.
    public func apply(records: [MessageRecord]) {
        self.messages = records
        self._idIndex = nil
        self.recomputeSections()
    }
```

> Vérifier que `fetchMessageWindow` (private fonction file-level lignes 42-91) est bien accessible. Elle l'est : pas d'`actor` isolation, déclarée file-scope.

> Vérifier que `_idIndex` et `recomputeSections()` sont accessibles. `_idIndex` est private mais le `apply` est dans la même classe → OK. `recomputeSections()` aussi.

- [ ] **Step 4: Lancer les tests pour vérifier le pass**

Run: `./apps/ios/meeshy.sh test --filter MessageStoreTests`

Expected: PASS sur les deux nouveaux tests + tous les tests existants.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift apps/ios/MeeshyTests/Unit/Stores/MessageStoreTests.swift apps/ios/MeeshyTests/Helpers/MessageStoreFixtures.swift
git commit -m "feat(ios/store): expose atomic loadInitialSnapshot + apply

Splits MessageStore.loadInitial() into a non-publishing fetch phase
(\`loadInitialSnapshot\`) and a synchronous apply phase (\`apply(records:)\`).
Lets ConversationViewModel pose messages + dependent metadata
(transcriptions / audio translations) in a single MainActor.run with no
await in between — closes the ~1s pop-in on audio bubbles."
```

---

### Task B2: Faire utiliser `loadInitialSnapshot` + `apply` par `ConversationViewModel.loadMessages` (`.fresh` + `.stale`)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (lignes 1019-1066)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` — `hydrateMetadataFromGRDB` (ligne 2878) pour accepter optionnellement une liste de records (au lieu de lire `messageStore.messages`)

- [ ] **Step 1: Refactorer `hydrateMetadataFromGRDB` pour accepter une source explicite**

Dans `ConversationViewModel.swift`, remplacer la signature `private func hydrateMetadataFromGRDB()` (ligne 2878) par :

```swift
    /// Reads the embedded transcription/translation metadata from
    /// `attachmentsJson` blobs and populates `messageTranscriptions` and
    /// `messageTranslatedAudios` dictionaries.
    ///
    /// - Parameter records: explicit record list to read from. When nil,
    ///   falls back to `messageStore.messages` (legacy path). Pass an
    ///   explicit list to ensure atomicity with a same-runloop `apply`.
    private func hydrateMetadataFromGRDB(from records: [MessageRecord]? = nil) {
        let source = records ?? messageStore.messages
        let decoder = JSONDecoder()
        for record in source {
            let msgId = record.serverId ?? record.localId
            guard let data = record.attachmentsJson,
                  let attachments = try? decoder.decode([MeeshyMessageAttachment].self, from: data)
            else { continue }
            // ... reste du corps inchangé (lignes 2886-2941) ...
```

> Garder tout le bloc `for att in attachments { ... }` qui suit, inchangé. Seule la déclaration de `source` change.

- [ ] **Step 2: Refactorer le case `.fresh`**

Remplacer le bloc `.fresh` (lignes 1019-1044) par :

```swift
        case .fresh:
            // Surface GRDB data immediately (fast path for returning to a conversation).
            // Pré-hydrate les traductions AVANT loadInitial : les bulles
            // s'affichent dès le premier rendu avec le Prisme Linguistique.
            await hydratePersistedTranslations()
            // Atomic publish — read off-MainActor, then apply messages +
            // dependent metadata in a single MainActor slice so no
            // intermediate frame ever renders audio bubbles without their
            // transcription / translated audios dictionaries.
            let snapshot = await messageStore.loadInitialSnapshot()
            messageStore.apply(records: snapshot)
            hydrateMetadataFromGRDB(from: snapshot)
            await hydrateTranslationsFromCache()
            // Always revalidate from API in background — same comment as
            // before, see refreshMessagesFromAPI below for the offline-
            // messages catch-up rationale.
            isRevalidating = !messageStore.messages.isEmpty
            Task { [weak self] in
                guard let self else { return }
                await self.refreshMessagesFromAPI()
                await MainActor.run { self.isRevalidating = false }
            }
```

- [ ] **Step 3: Refactorer le case `.stale`**

Remplacer le bloc `.stale` (lignes 1046-1066) par :

```swift
        case .stale:
            // Surface GRDB data immediately, then revalidate in background.
            await hydratePersistedTranslations()
            let snapshot = await messageStore.loadInitialSnapshot()
            messageStore.apply(records: snapshot)
            hydrateMetadataFromGRDB(from: snapshot)
            if messageStore.messages.isEmpty {
                // GRDB cold for this conversation — fetch synchronously to render now.
                await refreshMessagesFromAPI()
                await hydrateTranslationsFromCache()
            } else {
                await hydrateTranslationsFromCache()
                isRevalidating = true
                Task { [weak self] in
                    guard let self else { return }
                    await self.refreshMessagesFromAPI()
                    await MainActor.run { self.isRevalidating = false }
                }
            }
```

- [ ] **Step 4: Vérifier qu'il n'y a pas d'autre appel à `messageStore.loadInitial()` à remplacer ici**

Run: `grep -n 'messageStore.loadInitial' apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

Expected: deux occurrences restantes : ligne 1124 (dans `refreshMessagesFromAPI` — couvert par Task B3) et ligne 746 (dans un autre chemin, à inspecter Task B3). NE PAS toucher ici.

- [ ] **Step 5: Build pour vérifier que ça compile**

Run: `./apps/ios/meeshy.sh build`

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Ajouter un test ViewModel pour le pattern atomique**

Ajouter à `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` (créer une suite dédiée si pas déjà présente) :

```swift
func test_loadMessages_freshCache_publishesMessagesAndMetadataAtomically() async throws {
    // Arrange : ConversationViewModel avec MessageStore + GRDB seedés
    // avec un message audio dont l'attachment porte transcription +
    // audioTranslations en attachmentsJson. Cache CacheCoordinator en
    // état .fresh pour la conversationId.
    let (sut, _) = try await makeViewModelWithFreshAudioConversation()

    // Act
    await sut.loadMessages()

    // Assert : à la fin de loadMessages (donc après le 1er MainActor
    // slice où apply + hydrate sont appliqués atomiquement), il ne doit
    // PAS exister d'état où messages est non-vide mais messageTranscriptions
    // est vide. On vérifie le résultat final (le test du "frame intermédiaire"
    // n'est pas faisable en pur unit — couvert par la QA visuelle).
    XCTAssertFalse(sut.messages.isEmpty)
    XCTAssertFalse(sut.messageTranscriptions.isEmpty,
                   "transcriptions must be hydrated synchronously with messages")
}
```

> Helper `makeViewModelWithFreshAudioConversation()` à créer dans `apps/ios/MeeshyTests/Helpers/ConversationViewModelFixtures.swift` (s'inspirer des fixtures existantes). Le payload `attachmentsJson` doit contenir un `EmbeddedTranscription` + un `EmbeddedAudioTranslation` JSON-encodés.

- [ ] **Step 7: Lancer le test**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_loadMessages_freshCache_publishesMessagesAndMetadataAtomically`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift apps/ios/MeeshyTests/Helpers/ConversationViewModelFixtures.swift
git commit -m "fix(ios/conv): atomic publish of messages + audio metadata on open

ConversationViewModel.loadMessages now reads MessageStore via
loadInitialSnapshot then applies messages + hydrateMetadataFromGRDB in
a single MainActor slice with no await in between. Eliminates the ~1s
pop-in where audio bubbles rendered without their transcription /
translated audios dictionaries on first frame.

Refactors hydrateMetadataFromGRDB to accept an explicit record list
(legacy path falls back to messageStore.messages)."
```

---

### Task B3: Faire pareil pour `refreshMessagesFromAPI` (REST round-trip) et l'autre chemin

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (ligne 1124 dans `refreshMessagesFromAPI`, ligne 746 ailleurs)

- [ ] **Step 1: Localiser le 2e call site (ligne ~746)**

Run: `grep -n 'await store.loadInitial\|messageStore.loadInitial' apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

Lire le contexte de la ligne 746 :

```bash
sed -n '740,755p' apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
```

→ Probablement un appel dans un init/onAppear/socket handler. Vérifier : si ce chemin n'est pas en lecture-de-cache + render initial, **ne pas le toucher** (laisser `loadInitial()` legacy en place pour ce chemin).

- [ ] **Step 2: Refactorer `refreshMessagesFromAPI` (ligne 1108 et suivantes)**

Remplacer le bloc qui appelle `await messageStore.loadInitial()` (ligne 1124) par le pattern atomique. Le bloc actuel :

```swift
        try? await messagePersistence.upsertFromAPIMessages(response.data)
        extractAttachmentTranscriptions(from: response.data)
        extractTextTranslations(from: response.data)
        await messageStore.loadInitial()
```

devient :

```swift
        try? await messagePersistence.upsertFromAPIMessages(response.data)
        extractAttachmentTranscriptions(from: response.data)
        extractTextTranslations(from: response.data)
        // Atomic publish : same pattern as .fresh / .stale in loadMessages.
        // upsertFromAPIMessages has persisted the API rows into GRDB, so
        // loadInitialSnapshot will pick them up; apply them in the same
        // MainActor slice as the metadata extracted above to avoid
        // re-introducing a pop-in on background revalidations.
        let snapshot = await messageStore.loadInitialSnapshot()
        messageStore.apply(records: snapshot)
        hydrateMetadataFromGRDB(from: snapshot)
```

> Note : `extractAttachmentTranscriptions` et `extractTextTranslations` peuplent déjà `messageTranscriptions` depuis `response.data` (pas depuis GRDB), donc l'`hydrateMetadataFromGRDB(from: snapshot)` ajouté est défensif. Il garantit la cohérence si l'API a omis un champ que GRDB possède (e.g. transcription enrichie par un round-trip précédent).

- [ ] **Step 3: Build**

Run: `./apps/ios/meeshy.sh build`

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Lancer toute la suite ConversationViewModel**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests`

Expected: PASS. Si un test échoue parce qu'il fait une assertion sur l'ordre exact des publish, l'adapter au nouveau pattern atomique.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "fix(ios/conv): atomic publish on refreshMessagesFromAPI

Background REST revalidation now also uses the
loadInitialSnapshot/apply/hydrateMetadataFromGRDB triplet so the
re-render after a refresh never flashes audio bubbles without metadata."
```

---

## Lot C — Gateway : sérialisation socket centralisée + nouvel event

### Task C1: Ajouter `MESSAGE_ATTACHMENT_UPDATED` à `socketio-events.ts`

**Files:**
- Modify: `packages/shared/types/socketio-events.ts`

- [ ] **Step 1: Écrire le test du contrat**

Créer (ou ajouter à) `packages/shared/__tests__/socketio-events.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'; // ou jest selon la stack
import { SERVER_EVENTS } from '../types/socketio-events';

describe('SERVER_EVENTS', () => {
  it('declares message:attachment-updated for async enrichments', () => {
    expect(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED).toBe('message:attachment-updated');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run (depuis `packages/shared/`): `npm test -- --run socketio-events`

Expected: ÉCHEC — `MESSAGE_ATTACHMENT_UPDATED` undefined.

- [ ] **Step 3: Ajouter la constante**

Dans `packages/shared/types/socketio-events.ts`, à l'intérieur de `export const SERVER_EVENTS = { ... }` (après `ATTACHMENT_STATUS_UPDATED` ligne 173 pour grouper sémantiquement) :

```typescript
  /**
   * Emitted whenever an attachment on an existing message has been
   * enriched server-side : Whisper transcription finalized, NLLB
   * translation + Chatterbox TTS finalized for one language, etc.
   *
   * Payload : { conversationId, messageId, attachment } — the FULL
   * attachment object as serialized by `serializeAttachmentForSocket`
   * (parity with the `message:new` shape). Clients replace the matching
   * attachment in their store atomically and refresh derived metadata
   * (transcription dictionaries, translated audio listings).
   *
   * Replaces the need for separate `audio-transcribed` /
   * `audio-translated` events — one generic delta event is enough.
   */
  MESSAGE_ATTACHMENT_UPDATED: 'message:attachment-updated',
```

- [ ] **Step 4: Ajouter le type payload**

Dans le même fichier, après la déclaration de `SERVER_EVENTS`, chercher ou ajouter une section types pour les payloads. Si le fichier suit le pattern `interface XEventData`, ajouter :

```typescript
/**
 * Payload de `message:attachment-updated` (cf. SERVER_EVENTS).
 * `attachment` est la forme complète sérialisée — incluant transcription
 * et translations enrichies.
 */
export interface AttachmentUpdatedEventData {
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachment: unknown; // raffiné côté gateway via serializeAttachmentForSocket
}
```

- [ ] **Step 5: Ajouter au map `ServerToClientEvents`**

Chercher `[SERVER_EVENTS.MESSAGE_NEW]: (message: SocketIOMessage) => void;` (ligne ~871). Ajouter juste après :

```typescript
  [SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED]: (payload: AttachmentUpdatedEventData) => void;
```

- [ ] **Step 6: Build + test**

Run: `cd packages/shared && npm run build && npm test -- --run socketio-events`

Expected: BUILD OK + test PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/types/socketio-events.ts packages/shared/__tests__/socketio-events.test.ts
git commit -m "feat(shared): add message:attachment-updated server event

Generic delta event emitted whenever a message attachment is enriched
server-side (Whisper transcription, NLLB+TTS translation per lang).
Carries the full attachment payload — clients replace in-place and
refresh derived metadata atomically."
```

---

### Task C2: Helper `serializeAttachmentForSocket` côté gateway

**Files:**
- Create: `services/gateway/src/socketio/serializeAttachmentForSocket.ts`
- Test: `services/gateway/src/socketio/__tests__/serializeAttachmentForSocket.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `services/gateway/src/socketio/__tests__/serializeAttachmentForSocket.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { serializeAttachmentForSocket } from '../serializeAttachmentForSocket';

describe('serializeAttachmentForSocket', () => {
  it('preserves transcription and translations on audio attachment', () => {
    const attachment = {
      id: 'att-1',
      messageId: 'msg-1',
      fileName: 'voice.m4a',
      originalName: 'voice.m4a',
      mimeType: 'audio/m4a',
      fileSize: 870_400,
      fileUrl: 'https://cdn.meeshy.me/uploads/voice.m4a',
      thumbnailUrl: null,
      thumbHash: null,
      width: null,
      height: null,
      duration: 42_000,
      bitrate: 128_000,
      sampleRate: 44_100,
      codec: 'aac',
      channels: 2,
      fps: null,
      videoCodec: null,
      pageCount: null,
      lineCount: null,
      metadata: null,
      uploadedBy: 'user-1',
      isAnonymous: false,
      createdAt: new Date('2026-05-25T10:00:00Z'),
      transcription: { text: 'Bonjour', language: 'fr', confidence: 0.95 },
      translations: {
        en: { url: 'https://cdn.meeshy.me/tts/en/voice.mp3', transcription: 'Hello', format: 'mp3' },
      },
    };

    const result = serializeAttachmentForSocket(attachment);

    expect(result.id).toBe('att-1');
    expect(result.fileSize).toBe(870_400);
    expect(result.transcription).toEqual({ text: 'Bonjour', language: 'fr', confidence: 0.95 });
    expect(result.translations).toEqual({
      en: { url: 'https://cdn.meeshy.me/tts/en/voice.mp3', transcription: 'Hello', format: 'mp3' },
    });
  });

  it('passes through null transcription and translations without throwing', () => {
    const attachment: any = {
      id: 'att-2',
      messageId: 'msg-2',
      fileName: 'pic.jpg',
      mimeType: 'image/jpeg',
      fileSize: 12_000,
      fileUrl: 'https://cdn.meeshy.me/uploads/pic.jpg',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment);
    expect(result.transcription).toBeNull();
    expect(result.translations).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run (depuis `services/gateway/`): `npm test -- --run serializeAttachmentForSocket`

Expected: ÉCHEC — module introuvable.

- [ ] **Step 3: Créer le helper**

Créer `services/gateway/src/socketio/serializeAttachmentForSocket.ts` :

```typescript
import type { AttachmentMediaPayload } from '../services/attachments/attachmentIncludes';

/**
 * Canonical serializer for a `MessageAttachment` over Socket.IO.
 *
 * The shape mirrors `attachmentMediaSelect` (cf.
 * `services/attachments/attachmentIncludes.ts`) — the render-ready set
 * that already includes the Prisme Linguistique JSON pair
 * (`transcription`, `translations`). Use this helper everywhere a
 * Message attachment is broadcast to clients so socket payloads stay
 * at parity with the REST `/messages` payload.
 *
 * The input is intentionally typed loosely (`Record<string, unknown>`)
 * because call sites may have queried Prisma with either
 * `attachments: true` (full row) or `attachments: { select: attachmentMediaSelect }`.
 * Both produce a superset of the required fields ; we pick what we
 * need and let TypeScript infer the rest.
 */
export interface SocketAttachment {
  readonly id: string;
  readonly messageId: string;
  readonly fileName?: string | null;
  readonly originalName?: string | null;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string | null;
  readonly thumbHash?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly duration?: number | null;
  readonly bitrate?: number | null;
  readonly sampleRate?: number | null;
  readonly codec?: string | null;
  readonly channels?: number | null;
  readonly fps?: number | null;
  readonly videoCodec?: string | null;
  readonly pageCount?: number | null;
  readonly lineCount?: number | null;
  readonly metadata?: unknown;
  readonly uploadedBy?: string | null;
  readonly isAnonymous?: boolean | null;
  readonly createdAt: Date | string;
  readonly transcription: unknown;
  readonly translations: unknown;
}

export function serializeAttachmentForSocket(
  raw: Record<string, unknown>
): SocketAttachment {
  return {
    id: raw.id as string,
    messageId: raw.messageId as string,
    fileName: (raw.fileName as string | null | undefined) ?? null,
    originalName: (raw.originalName as string | null | undefined) ?? null,
    mimeType: raw.mimeType as string,
    fileSize: (raw.fileSize as number | undefined) ?? 0,
    fileUrl: raw.fileUrl as string,
    thumbnailUrl: (raw.thumbnailUrl as string | null | undefined) ?? null,
    thumbHash: (raw.thumbHash as string | null | undefined) ?? null,
    width: (raw.width as number | null | undefined) ?? null,
    height: (raw.height as number | null | undefined) ?? null,
    duration: (raw.duration as number | null | undefined) ?? null,
    bitrate: (raw.bitrate as number | null | undefined) ?? null,
    sampleRate: (raw.sampleRate as number | null | undefined) ?? null,
    codec: (raw.codec as string | null | undefined) ?? null,
    channels: (raw.channels as number | null | undefined) ?? null,
    fps: (raw.fps as number | null | undefined) ?? null,
    videoCodec: (raw.videoCodec as string | null | undefined) ?? null,
    pageCount: (raw.pageCount as number | null | undefined) ?? null,
    lineCount: (raw.lineCount as number | null | undefined) ?? null,
    metadata: raw.metadata ?? null,
    uploadedBy: (raw.uploadedBy as string | null | undefined) ?? null,
    isAnonymous: (raw.isAnonymous as boolean | null | undefined) ?? null,
    createdAt: raw.createdAt as Date | string,
    // Prisme Linguistique — null = pas encore enrichi, présent = serialize tel quel
    transcription: raw.transcription ?? null,
    translations: raw.translations ?? null,
  };
}
```

- [ ] **Step 4: Lancer le test pour vérifier le pass**

Run: `cd services/gateway && npm test -- --run serializeAttachmentForSocket`

Expected: PASS sur les 2 tests.

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/socketio/serializeAttachmentForSocket.ts services/gateway/src/socketio/__tests__/serializeAttachmentForSocket.test.ts
git commit -m "feat(gateway/socket): centralize attachment serialization for socket payloads

serializeAttachmentForSocket mirrors attachmentMediaSelect shape and
guarantees that transcription + translations always travel in socket
payloads. Replaces the scattered \`(message as any).attachments\` casts
that silently dropped these JSON fields depending on the query path."
```

---

### Task C3: Faire passer `MessageHandler._buildMessagePayload` par le sérialiseur

**Files:**
- Modify: `services/gateway/src/socketio/handlers/MessageHandler.ts` (ligne 883)

- [ ] **Step 1: Écrire un test d'intégration**

Ajouter à `services/gateway/src/socketio/__tests__/message-ack.test.ts` (ou créer une suite dédiée si elle est trop grande) :

```typescript
describe('message:new broadcast', () => {
  it('includes transcription and translations on attachments', async () => {
    // Arrange : seed un message audio avec attachment qui porte
    // transcription + translations dans la DB (via Prisma test helper).
    const seededMessage = await seedAudioMessageWithEnrichedAttachment(prisma);

    // Capture l'emit
    const emittedPayloads: unknown[] = [];
    const fakeIo = makeFakeSocketIO((event, payload) => {
      if (event === 'message:new') emittedPayloads.push(payload);
    });

    const handler = new MessageHandler(prisma, fakeIo as any, /* …deps */);
    await handler.broadcastNewMessage(seededMessage, seededMessage.conversationId);

    // Assert : au moins un emit message:new avec attachment[0] enrichi
    expect(emittedPayloads.length).toBeGreaterThan(0);
    const payload = emittedPayloads[0] as { attachments?: Array<{ transcription: unknown; translations: unknown }> };
    expect(payload.attachments?.[0]?.transcription).toBeTruthy();
    expect(payload.attachments?.[0]?.translations).toBeTruthy();
  });
});
```

> Si `seedAudioMessageWithEnrichedAttachment` ou `makeFakeSocketIO` n'existent pas, les implémenter dans `services/gateway/src/__tests__/helpers/` en s'inspirant des helpers existants (chercher des suites qui mockent déjà `io.emit`).

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd services/gateway && npm test -- --run message-ack`

Expected: ÉCHEC — `payload.attachments[0].transcription` est undefined (le `(message as never)['attachments'] || []` passe les attachments tel quel sans garantie).

- [ ] **Step 3: Câbler `serializeAttachmentForSocket` dans `_buildMessagePayload`**

Dans `services/gateway/src/socketio/handlers/MessageHandler.ts`, en haut du fichier ajouter l'import :

```typescript
import { serializeAttachmentForSocket, type SocketAttachment } from '../serializeAttachmentForSocket';
```

Remplacer la ligne 883 dans `_buildMessagePayload` :

```typescript
      attachments: (message as never)['attachments'] || [],
```

par :

```typescript
      attachments: serializeAttachmentsField(message),
```

Puis ajouter cette fonction privée juste après `_buildMessagePayload` (ou en file-scope helper si plus simple) :

```typescript
  /**
   * Normalize the attachments field on a broadcast message via the
   * centralized serializer. Tolerates the legacy `as any` access pattern
   * and guarantees transcription + translations always travel through.
   */
  private _serializeAttachmentsField(message: Message): SocketAttachment[] {
    const raw = (message as unknown as Record<string, unknown>).attachments;
    if (!Array.isArray(raw)) return [];
    return raw.map((att) => serializeAttachmentForSocket(att as Record<string, unknown>));
  }
```

> Et appeler `this._serializeAttachmentsField(message)` à la place de `serializeAttachmentsField(message)` dans `_buildMessagePayload`.

- [ ] **Step 4: Vérifier que la query Prisma qui charge le message pour broadcast inclut bien les attachments**

Run: `grep -n 'attachments:' services/gateway/src/socketio/handlers/MessageHandler.ts | head -10`

Confirmer que la fonction `_loadMessageForBroadcast` (vers ligne 770-815) utilise bien `attachments: true` ou `attachments: { select: attachmentMediaSelect }`. Si elle utilise `attachments: true` (ligne 786 actuelle), c'est OK — Prisma renvoie alors tous les champs y compris `transcription` et `translations`.

Si jamais une autre query (`broadcastNewMessage` direct) reçoit un `message` qui n'a PAS chargé les attachments avec leurs JSON, ajouter en début de `broadcastNewMessage` :

```typescript
    // Defensive re-fetch — guarantee transcription/translations are loaded
    // before serialization. No-op if the caller already loaded them.
    const enrichedMessage = await this._ensureAttachmentsHydrated(message);
```

Avec une méthode `_ensureAttachmentsHydrated` qui re-query si nécessaire (cf. Step 5 ci-dessous, optionnel selon ce que révèle le grep).

- [ ] **Step 5: Lancer le test pour vérifier le pass**

Run: `cd services/gateway && npm test -- --run message-ack`

Expected: PASS — le payload contient transcription/translations.

- [ ] **Step 6: Faire pareil pour `MeeshySocketIOManager` (le 2e emit point)**

Run: `grep -n 'attachments:' services/gateway/src/socketio/MeeshySocketIOManager.ts | head -5`

Si MeeshySocketIOManager construit lui aussi un payload avec attachments (chercher autour des `emit(SERVER_EVENTS.MESSAGE_NEW, ...)`), appliquer le même refactor : passer `attachments` par `serializeAttachmentForSocket`. Si le payload `entry.payload` ligne 310 est déjà passé tel quel depuis `MessageHandler._buildMessagePayload`, alors c'est OK — le fix est déjà central.

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/socketio/MeeshySocketIOManager.ts services/gateway/src/socketio/__tests__/message-ack.test.ts services/gateway/src/__tests__/helpers/
git commit -m "fix(gateway/socket): message:new attachments always carry transcription+translations

MessageHandler._buildMessagePayload now routes attachments through
serializeAttachmentForSocket. Integration test seeds a message with an
enriched audio attachment, asserts transcription + translations are
present in the broadcast payload."
```

---

### Task C4: Émettre `message:attachment-updated` quand un worker enrichit un attachment

**Files:**
- Modify: `services/gateway/src/services/message-translation/` (chercher le module qui handle `transcriptionReady` / `audioTranslationsProgressive`)
- Modify ou Create: un helper de broadcast `emitAttachmentUpdated(io, conversationId, messageId, attachment)`
- Test: une suite dédiée

- [ ] **Step 1: Localiser les emit existants pour transcription / TTS finalisés**

Run:
```bash
grep -rn 'audio:translation-ready\|attachment-status:updated\|transcriptionReady' services/gateway/src --include='*.ts' -l
```

Lister les call sites où le gateway sait qu'un attachment vient d'être enrichi (transcription Whisper finalisée ou TTS NLLB finalisé pour une langue).

- [ ] **Step 2: Écrire le test du nouvel event**

Ajouter à `services/gateway/src/socketio/__tests__/` une suite `attachment-updated.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitAttachmentUpdated } from '../emitAttachmentUpdated';

describe('emitAttachmentUpdated', () => {
  it('emits message:attachment-updated to the conversation room with the serialized attachment', () => {
    const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
    const fakeIo = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
    };

    const attachment = {
      id: 'att-1', messageId: 'msg-1', fileUrl: 'https://x', mimeType: 'audio/m4a',
      fileSize: 100, createdAt: new Date(),
      transcription: { text: 'Hi' }, translations: { en: { url: 'https://y' } },
    } as Record<string, unknown>;

    emitAttachmentUpdated(fakeIo as any, 'conv-1', 'msg-1', attachment);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED);
    expect(emitted[0].room).toBe('conversation:conv-1');
    const payload = emitted[0].payload as { conversationId: string; messageId: string; attachment: { transcription: unknown; translations: unknown } };
    expect(payload.conversationId).toBe('conv-1');
    expect(payload.messageId).toBe('msg-1');
    expect(payload.attachment.transcription).toEqual({ text: 'Hi' });
    expect(payload.attachment.translations).toEqual({ en: { url: 'https://y' } });
  });
});
```

- [ ] **Step 3: Lancer le test pour vérifier l'échec**

Run: `cd services/gateway && npm test -- --run attachment-updated`

Expected: ÉCHEC — `emitAttachmentUpdated` n'existe pas.

- [ ] **Step 4: Créer le helper**

Créer `services/gateway/src/socketio/emitAttachmentUpdated.ts` :

```typescript
import type { Server } from 'socket.io';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { serializeAttachmentForSocket } from './serializeAttachmentForSocket';

/**
 * Broadcast a `message:attachment-updated` event to the conversation room.
 *
 * Use this whenever an async worker (Whisper transcription finalized,
 * NLLB+Chatterbox TTS finalized for one language, …) has updated an
 * attachment in the DB and clients need to reflect the new payload
 * without re-fetching the whole message.
 */
export function emitAttachmentUpdated(
  io: Server,
  conversationId: string,
  messageId: string,
  attachment: Record<string, unknown>
): void {
  const room = ROOMS.conversation(conversationId);
  io.to(room).emit(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, {
    conversationId,
    messageId,
    attachment: serializeAttachmentForSocket(attachment),
  });
}
```

- [ ] **Step 5: Lancer le test pour vérifier le pass**

Run: `cd services/gateway && npm test -- --run attachment-updated`

Expected: PASS.

- [ ] **Step 6: Brancher l'emit aux call sites identifiés en Step 1**

Pour chaque chemin où le gateway écrit en DB un attachment enrichi (transcription, audio translation), ajouter juste après l'écrit DB :

```typescript
emitAttachmentUpdated(io, conversationId, messageId, updatedAttachment);
```

> `updatedAttachment` doit être ré-lu depuis Prisma avec `attachmentMediaSelect` pour garantir la fraicheur des champs. Si le worker dispose déjà de l'objet Prisma à jour, le passer directement.

Pour la liste précise des call sites, suivre les fichiers retournés par le grep du Step 1. Typiquement :
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (transcriptionReady handler) → après update DB
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (audioTranslationsProgressive handler) → après chaque langue
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (audioProcessCompleted) → finale

Pour chaque emit ajouté, ajouter un test d'intégration qui vérifie que l'event est émis avec le bon payload (mock io, déclencher le handler, asserter).

- [ ] **Step 7: Build complet gateway**

Run: `cd services/gateway && npm run build`

Expected: BUILD OK.

- [ ] **Step 8: Lancer toute la suite socketio**

Run: `cd services/gateway && npm test -- --testPathPattern=socketio`

Expected: PASS (modulo flaky tests pré-existants documentés dans `feedback_ios_test_suite_flaky` — re-run avant de conclure à une régression).

- [ ] **Step 9: Commit**

```bash
git add services/gateway/src/socketio/emitAttachmentUpdated.ts services/gateway/src/socketio/__tests__/attachment-updated.test.ts services/gateway/src/services/message-translation/
git commit -m "feat(gateway/socket): emit message:attachment-updated on async enrichments

Adds emitAttachmentUpdated helper and wires it into the transcription
and audio-translation workers. Whenever Whisper or NLLB+Chatterbox
finalize an attachment enrichment, the conversation room receives a
single generic delta event carrying the fully serialized attachment."
```

---

## Lot D — iOS SDK : handler `message:attachment-updated` + delta apply

### Task D1: Ajouter le publisher `attachmentUpdatedPublisher` dans `MessageSocketManager`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` (ou équivalent — chercher où `messagePublisher` est défini)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Sockets/MessageSocketManagerTests.swift`

- [ ] **Step 1: Localiser le manager + sa structure de publishers**

Run: `grep -n 'PassthroughSubject\|messagePublisher' packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift | head -20`

Identifier le pattern utilisé pour les publishers existants (PassthroughSubject<EventData, Never> exposé via Combine).

- [ ] **Step 2: Définir le DTO côté SDK**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`, ajouter :

```swift
/// Payload de l'event Socket.IO `message:attachment-updated`.
/// Reçu quand un worker gateway a enrichi un attachment (transcription
/// finalisée, traduction audio finalisée pour une langue). Le client
/// remplace l'attachment correspondant dans son store atomiquement.
public struct APIAttachmentUpdated: Decodable {
    public let conversationId: String
    public let messageId: String
    public let attachment: APIMessageAttachment
}
```

- [ ] **Step 3: Écrire le test du publisher**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Sockets/AttachmentUpdatedDecodingTests.swift` :

```swift
import Testing
import Foundation
@testable import MeeshySDK

@Suite("APIAttachmentUpdated decoding")
struct APIAttachmentUpdatedDecodingTests {
    @Test("decodes a full payload with transcription and translations")
    func decodesFullPayload() throws {
        let json = """
        {
          "conversationId": "conv-1",
          "messageId": "msg-1",
          "attachment": {
            "id": "att-1",
            "messageId": "msg-1",
            "type": "audio",
            "fileUrl": "https://cdn/voice.m4a",
            "originalName": "voice.m4a",
            "mimeType": "audio/m4a",
            "fileSize": 870400,
            "duration": 42000,
            "transcription": { "text": "Bonjour", "language": "fr", "confidence": 0.95 },
            "translations": {
              "en": { "url": "https://cdn/en.mp3", "transcription": "Hello", "format": "mp3" }
            },
            "createdAt": "2026-05-25T10:00:00Z"
          }
        }
        """
        let data = Data(json.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let result = try decoder.decode(APIAttachmentUpdated.self, from: data)
        #expect(result.conversationId == "conv-1")
        #expect(result.messageId == "msg-1")
        #expect(result.attachment.id == "att-1")
        #expect(result.attachment.transcription?.text == "Bonjour")
        #expect(result.attachment.translations?["en"]?.url == "https://cdn/en.mp3")
    }
}
```

- [ ] **Step 4: Lancer le test**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/APIAttachmentUpdatedDecodingTests -derivedDataPath apps/ios/Build -quiet`

Expected: ÉCHEC si `APIAttachmentUpdated` n'est pas encore committé, sinon PASS.

- [ ] **Step 5: Ajouter le publisher dans MessageSocketManager**

Dans `MessageSocketManager.swift`, ajouter à côté de `messagePublisher` :

```swift
    private let attachmentUpdatedSubject = PassthroughSubject<APIAttachmentUpdated, Never>()
    public var attachmentUpdatedPublisher: AnyPublisher<APIAttachmentUpdated, Never> {
        attachmentUpdatedSubject.eraseToAnyPublisher()
    }
```

Et dans le setup des handlers Socket.IO (chercher l'endroit où `socket.on("message:new", …)` est wiré), ajouter :

```swift
        socket.on("message:attachment-updated") { [weak self] data, _ in
            guard let self else { return }
            guard let payloadDict = data.first as? [String: Any] else { return }
            do {
                let json = try JSONSerialization.data(withJSONObject: payloadDict)
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let payload = try decoder.decode(APIAttachmentUpdated.self, from: json)
                self.attachmentUpdatedSubject.send(payload)
            } catch {
                Logger.socket.error("Failed to decode message:attachment-updated: \(error.localizedDescription)")
            }
        }
```

> Adapter le code au pattern exact du manager existant (présence d'un wrapper de décodage, gestion off-MainActor, etc.).

- [ ] **Step 6: Lancer le test**

Run: `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/APIAttachmentUpdatedDecodingTests -derivedDataPath apps/ios/Build -quiet`

Expected: PASS.

- [ ] **Step 7: Build du SDK**

Run: `xcodebuild build -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build -quiet`

Expected: BUILD SUCCEEDED.

- [ ] **Step 8: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sockets/AttachmentUpdatedDecodingTests.swift
git commit -m "feat(sdk/sockets): decode message:attachment-updated server event

Adds APIAttachmentUpdated DTO and MessageSocketManager
attachmentUpdatedPublisher. Subscribers (e.g. ConversationViewModel)
receive an atomic snapshot of the enriched attachment whenever the
gateway finalizes a transcription or audio translation."
```

---

### Task D2: Consommer `attachmentUpdatedPublisher` dans `ConversationViewModel`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- Test: ajouter une suite dans `ConversationViewModelTests.swift`

- [ ] **Step 1: Écrire le test**

Ajouter à `apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift` :

```swift
func test_handleAttachmentUpdated_replacesAttachmentAndRehydratesMetadataAtomically() async throws {
    // Arrange : ViewModel avec un message audio dont l'attachment a
    // transcription = nil initialement.
    let (sut, mockSocket) = try await makeViewModelWithBareAudioMessage()
    XCTAssertNil(sut.messageTranscriptions[mockSocket.seededMessageId])

    // Act : simuler la réception socket avec transcription enrichie
    let enriched = makeAPIAttachmentUpdated(
        conversationId: sut.conversationId,
        messageId: mockSocket.seededMessageId,
        attachmentId: mockSocket.seededAttachmentId,
        transcriptionText: "Bonjour le monde"
    )
    mockSocket.simulateAttachmentUpdated(enriched)

    // Attendre une boucle de run pour que Combine déclenche le handler
    try await Task.sleep(nanoseconds: 50_000_000)

    // Assert : la transcription est apparue dans le ViewModel
    XCTAssertEqual(
        sut.messageTranscriptions[mockSocket.seededMessageId]?.text,
        "Bonjour le monde"
    )
}
```

> Helpers `makeViewModelWithBareAudioMessage` et `makeAPIAttachmentUpdated` à ajouter aux fixtures. Le mock socket doit exposer un `simulateAttachmentUpdated(_:)` qui pousse dans le publisher.

- [ ] **Step 2: Lancer le test**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_handleAttachmentUpdated_replacesAttachmentAndRehydratesMetadataAtomically`

Expected: ÉCHEC — handler non câblé.

- [ ] **Step 3: Câbler le subscriber**

Dans `ConversationViewModel.swift`, dans la section où d'autres `Publisher` socket sont subscribed (chercher `messagePublisher.sink` ou similaire), ajouter :

```swift
        socketManager.attachmentUpdatedPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.handleAttachmentUpdated(payload)
            }
            .store(in: &cancellables)
```

Et ajouter la méthode dans le `MARK: - Socket Handlers` (ou créer la section) :

```swift
    /// Applies a server-pushed attachment delta atomically : replaces the
    /// matching attachment on the message record AND rehydrates the
    /// dependent metadata dictionaries in the same MainActor slice — same
    /// rule as the initial load (cf. loadInitialSnapshot+apply pattern).
    private func handleAttachmentUpdated(_ payload: APIAttachmentUpdated) {
        guard payload.conversationId == conversationId else { return }
        let msgId = payload.messageId

        // 1. Replace the attachment on the persisted record (GRDB) so a
        //    future open of this conversation already has the enriched
        //    metadata in cache.
        Task { [persistence = messagePersistence, attachment = payload.attachment] in
            await persistence.upsertAttachment(messageId: msgId, attachment: attachment)
        }

        // 2. Rehydrate the in-memory metadata dictionaries by reading the
        //    updated record from messageStore. We can't run hydrateMetadataFromGRDB
        //    on a stale record list, so we surgically inject the
        //    transcription + audioTranslations derived from the new attachment.
        injectAttachmentMetadata(from: payload.attachment, intoMessageId: msgId)
    }

    private func injectAttachmentMetadata(from attachment: APIMessageAttachment, intoMessageId msgId: String) {
        // Transcription
        if let t = attachment.transcription {
            let segments = (t.segments ?? []).map {
                MessageTranscriptionSegment(
                    text: $0.text, startTime: $0.startTime,
                    endTime: $0.endTime, speakerId: $0.speakerId
                )
            }
            messageTranscriptions[msgId] = MessageTranscription(
                attachmentId: attachment.id,
                text: t.transcribedText ?? t.text ?? "",
                language: t.language ?? "?",
                confidence: t.confidence,
                durationMs: t.durationMs,
                segments: segments,
                speakerCount: t.speakerCount
            )
        }
        // Audio translations
        if let translations = attachment.translations, !translations.isEmpty {
            var audios: [MessageTranslatedAudio] = []
            for (lang, trans) in translations {
                guard let url = trans.url, !url.isEmpty else { continue }
                let segments = (trans.segments ?? []).map {
                    MessageTranscriptionSegment(
                        text: $0.text, startTime: $0.startTime,
                        endTime: $0.endTime, speakerId: $0.speakerId
                    )
                }
                audios.append(MessageTranslatedAudio(
                    id: "\(attachment.id)_\(lang)",
                    attachmentId: attachment.id,
                    targetLanguage: lang,
                    url: url,
                    transcription: trans.transcription ?? "",
                    durationMs: trans.durationMs ?? 0,
                    format: trans.format ?? "mp3",
                    cloned: trans.cloned ?? false,
                    quality: trans.quality ?? 0,
                    voiceModelId: trans.voiceModelId,
                    ttsModel: trans.ttsModel ?? "xtts",
                    segments: segments
                ))
            }
            if !audios.isEmpty {
                messageTranslatedAudios[msgId] = audios
            }
        }
    }
```

> Si `MessagePersistenceActor.upsertAttachment(messageId:attachment:)` n'existe pas dans le SDK, l'ajouter ou utiliser une méthode équivalente (chercher comment `upsertFromAPIMessages` gère l'update). Au pire, ré-utiliser `upsertFromAPIMessages` avec un message synthétique qui ne contient que cet attachment.

- [ ] **Step 4: Lancer le test pour vérifier le pass**

Run: `./apps/ios/meeshy.sh test --filter ConversationViewModelTests/test_handleAttachmentUpdated`

Expected: PASS.

- [ ] **Step 5: Build complet**

Run: `./apps/ios/meeshy.sh build`

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/MeeshyTests/Unit/ViewModels/ConversationViewModelTests.swift apps/ios/MeeshyTests/Helpers/
git commit -m "feat(ios/conv): handle message:attachment-updated socket delta

ConversationViewModel subscribes to attachmentUpdatedPublisher,
upserts the enriched attachment to GRDB, and atomically injects
transcription + audio translations into the metadata dictionaries so
the open bubble lights up without a refetch."
```

---

## Lot E — QA visuelle + vérification image

### Task E1: Vérifier le badge taille sur les images non-téléchargées

**Files:**
- QA visuelle uniquement, modification éventuelle de `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` si écart constaté
- Modify `apps/ios/CLAUDE.md` (documentation)

- [ ] **Step 1: Préparer le scénario de test**

```bash
./apps/ios/meeshy.sh run
```

Dans l'app :
1. Settings → Media downloads → désactiver l'auto-DL pour images sur cellular (ou tous réseaux selon ce que les prefs permettent).
2. Forcer un mode network qui déclenche le blocage (Wi-Fi off / mode avion partiel via Network Link Conditioner).
3. Ouvrir une conversation contenant un message image récent (non encore téléchargé sur ce simulateur — clean app data si nécessaire).

- [ ] **Step 2: Vérifier visuellement**

Sur le bubble image qui n'est pas téléchargé :
- ✅ Le `centredIdleBadge` (cercle 56pt indigo + icône `arrow.down.to.line`) est visible.
- ✅ La pill noire sous le cercle affiche la taille (« 2.3 MB »).

Si ✅ sur les deux : aller à Step 4.
Si ❌ sur la pill taille : aller à Step 3.

- [ ] **Step 3: Correctif si la pill taille manque**

Lire le code de `centredIdleBadge` dans `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (lignes 116-140). Si la branche `if !totalSizeText.isEmpty` est déjà présente (ce que l'audit suggère), aucun fix n'est nécessaire — vérifier alors que la condition `totalSizeText` retourne bien quelque chose pour le cas image (logger temporairement `print("[DBG] image totalSize=\(totalSizeText) fileSize=\(attachment.fileSize)")` et relancer).

Si `attachment.fileSize` est `0` pour les images : c'est un bug d'hydratation REST côté gateway (le payload `/messages` doit retourner `fileSize` pour les images). Ouvrir une issue séparée et **ne pas bloquer cette PR** — documenter dans Step 4.

- [ ] **Step 4: Documenter le résultat dans apps/ios/CLAUDE.md**

Dans `apps/ios/CLAUDE.md`, dans la section media handling (ou créer si absente), ajouter :

```markdown
### Attachment Size Display Before Download

Conventions pour l'affichage de la taille de fichier sur un attachment non téléchargé (quand `MediaDownloadPolicyEngine.shouldAutoDownload` bloque l'auto-DL) :

| Type | Composant | Layout |
|---|---|---|
| Vidéo | `DownloadBadgeView(compact: true)` | Pill coin bas-droit avec icône + taille |
| Image | `DownloadBadgeView(compact: false)` | Cercle 56pt centré + pill taille sous |
| Audio | `AudioPlayerView.playButtonLabel` | Cercle play-button + label taille sous (parité visuelle) |

Source de vérité : `attachment.fileSize` (Int, bytes) hydraté par le payload REST `/messages` et `message:new` socket. Si la taille est 0, le label n'apparaît pas (no-op).
```

- [ ] **Step 5: Commit (même s'il n'y a pas de code)**

```bash
git add apps/ios/CLAUDE.md
git commit -m "docs(ios): document attachment-size display conventions across media types

Captures the parity established between video / image / audio bubbles
for the \"size before DL\" UX. Audio is now aligned via
AudioPlayerView.playButtonLabel (Lot A2), image was already covered by
DownloadBadgeView."
```

---

### Task E2: Smoke test global

**Files:** aucun, scénario manuel.

- [ ] **Step 1: Scénario 1 — ouverture conv avec audios transcrits**

```bash
./apps/ios/meeshy.sh run
```

- Se connecter avec compte de test (`atabeth` cf. memory).
- Ouvrir une conversation contenant au moins 3 messages audio avec transcription + traductions audio déjà finalisées en DB.
- ✅ À la première frame, les transcriptions sont visibles. Aucun pop-in « la transcription apparaît 1 seconde après ».

- [ ] **Step 2: Scénario 2 — réception live d'un audio enrichi**

- Garder la conv ouverte.
- Demander à un 2e compte (`jcharlesnm`) d'envoyer un audio.
- À l'arrivée du bubble : la transcription apparaît dans la même frame que le bubble (s'il a déjà été transcribé côté serveur avant le broadcast).

- [ ] **Step 3: Scénario 3 — enrichissement async**

- Demander au 2e compte d'envoyer un audio long (>5 secondes).
- ✅ Le bubble apparaît immédiatement sans transcription (Whisper toujours en cours).
- ✅ ~5 secondes plus tard, la transcription apparaît IN PLACE sans flash, sans saut visuel.
- ✅ ~10 secondes plus tard, les drapeaux de traductions audio apparaissent un par un dans la même UI.

- [ ] **Step 4: Scénario 4 — gate audio**

- Settings → Media downloads → couper l'auto-DL audio sur Wi-Fi (forcer le blocage).
- Ouvrir une nouvelle conv avec audios.
- ✅ Chaque bubble audio affiche la flèche `arrow.down.to.line` sur le bouton play, avec la taille (« 850 KB ») en label sous.
- ✅ Tap → l'icône devient anneau de progression, le label devient « 410 KB / 850 KB ».
- ✅ Au DL terminé → swap automatique vers le bouton play normal.

- [ ] **Step 5: Reporter les résultats**

Sortir un court rapport dans `tasks/todo.md` (créer la section si absente) :

```markdown
## Audio Instant Render + Attachment Size — QA 2026-05-25

- Scénario 1 (ouverture conv) : ✅ / ❌ — observations
- Scénario 2 (live transcribed) : ✅ / ❌ — observations
- Scénario 3 (live async enrichment) : ✅ / ❌ — observations
- Scénario 4 (audio gate) : ✅ / ❌ — observations
```

- [ ] **Step 6: Commit**

```bash
git add tasks/todo.md
git commit -m "docs(qa): record audio instant render + attachment size smoke results"
```

---

## Self-Review

### Spec coverage

| Spec section | Plan tasks |
|---|---|
| Fix 1 (hydratation atomique iOS) | Lot B (B1, B2, B3) |
| Fix 2 (sérialisation socket centralisée) | Lot C (C1, C2, C3) |
| Fix 2bis (event `message:attachment-updated`) | Lot C (C1, C4) + Lot D (D1, D2) |
| Fix 3a (AudioAvailabilityResolver) | Lot A (A3) |
| Fix 3b (wire BubbleAttachmentView) | Lot A (A4) |
| Fix 3c (label taille + enum enrichi) | Lot A (A1, A2) |
| Fix 4 (vérif image) | Lot E (E1) |
| Critères d'acceptation 1-6 | Lot E (E2) |

Tous les éléments de la spec sont couverts par au moins une tâche.

### Type consistency

- `AudioAvailability.downloading(progress:downloadedBytes:totalBytes:)` est utilisé identique dans Task A1 (définition), A2 (déstructuration dans `playButtonLabel`), A3 (construction dans `AudioAvailabilityResolver.availability`).
- `serializeAttachmentForSocket` retourne `SocketAttachment` (Task C2) qui est consommé par `_serializeAttachmentsField` (Task C3) et `emitAttachmentUpdated` (Task C4) — même type partout.
- `APIAttachmentUpdated` (Task D1) consommé tel quel par `handleAttachmentUpdated` (Task D2).
- `loadInitialSnapshot()` retourne `[MessageRecord]` (Task B1) ; `apply(records:)` accepte `[MessageRecord]` (Task B1) ; `hydrateMetadataFromGRDB(from:)` accepte `[MessageRecord]?` (Task B2).

### Placeholder scan

Aucun TBD/TODO. Quelques notes pragmatiques :
- Task A3 Step 4 : « générer 2 UUIDs » — l'engineer doit en effet les générer, c'est documenté avec la commande `uuidgen`.
- Task B1 Step 1 : « si le fixture n'existe pas, l'écrire » — c'est explicite et l'engineer a le pattern à suivre (`MessageStoreObservationHelper.swift`).
- Task C4 Step 1 et Step 6 : l'engineer doit grep les call sites enrichissement async + adapter — la liste typique est donnée (3 fichiers/handlers).
- Task D1 Step 5 : l'engineer doit adapter au pattern exact du manager existant — la convention est expliquée (Logger.socket.error, PassthroughSubject).

Aucun « add appropriate error handling » ou « similar to Task N » vague. Le code est donné inline partout.

### Scope check

Un seul thème cohérent (audio instant render + tailles attachment), 3 couches mais chacune nécessaire au critère d'acceptation « pas de pop-in ouverture + temps réel ». Pas de décomposition en sous-projets nécessaire.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-audio-instant-render-and-attachment-size-plan.md`.**

**Two execution options :**

1. **Subagent-Driven (recommended)** — Je dispatche un fresh subagent par task, review entre les tasks, itération rapide.

2. **Inline Execution** — Exécution en batches dans cette session via `superpowers:executing-plans`, checkpoints à chaque fin de Lot.

**Quelle approche ?**
