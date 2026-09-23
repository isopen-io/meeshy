import Testing
import Foundation
@testable import MeeshySDK

/// La projection d'un `MeeshyMessage` vers son chrome, le registre des
/// réceptions et l'ordonnancement des disparitions (#7452).
@Suite("La réception locale, le registre et le réveil unique")
struct MessageProtectionProjectionTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeMessage(
        id: String = "m1",
        isMe: Bool = false,
        expiresAt: Date? = nil,
        effects: MessageEffects = .none
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: id,
            conversationId: "c1",
            senderId: "u2",
            content: "secret",
            expiresAt: expiresAt,
            effects: effects,
            createdAt: Date(timeIntervalSince1970: 1_799_999_000),
            updatedAt: Date(timeIntervalSince1970: 1_799_999_000)
        )
        message.isMe = isMe
        return message
    }

    private func makeLedger() -> EphemeralReceiptLedger {
        let suite = "meeshy.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        return EphemeralReceiptLedger(defaults: defaults)
    }

    // MARK: - Registre

    @Test("Le registre grave la PREMIÈRE réception et ne la déplace plus")
    func test_noteReception_estIdempotenteEtMonotone() {
        let ledger = makeLedger()
        let first = ledger.noteReception(of: "m1", at: now)
        let second = ledger.noteReception(of: "m1", at: now.addingTimeInterval(120))
        #expect(first == now)
        #expect(second == now)
        #expect(ledger.firstReception(of: "m1") == now)
    }

    @Test("Un message inconnu du registre n'a aucune réception")
    func test_firstReception_messageInconnu_rendNil() {
        #expect(makeLedger().firstReception(of: "jamais-vu") == nil)
    }

    /// Le témoin précédent — « Oublier un message le retire du registre » —
    /// GARDAIT le défaut de #7552 : il exigeait l'effacement qui rouvrait
    /// l'horloge. Ce qu'on attend d'une destruction n'est pas qu'elle oublie,
    /// c'est qu'elle se SOUVIENNE.
    @Test("Détruire un message grave sa mort et rend sa réception inutile")
    func test_noteDestruction_graveLaMortEtLibèreLaRéception() {
        let ledger = makeLedger()
        ledger.noteReception(of: "m1", at: now)
        ledger.noteDestruction(of: "m1", at: now.addingTimeInterval(30))
        #expect(ledger.destruction(of: "m1") == now.addingTimeInterval(30))
        #expect(ledger.firstReception(of: "m1") == nil)
    }

    @Test("La mort gravée est la PREMIÈRE : un second appel ne la déplace pas")
    func test_noteDestruction_estMonotone() {
        let ledger = makeLedger()
        ledger.noteDestruction(of: "m1", at: now)
        ledger.noteDestruction(of: "m1", at: now.addingTimeInterval(600))
        #expect(ledger.destruction(of: "m1") == now)
    }

    @Test("Un message vivant n'a aucune mort gravée")
    func test_destruction_messageVivant_rendNil() {
        let ledger = makeLedger()
        ledger.noteReception(of: "m1", at: now)
        #expect(ledger.destruction(of: "m1") == nil)
    }

    // MARK: - Projection

    @Test("Projeter un éphémère REÇU démarre son horloge à cette projection")
    func test_protection_éphémèreReçu_démarreÀLaProjection() {
        let ledger = makeLedger()
        let message = makeMessage(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 300))
        let descriptor = message.protection(ledger: ledger, now: now)
        #expect(descriptor.ephemeralState == .running(deadline: now.addingTimeInterval(300)))
    }

    @Test("Rouvrir la conversation ne relance pas l'horloge")
    func test_protection_secondeProjection_gardeLaPremièreÉchéance() {
        let ledger = makeLedger()
        let message = makeMessage(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 300))
        _ = message.protection(ledger: ledger, now: now)
        let later = message.protection(ledger: ledger, now: now.addingTimeInterval(120))
        #expect(later.ephemeralState == .running(deadline: now.addingTimeInterval(300)))
    }

    @Test("MON propre envoi ne compte pas comme une réception : en attente")
    func test_protection_messageDeLExpéditeur_attendLaRéception() {
        let ledger = makeLedger()
        let message = makeMessage(isMe: true, effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 300))
        let descriptor = message.protection(ledger: ledger, now: now)
        #expect(descriptor.ephemeralState == .awaitingReception(duration: 300))
        #expect(ledger.firstReception(of: "m1") == nil)
    }

    @Test("Une échéance servie fait décompter l'envoi de l'expéditeur")
    func test_protection_expéditeurAvecÉchéanceServie_décompte() {
        let ledger = makeLedger()
        let served = now.addingTimeInterval(200)
        let message = makeMessage(
            isMe: true, expiresAt: served,
            effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 300)
        )
        let descriptor = message.protection(ledger: ledger, now: now)
        #expect(descriptor.ephemeralState == .running(deadline: served))
    }

    /// **Le compteur ne remonte pas** (#7552).
    ///
    /// Mesuré en recette le 2026-09-22 : un éphémère de 30 s atteignait 0:00,
    /// puis REMONTAIT à 0:06 trente secondes plus tard. `message:expired`
    /// arrive, l'application oublie la réception — mais la ligne est encore
    /// dans `messages`, si bien que la projection SUIVANTE stampe une réception
    /// NEUVE et fait repartir une fenêtre de 30 s entière.
    ///
    /// Le témoin fait donc VARIER le temps sur deux projections successives,
    /// avec l'annonce de destruction entre les deux — la dimension qu'aucun
    /// témoin existant ne faisait varier.
    @Test("Un éphémère DÉTRUIT ne renaît pas : la projection suivante est expirée")
    func test_protection_aprèsAnnonceDeDestruction_resteExpiré() {
        let ledger = makeLedger()
        let message = makeMessage(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 30))

        let première = message.protection(ledger: ledger, now: now)
        #expect(première.ephemeralState == .imminent(deadline: now.addingTimeInterval(30)))

        // `message:expired` arrive — la ligne est ENCORE dans `messages`.
        ledger.noteDestruction(of: "m1", at: now.addingTimeInterval(30))

        let seconde = message.protection(ledger: ledger, now: now.addingTimeInterval(31))
        #expect(seconde.ephemeralState == .expired)
        #expect(seconde.isEmpty)
    }

    /// Le corollaire, et la seconde moitié du symptôme de recette : la ligne
    /// CONTINUAIT de décompter après l'annonce de sa destruction. Une mort
    /// annoncée AVANT l'échéance locale l'emporte sur-le-champ.
    @Test("Une destruction annoncée AVANT l'échéance locale expire la ligne aussitôt")
    func test_protection_destructionAvantÉchéanceLocale_expireAussitôt() {
        let ledger = makeLedger()
        let message = makeMessage(effects: MessageEffects(flags: [.ephemeral], ephemeralDuration: 300))

        _ = message.protection(ledger: ledger, now: now)
        ledger.noteDestruction(of: "m1", at: now.addingTimeInterval(10))

        let après = message.protection(ledger: ledger, now: now.addingTimeInterval(11))
        #expect(après.ephemeralState == .expired)
    }

    @Test("Un message ordinaire ne touche jamais le registre")
    func test_protection_messageOrdinaire_neStampeRien() {
        let ledger = makeLedger()
        let descriptor = makeMessage().protection(ledger: ledger, now: now)
        #expect(descriptor.isEmpty)
        #expect(ledger.firstReception(of: "m1") == nil)
    }

    @Test("Une vue unique se désigne sans rien devoir à l'horloge")
    func test_protection_vueUnique_porteSonBadge() {
        let ledger = makeLedger()
        let message = makeMessage(effects: MessageEffects(flags: [.viewOnce]))
        #expect(message.protection(ledger: ledger, now: now).isViewOnce)
    }

    // MARK: - Le réveil unique

    @Test("Le plan ne retient qu'une échéance à surveiller pour tout le fil")
    func test_plan_rendLaProchaineÉchéanceEtLesExpirés() {
        let plan = EphemeralExpirySchedule.plan(
            deadlines: [
                "vieux": now.addingTimeInterval(-5),
                "bientôt": now.addingTimeInterval(30),
                "plus-tard": now.addingTimeInterval(600),
                "aussi-vieux": now,
            ],
            now: now
        )
        #expect(plan.expired == ["aussi-vieux", "vieux"])
        #expect(plan.nextWake == now.addingTimeInterval(30))
    }

    @Test("Sans éphémère vivant, il n'y a rien à attendre")
    func test_plan_sansÉchéanceFuture_rendNil() {
        let plan = EphemeralExpirySchedule.plan(deadlines: [:], now: now)
        #expect(plan.expired.isEmpty)
        #expect(plan.nextWake == nil)
    }
}
