import XCTest
import CoreMedia
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 19 — la pastille de lieu doit être peinte par `StoryRenderer.render`,
/// la source UNIQUE du premier plan (canvas live, backdrop, compositor
/// d'export). Une pastille dessinée ailleurs (vue SwiftUI par ex.) sortirait
/// invisible de la vidéo exportée — voir doc `StoryRenderer.render`.
@MainActor
final class StoryLocationBadgeRenderTests: XCTestCase {

    /// Rend le layer dans un bitmap alpha-only à ses propres bounds et
    /// retourne l'alpha au point donné — même technique que
    /// `StoryTextLayerInkClippingTests.inkColumns`, seule assertion de
    /// non-vacuité réellement présente dans ce harnais (`isUniformlyTransparent`
    /// n'existe nulle part dans le dépôt).
    private func alpha(of layer: CALayer, at point: CGPoint) throws -> UInt8 {
        let size = layer.bounds.size
        let width = Int(ceil(size.width)), height = Int(ceil(size.height))
        XCTAssertGreaterThan(width, 0); XCTAssertGreaterThan(height, 0)
        var pixels = [UInt8](repeating: 0, count: width * height)
        let ctx = try XCTUnwrap(CGContext(
            data: &pixels, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue))
        layer.render(in: ctx)
        let x = min(max(0, Int(point.x)), width - 1)
        let y = min(max(0, Int(point.y)), height - 1)
        return pixels[y * width + x]
    }

    /// Le point crucial de la tâche : la pastille doit sortir de
    /// `StoryRenderer.render` — la seule source du premier plan (canvas
    /// live, backdrop, compositor d'export lui délèguent tous). On rend une
    /// slide complète (pas juste `StoryLocationLayer` en isolation), on
    /// retrouve le sublayer par son id, puis on prouve qu'un pixel a
    /// réellement été peint en son centre.
    func test_renderer_drawsLocationBadge_soItSurvivesExport() throws {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                                   name: "Tour Eiffel"))
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geometry, at: .zero, mode: .edit)

        let badgeLayer = try XCTUnwrap(
            (root.sublayers ?? []).first { $0.name == "loc-1" },
            "StoryRenderer.render doit produire une layer nommée par l'id de la pastille"
        )
        let center = CGPoint(x: badgeLayer.bounds.midX, y: badgeLayer.bounds.midY)
        let value = try alpha(of: badgeLayer, at: center)
        XCTAssertGreaterThan(value, 8,
                             "Une pastille dessinee hors de StoryRenderer sort invisible de la video exportee.")
    }

    /// « Le point crucial est OU la dessiner » : x/y normalisés + anchor
    /// doivent traverser le MÊME pipeline design→render que `textObjects`
    /// (`geometry.designLength/designHeightLength` puis `geometry.render`) —
    /// sinon la pastille dérive du canvas live à l'export.
    func test_renderer_positionsLocationBadge_atNormalizedCoordinates_likeTextObjects() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "loc-1",
                                place: SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel"),
                                x: 0.25, y: 0.75)
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geometry, at: .zero, mode: .edit)
        let badgeLayer = (root.sublayers ?? []).first { $0.name == "loc-1" }

        let expectedX = geometry.designLength(forNormalized: 0.25)
        let expectedY = geometry.designHeightLength(forNormalized: 0.75)
        let expectedPosition = geometry.render(CGPoint(x: expectedX, y: expectedY))

        XCTAssertEqual(badgeLayer?.position.x ?? -1, expectedPosition.x, accuracy: 0.01)
        XCTAssertEqual(badgeLayer?.position.y ?? -1, expectedPosition.y, accuracy: 0.01)
        XCTAssertEqual(badgeLayer?.zPosition, 0)
    }

    /// zIndex ordonne les pastilles comme les autres items de premier plan
    /// (`render` trie `allItems` par `zIndex` avant de peindre).
    func test_renderer_sortsLocationBadgesByZIndex() {
        var slide = StorySlide(id: "s1")
        slide.locationObjects = [
            StoryLocationObject(id: "back",
                                place: SharedPlace(latitude: 0, longitude: 0, name: "Back"),
                                zIndex: 0),
            StoryLocationObject(id: "front",
                                place: SharedPlace(latitude: 0, longitude: 0, name: "Front"),
                                zIndex: 5)
        ]
        let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let root = StoryRenderer.render(slide: slide, into: geometry, at: .zero, mode: .edit)
        let names = (root.sublayers ?? []).map { $0.name }

        XCTAssertEqual(names, ["back", "front"])
    }

    // MARK: - Label fallback (place.name → place.address → "Ici" localisé)

    func test_resolvedLabel_prefersName() {
        let place = SharedPlace(latitude: 0, longitude: 0, name: "Tour Eiffel", address: "Champ de Mars")
        XCTAssertEqual(StoryLocationLayer.resolvedLabel(for: place), "Tour Eiffel")
    }

    func test_resolvedLabel_fallsBackToAddressWhenNameMissing() {
        let place = SharedPlace(latitude: 0, longitude: 0, name: nil, address: "Champ de Mars")
        XCTAssertEqual(StoryLocationLayer.resolvedLabel(for: place), "Champ de Mars")
    }

    func test_resolvedLabel_fallsBackToLocalizedHereWhenBothMissing() {
        let place = SharedPlace(latitude: 0, longitude: 0, name: nil, address: nil)
        let expected = String(localized: "story.location.here", defaultValue: "Ici", bundle: .module)
        XCTAssertEqual(StoryLocationLayer.resolvedLabel(for: place), expected)
    }
}
