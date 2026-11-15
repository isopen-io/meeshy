import XCTest
import MeeshySDK
@testable import Meeshy

/// Les trois scènes de l'en-tête de la fiche App Store (#9904) : des réels drôles qui défilent, une story qui s'ouvre, un
/// vocal qui passe de sa langue à celle du lecteur — chacune par le chemin réel de l'app.
@MainActor
final class VitrineEnteteTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    func test_defilement_parses_andWaitsForTheReelPlayer() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-defilement"]), .interactionDefilement)
        XCTAssertEqual(VitrineScene.interactionDefilement.interaction, .defilement)
        XCTAssertEqual(VitrineScene.interactionDefilement.sceneDuKit, .interactionDefilement)
        XCTAssertTrue(VitrineScene.interactionDefilement.ouvreUneSession)
        XCTAssertNil(VitrineScene.interactionDefilement.jeuServi)
        XCTAssertEqual(VitrineScene.interactionDefilement.rendusAttendus(conversationId: nil, appareil: .iphone), [.lecteurDeReels])
        XCTAssertEqual(VitrineScene.interactionDefilement.rendusAttendus(conversationId: nil, appareil: .ipad), [.lecteurDeReels])
    }

    /// La story s'ouvre APRÈS le clap : la scène n'attend que la racine (le fil sur iPad), l'ouverture se filme.
    func test_story_parses_andWaitsOnlyForTheRoot() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-story"]), .interactionStory)
        XCTAssertEqual(VitrineScene.interactionStory.interaction, .story)
        XCTAssertNil(VitrineScene.interactionStory.jeuServi)
        XCTAssertEqual(VitrineScene.interactionStory.rendusAttendus(conversationId: nil, appareil: .iphone), [.racine])
        XCTAssertEqual(VitrineScene.interactionStory.rendusAttendus(conversationId: nil, appareil: .ipad), [.fil])
    }

    /// Le vocal est celui de la conversation « amour » : la scène emprunte sa destination.
    func test_vocal_parses_andOpensTheLoveConversation() throws {
        let f = try fixtures()
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "interaction-vocal"]), .interactionVocal)
        XCTAssertEqual(VitrineScene.interactionVocal.interaction, .vocal)
        XCTAssertEqual(VitrineScene.interactionVocal.sceneDuKit, .amour)
        let destination = try XCTUnwrap(f.destination(VitrineScene.interactionVocal.sceneDuKit))
        XCTAssertNotNil(destination.attachmentId)
        XCTAssertEqual(VitrineScene.interactionVocal.rendusAttendus(conversationId: destination.conversationId, appareil: .iphone),
                       [.conversation(destination.conversationId)])
    }

    /// Le kit sert quatre réels vidéo, chacun écrit dans une autre langue : le lecteur immersif les reçoit résolus par le
    /// Prisme, légende traduite dans la langue du lecteur.
    func test_reelsDuDefilement_areVideoReels_readInTheReadersLanguage() throws {
        let f = try fixtures()
        let reels = VitrineInteractions.reelsDuDefilement(f)
        XCTAssertEqual(reels.count, 4)
        XCTAssertEqual(FeedPost.reels(from: reels).map(\.id), reels.map(\.id), "Un réel du kit n'est pas un réel pour le lecteur.")
        let originaux = try XCTUnwrap(f.reels)
        XCTAssertEqual(Set(originaux.compactMap(\.originalLanguage)).count, 4)
        for (servi, original) in zip(reels, originaux) {
            XCTAssertNotEqual(original.originalLanguage, f.lang)
            XCTAssertEqual(servi.displayContent, original.translations?[f.lang]?.text)
            XCTAssertEqual(servi.primaryReelDisplayMedia?.type, .video)
            XCTAssertNotNil(servi.primaryReelDisplayMedia?.thumbnailUrl, "Réel sans affiche : la page peindrait sa couleur d'attente.")
            XCTAssertTrue(f.medias.contains { $0.genre == .video && $0.url == servi.primaryReelDisplayMedia?.url })
        }
    }

    /// La story du kit est celle d'un autre, son texte écrit sur la scène dans sa langue et traduit pour le lecteur.
    func test_story_isAnotherAuthorsStory_whoseSceneTextReadsInTheReadersLanguage() throws {
        let f = try fixtures()
        let groupes = try XCTUnwrap(f.stories).toStoryGroups(currentUserId: f.lecteur.id)
        let story = try XCTUnwrap(groupes.first?.stories.first)
        XCTAssertNotEqual(groupes.first?.id, f.lecteur.id)
        let texte = try XCTUnwrap(story.storyEffects?.textObjects.first)
        XCTAssertNotEqual(texte.sourceLanguage, f.lang)
        let lu = texte.resolvedText(preferredLanguages: [f.lang])
        XCTAssertEqual(lu, texte.translations?[f.lang])
        XCTAssertNotEqual(lu, texte.text)
    }

    /// Le lecteur des réels prête son passage au suivant à la vitrine — et à elle seule.
    func test_rendu_relaysTheNextReel_onlyInsideTheVitrine() {
        var passages = 0
        let actif = VitrineRendu(actif: true)
        actif.lecteurDeReelsAffiche { passages += 1 }
        actif.reelSuivant?()
        XCTAssertEqual(passages, 1)
        XCTAssertTrue(actif.observes.contains(.lecteurDeReels))

        let inactif = VitrineRendu(actif: false)
        inactif.lecteurDeReelsAffiche { passages += 1 }
        XCTAssertNil(inactif.reelSuivant)
        XCTAssertTrue(inactif.observes.isEmpty)
    }

    /// La racine montée se signale : la scène de la story l'attend avant son clap.
    func test_rendu_rootMounted_isObserved() {
        let rendu = VitrineRendu(actif: true)
        rendu.racineAffichee {}
        XCTAssertTrue(rendu.observes.contains(.racine))
    }
}
