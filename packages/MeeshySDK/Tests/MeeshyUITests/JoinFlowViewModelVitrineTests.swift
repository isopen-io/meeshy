import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// La vitrine (#8855) capture l'accueil d'un lien une fois son aperçu SERVI (#8921).
final class JoinFlowViewModelVitrineTests: XCTestCase {
    override func tearDown() {
        JoinFlowViewModel.debugOnPreviewShown = nil
        ShareLinkService.debugLinkInfoOverride = nil
        super.tearDown()
    }

    @MainActor
    func test_loadLinkInfo_announcesThePreviewOnceTheLinkIsServed() async throws {
        let info = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? info : nil }
        let annonces = Annonces()
        JoinFlowViewModel.debugOnPreviewShown = { annonces.nombre += 1 }

        let viewModel = JoinFlowViewModel(identifier: "lisboa-2026")
        await viewModel.loadLinkInfo()

        XCTAssertEqual(viewModel.phase, .preview)
        XCTAssertEqual(annonces.nombre, 1)
    }

    @MainActor
    func test_loadLinkInfo_straightToTheForm_announcesNoPreview() async throws {
        let info = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? info : nil }
        let annonces = Annonces()
        JoinFlowViewModel.debugOnPreviewShown = { annonces.nombre += 1 }

        let viewModel = JoinFlowViewModel(identifier: "lisboa-2026", entry: .anonymousForm)
        await viewModel.loadLinkInfo()

        XCTAssertEqual(annonces.nombre, 0)
    }

    private static func info(linkId: String) throws -> ShareLinkInfo {
        let json = #"{"id":"l1","linkId":"LINK","conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"},"creator":{"id":"u1","username":"aiko.t"},"stats":{"totalParticipants":6,"memberCount":6,"anonymousCount":0,"languageCount":5,"spokenLanguages":["ja","pt","en","ko","es"]}}"#
            .replacingOccurrences(of: "LINK", with: linkId)
        return try APIClient.makeAPIPayloadDecoder().decode(ShareLinkInfo.self, from: Data(json.utf8))
    }
}

@MainActor
private final class Annonces {
    nonisolated deinit {}

    var nombre = 0
}
