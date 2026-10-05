import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un post passe en réel dès qu'on pose une vidéo en fond ou un audio sur une
/// image de fond** (#8793 — directive porteur 2026-09-30, corrigée le même jour :
/// la bascule va vers le mode RÉEL ; « Libre à l'utilisateur de rechoisir
/// post ! »).
final class ComposerReelAutoSwitchTests: XCTestCase {

    private func slide(id: String = "s1",
                       background: StoryMediaKind? = nil,
                       foreground: StoryMediaKind? = nil,
                       sound: Bool = false,
                       backgroundAudioId: String? = nil) -> StorySlide {
        var effets = StoryEffects()
        let fond = background.map { StoryMediaObject(id: "fond", kind: $0, aspectRatio: 1, isBackground: true) }
        let dessus = foreground.map { StoryMediaObject(id: "dessus", kind: $0, aspectRatio: 1) }
        let medias = [fond, dessus].compactMap { $0 }
        effets.mediaObjects = medias.isEmpty ? nil : medias
        effets.audioPlayerObjects = sound ? [StoryAudioPlayerObject(id: "son")] : nil
        effets.backgroundAudioId = backgroundAudioId
        return StorySlide(id: id, effects: effets)
    }

    // MARK: - Ce qui DEMANDE le réel

    func test_sceneDemandsReel_fondVideo_demandeLeReel() {
        XCTAssertTrue(ComposerReelAutoSwitch.sceneDemandsReel([slide(background: .video)], slideImageIds: []))
    }

    func test_sceneDemandsReel_fondImageEtSonPose_demandeLeReel() {
        XCTAssertTrue(ComposerReelAutoSwitch.sceneDemandsReel([slide(background: .image, sound: true)],
                                                                slideImageIds: []))
    }

    func test_sceneDemandsReel_fondImageEtSonDeFond_demandeLeReel() {
        XCTAssertTrue(ComposerReelAutoSwitch.sceneDemandsReel([slide(background: .image, backgroundAudioId: "a1")],
                                                                slideImageIds: []))
    }

    func test_sceneDemandsReel_imageDeFondHeriteeEtSon_demandeLeReel() {
        XCTAssertTrue(ComposerReelAutoSwitch.sceneDemandsReel([slide(id: "s9", sound: true)],
                                                                slideImageIds: ["s9"]),
                      "l'image de fond d'une slide (slideImages) est un fond image")
    }

    func test_sceneDemandsReel_fondImageSeul_resteUnPost() {
        XCTAssertFalse(ComposerReelAutoSwitch.sceneDemandsReel([slide(background: .image)], slideImageIds: []))
    }

    func test_sceneDemandsReel_sonSansFondImage_resteUnPost() {
        XCTAssertFalse(ComposerReelAutoSwitch.sceneDemandsReel([slide(sound: true)], slideImageIds: []),
                       "un son sur un fond de couleur ne bascule pas")
    }

    func test_sceneDemandsReel_videoAuPremierPlan_resteUnPost() {
        XCTAssertFalse(ComposerReelAutoSwitch.sceneDemandsReel([slide(foreground: .video)], slideImageIds: []),
                       "seule une vidéo de FOND bascule — une vidéo posée garde l'offre de réel (#8603)")
    }

    func test_sceneDemandsReel_uneSeuleSlideSuffit() {
        XCTAssertTrue(ComposerReelAutoSwitch.sceneDemandsReel(
            [slide(id: "a", background: .image), slide(id: "b", background: .video)], slideImageIds: []))
    }

    // MARK: - La décision

    func test_decide_demandeSurUnPost_armeLeReel() {
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(), reelChoosable: true),
                       .armReel)
    }

    func test_decide_dejaArmee_neChangeRien() {
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(authorChose: false, autoArmed: true),
                                                      reelChoosable: true),
                       .keep)
    }

    func test_decide_choixManuel_nEstJamaisEcrase() {
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(authorChose: true, autoArmed: true),
                                                      reelChoosable: true),
                       .keep, "« Libre à l'utilisateur de rechoisir post ! »")
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: false, defaultFormat: .post,
                                                      state: .init(authorChose: true, autoArmed: true),
                                                      reelChoosable: true),
                       .keep, "un choix de l'auteur ne se désarme pas non plus")
    }

    func test_decide_laDemandeDisparait_rendLePost() {
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: false, defaultFormat: .post,
                                                      state: .init(authorChose: false, autoArmed: true),
                                                      reelChoosable: true),
                       .disarm, "retirer la vidéo de fond rend le format de la porte")
    }

    func test_decide_horsPost_neBasculeJamais() {
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .story,
                                                      state: .init(), reelChoosable: true), .keep)
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .reel,
                                                      state: .init(), reelChoosable: true), .keep)
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .status,
                                                      state: .init(), reelChoosable: true), .keep)
    }

    func test_decide_reelNonOffert_neMentPas() {
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(), reelChoosable: false), .keep,
                       "armer un format que le menu n'offre pas serait un bouton qui ment")
    }

    // MARK: - Ce que le geste fait de l'état

    func test_applying_armReel_armeLeReelEtLeNote() {
        let (choix, etat) = ComposerReelAutoSwitch.applying(.armReel, to: .init(), armed: nil)
        XCTAssertEqual(choix, ComposerPublishChoice(format: .reel, layout: nil))
        XCTAssertEqual(etat, .init(authorChose: false, autoArmed: true))
    }

    func test_applying_disarm_rendLeChoixDeLaPorte() {
        let (choix, etat) = ComposerReelAutoSwitch.applying(
            .disarm, to: .init(authorChose: false, autoArmed: true),
            armed: ComposerPublishChoice(format: .reel, layout: nil))
        XCTAssertNil(choix)
        XCTAssertEqual(etat, .init())
    }

    func test_applying_keep_neTouchePasAuChoix() {
        let arme = ComposerPublishChoice(format: .post, layout: nil)
        let (choix, etat) = ComposerReelAutoSwitch.applying(.keep, to: .init(authorChose: true, autoArmed: true),
                                                             armed: arme)
        XCTAssertEqual(choix, arme)
        XCTAssertEqual(etat, .init(authorChose: true, autoArmed: true))
    }

    func test_authorChose_retourAPost_verrouilleLaComposition() {
        let etat = ComposerReelAutoSwitch.authorChose(.init(authorChose: false, autoArmed: true))
        XCTAssertTrue(etat.authorChose)
        XCTAssertEqual(ComposerReelAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: etat, reelChoosable: true), .keep)
    }
}
