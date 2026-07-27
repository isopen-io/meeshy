// packages/MeeshySDK/Tests/MeeshyUITests/Story/Offline/StoryPublishHandlerSingleWriterTests.swift
import XCTest
@testable import MeeshyUI

/// `StoryPublishQueue.shared.onPublish` n'admet qu'UN écrivain : le service qui
/// parle réellement au serveur (`StoryPublishService.registerPublishHandler`).
///
/// `StoryOfflineQueueBootstrap` en posait un second. Les deux visaient la même
/// propriété — depuis l'unification des files du 2026-05-12, `StoryOfflineQueue`
/// n'est plus qu'un adaptateur dont le `publishQueue` EST
/// `StoryPublishQueue.shared` — et `setPublishHandler` réaffecte sans condition.
///
/// Le handler du bootstrap ne publiait rien : il ré-enfilait l'item sous un
/// nouveau `tempStoryId` puis annonçait un succès. La file supprimait alors
/// l'original ET ses médias locaux ; le doublon, qui pointait sur ces mêmes
/// fichiers, échouait plus tard en `missingLocalMedia`. Une story composée hors
/// ligne était donc perdue APRÈS avoir affiché « Story enfin publiée ».
///
/// La course était gagnable par le mauvais côté : ce bootstrap part du `.task`
/// racine de l'app, avant toute authentification, quand `StoryPublishService`
/// attend le montage de `RootView` — et `setPublishHandler` déclenche un drain
/// immédiat quand des items attendent déjà.
///
/// La garde est une analyse de SOURCE parce que l'invariant porte sur le
/// câblage de démarrage : le reproduire à l'exécution demanderait de rejouer
/// l'ordre de boot complet de l'app, singletons compris.
final class StoryPublishHandlerSingleWriterTests: XCTestCase {

    func test_bootstrapDoesNotRegisterItsOwnPublishHandler() throws {
        let source = try String(contentsOfFile: Self.bootstrapPath, encoding: .utf8)
        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        XCTAssertFalse(code.contains("setOnPublish"),
                       "Le bootstrap réenregistre un handler de publication : il écrasera celui " +
                       "de StoryPublishService et la story sera perdue en étant annoncée publiée.")
    }

    /// Ce que le bootstrap doit CONSERVER : vider la file au retour du réseau.
    /// Retirer le handler ne devait pas emporter cette responsabilité-là.
    func test_bootstrapStillFlushesOnReconnect() throws {
        let source = try String(contentsOfFile: Self.bootstrapPath, encoding: .utf8)

        XCTAssertTrue(source.contains("NetworkMonitor.shared.$isOffline"),
                      "Le bootstrap doit continuer d'observer le réseau.")
        XCTAssertTrue(source.contains("flush()"),
                      "…et de vider la file quand la connexion revient.")
    }

    private static var bootstrapPath: String {
        // …/Tests/MeeshyUITests/Story/Offline/ → …/Sources/MeeshyUI/Story/
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Offline
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryOfflineQueueBootstrap.swift")
            .path
    }
}
