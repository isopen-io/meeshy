import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

/// #6700 — **ÉDITER UNE STORY OUVRE LE MEUBLE, PAS L'ANCIEN ÉDITEUR.**
///
/// Constat porteur (2026-09-15) : « le système utilise encore l'ancien composer
/// au lieu du nouveau ». Mesuré : les CINQ hôtes qui offrent « Modifier »
/// montaient `EditPostSheet` sans jamais regarder le TYPE du post, alors que
/// `post.isStory` existe et sert déjà à leur affichage.
///
/// Ces témoins INSTANCIENT la décision et observent sa valeur. Ils ne lisent
/// aucune source — sauf la garde de CÂBLAGE, qui n'a pas d'autre prise : une
/// décision juste que personne n'appelle n'ouvre aucun écran (c'est le défaut
/// que ce lot corrige, pris par l'autre bout).
final class PostEditRouteTests: XCTestCase {

    private func post(type: String) -> FeedPost {
        FeedPost(id: "p-1", author: "ada", authorId: "u-1", type: type, content: "…")
    }

    // MARK: - La décision

    func test_uneStory_ouvreLeMeuble() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "STORY"), hasStoryComposer: true), .meuble)
    }

    func test_unPost_gardeLAncienEditeur() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "POST"), hasStoryComposer: true), .legacySheet)
    }

    func test_unReel_gardeLAncienEditeur() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "REEL"), hasStoryComposer: true), .legacySheet)
    }

    /// Le type est celui que le SERVEUR sert, en minuscules comprises — la même
    /// lecture que `FeedPost.isStory`, jamais une comparaison à part.
    func test_leTypeSeLitCommeIsStory_casseIndifferente() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "story"), hasStoryComposer: true), .meuble)
    }

    // MARK: - La DÉGRADATION, jamais un piège

    /// Sans `StoryViewModel` dans l'environnement — le cas des feuilles qui ne
    /// portent pas les objets de la racine — la porte retombe sur l'ancien
    /// éditeur au lieu de trapper. C'est le contrat de
    /// `SocialChromeEnvironment` (`nil` DÉGRADE), et la classe de crash que
    /// `SheetEnvironmentObjectGuardTests` garde.
    func test_sansCompositeurDansLEnvironnement_uneStoryRetombeSurLAncienEditeur() {
        XCTAssertEqual(PostEditRoute.resolve(for: post(type: "STORY"), hasStoryComposer: false), .legacySheet)
    }

    func test_sansPost_aucuneRouteNeSInvente() {
        XCTAssertEqual(PostEditRoute.resolve(for: nil, hasStoryComposer: true), .legacySheet)
    }

    // MARK: - Le CÂBLAGE : les cinq portes consultent la décision

    func test_lesCinqPortes_consultentLaDecision() throws {
        for chemin in [
            "Meeshy/Features/Main/Views/PostDetailView.swift",
            "Meeshy/Features/Main/Views/FeedView.swift",
            "Meeshy/Features/Main/Views/ProfileUserPostsList.swift",
            "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
            "Meeshy/Features/Main/Views/RootViewComponents.swift",
        ] {
            let texte = try MyStoriesSourceCorpus.text(of: chemin)
            XCTAssertTrue(
                texte.contains(".postEditCover("),
                "\(chemin) : cette porte monte encore l'ancien éditeur sans regarder le type du post."
            )
        }
    }
    // MARK: - #9178 — le TYPE d'une publication éditée

    /// **La cause du « réel qui devient un post ».** `FeedMedia.duration` est en
    /// SECONDES (`APIPost` divise par 1 000) ; la feuille la lisait comme des
    /// millisecondes, si bien qu'une vidéo de 30 s pesait « 30 ms » sous le
    /// plancher de 3 000 ms — et l'ouverture rebasculait le réel en POST.
    @MainActor
    func test_laDureeDUnMediaEdite_estConvertieEnMillisecondes() {
        let video = EditablePostMedia(FeedMedia.video(duration: 30))
        XCTAssertEqual(video.durationMs, 30_000)
        XCTAssertTrue(ReelComposition.qualifiesAsReel(
            mediaKinds: [(kind: video.feedMediaType, durationMs: video.durationMs)]))
    }

    func test_lOuverture_restaureLeTypeDOrigine_exactement() {
        XCTAssertEqual(PostEditTypeChoice.initialType(originalType: "REEL"), "REEL")
        XCTAssertEqual(PostEditTypeChoice.initialType(originalType: "reel"), "REEL")
        XCTAssertEqual(PostEditTypeChoice.initialType(originalType: "POST"), "POST")
        XCTAssertEqual(PostEditTypeChoice.initialType(originalType: nil), "POST")
    }

    /// Le serveur a accepté ce réel : tant que l'auteur n'a rien retiré, la
    /// feuille ne le juge pas plus sévèrement que lui (durée inconnue, corpus
    /// hérité).
    func test_unReelIntact_resteChoisissable_memeSiLaCompositionNeSeJugePasIci() {
        XCTAssertTrue(PostEditTypeChoice.reelIsChoosable(
            originalType: "REEL", remainingQualifies: false, removedAny: false))
        XCTAssertFalse(PostEditTypeChoice.reelIsChoosable(
            originalType: "REEL", remainingQualifies: false, removedAny: true))
        XCTAssertTrue(PostEditTypeChoice.reelIsChoosable(
            originalType: "POST", remainingQualifies: true, removedAny: false))
        XCTAssertFalse(PostEditTypeChoice.reelIsChoosable(
            originalType: "POST", remainingQualifies: false, removedAny: false))
    }

    func test_unRetraitQuiDequalifie_imposeLePost_sansToucherAuReste() {
        XCTAssertEqual(PostEditTypeChoice.selection("REEL", reelIsChoosable: false), "POST")
        XCTAssertEqual(PostEditTypeChoice.selection("REEL", reelIsChoosable: true), "REEL")
        XCTAssertEqual(PostEditTypeChoice.selection("POST", reelIsChoosable: false), "POST")
    }

    /// **Le sélecteur est TOUJOURS offert, le réel refusé l'est AVEC sa raison**
    /// — la règle de `ComposerFormatAvailability`, jamais une jumelle.
    func test_leSelecteur_offreLesDeuxTypes_etDitPourquoiLeReelEstRefuse() {
        let refuse = PostEditTypeChoice.verdicts(reelIsChoosable: false)
        XCTAssertEqual(refuse.map(\.format), [.post, .reel])
        XCTAssertEqual(refuse.map(\.isChoosable), [true, false])
        XCTAssertEqual(refuse.last?.reason,
                       ComposerFormatAvailability.reason(for: .reel, carriesMoreThanText: true))
        XCTAssertEqual(PostEditTypeChoice.verdicts(reelIsChoosable: true).map(\.isChoosable), [true, true])
    }

    private func canvas(scenes: Int, layout: MosaicLayoutMode? = nil) -> StoryEffects {
        var effects = StoryEffects()
        effects.canvasV3 = CanvasV3(scenes: (0..<scenes).map { SceneV3(id: "s\($0 + 1)", objects: []) },
                                    layout: layout)
        return effects
    }

    /// **L'agencement d'un POST se change à l'édition** — offert exactement là
    /// où `ComposerMosaicChoice` l'offre à la création : plusieurs scènes, un
    /// post.
    func test_lAgencement_nEstOffertQuAUnPostDePlusieursScenes() {
        XCTAssertTrue(PostEditTypeChoice.offersLayout(selectedType: "POST", effects: canvas(scenes: 2), removedAny: false))
        XCTAssertFalse(PostEditTypeChoice.offersLayout(selectedType: "REEL", effects: canvas(scenes: 2), removedAny: false))
        XCTAssertFalse(PostEditTypeChoice.offersLayout(selectedType: "POST", effects: canvas(scenes: 1), removedAny: false))
        XCTAssertFalse(PostEditTypeChoice.offersLayout(selectedType: "POST", effects: nil, removedAny: false))
        XCTAssertFalse(PostEditTypeChoice.offersLayout(selectedType: "POST", effects: canvas(scenes: 2), removedAny: true))
    }

    func test_changerLAgencement_reecritLeSeulLayout_etGardeLesScenes() throws {
        let origine = canvas(scenes: 3, layout: .carousel)
        let edite = try XCTUnwrap(PostEditTypeChoice.effects(origine, layout: .wave))
        XCTAssertEqual(edite.canvasV3?.layout, .wave)
        XCTAssertEqual(edite.canvasV3?.scenes.map(\.id), origine.canvasV3?.scenes.map(\.id))
        XCTAssertNil(PostEditTypeChoice.effects(StoryEffects(), layout: .wave))
    }
}
