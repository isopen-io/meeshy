import XCTest
@testable import Meeshy

/// Garde de source sur le CÂBLAGE de la republication de story.
///
/// Ce que la demande produit exige (2026-08-19) : « Il faut permettre la
/// republication de story ! Actuellement on a le partage mais il faut plutôt
/// mettre la republication (ça ouvre le story composeur permettant d'ajouter
/// plus du texte). »
///
/// Ce câblage n'est pas exerçable par un test unitaire : il vit dans des
/// closures SwiftUI d'un `fullScreenCover` et d'un bouton de rail, sans harnais
/// de rendu dans ce bundle. Il porte en revanche trois invariants qu'un refactor
/// pourrait défaire en silence, et dont l'absence est précisément l'état d'AVANT
/// ce lot — donc des témoins qui discriminent :
///
/// 1. Le rail OUVRE le composeur ; il ne republie plus d'un tap côté serveur.
///    L'ancien chemin appelait `PostService.shared.repost` directement : la
///    story repartait à l'identique, sans texte ajouté ni choix d'audience.
/// 2. Le sélecteur d'audience du composeur est PLAFONNÉ par la loi
///    (`StoryRepostAudience`) — même audience ou plus restreinte, jamais plus
///    large.
/// 3. `repostOfId` descend jusqu'à la publication. Il valait `nil` en dur
///    depuis l'écriture du composeur de repost : la « Phase C » annoncée par sa
///    docstring n'avait jamais été faite, si bien qu'une republication naîtrait
///    sans lien vers son original — donc sans attribution ni crédit de vues.
@MainActor
final class StoryRepublishWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Features/Stories
            .deletingLastPathComponent()   // .../Features
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - 1. Le rail ouvre le composeur

    func test_railRepostButton_opensTheComposer_andNoLongerRepostsInOneTap() throws {
        let sidebar = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"))

        XCTAssertTrue(
            sidebar.contains("republishStorySource = RepostPostSourceWrapper("),
            "Le bouton de republication du rail doit OUVRIR le composeur en posant " +
            "`republishStorySource` — c'est la demande produit du 2026-08-19."
        )
        XCTAssertFalse(
            sidebar.contains("PostService.shared.repost("),
            "Le rail ne doit plus republier d'un tap côté serveur : ce chemin ne " +
            "laissait ni ajouter de texte ni choisir l'audience."
        )
    }

    /// Le libellé annonçait « Partager » pour une action de republication —
    /// source directe de la confusion signalée par l'utilisateur.
    func test_railRepostButton_isLabelledRepublish_notShare() throws {
        let sidebar = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"))
        guard let range = sidebar.range(of: "story.viewer.action.repost") else {
            return XCTFail("clé de libellé du bouton de republication introuvable")
        }
        let tail = String(sidebar[range.lowerBound...].prefix(120))
        XCTAssertTrue(
            tail.contains("defaultValue: \"Republier\""),
            "Le repli du libellé doit dire « Republier », pas « Partager » — l'action " +
            "republie, elle ne transmet pas. Trouvé : \(tail)"
        )
    }

    // MARK: - 2. L'audience est plafonnée

    func test_composerPresentation_capsTheAudienceWithTheSharedLaw() throws {
        let viewer = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView.swift"))

        XCTAssertTrue(
            viewer.contains("allowedVisibilities: StoryRepostAudience.allowed(fromRawValue:"),
            "La présentation du composeur de republication doit plafonner le " +
            "sélecteur d'audience par la loi — même audience ou plus restreinte."
        )
        XCTAssertTrue(
            viewer.contains("StoryComposerViewModel(") && viewer.contains("reposting:"),
            "Le composeur doit être construit par l'initialiseur de repost, qui " +
            "préremplit la slide source et verrouille le badge d'attribution."
        )
    }

    // MARK: - 3. repostOfId descend jusqu'à la publication

    func test_repostOfId_travelsAllTheWayToPublication_neverHardcodedNil() throws {
        let viewer = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView.swift"))
        XCTAssertTrue(
            viewer.contains("repostOfId: wrapper.story.id"),
            "La publication de la republication doit porter l'id de l'original."
        )

        let viewModel = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/ViewModels/StoryViewModel.swift"))
        XCTAssertTrue(
            viewModel.contains("repostOfId: upload.repostOfId"),
            "`createStory` doit lire `repostOfId` sur l'état d'upload — il valait " +
            "`nil` en dur, ce qui produisait des republications orphelines."
        )
        XCTAssertFalse(
            viewModel.contains("repostOfId: nil,"),
            "Plus aucun `repostOfId: nil` en dur sur le chemin de publication : " +
            "c'est ce qui rendait la « Phase C » inopérante."
        )
    }
}
