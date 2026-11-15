import XCTest
import Foundation
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class CommunityMemberSectionTests: XCTestCase {

    private static let languages = ["fr", "en", "de", "es", "pt-BR", "it", "ar"]

    private func lproj(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.module.path(forResource: code, ofType: "lproj"),
            "\(code).lproj absent de Bundle.module"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    private func makeMember(id: String, role: String) throws -> APICommunityMember {
        let json = #"{"id":"\#(id)","communityId":"c1","userId":"u-\#(id)","role":"\#(role)"}"#
        return try JSONDecoder().decode(APICommunityMember.self, from: Data(json.utf8))
    }

    func test_sections_groupeParRole_ordreCreateurAdminModerateurMembre_rolesVidesOmis() throws {
        let members = try [
            makeMember(id: "m1", role: "member"),
            makeMember(id: "m2", role: "member"),
            makeMember(id: "a1", role: "admin"),
            makeMember(id: "c1", role: "creator"),
            makeMember(id: "m3", role: "member")
        ]

        let sections = CommunityMemberSection.sections(from: members)

        XCTAssertEqual(sections.map(\.role), [.creator, .admin, .member])
        XCTAssertEqual(sections.map(\.members.count), [1, 1, 3])
        XCTAssertEqual(sections.last?.members.map(\.id), ["m1", "m2", "m3"])
    }

    func test_sections_listeVide_rendAucuneSection() {
        XCTAssertTrue(CommunityMemberSection.sections(from: []).isEmpty)
    }

    func test_sections_roleInconnu_retombeSurMembre() throws {
        let sections = CommunityMemberSection.sections(from: [try makeMember(id: "x", role: "inconnu")])

        XCTAssertEqual(sections.map(\.role), [.member])
    }

    func test_sectionTitle_lprojEnEtFr() throws {
        XCTAssertEqual(MemberRole.admin.sectionTitle(in: try lproj("en")), "Admins")
        XCTAssertEqual(MemberRole.creator.sectionTitle(in: try lproj("en")), "Creators")
        XCTAssertEqual(MemberRole.member.sectionTitle(in: try lproj("fr")), "Membres")
        XCTAssertEqual(MemberRole.moderator.sectionTitle(in: try lproj("fr")), "Modérateurs")
    }

    func test_sectionTitle_resoluDansLesSeptLangues() throws {
        for code in Self.languages {
            for role in MemberRole.allCases {
                let title = role.sectionTitle(in: try lproj(code))
                XCTAssertFalse(title.isEmpty, "\(role) \(code)")
                XCTAssertFalse(title.hasPrefix("community.members.section."), "\(role) \(code)")
            }
        }
    }
}
