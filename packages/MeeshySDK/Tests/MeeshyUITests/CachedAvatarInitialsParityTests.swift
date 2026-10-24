import XCTest
@testable import MeeshyUI

/// #12568 — une personne a UN visage : les initiales montrées pendant le
/// chargement (ou après un échec) de `CachedAvatarImage` sont EXACTEMENT celles
/// d'un `MeeshyAvatar` sans photo, sinon le cercle change de lettres à
/// l'arrivée de la photo.
@MainActor
final class CachedAvatarInitialsParityTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_fallbackInitials_followTheAvatarWithoutPhoto() {
        let names = ["Théo (foot)", "Ada Lovelace", "Jean Charles Mbiada", "Élodie Çağ", "😀 Zoé", "😀", "   ", "", "(((", "Bjarne"]
        for name in names {
            XCTAssertEqual(CachedAvatarImage.fallbackInitials(for: name), MeeshyAvatar.initials(for: name),
                           "Les initiales de chargement de « \(name) » doivent être celles de l'avatar sans photo.")
        }
    }

    func test_fallbackInitials_ignorePunctuationLikeTheAvatar() {
        XCTAssertEqual(CachedAvatarImage.fallbackInitials(for: "Théo (foot)"), "TF")
    }

    func test_cachedAvatarImage_paintsItsFallbackWithTheSharedFace() throws {
        let src = try source("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")
        guard let start = src.range(of: "public struct CachedAvatarImage: View {"),
              let end = src.range(of: "public struct CachedBannerImage: View {") else {
            return XCTFail("CachedAvatarImage introuvable")
        }
        let avatar = String(src[start.lowerBound..<end.lowerBound])
        XCTAssertTrue(avatar.contains("AvatarInitialsFace("),
                      "Le repli de CachedAvatarImage doit réutiliser le visage d'initiales de MeeshyAvatar (dégradé, graisse).")
        XCTAssertFalse(avatar.contains("components(separatedBy"),
                       "CachedAvatarImage ne découpe plus le nom lui-même : il délègue à MeeshyAvatar.initials(for:).")
    }

    func test_meeshyAvatarWithoutPhoto_usesTheSharedFace() throws {
        let src = try source("Sources/MeeshyUI/Primitives/MeeshyAvatar.swift")
        XCTAssertTrue(src.contains("AvatarInitialsFace("),
                      "MeeshyAvatar sans photo doit peindre le même visage que le repli de CachedAvatarImage.")
    }

    func test_cachedAvatarImage_refreshesItsThumbHashWhenTheURLChanges() throws {
        let src = try source("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")
        guard let start = src.range(of: "public struct CachedAvatarImage: View {"),
              let end = src.range(of: "public struct CachedBannerImage: View {") else {
            return XCTFail("CachedAvatarImage introuvable")
        }
        let avatar = String(src[start.lowerBound..<end.lowerBound])
        guard let onChange = avatar.range(of: ".adaptiveOnChange(of: urlString)") else {
            return XCTFail("adaptiveOnChange(of: urlString) introuvable")
        }
        let tail = String(avatar[onChange.lowerBound...].prefix(700))
        XCTAssertTrue(tail.contains("thumbHashImage ="),
                      "Un changement d'URL ne doit pas garder le flou de la personne précédente.")
    }
}

@MainActor
final class InviteAccountFaceWiringTests: XCTestCase {
    func test_inviteChoicesPanel_accountChipIsAnAvatarNotBareInitials() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/JoinFlow/InviteLanding/InviteChoicesPanel.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("CachedAvatarImage("), "La pastille du compte montre sa photo, sinon ses initiales.")
        XCTAssertTrue(source.contains("urlString: face.avatarURL"))
        XCTAssertFalse(source.contains("Text(verbatim: initials)"))
    }
}
