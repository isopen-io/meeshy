import XCTest
@testable import Meeshy

/// Garde contre le crash device n°1 de Meeshy : `EXC_BREAKPOINT` sur le thread
/// `com.apple.photos.requestAVAsset`, dans
/// `closure #1 in closure #1 in RecentMediaStripModel.resolveVideo(_:)`.
/// Sept occurrences sur iPhone 16 Pro Max, builds 1201 → 1235 (29/06 → 11/07) :
/// toucher une vidéo du strip d'échantillons photothèque tuait l'app.
///
/// Mécanique — la cible compile sous isolation MainActor par défaut, donc une
/// closure écrite en littéral trailing dans une méthode de cette classe
/// `@MainActor` hérite de `@MainActor`. Swift 6 émet alors une assertion
/// d'isolation dynamique (`swift_task_isCurrentExecutor`) dans le PROLOGUE de
/// la closure — elle trappe dès que PhotoKit l'appelle depuis sa queue, avant
/// que le corps ne s'exécute. Emballer le corps dans `Task { @MainActor in }`
/// ne sert à rien : le piège est à l'entrée.
///
/// `PHImageManager.h` documente mot pour mot les handlers vidéo — « The result
/// handler is called on an arbitrary queue » — donc `requestAVAsset` et
/// `requestPlayerItem` trappaient systématiquement. Les handlers image sont
/// documentés main-thread, mais portent le même prologue latent : un
/// `deliveryMode = .opportunistic` (que le header autorise à rappeler
/// « synchronously on the calling thread ») suffirait à l'armer.
///
/// Seul correctif qui casse l'inférence : un local explicitement typé
/// `@Sendable`, passé via `resultHandler:` — jamais un littéral trailing.
/// Même correctif, même raison, que `CallTranscriptionService.requestPermission()`
/// (crash Meeshy-2026-07-11-020237.ips).
///
/// Vérifié binairement : sur l'ancien code, le désassemblage arm64 comptait 13
/// symboles `RecentMediaStripModel` porteurs d'un `isCurrentExecutor` ; après
/// correctif, 8 — les 5 disparus sont exactement les cinq callbacks PhotoKit
/// échappants. Ce test épingle la forme source qui produit ce résultat.
final class PhotoKitCallbackIsolationGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Components
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func occurrences(of needle: String, in source: String) -> Int {
        source.components(separatedBy: needle).count - 1
    }

    /// Chaque appel `PHImageManager` doit recevoir son handler par
    /// `resultHandler:` depuis un local `@Sendable` — jamais en trailing
    /// closure, forme qui hérite de `@MainActor`. L'égalité des trois compteurs
    /// est ce qui rend le fichier queue-agnostique : ajouter un sixième appel
    /// sans son local casse ce test.
    func test_recentMediaStrip_everyPhotoKitRequest_passesAnExplicitlySendableHandler() throws {
        let src = try source("Meeshy/Features/Main/Components/RecentMediaStrip.swift")

        let requests = occurrences(of: "imageManager.request", in: src)
        XCTAssertGreaterThan(requests, 0, "Le strip doit toujours interroger PhotoKit — marqueur introuvable")
        XCTAssertEqual(
            occurrences(of: "resultHandler: completion", in: src), requests,
            "Chaque appel PhotoKit doit passer `resultHandler:` — une trailing closure hérite de @MainActor et trappe sur la queue PhotoKit"
        )
        XCTAssertEqual(
            occurrences(of: "let completion: @Sendable", in: src), requests,
            "Chaque handler PhotoKit doit venir d'un local explicitement typé `@Sendable`"
        )
    }

    /// Une closure `@Sendable` par callback PhotoKit : thumbnail, preview,
    /// videoPlayerItem, resolveImage, resolveVideo.
    func test_recentMediaStrip_declaresOneSendableCompletionPerPhotoKitCallback() throws {
        let src = try source("Meeshy/Features/Main/Components/RecentMediaStrip.swift")

        XCTAssertEqual(
            occurrences(of: "let completion: @Sendable", in: src), 5,
            "Les 5 callbacks PhotoKit (thumbnail, preview, videoPlayerItem, resolveImage, resolveVideo) doivent chacun passer par un local `@Sendable`"
        )

        XCTAssertTrue(
            src.contains("let completion: @Sendable (AVAsset?, AVAudioMix?, [AnyHashable: Any]?) -> Void"),
            "resolveVideo — le site du crash — doit déclarer son handler `@Sendable`"
        )
        XCTAssertTrue(
            src.contains("let completion: @Sendable (AVPlayerItem?, [AnyHashable: Any]?) -> Void"),
            "videoPlayerItem est documenté « arbitrary queue » au même titre que requestAVAsset"
        )
    }

    /// Le correctif jumeau déjà en place côté transcription : s'il régresse, le
    /// même crash revient sur la queue TCC.
    func test_callTranscription_requestPermission_keepsItsSendableCompletion() throws {
        let src = try source("Meeshy/Features/Main/Services/CallTranscriptionService.swift")
        XCTAssertTrue(
            src.contains("let completion: @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void"),
            "SFSpeechRecognizer.requestAuthorization rappelle hors MainActor — le handler doit rester `@Sendable`"
        )
        XCTAssertFalse(
            src.contains("SFSpeechRecognizer.requestAuthorization {"),
            "Une trailing closure ici hérite de @MainActor et trappe (crash Meeshy-2026-07-11-020237.ips)"
        )
    }
}
