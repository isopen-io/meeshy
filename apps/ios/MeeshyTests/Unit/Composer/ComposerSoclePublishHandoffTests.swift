import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **#4135 — l'audience choisie AU SOCLE atteint la publication.**
///
/// C'est la moitié qui manquait, et la seule dont l'erreur est IRRÉVERSIBLE :
/// un contenu « Amis » publié en « Public » ne se rattrape pas. Le lot avait
/// été écrit puis REMIS EN ARRIÈRE au #4124 pour cette raison exacte — le
/// sélecteur de l'atelier était l'unique écrivain de sa `visibility`, et un
/// socle qui affiche une audience qu'il n'écrit pas ment.
///
/// Le témoin porte donc sur la valeur **SERVIE** — celle que
/// `publishAllSlides` remet au hand-off — jamais sur ce que le socle affiche.
/// Une garde d'affichage serait passée au vert pendant que la publication
/// partait ailleurs.
final class ComposerSoclePublishHandoffTests: XCTestCase {

    // MARK: - L'audience servie

    func test_lAudienceDuSocle_gagne_surCelleDeLAtelier() {
        XCTAssertEqual(
            ComposerPublishTrigger.publishedVisibility(
                requested: PostVisibility.friends.rawValue, atelier: PostVisibility.public.rawValue
            ),
            PostVisibility.friends.rawValue,
            "Le socle est l'écrivain : ce qu'il apporte au moment du geste fait autorité."
        )
    }

    func test_unPresseurMuet_rendLaMain_alAtelier_jamaisAPublic() {
        XCTAssertEqual(
            ComposerPublishTrigger.publishedVisibility(
                requested: nil, atelier: PostVisibility.friends.rawValue
            ),
            PostVisibility.friends.rawValue,
            "`nil` = « ce presseur n'a pas de sélecteur ». Le défaut SÛR est de rendre la main au seul "
                + "autre porteur du fait — poser `public` publierait ce que personne n'a demandé."
        )
    }

    /// La liste suit l'audience SERVIE, jamais celle du presseur. Sans cela, une
    /// audience « Amis » pourrait emporter la liste d'un « Seulement… » choisi
    /// puis abandonné.
    func test_lesPersonnesNommees_suivent_laudienceSERVIE() {
        let ids = ["u1", "u2"]
        XCTAssertEqual(
            ComposerPublishTrigger.publishedVisibilityUserIds(
                requested: ids, atelier: [], served: PostVisibility.friends.rawValue
            ),
            [],
            "« Amis » n'exige personne : servir une liste ici l'enverrait à un ensemble non demandé."
        )
        let restreint = PostVisibility.composerSelectableCases.first(where: \.requiresUserSelection)
        let mode = try? XCTUnwrap(restreint)
        if let mode {
            XCTAssertEqual(
                ComposerPublishTrigger.publishedVisibilityUserIds(
                    requested: ids, atelier: ["autre"], served: mode.rawValue
                ),
                ids,
                "Une audience qui exige des personnes sert celles du PRESSEUR."
            )
            XCTAssertEqual(
                ComposerPublishTrigger.publishedVisibilityUserIds(
                    requested: nil, atelier: ["atelier"], served: mode.rawValue
                ),
                ["atelier"],
                "… et rend la main à l'atelier quand le presseur n'en apporte pas."
            )
        }
    }

    // MARK: - La télécommande transporte, et se désarme entièrement

    @MainActor
    func test_laPression_transporte_leFormat_etLAudience_ensemble() {
        let trigger = ComposerPublishTrigger()
        var presses = 0
        trigger.arm { presses += 1 }

        trigger.requestPublish(as: .post,
                               visibility: PostVisibility.friends.rawValue,
                               visibilityUserIds: ["u1"])

        XCTAssertEqual(presses, 1)
        XCTAssertEqual(trigger.requestedTargetType, .post)
        XCTAssertEqual(trigger.requestedVisibility, PostVisibility.friends.rawValue)
        XCTAssertEqual(trigger.requestedVisibilityUserIds, ["u1"])
    }

    /// Une télécommande qui survit à son atelier publierait l'état d'un composer
    /// disparu — et, depuis #4135, sous une audience périmée. Le désarmement
    /// doit donc tout rendre, pas seulement le format.
    @MainActor
    func test_leDesarmement_rendTOUT_pasSeulementLeFormat() {
        let trigger = ComposerPublishTrigger()
        trigger.arm { }
        trigger.armPreview { }
        trigger.report(canPublish: true)
        trigger.requestPublish(as: .post, visibility: PostVisibility.friends.rawValue, visibilityUserIds: ["u1"])

        trigger.disarm()

        XCTAssertFalse(trigger.isArmed)
        XCTAssertFalse(trigger.offersPreview)
        XCTAssertFalse(trigger.canPublish)
        XCTAssertNil(trigger.requestedTargetType)
        XCTAssertNil(trigger.requestedVisibility)
        XCTAssertNil(trigger.requestedVisibilityUserIds)
    }

    // MARK: - Loi 4 : l'œil et la flèche n'existent que s'ils font quelque chose

    @MainActor
    func test_loeil_nEstOffert_queSilEstArme() {
        let trigger = ComposerPublishTrigger()
        XCTAssertFalse(trigger.offersPreview, "un œil non armé ne se peint pas")
        XCTAssertTrue(
            ComposerChromeOwnership.socleZones(for: .scene, atelierOffersPreview: false).isEmpty == false,
            "l'audience et la flèche restent peintes"
        )
        XCTAssertFalse(
            ComposerChromeOwnership.socleZones(for: .scene, atelierOffersPreview: false).contains(.preview),
            "… mais pas l'œil"
        )
        XCTAssertTrue(
            ComposerChromeOwnership.socleZones(for: .scene, atelierOffersPreview: true).contains(.preview)
        )

        var vus = 0
        trigger.armPreview { vus += 1 }
        XCTAssertTrue(trigger.offersPreview)
        trigger.requestPreview()
        XCTAssertEqual(vus, 1, "presser l'œil doit EXÉCUTER le corps armé par l'atelier")
    }

    /// La flèche du socle sous la scène ne se gate pas sur le brouillon du
    /// document — il n'y en a pas — mais sur la matière RELAYÉE par l'atelier.
    func test_laFleche_sousLaScene_seGate_surLaMatiereRelayee() {
        func gate(_ matiere: Bool) -> Bool {
            ComposerDocumentPublishGate.canPublish(
                surface: .scene, emoji: nil, text: "",
                visibility: .public, visibilityUserIds: [],
                isPublishing: false, repostOfId: nil,
                atelierHasMatter: matiere
            )
        }
        XCTAssertFalse(gate(false), "atelier vide ⇒ flèche inerte")
        XCTAssertTrue(gate(true), "atelier avec matière ⇒ flèche armée")
        XCTAssertFalse(
            ComposerDocumentPublishGate.canPublish(
                surface: .scene, emoji: nil, text: "",
                visibility: .public, visibilityUserIds: [],
                isPublishing: false, repostOfId: nil
            ),
            "le DÉFAUT du paramètre est le sens sûr : un appelant qui l'ignore obtient une flèche inerte, "
                + "jamais une flèche armée au-dessus d'une composition vide"
        )
    }

    // MARK: - La graine du socle sous la scène

    func test_laGraine_duSocle_vientDeLaPorte_quandLeFormatNaPasDeMemoire() {
        XCTAssertNil(ComposerAudienceMemory.key(for: .story))
        XCTAssertNil(ComposerAudienceMemory.key(for: .reel))
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: nil, doorRaw: PostVisibility.friends.rawValue),
            .friends
        )
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: PostVisibility.public.rawValue,
                                        doorRaw: PostVisibility.friends.rawValue),
            .public,
            "une mémoire EXISTANTE fait autorité sur la porte — c'est la loi 10"
        )
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: "n-importe-quoi",
                                        doorRaw: PostVisibility.friends.rawValue),
            .friends,
            "une mémoire illisible n'est pas une mémoire : le rang suivant sert"
        )
        XCTAssertEqual(
            ComposerAudienceMemory.seed(rememberedRaw: nil, doorRaw: nil), .public,
            "et le dernier repli reste public"
        )
    }
}
