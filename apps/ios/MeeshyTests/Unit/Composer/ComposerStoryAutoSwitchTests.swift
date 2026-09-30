import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un post passe en story dès qu'on pose une vidéo en fond ou un audio sur une
/// image de fond** (#8793 — directive porteur 2026-09-30 : « la création de post
/// doit activer directement le mode story lorsqu'on met comme fond une vidéo ou
/// qu'on attache un audio à une image de fond ! Libre à l'utilisateur de
/// rechoisir post ! »).
final class ComposerStoryAutoSwitchTests: XCTestCase {

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

    // MARK: - Ce qui DEMANDE la story

    func test_sceneDemandsStory_fondVideo_demandeLaStory() {
        XCTAssertTrue(ComposerStoryAutoSwitch.sceneDemandsStory([slide(background: .video)], slideImageIds: []))
    }

    func test_sceneDemandsStory_fondImageEtSonPose_demandeLaStory() {
        XCTAssertTrue(ComposerStoryAutoSwitch.sceneDemandsStory([slide(background: .image, sound: true)],
                                                                slideImageIds: []))
    }

    func test_sceneDemandsStory_fondImageEtSonDeFond_demandeLaStory() {
        XCTAssertTrue(ComposerStoryAutoSwitch.sceneDemandsStory([slide(background: .image, backgroundAudioId: "a1")],
                                                                slideImageIds: []))
    }

    func test_sceneDemandsStory_imageDeFondHeriteeEtSon_demandeLaStory() {
        XCTAssertTrue(ComposerStoryAutoSwitch.sceneDemandsStory([slide(id: "s9", sound: true)],
                                                                slideImageIds: ["s9"]),
                      "l'image de fond d'une slide (slideImages) est un fond image")
    }

    func test_sceneDemandsStory_fondImageSeul_resteUnPost() {
        XCTAssertFalse(ComposerStoryAutoSwitch.sceneDemandsStory([slide(background: .image)], slideImageIds: []))
    }

    func test_sceneDemandsStory_sonSansFondImage_resteUnPost() {
        XCTAssertFalse(ComposerStoryAutoSwitch.sceneDemandsStory([slide(sound: true)], slideImageIds: []),
                       "un son sur un fond de couleur ne bascule pas")
    }

    func test_sceneDemandsStory_videoAuPremierPlan_resteUnPost() {
        XCTAssertFalse(ComposerStoryAutoSwitch.sceneDemandsStory([slide(foreground: .video)], slideImageIds: []),
                       "seule une vidéo de FOND bascule — une vidéo posée garde l'offre de réel (#8603)")
    }

    func test_sceneDemandsStory_uneSeuleSlideSuffit() {
        XCTAssertTrue(ComposerStoryAutoSwitch.sceneDemandsStory(
            [slide(id: "a", background: .image), slide(id: "b", background: .video)], slideImageIds: []))
    }

    // MARK: - La décision

    func test_decide_demandeSurUnPost_armeLaStory() {
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(), storyChoosable: true),
                       .armStory)
    }

    func test_decide_dejaArmee_neChangeRien() {
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(authorChose: false, autoArmed: true),
                                                      storyChoosable: true),
                       .keep)
    }

    func test_decide_choixManuel_nEstJamaisEcrase() {
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(authorChose: true, autoArmed: true),
                                                      storyChoosable: true),
                       .keep, "« Libre à l'utilisateur de rechoisir post ! »")
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: false, defaultFormat: .post,
                                                      state: .init(authorChose: true, autoArmed: true),
                                                      storyChoosable: true),
                       .keep, "un choix de l'auteur ne se désarme pas non plus")
    }

    func test_decide_laDemandeDisparait_rendLePost() {
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: false, defaultFormat: .post,
                                                      state: .init(authorChose: false, autoArmed: true),
                                                      storyChoosable: true),
                       .disarm, "retirer la vidéo de fond rend le format de la porte")
    }

    func test_decide_horsPost_neBasculeJamais() {
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .story,
                                                      state: .init(), storyChoosable: true), .keep)
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .reel,
                                                      state: .init(), storyChoosable: true), .keep)
    }

    func test_decide_storyNonOfferte_neMentPas() {
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: .init(), storyChoosable: false), .keep,
                       "armer un format que le menu n'offre pas serait un bouton qui ment")
    }

    // MARK: - Ce que le geste fait de l'état

    func test_applying_armStory_armeLaStoryEtLeNote() {
        let (choix, etat) = ComposerStoryAutoSwitch.applying(.armStory, to: .init(), armed: nil)
        XCTAssertEqual(choix, ComposerPublishChoice(format: .story, layout: nil))
        XCTAssertEqual(etat, .init(authorChose: false, autoArmed: true))
    }

    func test_applying_disarm_rendLeChoixDeLaPorte() {
        let (choix, etat) = ComposerStoryAutoSwitch.applying(
            .disarm, to: .init(authorChose: false, autoArmed: true),
            armed: ComposerPublishChoice(format: .story, layout: nil))
        XCTAssertNil(choix)
        XCTAssertEqual(etat, .init())
    }

    func test_applying_keep_neTouchePasAuChoix() {
        let arme = ComposerPublishChoice(format: .post, layout: nil)
        let (choix, etat) = ComposerStoryAutoSwitch.applying(.keep, to: .init(authorChose: true, autoArmed: true),
                                                             armed: arme)
        XCTAssertEqual(choix, arme)
        XCTAssertEqual(etat, .init(authorChose: true, autoArmed: true))
    }

    func test_authorChose_retourAPost_verrouilleLaComposition() {
        let etat = ComposerStoryAutoSwitch.authorChose(.init(authorChose: false, autoArmed: true))
        XCTAssertTrue(etat.authorChose)
        XCTAssertEqual(ComposerStoryAutoSwitch.decide(demands: true, defaultFormat: .post,
                                                      state: etat, storyChoosable: true), .keep)
    }
}
