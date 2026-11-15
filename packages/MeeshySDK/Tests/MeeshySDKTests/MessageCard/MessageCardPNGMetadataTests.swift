import Foundation
import Testing
@testable import MeeshySDK

/// Le PNG exporté dit qui l'a créé : Meeshy — et rien de l'exportateur.
struct MessageCardPNGMetadataTests {

    private static func bigEndian(_ value: UInt32) -> [UInt8] {
        [UInt8((value >> 24) & 0xFF), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)]
    }

    private static func chunk(_ type: String, _ data: [UInt8]) -> [UInt8] {
        let body = Array(type.utf8) + data
        return bigEndian(UInt32(data.count)) + body + bigEndian(MessageCardPNGMetadata.crc32(body))
    }

    /// Un PNG minimal : signature, IHDR 1×1, IEND.
    private static let minimalPNG: Data = {
        let signature: [UInt8] = [137, 80, 78, 71, 13, 10, 26, 10]
        let ihdr = chunk("IHDR", bigEndian(1) + bigEndian(1) + [8, 6, 0, 0, 0])
        return Data(signature + ihdr + chunk("IEND", []))
    }()

    @Test func crc32_matchesTheStandardValue() {
        #expect(MessageCardPNGMetadata.crc32(Array("IEND".utf8)) == 0xAE42_6082)
    }

    @Test func stamp_namesMeeshyAsCreator_inTextAndXMP() throws {
        let stamped = MessageCardPNGMetadata.meeshy.stamp(Self.minimalPNG)
        let chunks = MessageCardPNGMetadata.textChunks(of: stamped)
        #expect(chunks["Software"] == "Meeshy")
        #expect(chunks["Source"] == "Meeshy")
        #expect(chunks["Comment"] == "Created with Meeshy (https://meeshy.me)")
        let xmp = try #require(chunks["XML:com.adobe.xmp"])
        #expect(xmp.contains("<xmp:CreatorTool>Meeshy</xmp:CreatorTool>"))
    }

    @Test func stamp_insertsRightAfterIHDR_andKeepsEveryOriginalByte() {
        let original = [UInt8](Self.minimalPNG)
        let stamped = [UInt8](MessageCardPNGMetadata.meeshy.stamp(Self.minimalPNG))
        let ihdrEnd = 8 + 12 + 13
        #expect(Array(stamped.prefix(ihdrEnd)) == Array(original.prefix(ihdrEnd)))
        #expect(Array(stamped.suffix(original.count - ihdrEnd)) == Array(original.suffix(original.count - ihdrEnd)))
        #expect(String(decoding: stamped[(ihdrEnd + 4)..<(ihdrEnd + 8)], as: UTF8.self) == "tEXt")
    }

    @Test func stamp_leavesAnythingElseUntouched() {
        let notPNG = Data("pas une image".utf8)
        #expect(MessageCardPNGMetadata.meeshy.stamp(notPNG) == notPNG)
    }
}
