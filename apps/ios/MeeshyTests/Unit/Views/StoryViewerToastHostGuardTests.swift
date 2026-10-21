import XCTest

/// **Le lecteur de story affiche ses propres retours** (#4876).
///
/// Il en lève six — deux confirmations et **quatre refus** — et il est présenté
/// en `fullScreenCover`. L'hôte qui les rend était monté sur la racine, qu'un
/// `fullScreenCover` recouvre : les six se levaient derrière l'écran.
///
/// > Un refus muet ne se lit pas « ça a échoué » mais « le bouton ne marche
/// > pas » — et l'utilisateur recommence. Le geste était juste, à la bonne
/// > place, avec sa raison écrite ; c'est la couche d'AFFICHAGE qui le rendait
/// > sans effet.
///
/// Ce témoin garde le LIEN, pas le message. Un toast levé par un site que plus
/// personne n'affiche ne rougit nulle part : le manager reçoit l'appel, la vue
/// existe, et rien ne se voit.
final class StoryViewerToastHostGuardTests: XCTestCase {

    private static let containerPath = "Meeshy/Features/Main/Views/StoryViewerContainer.swift"
    private static let viewerPath = "Meeshy/Features/Main/Views/StoryViewerView.swift"

    func test_leConteneurMonteLHoteDesRetours() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.containerPath))
        XCTAssertTrue(
            source.contains(".feedbackToastOverlay()"),
            "`StoryViewerContainer` doit monter l'hôte des toasts : il est le point de montage UNIQUE "
                + "du lecteur, et un `fullScreenCover` recouvre l'overlay de la racine (#4876)."
        )
    }

    /// **Garde d'aveuglement, et elle porte la RAISON du témoin ci-dessus.**
    ///
    /// Si le lecteur cessait un jour de lever des toasts, le modificateur
    /// deviendrait inutile et sa disparition serait légitime. Tant qu'il en
    /// lève, elle ne l'est pas. Le témoin mesure donc les deux moitiés du lien —
    /// sans quoi il garderait un modificateur sans savoir pourquoi.
    func test_leLecteurLeveBienDesRetoursAAfficher() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.viewerPath))
        let appels = source.components(separatedBy: "FeedbackToastManager.shared").count - 1
        XCTAssertGreaterThan(
            appels, 0,
            "Le lecteur ne lève plus aucun retour — si c'est voulu, `feedbackToastOverlay()` peut "
                + "partir avec, et ce témoin doit être retiré en connaissance de cause."
        )
    }

    // MARK: - UN lecteur, quel que soit le point d'appel (#11197)

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    /// Les fichiers de l'app dont le CODE (commentaires retirés) contient `needle`.
    private static func appFiles(containing needle: String) throws -> [String] {
        let meeshy = appRoot.appendingPathComponent("Meeshy")
        let files = FileManager.default.enumerator(at: meeshy, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" } ?? []
        return try files
            .filter { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)).contains(needle) }
            .map(\.lastPathComponent)
            .sorted()
    }

    /// **Le lecteur se monte à UN seul endroit.** Six `fullScreenCover`
    /// recopiaient `StoryViewerContainer(` et cinq portes de composer
    /// `StoryViewerView(` : les copies avaient divergé (pas de « Répondre »
    /// depuis les favoris, pastille de synchronisation sous l'en-tête depuis la
    /// conversation). Les points d'appel décrivent une `StoryViewerRequest` ou
    /// des `StoryPreviewAssets` ; seul ce fichier en fait un lecteur.
    func test_leLecteurNeSeMonteQueDansSonConteneur() throws {
        XCTAssertEqual(try Self.appFiles(containing: "StoryViewerContainer("), ["StoryViewerContainer.swift"],
                       "Un point d'appel monte sa propre copie du lecteur : passer par `StoryReaderCover`.")
        XCTAssertEqual(try Self.appFiles(containing: "StoryViewerView("), ["StoryViewerContainer.swift"],
                       "Un aperçu monte sa propre copie du lecteur : passer par `StoryPreviewReaderCover`.")
    }

    /// Le couvercle unique pose ce que chaque copie oubliait tour à tour.
    func test_leCouvercleUniquePorteCeQueLesCopiesOubliaient() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.containerPath))
        XCTAssertTrue(source.contains(".environment(\\.isStoryViewerPresenting, true)"))
        XCTAssertTrue(source.contains("onReplyToStory: replyHandler"))
        XCTAssertTrue(source.contains("initialStoryIndex: presented.initialStoryIndex"))
    }
}
