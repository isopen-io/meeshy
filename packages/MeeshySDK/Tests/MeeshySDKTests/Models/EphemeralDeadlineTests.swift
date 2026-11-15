import Testing
import Foundation
@testable import MeeshySDK

/// Le décompte d'un éphémère part de la RÉCEPTION, pas de l'envoi (#7452,
/// contrat du fil #7451 point 6).
///
/// Jusqu'ici l'échéance naissait à l'ENVOI, côté client
/// (`EphemeralDuration.expiresAt` = `Date() + rawValue`), et chaque destinataire
/// héritait d'une horloge démarrée chez quelqu'un d'autre : un message de cinq
/// minutes reçu quatre minutes plus tard ne vivait qu'une minute. La règle du
/// contrat prend donc DEUX entrées — l'échéance SERVIE par le gateway, résolue
/// par lecteur, et la RÉCEPTION LOCALE plus la durée — et retient la plus
/// PROCHE : aucune des deux ne peut prolonger l'autre.
@Suite("EphemeralDeadline — la règle d'échéance du contrat #7451")
struct EphemeralDeadlineTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test("Sans durée ni échéance, le message n'est pas éphémère")
    func test_resolve_sansDuréeNiÉchéance_rendNone() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: nil, ephemeralDuration: nil, localReceivedAt: now, now: now
        )
        #expect(state == .notEphemeral)
    }

    @Test("Une durée sans réception ni échéance servie : en attente de réception")
    func test_resolve_duréeSansRéception_rendAwaitingReception() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: nil, ephemeralDuration: 300, localReceivedAt: nil, now: now
        )
        #expect(state == .awaitingReception(duration: 300))
    }

    @Test("La réception locale plus la durée fait l'échéance quand le serveur se tait")
    func test_resolve_réceptionLocaleEtDurée_rendRunningDepuisLaRéception() {
        let received = now.addingTimeInterval(-60)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: nil, ephemeralDuration: 300, localReceivedAt: received, now: now
        )
        #expect(state == .running(deadline: received.addingTimeInterval(300)))
    }

    @Test("Deux échéances connues : la PLUS PROCHE gagne, ici celle du serveur")
    func test_resolve_échéanceServiePlusProche_gagne() {
        let received = now.addingTimeInterval(-10)
        let served = now.addingTimeInterval(30)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: served, ephemeralDuration: 300, localReceivedAt: received, now: now
        )
        // `.imminent` et non `.running` : +30 s est dans la dernière minute
        // (#7467). L'ÉCHÉANCE retenue reste celle du serveur, qui est le sujet
        // de ce témoin.
        #expect(state == .imminent(deadline: served))
        #expect(state.deadline == served)
    }

    @Test("Deux échéances connues : la PLUS PROCHE gagne, ici la locale")
    func test_resolve_échéanceLocalePlusProche_gagne() {
        let received = now.addingTimeInterval(-280)
        let served = now.addingTimeInterval(3600)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: served, ephemeralDuration: 300, localReceivedAt: received, now: now
        )
        // +20 s : dans la dernière minute (#7467).
        #expect(state.deadline == received.addingTimeInterval(300))
        #expect(state.showsCountdown)
    }

    @Test("Une échéance servie seule suffit — un message hérité n'a pas de durée")
    func test_resolve_échéanceServieSeule_suffitÀFaireUneÉchéance() {
        let served = now.addingTimeInterval(45)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: served, ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state.deadline == served)
    }

    @Test("À l'échéance, le message est expiré")
    func test_resolve_échéanceAtteinte_rendExpired() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: now, ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state == .expired)
    }

    @Test("Une durée nulle ou négative ne fabrique aucune échéance")
    func test_resolve_duréeNonPositive_ignoréeCommeSource() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: nil, ephemeralDuration: 0, localReceivedAt: now, now: now
        )
        #expect(state == .notEphemeral)
    }

    @Test("L'échéance est lisible sans déballer le cas")
    func test_deadline_exposéeParLeState() {
        let served = now.addingTimeInterval(45)
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: served, ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state.deadline == served)
        #expect(EphemeralDeadline.State.notEphemeral.deadline == nil)
    }

    // MARK: - Ce qui a DÉJÀ quitté sa vie (#7552)

    @Test("Un message échu se DÉCLARE échu, là où son échéance se tait")
    func test_hasElapsed_expiré_estVraiAlorsQueDeadlineEstNil() {
        let state = EphemeralDeadline.resolve(
            servedExpiresAt: now.addingTimeInterval(-30),
            ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(state == .expired)
        // Les deux questions divergent ICI, et c'est tout le défaut : le
        // balayage lisait `deadline`, qui n'a plus rien à dire sur un échu.
        #expect(state.deadline == nil)
        #expect(state.hasElapsed)
    }

    @Test("Rien d'autre ne se déclare échu")
    func test_hasElapsed_faussePourTousLesAutresÉtats() {
        let enCours = EphemeralDeadline.resolve(
            servedExpiresAt: now.addingTimeInterval(300),
            ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        let imminent = EphemeralDeadline.resolve(
            servedExpiresAt: now.addingTimeInterval(20),
            ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        let enAttente = EphemeralDeadline.resolve(
            servedExpiresAt: nil, ephemeralDuration: 60, localReceivedAt: nil, now: now
        )
        #expect(!enCours.hasElapsed)
        #expect(!imminent.hasElapsed)
        #expect(!enAttente.hasElapsed)
        #expect(!EphemeralDeadline.State.notEphemeral.hasElapsed)
    }
}
