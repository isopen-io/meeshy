import XCTest
import SwiftUI
import CryptoKit
import MeeshySDK
@testable import MeeshyUI

/// #10756 — la couche animée d'une bannière ne fixe jamais sa taille : le design 3:1 la fixe.
/// Un film carré posé en `.fill` dans un `ZStack` demandait une hauteur carrée, et la tuile
/// « Aurore vive » de la feuille « Contour et bannière » sortait trois fois plus haute que
/// ses voisines.
@MainActor
final class BannerDesignViewLayoutTests: XCTestCase {

    private static let squareFilm = """
    {"v":"5.7.0","fr":30,"ip":0,"op":60,"w":100,"h":100,"nm":"NAME","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"s","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[50,50,0]},"a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ty":"rc","d":1,"s":{"a":0,"k":[20,20]},"p":{"a":0,"k":[0,0]},"r":{"a":0,"k":0}},{"ty":"fl","c":{"a":0,"k":[1,0,0,1]},"o":{"a":0,"k":100},"r":1},{"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}]}],"ip":0,"op":60,"st":0,"bm":0}]}
    """

    func test_aLoadedSquareLottieLayer_neverGrowsTheBannerBeyondItsThreeToOneFrame() async throws {
        let data = Data(Self.squareFilm.replacingOccurrences(of: "NAME", with: UUID().uuidString).utf8)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let ref = try XCTUnwrap(PackAssetRef(src: "\(digest.prefix(16)).json", bytes: data.count, sha256: digest))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("banner-layout-\(UUID().uuidString)", isDirectory: true)
        let store = ContentAddressedStore(directory: directory, fetcher: FixedFetcher(data: data))
        let loaded = await LottieLayerSource.film(for: ref, store: store)
        XCTAssertNotNil(loaded, "le film est en mémoire : la couche se monte dès la première mise en page")

        let design = try animatedDesign(lottie: ref)
        let host = UIHostingController(rootView:
            BannerDesignView(design: design, isDark: false, accentHex: "#6366F1", animates: false)
                .aspectRatio(3, contentMode: .fit)
        )
        let size = host.sizeThatFits(in: CGSize(width: 300, height: CGFloat.greatestFiniteMagnitude))

        XCTAssertEqual(size.width, 300, accuracy: 1)
        XCTAssertEqual(size.height, 100, accuracy: 1, "la bannière garde son cadre 3:1, quelle que soit la forme du film")
    }

    private func animatedDesign(lottie ref: PackAssetRef) throws -> AppearanceDesign {
        let base = try XCTUnwrap(AppearanceCatalog.shared.wallpaper(pack: "heritages", design: "zellige"))
        var object = try XCTUnwrap(try JSONSerialization.jsonObject(with: JSONEncoder().encode(base)) as? [String: Any])
        object["lottie"] = ["src": ref.src, "bytes": ref.bytes, "sha256": ref.sha256]
        return try JSONDecoder().decode(AppearanceDesign.self, from: JSONSerialization.data(withJSONObject: object))
    }
}

private struct FixedFetcher: PackAssetFetching {
    let data: Data
    func fetch(file name: String) async throws -> Data { data }
}
