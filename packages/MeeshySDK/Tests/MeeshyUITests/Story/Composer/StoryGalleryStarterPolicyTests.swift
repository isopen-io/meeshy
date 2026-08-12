import XCTest
import MeeshySDK
@testable import MeeshyUI

/// S5 — l'amorce « pellicule » de la page blanche, et ce que son tap déclenche.
///
/// Trois états, une seule règle produit : **aucun prompt à l'ouverture du
/// composer**. Tant que l'accès en lecture n'est pas déjà accordé, le SDK ne
/// reçoit aucune vignette (`latest()` rend `nil` sans rien demander) et
/// l'amorce reste une capsule « Galerie » générique. C'est son TAP — un geste
/// explicite, dans un contexte que l'utilisateur vient de créer — qui autorise
/// la demande d'accès.
///
/// Et le refus ne referme aucune porte : le `PhotosPicker` système, qui ne
/// consomme aucune permission, prend le relais. Aucune impasse, jamais.
final class StoryGalleryStarterPolicyTests: XCTestCase {

    // MARK: - Quelle amorce est proposée

    func test_galleryStarter_withAResolvedRecentAsset_showsTheThumbnail() {
        XCTAssertEqual(
            StoryComposerView.galleryStarter(hasRecentAsset: true, hasCameraRollProvider: true),
            .recentAssetThumbnail,
            "Accès déjà accordé : la dernière photo est à UN geste, le chevron gardant la pellicule complète."
        )
    }

    func test_galleryStarter_providerInjectedButNoAssetResolved_showsThePermissionGatedCapsule() {
        XCTAssertEqual(
            StoryComposerView.galleryStarter(hasRecentAsset: false, hasCameraRollProvider: true),
            .accessRequestCapsule,
            """
            Pas de vignette = accès non accordé (ou pellicule vide). On n'a RIEN \
            demandé à l'ouverture : la capsule générique attend le geste.
            """
        )
    }

    func test_galleryStarter_withoutAnyProvider_fallsBackToTheSystemPicker() {
        XCTAssertEqual(
            StoryComposerView.galleryStarter(hasRecentAsset: false, hasCameraRollProvider: false),
            .systemPickerCapsule,
            "Sans injection app-side, le SDK ne sait rien demander — le PhotosPicker reste la seule porte."
        )
    }

    // MARK: - Ce que le tap déclenche

    func test_galleryTap_whenAccessIsGranted_insertsTheResolvedAsset() {
        let asset = StoryRecentCameraRollAsset(identifier: "PHAsset/42", thumbnail: UIImage())

        XCTAssertEqual(
            StoryComposerView.galleryAccessOutcome(resolved: asset),
            .insertRecentAsset(asset),
            "Accès accordé sur ce geste : la dernière photo entre directement — le geste reste UNIQUE."
        )
    }

    func test_galleryTap_whenAccessIsRefused_opensTheSystemPicker() {
        XCTAssertEqual(
            StoryComposerView.galleryAccessOutcome(resolved: nil),
            .presentSystemPicker,
            """
            Refus, ou pellicule vide : le `PhotosPicker` prend le relais. Laisser \
            l'amorce sans effet ferait d'un refus une impasse définitive.
            """
        )
    }
}
