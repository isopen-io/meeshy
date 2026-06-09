import Testing
import Foundation
@testable import MeeshySDK

/// D4 — responsive image variants must decode from the gateway payload so a
/// client can pick a lighter WebP instead of the multi-MB original.
struct ImageVariantDecodingTests {
    private func decodeAttachment(_ json: String) throws -> APIMessageAttachment {
        try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
    }

    @Test func variant_decodesAllFields() throws {
        let json = #"{"width":640,"height":480,"url":"/v/640.webp","size":42000,"format":"webp"}"#
        let v = try JSONDecoder().decode(MeeshyImageVariant.self, from: Data(json.utf8))
        #expect(v.width == 640)
        #expect(v.height == 480)
        #expect(v.url == "/v/640.webp")
        #expect(v.size == 42000)
        #expect(v.format == "webp")
    }

    @Test func apiAttachment_decodesImageVariantsArray() throws {
        let json = """
        {
          "id": "att1",
          "fileUrl": "/full.jpg",
          "mimeType": "image/jpeg",
          "width": 4000,
          "height": 3000,
          "imageVariants": [
            {"width":320,"height":240,"url":"/v/320.webp","size":12000,"format":"webp"},
            {"width":640,"height":480,"url":"/v/640.webp","size":42000,"format":"webp"}
          ]
        }
        """
        let att = try decodeAttachment(json)
        #expect(att.imageVariants?.count == 2)
        #expect(att.imageVariants?.first?.width == 320)
        #expect(att.imageVariants?.last?.url == "/v/640.webp")
    }

    @Test func apiAttachment_withoutVariants_decodesNil() throws {
        let json = #"{"id":"att2","fileUrl":"/x.jpg","mimeType":"image/jpeg"}"#
        let att = try decodeAttachment(json)
        #expect(att.imageVariants == nil)
    }

    @Test func domainAttachment_roundTripsVariants() throws {
        let original = MeeshyMessageAttachment(
            id: "a",
            mimeType: "image/jpeg",
            fileUrl: "/full.jpg",
            width: 2000, height: 1500,
            imageVariants: [MeeshyImageVariant(width: 640, height: 480, url: "/v/640.webp", size: 42000)]
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MeeshyMessageAttachment.self, from: data)
        #expect(decoded.imageVariants?.first?.width == 640)
        #expect(decoded.imageVariants?.first?.format == "webp")
    }
}
