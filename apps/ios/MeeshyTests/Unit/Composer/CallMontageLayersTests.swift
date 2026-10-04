import XCTest
import CoreImage
@testable import Meeshy

/// **Les classiques en couches** (#9348, spec § 4.2) : chaque style se cuit en
/// scène, et la scène composée sur le GPU rend ce que le peintre CPU rendait.
@MainActor
final class CallMontageLayersTests: XCTestCase {

    private let personne = CallFramePerson(id: "moi", name: "Ada", handle: "ada", isSelf: true)
    private let legende = CallMontageCaption(title: "Meeshy", subtitle: "4 oct. 2026")
    private let toile = CGSize(width: 108, height: 192)

    func test_layers_everyClassicStyle_producesASceneWithOneSlot() {
        for style in CallMontageStyle.allCases {
            let scene = CallMontageRenderer.layers(style: style, person: personne, caption: legende, size: toile)
            XCTAssertNotNil(scene, "\(style) se découpe en couches")
            XCTAssertEqual(scene?.slots.count, 1, "\(style) : une personne, une découpe")
            XCTAssertNotNil(scene?.slots.first?.placement, "\(style) : la case se pose par la transformation relevée")
        }
    }

    func test_layers_composedOnGPU_matchesTheHistoricalCPURender() throws {
        let photo = Self.photo()
        let contexte = CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
        for style in CallMontageStyle.allCases {
            let cpu = try XCTUnwrap(CallMontageRenderer.render(
                style: style,
                portraits: [CallMontagePortrait(id: personne.id, name: personne.name, image: photo)],
                canvas: toile, caption: legende))
            let scene = try XCTUnwrap(CallMontageRenderer.layers(style: style, person: personne,
                                                                 caption: legende, size: toile))
            let gpu = CallLiveFrameCompositor().compose(scene, videos: [personne.id: CIImage(cgImage: photo)])
            let a = Self.rgba(CIImage(cgImage: cpu), size: toile, context: contexte)
            let b = Self.rgba(gpu, size: toile, context: contexte)
            let ecart = Self.meanGap(a, b)
            let tolerance = style == .noir ? 0.10 : 0.035
            print("CallMontageLayers écart \(style.rawValue) = \(ecart)")
            XCTAssertLessThan(ecart, tolerance, "\(style) : écart moyen \(ecart) entre les couches et le rendu CPU")
        }
    }

    func test_render_withoutHole_isUnchangedForCalls() throws {
        let photo = Self.photo()
        let avant = try XCTUnwrap(CallMontageRenderer.render(
            style: .polaroid, portraits: [CallMontagePortrait(id: "a", name: "A", image: photo)],
            canvas: toile, caption: legende))
        XCTAssertEqual(avant.width, 108, "le chemin CPU des appels ne change pas")
    }

    func test_tone_noirIsMono_othersInColor() {
        XCTAssertEqual(CallMontageRenderer.tone(of: .noir), .mono)
        XCTAssertEqual(CallMontageRenderer.tone(of: .polaroid), .color)
    }

    // MARK: - Outils

    static func photo() -> CGImage {
        let contexte = CGContext(data: nil, width: 300, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 150, height: 400))
        contexte.setFillColor(CGColor(red: 0.1, green: 0.3, blue: 0.9, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 0, width: 150, height: 200))
        contexte.setFillColor(CGColor(red: 0.2, green: 0.8, blue: 0.3, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 200, width: 150, height: 200))
        return contexte.makeImage()!
    }

    static func meanGap(_ a: [UInt8], _ b: [UInt8]) -> Double {
        let somme: Double = zip(a, b).reduce(0.0) { (total: Double, paire: (UInt8, UInt8)) -> Double in
            total + abs(Double(paire.0) - Double(paire.1))
        }
        return somme / Double(max(a.count, 1)) / 255
    }

    static func rgba(_ image: CIImage, size: CGSize, context: CIContext) -> [UInt8] {
        let largeur = Int(size.width), hauteur = Int(size.height)
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        context.render(image, toBitmap: &octets, rowBytes: largeur * 4, bounds: CGRect(origin: .zero, size: size),
                       format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }
}
