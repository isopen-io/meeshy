import XCTest
@testable import MeeshyUI

/// Contrat d'identité du contenu de fond (`StoryBackgroundLayer.contentIdentity`).
///
/// BUG-1 (user 2026-07-04) : l'identité d'un fond couleur valait « color »
/// quelle que soit la couleur — le no-op diff de `configure()` avalait donc
/// tout changement de pastille (`hasVisibleContent` était satisfait par
/// l'ANCIENNE couleur) et le canvas ne se mettait jamais à jour, alors que la
/// mini-preview SwiftUI (qui lit `effects` directement) devenait rouge.
final class StoryBackgroundLayerIdentityTests: XCTestCase {

    func test_solidColor_identityChangesWithColor() {
        let red = StoryBackgroundLayer.contentIdentity(for: .solidColor(.red))
        let blue = StoryBackgroundLayer.contentIdentity(for: .solidColor(.blue))
        XCTAssertNotEqual(red, blue,
            "Changer de pastille DOIT invalider le no-op diff du configure")
    }

    func test_solidColor_identityStableForSameColor() {
        let a = StoryBackgroundLayer.contentIdentity(for: .solidColor(.red))
        let b = StoryBackgroundLayer.contentIdentity(for: .solidColor(.red))
        XCTAssertEqual(a, b, "Même couleur = même identité (anti-flash préservé)")
    }

    func test_gradient_identityChangesWithColors() {
        let a = StoryBackgroundLayer.contentIdentity(
            for: .gradient(colors: [.red, .blue], direction: .topToBottom))
        let b = StoryBackgroundLayer.contentIdentity(
            for: .gradient(colors: [.green, .blue], direction: .topToBottom))
        XCTAssertNotEqual(a, b)
    }

    func test_mediaIdentity_ignoresDynamicParams() {
        let muted = StoryBackgroundLayer.contentIdentity(
            for: .video(postMediaId: "v1", looping: true, mute: true, thumbHash: nil))
        let loud = StoryBackgroundLayer.contentIdentity(
            for: .video(postMediaId: "v1", looping: true, mute: false, thumbHash: nil))
        XCTAssertEqual(muted, loud,
            "mute reste dynamique (property AVPlayer) — pas une identité")
    }
}
