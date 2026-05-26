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
        let firstBgColor = layer.backgroundColor
        let sublayerCountBefore = layer.sublayers?.count ?? 0
        layer.configure(kind: .solidColor(.red), transform: .identity,
                        geometry: geom, resolver: nil, imageCache: nil)
        let sublayerCountAfter = layer.sublayers?.count ?? 0
        XCTAssertEqual(sublayerCountBefore, sublayerCountAfter)
        XCTAssertEqual(layer.backgroundColor, firstBgColor)
    }
}
