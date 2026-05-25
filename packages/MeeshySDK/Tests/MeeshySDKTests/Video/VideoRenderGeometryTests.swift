import Testing
import CoreGraphics
@testable import MeeshySDK

@Suite("VideoRenderGeometry transform math")
struct VideoRenderGeometryTests {

    private let landscape = CGSize(width: 1920, height: 1080)

    @Test("no crop, no rotation preserves the natural size")
    func identityGeometry() {
        let geometry = VideoRenderGeometry.make(
            naturalSize: landscape,
            crop: .full,
            rotationQuarterTurns: 0
        )
        #expect(geometry.renderSize.width == 1920)
        #expect(geometry.renderSize.height == 1080)
    }

    @Test("a quarter turn swaps width and height")
    func quarterTurnSwaps() {
        let geometry = VideoRenderGeometry.make(
            naturalSize: landscape,
            crop: .full,
            rotationQuarterTurns: 1
        )
        #expect(geometry.renderSize.width == 1080)
        #expect(geometry.renderSize.height == 1920)
    }

    @Test("a half turn keeps the original dimensions")
    func halfTurnKeepsSize() {
        let geometry = VideoRenderGeometry.make(
            naturalSize: landscape,
            crop: .full,
            rotationQuarterTurns: 2
        )
        #expect(geometry.renderSize.width == 1920)
        #expect(geometry.renderSize.height == 1080)
    }

    @Test("cropping shrinks the render size proportionally")
    func croppingShrinks() {
        let geometry = VideoRenderGeometry.make(
            naturalSize: landscape,
            crop: NormalizedRect(x: 0, y: 0, width: 0.5, height: 0.5),
            rotationQuarterTurns: 0
        )
        #expect(geometry.renderSize.width == 960)
        #expect(geometry.renderSize.height == 540)
    }

    @Test("render dimensions are always even")
    func dimensionsAreEven() {
        let geometry = VideoRenderGeometry.make(
            naturalSize: CGSize(width: 1081, height: 607),
            crop: .full,
            rotationQuarterTurns: 0
        )
        #expect(geometry.renderSize.width.truncatingRemainder(dividingBy: 2) == 0)
        #expect(geometry.renderSize.height.truncatingRemainder(dividingBy: 2) == 0)
    }

    @Test("centered crop fits a square inside a landscape source")
    func centeredSquareCrop() {
        let rect = NormalizedRect.centered(targetAspect: 1, sourceAspect: 16.0 / 9.0)
        #expect(abs(rect.width - 9.0 / 16.0) < 0.001)
        #expect(abs(rect.height - 1) < 0.001)
        #expect(abs(rect.x - (1 - 9.0 / 16.0) / 2) < 0.001)
    }

    @Test("centered crop fits a wide target inside a portrait source")
    func centeredWideCrop() {
        let rect = NormalizedRect.centered(targetAspect: 16.0 / 9.0, sourceAspect: 9.0 / 16.0)
        #expect(abs(rect.width - 1) < 0.001)
        #expect(rect.height < 1)
    }
}
