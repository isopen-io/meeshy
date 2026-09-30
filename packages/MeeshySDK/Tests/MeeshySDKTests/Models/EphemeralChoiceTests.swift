import Testing
import Foundation
@testable import MeeshySDK

/// **La flamme-œil n'est pas une durée** (#8303, contrat #8302).
///
/// Directive porteur 2026-09-27 : l'éphémère propose la flamme-œil — le message
/// disparaît chez chaque lecteur quand il l'a vu puis a quitté la conversation —
/// puis 15 s, puis les durées existantes. Un choix d'éphémère est donc un type
/// SOMME : `.afterRead` ne porte aucune seconde, et le fil ne transporte aucune
/// durée pour lui, seulement les bits `EPHEMERAL | EPHEMERAL_AFTER_READ`.
@Suite("EphemeralChoice — la flamme-œil, puis les durées")
struct EphemeralChoiceTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test("Le menu : flamme-œil, 15 s, puis les durées existantes")
    func test_menu_flammeOeilPuisQuinzeSecondes() {
        #expect(EphemeralChoice.menu.first == .afterRead)
        #expect(EphemeralChoice.menu.dropFirst().first == .duration(.fifteenSeconds))
        #expect(EphemeralChoice.menu.count == EphemeralDuration.allCases.count + 1)
    }

    @Test("Le brouillon relit ce qu'il a écrit — la flamme-œil comprise")
    func test_storage_allerRetour() {
        for choice in EphemeralChoice.menu {
            #expect(EphemeralChoice(storageValue: choice.storageValue) == choice)
        }
        #expect(EphemeralChoice(storageValue: 30) == .duration(.thirtySeconds))
        #expect(EphemeralChoice(storageValue: 42) == nil)
    }

    @Test("Flamme-œil : les deux bits, AUCUNE durée ni échéance")
    func test_intent_flammeOeil_bitsSansDurée() {
        let intent = MessageProtectionIntent(ephemeral: .afterRead)
        #expect(intent.lifecycleFlags == [.ephemeral, .ephemeralAfterRead])
        #expect(intent.ephemeralDurationSeconds == nil)
        #expect(!intent.isEmpty)
        #expect(intent.wireEffectFlags == [.ephemeral, .ephemeralAfterRead],
                "le corps REST n'a pas de colonne pour la flamme-œil : les bits voyagent par effectFlags")
    }

    @Test("Une durée garde sa colonne, et rien ne part en effectFlags")
    func test_intent_durée_colonneSeule() {
        let intent = MessageProtectionIntent(ephemeral: .duration(.fifteenSeconds))
        #expect(intent.ephemeralDurationSeconds == 15)
        #expect(intent.lifecycleFlags == .ephemeral)
        #expect(intent.wireEffectFlags.isEmpty)
        #expect(intent.ephemeralChoice == .duration(.fifteenSeconds))
        #expect(MessageProtectionIntent(ephemeral: .afterRead).ephemeralChoice == .afterRead)
        #expect(MessageProtectionIntent.none.ephemeralChoice == nil)
    }

    @Test("Un message flamme-œil n'affiche ni décompte ni pastille d'éphémère")
    func test_descripteur_flammeOeil_sansBadge() {
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.ephemeral, .ephemeralAfterRead],
            servedExpiresAt: nil, ephemeralDuration: nil,
            localReceivedAt: now, now: now
        )
        #expect(descriptor.isAfterRead)
        #expect(descriptor.badges.isEmpty)
        #expect(descriptor.ephemeralState == .notEphemeral)
        let ordinaire = MessageProtectionDescriptor.resolve(
            flags: .ephemeral, servedExpiresAt: nil, ephemeralDuration: 60,
            localReceivedAt: now, now: now
        )
        #expect(!ordinaire.isAfterRead)
    }

    @Test("Un envoi mis en file garde sa protection — la flamme-œil comprise")
    func test_fileHorsLigne_rejoueLaProtection() throws {
        let intent = MessageProtectionIntent(ephemeral: .afterRead, isBlurred: true)
        let item = OfflineQueueItem(conversationId: "c1", content: "secret", protection: intent)
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let relu = try decoder.decode(OfflineQueueItem.self, from: encoder.encode(item))
        #expect(relu.replayProtection == intent)
        let duree = OfflineQueueItem(conversationId: "c1", content: "x",
                                     protection: MessageProtectionIntent(ephemeral: .duration(.oneMinute)))
        #expect(duree.replayProtection.ephemeralDurationSeconds == 60)
        #expect(OfflineQueueItem(conversationId: "c1", content: "x").replayProtection.isEmpty)
    }
}
