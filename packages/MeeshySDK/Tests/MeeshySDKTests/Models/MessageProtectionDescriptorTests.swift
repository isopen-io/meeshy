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

    /// La table arrêtée par la directive porteur du 2026-09-22 : « vue unique
    /// c'est "1" cerclé plutôt, et l'œil représente le flou ! » — l'éphémère
    /// restant la flamme.
    @Test("Chaque protection a SON pictogramme, et c'est celui de la directive")
    func test_symboles_suiventLaTableDuPorteur() {
        #expect(MessageProtectionSymbols.ephemeral == "flame")
        #expect(MessageProtectionSymbols.viewOnce == "1.circle")
        #expect(MessageProtectionSymbols.blurred == "eye.slash")
    }

    /// **Deux protections n'en partagent aucun.** C'est la moitié de la règle
    /// qui a réellement été violée : `flame` a désigné la VUE UNIQUE dans la
    /// ligne de liste pendant qu'il désignait l'ÉPHÉMÈRE dans la bulle.
    @Test("Aucun sens ne partage son pictogramme avec un autre, plein comme vide")
    func test_symboles_sontDistinctsDeuxÀDeux() {
        #expect(Set(MessageProtectionSymbols.all).count == MessageProtectionSymbols.all.count)
        #expect(Set(MessageProtectionSymbols.allFilled).count == MessageProtectionSymbols.allFilled.count)
        // Un pictogramme PLEIN ne doit pas non plus être le pictogramme VIDE
        // d'un autre sens : l'état actif d'une protection se lirait comme
        // l'état au repos d'une autre.
        #expect(Set(MessageProtectionSymbols.all).isDisjoint(with: Set(MessageProtectionSymbols.allFilled)))
    }

    @Test("Le pictogramme rempli reste celui du même sens")
    func test_symbolesRemplis_dériventDuMêmeSens() {
        #expect(MessageProtectionSymbols.viewOnceFilled == "1.circle.fill")
        #expect(MessageProtectionSymbols.ephemeralFilled == "flame.fill")
        #expect(MessageProtectionSymbols.blurredFilled == "eye.slash.fill")
    }
}
