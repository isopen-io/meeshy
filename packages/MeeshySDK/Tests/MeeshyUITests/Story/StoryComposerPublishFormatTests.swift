import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// V3-3 — **le format choisi voyage jusqu'au hand-off.**
///
/// L'atelier ne décide de rien : c'est l'hôte qui sait sous quel type publier.
/// Mais l'atelier est le seul à tenir le paquet (rabattement des effets du
/// canvas, visibilité, langue), donc c'est par lui que le format doit passer.
///
/// Deux porteurs, et ce n'est pas un doublon — c'est une conséquence mesurée du
/// cycle de vie SwiftUI :
///
/// - la FLÈCHE de l'atelier lit `publishTargetType`, propriété relue à chaque
///   rendu du corps, donc fraîche au moment du tap ;
/// - la TÉLÉCOMMANDE apporte le sien, parce que le corps armé est capturé une
///   fois pour toutes au montage (`onAppear`) : une propriété lue depuis ce
///   corps serait celle du montage, et le meuble publierait le format qu'il
///   offrait à l'ouverture.
///
/// `publishedType(requested:atelier:)` est l'arbitrage, en règle pure — la vue
/// n'est pas hostable en XCTest.
@MainActor
final class StoryComposerPublishFormatTests: XCTestCase {

    // MARK: - L'arbitrage entre les deux porteurs

    func test_withoutAnyPress_theAtelierOwnFormatPublishes() {
        XCTAssertEqual(
            StoryComposerView.publishedType(requested: nil, atelier: .story), .story,
            "La flèche de l'atelier publie sous le format que l'hôte lui a posé."
        )
        XCTAssertEqual(
            StoryComposerView.publishedType(requested: nil, atelier: .post), .post,
            "…y compris quand cet hôte a un éventail : la propriété est relue à chaque rendu."
        )
    }

    /// Le geste tranche : il est le seul des deux à ne pas pouvoir être périmé.
    func test_aPressCarriesItsOwnFormat_andWins() {
        XCTAssertEqual(
            StoryComposerView.publishedType(requested: .reel, atelier: .story), .reel,
            "Le format mesuré AU MOMENT DU GESTE prime sur celui capturé au montage."
        )
    }

    // MARK: - Ce que la télécommande transporte

    func test_anUnpressedTrigger_carriesNoFormat() {
        XCTAssertNil(ComposerPublishTrigger().requestedTargetType,
                     "Tant que personne n'a pressé, rien ne doit supplanter l'atelier.")
    }

    func test_aPressRecordsTheFormatItWasGiven_beforeFiring() {
        let trigger = ComposerPublishTrigger()
        var seen: PostType?
        trigger.arm { seen = trigger.requestedTargetType }

        trigger.requestPublish(as: .post)

        XCTAssertEqual(seen, .post,
                       "Le format doit être posé AVANT l'exécution : le corps armé le lit pendant qu'il publie.")
    }

    /// Le presseur sans éventail (une surface qui ne propose qu'un format)
    /// rend la main à l'atelier plutôt que d'imposer un format inventé.
    func test_aPressWithoutAFormat_leavesTheAtelierInCharge() {
        let trigger = ComposerPublishTrigger()
        trigger.arm { }

        trigger.requestPublish()

        XCTAssertNil(trigger.requestedTargetType)
        XCTAssertEqual(
            StoryComposerView.publishedType(requested: trigger.requestedTargetType, atelier: .story), .story
        )
    }

    func test_disarmingForgetsTheRequestedFormat() {
        let trigger = ComposerPublishTrigger()
        trigger.arm { }
        trigger.requestPublish(as: .reel)

        trigger.disarm()

        XCTAssertNil(trigger.requestedTargetType,
                     "Une télécommande démontée ne doit pas dicter le format du composer suivant.")
    }

    // MARK: - Gardes de source POSITIVES

    /// Le format doit être un ARGUMENT du hand-off, et il doit venir de
    /// l'arbitrage — pas d'un littéral, pas d'une des deux moitiés seule.
    func test_thePublishHandoffCarriesTheArbitratedFormat() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func publishAllSlides()", in: code),
            "publishAllSlides() introuvable — la garde ne mesurerait RIEN"
        )
        let flat = body.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "Self.publishedType(requested:", in: flat), 1,
            "Le type publié doit passer par l'arbitrage, une fois."
        )
        let handoff = try XCTUnwrap(flat.range(of: "onPublishAllInBackground("))
        let format = try XCTUnwrap(flat.range(of: "Self.publishedType(requested:"))
        XCTAssertTrue(
            handoff.lowerBound < format.lowerBound,
            "Le format doit être un ARGUMENT du hand-off, pas un calcul posé à côté."
        )
    }

    /// Les DEUX porteurs sont lus, et depuis leur seule source. Une garde qui
    /// n'en nommerait qu'un resterait verte pendant que l'autre chemin publie
    /// le mauvais format.
    func test_bothCarriersAreRead_atTheSinglePublicationPoint() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let flat = code.components(separatedBy: .whitespacesAndNewlines).joined()

        XCTAssertTrue(flat.contains("publishTrigger?.requestedTargetType"),
                      "Le chemin télécommande doit apporter son format.")
        XCTAssertTrue(flat.contains("atelier:publishTargetType"),
                      "Le chemin flèche doit apporter le sien.")
    }

    /// La propriété existe sur les DEUX init publics, avec un défaut : c'est la
    /// seule chose qui garde compilables les appelants qui n'ont pas d'éventail
    /// (édition, republication), et qui garantit qu'ils publient exactement ce
    /// qu'ils publiaient.
    func test_bothPublicInitializers_defaultTheTargetTypeToAStory() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "publishTargetType: PostType = .story", in: code), 2,
            "Les DEUX init publics portent le défaut — sinon quatre appelants cessent de compiler."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "public let publishTargetType: PostType", in: code), 1,
            "…et la propriété est unique."
        )
    }
}
