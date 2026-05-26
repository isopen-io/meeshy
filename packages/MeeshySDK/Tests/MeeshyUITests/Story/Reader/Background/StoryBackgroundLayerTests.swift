// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift
import XCTest
@testable import MeeshyUI

@MainActor
final class StoryBackgroundLayerTests: XCTestCase {
    func test_configure_solidColor_setsBackgroundColor() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        XCTAssertEqual(layer.backgroundColor, UIColor.red.cgColor)
    }

    func test_configure_gradient_addsGradientSublayer() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .gradient(colors: [.red, .blue], direction: .topToBottom),
                        transform: .identity, geometry: geom, resolver: nil, imageCache: nil)
        let gradient = layer.sublayers?.first { $0 is CAGradientLayer } as? CAGradientLayer
        XCTAssertNotNil(gradient)
        XCTAssertEqual(gradient?.colors?.count, 2)
    }

    func test_configure_appliesTransform() {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.black),
                        transform: BackgroundTransform(scale: 2.0),
                        geometry: geom, resolver: nil, imageCache: nil)
        XCTAssertEqual(layer.transform.m11, 2.0, accuracy: 1e-9)
    }

    func test_configure_sameSolidColorTwice_isNoOp() throws {
        let layer = StoryBackgroundLayer()
        let geom = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let sublayerCountBefore = layer.sublayers?.count ?? 0

        // Capture color components (not CGColor identity — UIColor caches its
        // .cgColor but the cache isn't a guaranteed invariant; comparing RGBA
        // via getRed() is the robust check the user-facing pixel sees).
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        if let cg = layer.backgroundColor {
            UIColor(cgColor: cg).getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        }

        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let sublayerCountAfter = layer.sublayers?.count ?? 0
        XCTAssertEqual(sublayerCountBefore, sublayerCountAfter)

        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        if let cg = layer.backgroundColor {
            UIColor(cgColor: cg).getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        }
        XCTAssertEqual(r1, r2, accuracy: 1e-9)
        XCTAssertEqual(g1, g2, accuracy: 1e-9)
        XCTAssertEqual(b1, b2, accuracy: 1e-9)
        XCTAssertEqual(a1, a2, accuracy: 1e-9)
    }
}
