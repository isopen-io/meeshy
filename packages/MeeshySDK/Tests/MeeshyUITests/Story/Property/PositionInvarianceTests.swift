import Testing
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("Position normalization — invariance")
struct PositionInvarianceTests {

    @Test("normalized 0.5,0.5 always maps to canvas center across devices")
    func center_mapsToCenter() {
        let geometries: [CanvasGeometry] = [
            CanvasGeometry(renderSize: CGSize(width: 412, height: 732)),  // iPhone 16 Pro
            CanvasGeometry(renderSize: CGSize(width: 820, height: 1456)), // iPad Pro M2
            CanvasGeometry(renderSize: CGSize(width: 375, height: 667)),  // iPhone SE 3
        ]
        for g in geometries {
            let p = CGPoint(x: g.designLength(forNormalized: 0.5),
                            y: CanvasGeometry.designHeight * 0.5)
            let rendered = g.render(p)
            #expect(abs(rendered.x - g.renderSize.width * 0.5) < 0.5)
            #expect(abs(rendered.y - g.renderSize.height * 0.5) < 0.5)
        }
    }

    @Test("normalized corners map exactly")
    func corners_mapExactly() {
        let g = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        // Top-left
        let tl = g.render(CGPoint(x: 0, y: 0))
        #expect(abs(tl.x) < 0.5 && abs(tl.y) < 0.5)
        // Bottom-right
        let br = g.render(CGPoint(x: 1080, y: 1920))
        #expect(abs(br.x - 412) < 0.5 && abs(br.y - 732) < 0.5)
    }
}
