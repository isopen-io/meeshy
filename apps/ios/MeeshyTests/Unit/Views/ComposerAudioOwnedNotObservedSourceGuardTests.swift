import XCTest
@testable import Meeshy

/// **Un gestionnaire à haute cadence est POSSÉDÉ par la racine, OBSERVÉ par la
/// seule vue qui le dessine** (#6226).
///
/// `AudioPlaybackManager` publie sa progression toutes les 100 ms. La racine
/// de conversation fait 2 911 lignes et n'en dessine qu'une chose : la tuile
/// d'une pièce jointe audio en attente, qui montre « lecture » ou « pause ».
/// Tant que la racine déclare le lecteur en `@StateObject`, toute lecture d'un
/// vocal du composeur la réévalue dix fois par seconde — et rappelle
/// `updateUIViewController` du pont de liste à chaque passe.
///
/// La décision était déjà prise deux lignes plus haut, pour l'enregistreur :
/// « POSSÉDÉ, PAS OBSERVÉ — le vumètre publie vingt fois par seconde et la
/// racine n'en lit aucune valeur ». `ComposerAudioHost` en est l'unique
/// observateur. Le lecteur n'avait jamais reçu le même traitement.
///
/// **Le canton n'est pas optionnel ici.** Contrairement au coordinateur de
/// réels, la racine LIT bien `isPlaying` — dans `audioTileFallback`. Passer
/// simplement en `@State` sans extraire la tuile figerait son icône à l'état
/// où elle est née : un défaut de CORRECTION, pire que la lenteur qu'il
/// corrige. C'est la moitié que le relevé d'audit avait manquée.
final class ComposerAudioOwnedNotObservedSourceGuardTests: XCTestCase {

    private func viewsRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func strippedSource(_ fileName: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: viewsRoot().appendingPathComponent(fileName), encoding: .utf8)
        )
    }

    func test_theConversationRootOwnsThePendingAudioPlayerWithoutObservingIt() throws {
        let code = try strippedSource("ConversationView.swift")
        XCTAssertFalse(
            code.contains("@StateObject var pendingAudioPlayer"),
            "La racine de conversation ne doit pas OBSERVER le lecteur du composeur : il publie sa progression à 10 Hz et elle n'en dessine qu'une tuile (#6226)."
        )
        XCTAssertTrue(
            code.contains("@State var pendingAudioPlayer"),
            "La racine doit POSSÉDER le lecteur en `@State` — même décision que `audioRecorder`, deux lignes plus haut (#6226)."
        )
    }

    /// **Le pendant : la tuile qui DESSINE l'état de lecture l'observe.**
    ///
    /// Sans cet abonné, l'icône play/pause resterait figée et les barres du
    /// vumètre garderaient leur opacité de naissance. Un correctif dont la
    /// valeur n'atteint aucun lecteur n'a corrigé personne ; ici, pire, il
    /// retirerait un lecteur qui existait.
    func test_thePendingAudioTileObservesThePlayerItDraws() throws {
        let code = try strippedSource("ConversationView+ComposerAttachments.swift")
        XCTAssertTrue(
            code.contains("@ObservedObject var player: AudioPlaybackManager"),
            "La tuile d'un audio en attente DOIT observer le lecteur : c'est elle qui rend « lecture » ou « pause » (#6226)."
        )
        XCTAssertFalse(
            code.contains("let isPlaying = pendingAudioPlayer.isPlaying"),
            "L'état de lecture ne doit plus être lu depuis le corps de la racine : c'est cette lecture qui l'abonnait au lecteur (#6226)."
        )
    }
}
