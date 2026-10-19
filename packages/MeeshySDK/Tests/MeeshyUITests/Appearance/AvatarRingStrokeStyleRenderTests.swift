import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// #10936 — un contour `none` n'a AUCUN trait de base : l'ornement dessine tout (miroir de `ringStroke`,
/// `packages/shared/utils/appearance-svg.ts`). Le même contour en `solid` peint l'anneau ; la référence
/// porte un ornement central pour que le rendu ne soit jamais vide.
@MainActor
final class AvatarRingStrokeStyleRenderTests: XCTestCase {

    private func ring(_ style: String) throws -> AvatarRingDesign {
        let json = ##"{"key":"k","stroke":{"style":"\##(style)","width":0.08,"colors":["#B3261E"]},"ornament":{"paths":[{"d":"M40 40 h20 v20 h-20 Z","color":0,"opacity":1}]}}"##
        return try JSONDecoder().decode(AvatarRingDesign.self, from: Data(json.utf8))
    }

    private func alpha(_ design: AvatarRingDesign, x: Int, y: Int) throws -> UInt8 {
        let renderer = ImageRenderer(content: AvatarRingView(design: design, animates: false).frame(width: 100, height: 100))
        renderer.scale = 1
        let cg = try XCTUnwrap(renderer.cgImage)
        var data = [UInt8](repeating: 0, count: 4)
        let context = try XCTUnwrap(CGContext(data: &data, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(cg, in: CGRect(x: -CGFloat(x), y: -CGFloat(cg.height - 1 - y), width: CGFloat(cg.width), height: CGFloat(cg.height)))
        return data[3]
    }

    func test_none_paintsTheOrnamentButNoBaseRing() throws {
        let design = try ring("none")
        XCTAssertGreaterThan(try alpha(design, x: 50, y: 50), 200, "l'ornement se peint")
        XCTAssertEqual(try alpha(design, x: 50, y: 4), 0, "aucun anneau de base")
    }

    func test_solid_paintsTheBaseRing() throws {
        XCTAssertGreaterThan(try alpha(try ring("solid"), x: 50, y: 4), 200)
    }
}
