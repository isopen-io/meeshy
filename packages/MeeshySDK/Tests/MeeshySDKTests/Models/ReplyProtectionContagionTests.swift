import Testing
import Foundation
@testable import MeeshySDK

/// La contagion des protections par la réponse (#8557) — mêmes cas que le
/// témoin de la loi jumelle TS (`packages/shared/utils/reply-protection-contagion.test.ts`).
@Suite("ReplyProtectionContagion — la réponse hérite du flou et de l'éphémère du message cité")
struct ReplyProtectionContagionTests {

    private typealias Columns = ReplyProtectionContagion.Columns
    private let afterRead: MessageEffectFlags = [.ephemeral, .ephemeralAfterRead]

    // MARK: - contaminate(requested:quoted:)

    @Test("Une réponse à un message ordinaire garde exactement ce qu'elle demande")
    func test_contaminate_messageOrdinaire_gardeLaDemande() {
        let result = ReplyProtectionContagion.contaminate(
            requested: Columns(effectFlags: .glow, isBlurred: false, ephemeralDuration: 60),
            quoted: Columns()
        )
        #expect(result == Columns(effectFlags: [.glow, .ephemeral], isBlurred: false, ephemeralDuration: 60))
    }

    @Test("Sans message cité, rien ne change")
    func test_contaminate_sansCité_recomposeLaDemande() {
        let result = ReplyProtectionContagion.contaminate(requested: Columns(isBlurred: true), quoted: nil)
        #expect(result == Columns(effectFlags: .blurred, isBlurred: true, ephemeralDuration: nil))
    }

    @Test("Citer un message FLOU rend la réponse floue")
    func test_contaminate_citéFlou_réponseFloue() {
        let result = ReplyProtectionContagion.contaminate(
            requested: Columns(),
            quoted: Columns(effectFlags: .blurred, isBlurred: true)
        )
        #expect(result == Columns(effectFlags: .blurred, isBlurred: true, ephemeralDuration: nil))
    }

    @Test("Le flou se lit aussi sur la seule colonne isBlurred")
    func test_contaminate_colonneIsBlurredSeule_réponseFloue() {
        let result = ReplyProtectionContagion.contaminate(requested: Columns(), quoted: Columns(isBlurred: true))
        #expect(result.isBlurred)
    }

    @Test("Citer une FLAMME-ŒIL rend la réponse flamme-œil, sans durée")
    func test_contaminate_citéFlammeOeil_réponseFlammeOeil() {
        let result = ReplyProtectionContagion.contaminate(requested: Columns(), quoted: Columns(effectFlags: afterRead))
        #expect(result == Columns(effectFlags: afterRead, isBlurred: false, ephemeralDuration: nil))
    }

    @Test("Citer un éphémère à DURÉE donne la même durée")
    func test_contaminate_citéDurée_mêmeDurée() {
        let result = ReplyProtectionContagion.contaminate(
            requested: Columns(),
            quoted: Columns(effectFlags: .ephemeral, ephemeralDuration: 300)
        )
        #expect(result == Columns(effectFlags: .ephemeral, isBlurred: false, ephemeralDuration: 300))
    }

    @Test("Le mode éphémère du cité est IMPOSÉ : le choix propre de la réponse est remplacé")
    func test_contaminate_modeÉphémèreCité_remplaceLeChoixDeLaRéponse() {
        let versFlamme = ReplyProtectionContagion.contaminate(
            requested: Columns(effectFlags: .ephemeral, ephemeralDuration: 86_400),
            quoted: Columns(effectFlags: afterRead)
        )
        #expect(versFlamme == Columns(effectFlags: afterRead, isBlurred: false, ephemeralDuration: nil))

        let versDurée = ReplyProtectionContagion.contaminate(
            requested: Columns(effectFlags: afterRead),
            quoted: Columns(effectFlags: .ephemeral, ephemeralDuration: 30)
        )
        #expect(versDurée == Columns(effectFlags: .ephemeral, isBlurred: false, ephemeralDuration: 30))
    }

    @Test("Éphémère ET flou : la réponse gagne les deux")
    func test_contaminate_citéÉphémèreEtFlou_réponseGagneLesDeux() {
        let result = ReplyProtectionContagion.contaminate(
            requested: Columns(),
            quoted: Columns(effectFlags: afterRead.union(.blurred), isBlurred: true)
        )
        #expect(result == Columns(effectFlags: afterRead.union(.blurred), isBlurred: true, ephemeralDuration: nil))
    }

    @Test("Contaminée par le flou, la réponse peut AJOUTER l'éphémère")
    func test_contaminate_contaminéeParLeFlou_peutAjouterLÉphémère() {
        let result = ReplyProtectionContagion.contaminate(
            requested: Columns(ephemeralDuration: 60),
            quoted: Columns(isBlurred: true)
        )
        #expect(result == Columns(effectFlags: [.ephemeral, .blurred], isBlurred: true, ephemeralDuration: 60))
    }

    @Test("Contaminée par l'éphémère, la réponse peut AJOUTER le flou")
    func test_contaminate_contaminéeParLÉphémère_peutAjouterLeFlou() {
        let result = ReplyProtectionContagion.contaminate(
            requested: Columns(isBlurred: true),
            quoted: Columns(effectFlags: afterRead)
        )
        #expect(result == Columns(effectFlags: afterRead.union(.blurred), isBlurred: true, ephemeralDuration: nil))
    }

    @Test("La vue unique ne se transmet pas, et reste un choix de la réponse")
    func test_contaminate_vueUnique_neSeTransmetPas() {
        #expect(ReplyProtectionContagion.contaminate(requested: Columns(), quoted: Columns(effectFlags: .viewOnce)).effectFlags == [])
        #expect(ReplyProtectionContagion.contaminate(
            requested: Columns(effectFlags: .viewOnce),
            quoted: Columns(effectFlags: .blurred)
        ).effectFlags == [.viewOnce, .blurred])
    }

    @Test("Un bit EPHEMERAL sans durée ni flamme-œil ne transmet rien d'inventé")
    func test_contaminate_bitÉphémèreSeul_neTransmetRien() {
        let result = ReplyProtectionContagion.contaminate(requested: Columns(), quoted: Columns(effectFlags: .ephemeral))
        #expect(result == Columns(effectFlags: [], isBlurred: false, ephemeralDuration: nil))
    }

    // MARK: - imposed(quoted:)

    @Test("Un message ordinaire n'impose rien")
    func test_imposed_messageOrdinaire_rien() {
        let imposed = ReplyProtectionContagion.imposed(quoted: Columns(effectFlags: .glow))
        #expect(imposed == .none)
        #expect(imposed.isEmpty)
    }

    @Test("Flou + flamme-œil")
    func test_imposed_flouEtFlammeOeil() {
        let imposed = ReplyProtectionContagion.imposed(quoted: Columns(effectFlags: afterRead.union(.blurred)))
        #expect(imposed == ReplyProtectionContagion.Imposed(blurred: true, ephemeral: .afterRead))
    }

    @Test("Durée")
    func test_imposed_durée() {
        let imposed = ReplyProtectionContagion.imposed(quoted: Columns(effectFlags: .ephemeral, ephemeralDuration: 15))
        #expect(imposed == ReplyProtectionContagion.Imposed(blurred: false, ephemeral: .duration(seconds: 15)))
    }

    // MARK: - L'intention du composeur

    @Test("Une intention vide contaminée par flou + flamme-œil devient floue + flamme-œil")
    func test_intentContaminated_flouEtFlammeOeil() {
        let intent = MessageProtectionIntent.none.contaminated(by: .init(blurred: true, ephemeral: .afterRead))
        #expect(intent.isBlurred)
        #expect(intent.ephemeralAfterRead)
        #expect(intent.ephemeralDurationSeconds == nil)
    }

    @Test("La durée imposée remplace la flamme-œil demandée ; le flou demandé reste")
    func test_intentContaminated_duréeImposée_remplaceLeChoix() {
        let intent = MessageProtectionIntent(ephemeral: .afterRead, isBlurred: true)
            .contaminated(by: .init(blurred: false, ephemeral: .duration(seconds: 30)))
        #expect(intent.ephemeralDurationSeconds == 30)
        #expect(!intent.ephemeralAfterRead)
        #expect(intent.isBlurred)
    }

    @Test("Sous un flou imposé, la vue unique demandée reste : la réponse porte les deux (#8567)")
    func test_intentContaminated_flouImposé_garderLaVueUnique() {
        let intent = MessageProtectionIntent(ephemeral: nil, isViewOnce: true)
            .contaminated(by: .init(blurred: true, ephemeral: nil))
        #expect(intent.isBlurred)
        #expect(intent.isViewOnce)
        #expect(intent.lifecycleFlags == [.blurred, .viewOnce])
        #expect(intent.wireIsBlurred == true)
        #expect(intent.wireIsViewOnce == true)
    }

    @Test("Sous un flou imposé, le plafond d'ouvertures de la vue unique voyage avec elle (#8567)")
    func test_intentContaminated_flouImposé_garderLePlafond() {
        let intent = MessageProtectionIntent(isViewOnce: true, maxViewOnceCount: 2)
            .contaminated(by: .init(blurred: true, ephemeral: .afterRead))
        #expect(intent.isViewOnce)
        #expect(intent.maxViewOnceCount == 2)
        #expect(intent.isBlurred)
        #expect(intent.ephemeralAfterRead)
    }

    @Test("La file hors ligne rejoue une réponse floue ET à vue unique telle qu'elle a été saisie (#8567)")
    func test_fileHorsLigne_rejoueFlouEtVueUnique() {
        let intent = MessageProtectionIntent(isViewOnce: true)
            .contaminated(by: .init(blurred: true, ephemeral: nil))
        let item = OfflineQueueItem(conversationId: "c1", content: "secret", protection: intent)
        #expect(item.replayProtection.isBlurred)
        #expect(item.replayProtection.isViewOnce)
    }

    @Test("Hors contagion, flou et vue unique restent exclusifs (#7667)")
    func test_intent_horsContagion_restentExclusifs() {
        let intent = MessageProtectionIntent(isBlurred: true, isViewOnce: true)
            .contaminated(by: .init(blurred: false, ephemeral: .duration(seconds: 30)))
        #expect(!intent.isBlurred)
        #expect(intent.isViewOnce)
    }

    @Test("Rien d'imposé : l'intention passe telle quelle")
    func test_intentContaminated_rienDImposé_identité() {
        let armed = MessageProtectionIntent(ephemeral: .duration(.oneMinute), isViewOnce: true)
        #expect(armed.contaminated(by: .none) == armed)
    }

    @Test("Les colonnes d'un message se lisent sur ses effets")
    func test_replyProtectionColumns_lisentLesEffets() {
        var message = MeeshyMessage(conversationId: "c", content: "x")
        message.effects = MessageEffects(flags: [.ephemeral, .blurred], ephemeralDuration: 300)
        #expect(message.replyProtectionColumns == Columns(effectFlags: [.ephemeral, .blurred], isBlurred: true, ephemeralDuration: 300))
    }
}
