import Foundation
import XCTest
@testable import MeeshyUI

/// #11847 — **une prise de la caméra entre dans la story par ses OCTETS** : le
/// fichier du média est écrit tel quel, sous l'extension que les octets disent,
/// sans seconde génération JPEG.
final class StoryCapturedPhotoFileTests: XCTestCase {

    private static let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3])
    private static let heic = Data([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 4, 5])
    private static let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D])

    func test_fileName_followsTheBytes_neverAGuess() {
        XCTAssertEqual(StoryCapturedPhotoFile.fileName(objectId: "obj", data: Self.jpeg), "obj.jpg")
        XCTAssertEqual(StoryCapturedPhotoFile.fileName(objectId: "obj", data: Self.heic), "obj.heic")
        XCTAssertEqual(StoryCapturedPhotoFile.fileName(objectId: "obj", data: Self.png), "obj.png")
        XCTAssertNil(StoryCapturedPhotoFile.fileName(objectId: "obj", data: Data([1, 2, 3])))
    }

    func test_write_keepsTheBytesOfTheTake_byteForByte() throws {
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dossier) }

        let url = try XCTUnwrap(StoryCapturedPhotoFile.write(Self.heic, objectId: "prise", in: dossier))

        XCTAssertEqual(url.lastPathComponent, "prise.heic")
        XCTAssertEqual(try Data(contentsOf: url), Self.heic)
    }

    func test_write_refusesBytesThatAreNotAPhoto() {
        XCTAssertNil(StoryCapturedPhotoFile.write(Data([1, 2, 3]), objectId: "x", in: FileManager.default.temporaryDirectory))
    }
}
