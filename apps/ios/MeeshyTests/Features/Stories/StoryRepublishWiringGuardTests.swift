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

    /// `StoryViewModel` s'est scindé en plusieurs fichiers (#4425) : ce chemin
    /// précis passe par l'UNITÉ (`AppSourceGuard.storyViewModelSource`), sinon
    /// l'invariant 3 ci-dessous (`repostOfId` jamais figé à `nil`) cesserait de
    /// mesurer quoi que ce soit le jour où `createStory` migre vers un fichier
    /// frère. Les deux autres chemins lus par ce helper
    /// (`StoryViewerView+Sidebar.swift`, `StoryViewerView.swift`) continuent
    /// de lire leur fichier tel quel.
    private func source(_ relativePath: String) throws -> String {
        if relativePath == AppSourceGuard.storyViewModelPath {
            return try AppSourceGuard.storyViewModelSource()
        }
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

    // MARK: - 1bis. Envoyer et Republier vivent au RAIL, plus dans le menu (...)

    /// Le porteur a retiré du menu (…) « Envoyer », « Republier en post » et
    /// « Citer en post » (#9953). Republier et transférer ne disparaissent
    /// pas : le rail garde « Envoyer » (qui transfère n'importe où dans l'app)
    /// et « Republier », dont le composeur offre l'éventail story / post.
    func test_sendAndRepublish_stayOnTheRail_andLeftTheMenu() throws {
        let sidebar = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"))
        XCTAssertTrue(sidebar.contains("story.viewer.action.send"), "« Envoyer » reste au rail.")
        XCTAssertTrue(sidebar.contains("sharedContentWrapper = SharedContentWrapper(content: .story("))
        XCTAssertTrue(sidebar.contains("republishStorySource = RepostPostSourceWrapper("), "« Republier » reste au rail.")

        let header = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/StoryViewerView+Header.swift"))
        for key in ["story.viewer.repostAsPost", "story.viewer.editAndRepostAsPost", "story.viewer.share.internal"] {
            XCTAssertFalse(header.contains(key), "\(key) a quitté le menu (…) — #9953")
        }
    }

    // MARK: - 2. L'audience est plafonnée

    /// **Le plafond a rejoint l'HYDRATATION** (#5053, 2026-09-06).
    ///
    /// La présentation posait `allowedVisibilities:` et construisait le
    /// ViewModel de repost côté `StoryViewerView`. Les deux vivent désormais
    /// dans `ComposerHydration` — « un seul paramètre pour deux choses (quel
    /// contenu reprendre, quelle audience il autorise) parce que les séparer
    /// aurait permis d'en passer une sans l'autre, c'est-à-dire de republier
    /// SANS PLAFOND, silencieusement ».
    ///
    /// > Le déménagement RENFORCE la loi que ce témoin garde : elle n'est plus
    /// > à reposer sur chaque présentation, elle est portée par le type que
    /// > toute republication doit passer. La garde suit donc le site qui la
    /// > DÉCIDE, et non plus celui qui la recopiait.
    func test_composerPresentation_capsTheAudienceWithTheSharedLaw() throws {
        let hydration = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Composer/ComposerHydration.swift"))

        XCTAssertTrue(
            hydration.contains("StoryRepostAudience.allowed(fromRawValue: story.visibility)"),
            "La republication doit plafonner le sélecteur d'audience par la loi — même audience ou " +
            "plus restreinte. Le plafond est une affordance, mais une affordance dont l'absence " +
            "transforme un refus serveur en échec inexpliqué au moment de publier."
        )
        XCTAssertTrue(
            hydration.contains("case .editingStory:") && hydration.contains("return nil"),
            "… et l'ÉDITION rend `nil` : le ViewModel hydraté porte sa propre visibilité initiale, " +
            "et en poser une seconde ici ferait deux sources pour une même valeur."
        )

        let host = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(
            host.contains("StoryComposerViewModel(reposting: story, authorHandle: authorHandle)"),
            "Le composeur doit être construit par l'initialiseur de repost, qui " +
            "préremplit la slide source et verrouille le badge d'attribution."
        )
    }

    // MARK: - 3. repostOfId descend jusqu'à la publication

    func test_repostOfId_travelsAllTheWayToPublication_neverHardcodedNil() throws {
        // **La republication est passée au COMPOSER** (2026-09-06). Le geste
        // partait de `StoryViewerView`, qui posait `repostOfId: wrapper.story.id`
        // au moment de publier ; il passe désormais par `StoryRepublishComposer`,
        // qui porte le même id sous le nom de sa propre source
        // (`repostOfId: source.story.id`). L'invariant n'a pas bougé d'un pouce —
        // la publication d'une republication porte l'id de l'original — mais le
        // site qui l'honore a changé, et la garde lisait l'ancien.
        //
        // > Une garde qui nomme un FICHIER mesure une géographie, pas une règle.
        // > Celle-ci nomme désormais le site qui DÉCIDE, et son message dit quoi
        // > chercher si le geste déménage encore.
        let composer = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Composer/StoryRepublishComposer.swift"))
        XCTAssertTrue(
            composer.contains("repostOfId: source.story.id"),
            "La publication de la republication doit porter l'id de l'original. Si ce site n'est plus "
                + "celui qui republie, chercher qui pose `repostOfId` sur le chemin de la scène — jamais "
                + "retirer cette garde : c'est elle qui a attrapé les republications orphelines."
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
