import Testing
import Foundation
@testable import MeeshySDK

/// Le CHROME DE PROTECTION d'un message — ce qui le désigne comme éphémère,
/// à vue unique ou flouté — se résout UNE fois, hors de toute vue (#7452).
///
/// Cinq modes de lecture rendent le même message (`focal`, `script`, `summary`,
/// `river`, `bubbles`) et trois seulement portaient un décompte. Un descripteur
/// partagé ne rend pas les modes conformes tout seul — c'est la garde de source
/// qui s'en charge — mais il supprime la raison pour laquelle ils divergeaient :
/// chaque surface relisait `expiresAt`, `isViewOnce` et `isBlurred` à sa façon.
///
/// **Le vocabulaire est celui du COMPOSEUR**, là où l'utilisateur CHOISIT la
/// protection (`EffectsPickerView` : `hourglass`, `eye.slash`, `1.circle`).
/// `flame` désignait la vue unique dans la liste et l'éphémère dans la bulle :
/// le même pictogramme pour deux sens, et aucun des deux n'était celui du choix.
@Suite("MessageProtectionDescriptor — un pictogramme par sens, un chrome pour cinq modes")
struct MessageProtectionDescriptorTests {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test("Un message sans protection n'a aucun badge")
    func test_resolve_sansProtection_rendVide() {
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [], servedExpiresAt: nil, ephemeralDuration: nil, localReceivedAt: nil, now: now
        )
        #expect(descriptor.badges.isEmpty)
        #expect(descriptor.isEmpty)
    }

    @Test("Un éphémère reçu porte son décompte")
    func test_resolve_éphémèreReçu_porteSonDécompte() {
        let received = now.addingTimeInterval(-60)
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.ephemeral], servedExpiresAt: nil, ephemeralDuration: 300,
            localReceivedAt: received, now: now
        )
        #expect(descriptor.badges == [.ephemeral(.running(deadline: received.addingTimeInterval(300)))])
    }

    @Test("Un éphémère dont personne n'a accusé réception attend, sans décompter")
    func test_resolve_éphémèreSansRéception_attend() {
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.ephemeral], servedExpiresAt: nil, ephemeralDuration: 300,
            localReceivedAt: nil, now: now
        )
        #expect(descriptor.badges == [.ephemeral(.awaitingReception(duration: 300))])
    }

    @Test("Un éphémère expiré ne porte plus de badge — le message a disparu")
    func test_resolve_éphémèreExpiré_neRendAucunBadge() {
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.ephemeral], servedExpiresAt: now.addingTimeInterval(-1),
            ephemeralDuration: 300, localReceivedAt: nil, now: now
        )
        #expect(descriptor.badges.isEmpty)
        #expect(descriptor.isExpired)
    }

    @Test("La vue unique se désigne, même sans flou")
    func test_resolve_vueUnique_porteSonBadge() {
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.viewOnce], servedExpiresAt: nil, ephemeralDuration: nil,
            localReceivedAt: nil, now: now
        )
        #expect(descriptor.badges == [.viewOnce])
    }

    @Test("Vue unique et éphémère cohabitent, chacun son badge")
    func test_resolve_vueUniqueEtÉphémère_rendentDeuxBadges() {
        let received = now.addingTimeInterval(-60)
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.viewOnce, .ephemeral], servedExpiresAt: nil, ephemeralDuration: 300,
            localReceivedAt: received, now: now
        )
        #expect(descriptor.badges.count == 2)
        #expect(descriptor.badges.contains(.viewOnce))
    }

    @Test("Le pictogramme de chaque sens est celui du composeur")
    func test_symboles_reprennentLeVocabulaireDuComposeur() {
        #expect(MessageProtectionSymbols.ephemeral == "hourglass")
        #expect(MessageProtectionSymbols.viewOnce == "1.circle")
        #expect(MessageProtectionSymbols.blurred == "eye.slash")
    }

    @Test("Aucun sens ne partage son pictogramme avec un autre")
    func test_symboles_sontDistinctsDeuxÀDeux() {
        let all = [
            MessageProtectionSymbols.ephemeral,
            MessageProtectionSymbols.viewOnce,
            MessageProtectionSymbols.blurred,
        ]
        #expect(Set(all).count == all.count)
    }

    @Test("Le pictogramme rempli reste celui du même sens")
    func test_symbolesRemplis_dériventDuMêmeSens() {
        #expect(MessageProtectionSymbols.viewOnceFilled == "1.circle.fill")
        #expect(MessageProtectionSymbols.ephemeralFilled == "hourglass")
    }
}
