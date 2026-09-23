import Testing
import Foundation
@testable import MeeshySDK

/// Le compteur d'un éphémère n'apparaît que dans sa DERNIÈRE MINUTE, et sa
/// destruction se VOIT (#7467).
///
/// ## Ce que la précision du porteur change
///
/// > « l'éphémère est la flamme avec la configuration de durée par défaut ! Ce
/// > qu'il faudrait c'est d'afficher le compteur de l'éphémère dans la
/// > conversation uniquement quand on est déjà à 1 min et moins de sa
/// > destruction. Et sa destruction doit avoir un effet visuel si on est dans
/// > la conversation au moment de la destruction. »
///
/// #7452 a livré un compteur qui bat dès la réception. Un message de vingt-
/// quatre heures affichait donc « 23:59:58 » sous chaque bulle — une horloge
/// qui ne dit rien d'utile pendant vingt-trois heures, et qui fait battre une
/// seconde pour rien. La flamme SEULE suffit à dire « ceci va disparaître » ;
/// le CHIFFRE ne devient une information qu'au moment où il devient une
/// urgence.
///
/// **Le seuil est une propriété du MODÈLE, jamais de la vue.** Une vue qui
/// lirait `Date()` dans son corps pour décider deviendrait non déterministe —
/// donc intestable, et son `Equatable` mentirait. L'état résolu porte la
/// décision ; l'hôte se réveille au franchissement.
@Suite("Le seuil de la dernière minute, et l'état de destruction")
struct EphemeralLastMinuteTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    // MARK: - Le seuil

    @Test("Le seuil est UNE constante nommée, et c'est soixante secondes")
    func test_countdownThreshold_vautSoixanteSecondes() {
        #expect(EphemeralDeadline.countdownThreshold == 60)
    }

    @Test("Loin de l'échéance, l'horloge tourne mais le compteur ne s'affiche pas")
    func test_resolve_auDelàDuSeuil_rendRunning() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: now.addingTimeInterval(300),
            ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state == .running(deadline: now.addingTimeInterval(300)))
        #expect(state.showsCountdown == false)
    }

    @Test("Exactement au seuil, le compteur apparaît")
    func test_resolve_auSeuilExact_rendImminent() {
        let deadline = now.addingTimeInterval(60)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: deadline, ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state == .imminent(deadline: deadline))
        #expect(state.showsCountdown)
    }

    @Test("Dans la dernière minute, le compteur défile")
    func test_resolve_sousLeSeuil_rendImminent() {
        let deadline = now.addingTimeInterval(1)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: deadline, ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state == .imminent(deadline: deadline))
    }

    @Test("Les deux états portent la MÊME échéance — seul l'affichage diffère")
    func test_deadline_estLisibleDesDeuxÉtats() {
        let deadline = now.addingTimeInterval(300)
        #expect(EphemeralDeadline.State.running(deadline: deadline).deadline == deadline)
        #expect(EphemeralDeadline.State.imminent(deadline: deadline).deadline == deadline)
    }

    @Test("L'attente de réception de l'expéditeur ne change pas")
    func test_resolve_expéditeurSansÉchéance_resteEnAttente() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: nil, ephemeralDuration: 30, localReceivedAt: nil, now: now
        )
        #expect(state == .awaitingReception(duration: 30))
        #expect(state.showsCountdown == false)
    }

    // MARK: - Le réveil au franchissement

    @Test("L'hôte se réveille au FRANCHISSEMENT du seuil, pas seulement à l'échéance")
    func test_plan_réveilleAuSeuilAvantLÉchéance() {
        let plan = EphemeralExpirySchedule.plan(
            deadlines: ["m1": now.addingTimeInterval(300)], now: now
        )
        // 300 s − 60 s : c'est l'instant où la flamme gagne son compteur.
        #expect(plan.nextWake == now.addingTimeInterval(240))
        #expect(plan.expired.isEmpty)
    }

    @Test("Le seuil déjà franchi, le prochain réveil est l'échéance elle-même")
    func test_plan_seuilDéjàFranchi_réveilleÀLÉchéance() {
        let deadline = now.addingTimeInterval(30)
        let plan = EphemeralExpirySchedule.plan(deadlines: ["m1": deadline], now: now)
        #expect(plan.nextWake == deadline)
    }

    @Test("Deux messages : le réveil retenu est le plus PROCHE des deux instants")
    func test_plan_retientLInstantLePlusProcheTousMessagesConfondus() {
        let plan = EphemeralExpirySchedule.plan(
            deadlines: [
                "loin": now.addingTimeInterval(3600),   // seuil à +3540
                "proche": now.addingTimeInterval(90),   // seuil à +30
            ],
            now: now
        )
        #expect(plan.nextWake == now.addingTimeInterval(30))
    }

    // MARK: - La destruction qui se voit

    @Test("La combustion a une durée nommée, et « Réduire les animations » la raccourcit")
    func test_burnDuration_dépendDeLaRéductionDAnimations() {
        #expect(EphemeralBurn.duration(reduceMotion: false) == EphemeralBurn.fullDuration)
        #expect(EphemeralBurn.duration(reduceMotion: true) == EphemeralBurn.fadeDuration)
        #expect(EphemeralBurn.fadeDuration < EphemeralBurn.fullDuration)
    }

    @Test("Un message échu passe par l'état EN DESTRUCTION avant d'être retiré")
    func test_plan_unMessageÉchuEstDAbordÀBrûler() {
        let plan = EphemeralExpirySchedule.plan(
            deadlines: ["m1": now.addingTimeInterval(-1)], now: now
        )
        // `expired` nomme ce qui a franchi son échéance ; c'est l'hôte qui
        // allume la combustion PUIS retire. Le retrait immédiat est ce que
        // #7467 corrige : un message qui disparaît sans transition se lit
        // comme un saut de liste, pas comme une destruction.
        #expect(plan.expired == ["m1"])
    }

    @Test("La combustion d'un message se termine, elle ne boucle pas")
    func test_burn_estBornée() {
        #expect(EphemeralBurn.fullDuration > 0)
        #expect(EphemeralBurn.fullDuration < 2)
    }
}
