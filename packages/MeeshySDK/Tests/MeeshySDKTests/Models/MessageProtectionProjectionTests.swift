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

    @Test("Oublier un message le retire du registre")
    func test_forget_retireLEntrée() {
        let ledger = makeLedger()
        ledger.noteReception(of: "m1", at: now)
        ledger.forget("m1")
        #expect(ledger.firstReception(of: "m1") == nil)
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
