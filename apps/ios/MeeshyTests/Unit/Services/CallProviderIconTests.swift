import XCTest
import UIKit
@testable import Meeshy

/// `CallKitIcon` — l'asset template qui porte l'identité Meeshy dans l'UI
/// d'appel CallKit (`CXProviderConfiguration.iconTemplateImageData`).
///
/// Ces tests existent parce que l'asset n'a jamais été livré : `CallManager`
/// le chargeait derrière un `if let` nu, donc la carte d'appel a expédié sans
/// glyphe de marque depuis le premier build, en silence.
///
/// L'assertion qui compte est celle sur le canal alpha. `iconTemplateImageData`
/// est un TEMPLATE : iOS jette les canaux couleur et ne lit que l'alpha. Un
/// test qui se contenterait de vérifier la présence de l'asset passerait au
/// vert sur une image entièrement opaque — laquelle rend un rectangle plein,
/// exactement le défaut qu'on cherche à interdire.
final class CallProviderIconTests: XCTestCase {

    /// Taille prescrite par Apple pour l'icône de provider CallKit.
    private static let expectedPointSize = CGSize(width: 40, height: 40)

    private func loadIcon(file: StaticString = #filePath, line: UInt = #line) throws -> UIImage {
        // `bundle: .main` explicitement : le bundle de tests est hébergé dans
        // Meeshy.app, mais un `UIImage(named:)` nu résout contre le bundle du
        // code appelant — qui n'est pas celui qui porte le catalogue.
        let icon = UIImage(named: "CallKitIcon", in: .main, compatibleWith: nil)
        return try XCTUnwrap(icon, "CallKitIcon absent du catalogue d'assets", file: file, line: line)
    }

    func test_callKitIcon_isPresentInAssetCatalog() throws {
        XCTAssertNoThrow(try loadIcon())
    }

    func test_callKitIcon_measures40x40Points() throws {
        let icon = try loadIcon()
        XCTAssertEqual(icon.size, Self.expectedPointSize)
    }

    /// Le cœur du test : l'image doit porter un glyphe DÉCOUPÉ, donc mélanger
    /// des pixels transparents et des pixels opaques. Une image uniformément
    /// opaque (ou uniformément vide) est un échec.
    func test_callKitIcon_hasNonTrivialAlphaChannel() throws {
        let icon = try loadIcon()
        let alphas = try alphaSamples(of: icon)

        XCTAssertTrue(alphas.contains { $0 == 0 },
                      "Aucun pixel transparent : le template rendrait un rectangle plein")
        XCTAssertTrue(alphas.contains { $0 == 255 },
                      "Aucun pixel opaque : le template ne rendrait aucun glyphe")
    }

    /// Le glyphe doit occuper une part significative du cadre. À 40 pt, un
    /// glyphe qui garde les marges généreuses d'une icône d'app est illisible.
    func test_callKitIcon_glyphFillsTheFrame() throws {
        let icon = try loadIcon()
        let alphas = try alphaSamples(of: icon)
        let covered = alphas.filter { $0 > 0 }.count

        XCTAssertGreaterThan(Double(covered) / Double(alphas.count), 0.10,
                             "Glyphe trop petit dans le cadre pour être lisible à 40 pt")
    }

    // MARK: - Helpers

    /// Redessine l'image dans un contexte RGBA connu avant de lire l'alpha :
    /// le `CGImage` d'un asset catalog n'a pas de format garanti, et lire
    /// directement son `dataProvider` dépendrait de l'encodage retenu par le
    /// compilateur d'assets.
    private func alphaSamples(of image: UIImage) throws -> [UInt8] {
        let cgImage = try XCTUnwrap(image.cgImage, "CallKitIcon sans représentation bitmap")
        let width = cgImage.width
        let height = cgImage.height
        var buffer = [UInt8](repeating: 0, count: width * height * 4)

        let context = try XCTUnwrap(CGContext(
            data: &buffer,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        return stride(from: 3, to: buffer.count, by: 4).map { buffer[$0] }
    }
}
