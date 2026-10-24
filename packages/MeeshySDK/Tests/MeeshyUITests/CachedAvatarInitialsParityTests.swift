import XCTest
import UIKit
import MeeshySDK
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

    private let decodableThumbHash = "1QcSHQRnh493V4dIh4eXh0h4kJUI"
    private let photoToCome = "https://cdn.example.invalid/avatars/12568.jpg"

    func test_waitingBlur_withoutPhoto_isNeverShown_evenWhenAThumbHashIsServed() {
        XCTAssertNotNil(UIImage.fromThumbHash(decodableThumbHash), "le témoin a besoin d'un thumbHash décodable")
        XCTAssertNil(CachedAvatarImage.waitingBlur(urlString: nil, thumbHash: decodableThumbHash),
                     "Sans photo, le cercle montre les initiales : aucun flou, ni le sien ni celui d'une autre personne.")
        XCTAssertNil(CachedAvatarImage.waitingBlur(urlString: "", thumbHash: decodableThumbHash))
    }

    func test_waitingBlur_withAPhotoToCome_isTheBlurOfThatPhoto() {
        XCTAssertNotNil(CachedAvatarImage.waitingBlur(urlString: photoToCome, thumbHash: decodableThumbHash))
        XCTAssertNil(CachedAvatarImage.waitingBlur(urlString: photoToCome, thumbHash: nil))
        XCTAssertNil(CachedAvatarImage.waitingBlur(urlString: photoToCome, thumbHash: ""))
    }

    func test_cachedAvatarImage_initAndURLChange_shareTheWaitingBlurRule() throws {
        let src = try source("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")
        guard let start = src.range(of: "public struct CachedAvatarImage: View {"),
              let end = src.range(of: "public struct CachedBannerImage: View {") else {
            return XCTFail("CachedAvatarImage introuvable")
        }
        let avatar = String(src[start.lowerBound..<end.lowerBound])
        guard let onChange = avatar.range(of: ".adaptiveOnChange(of: urlString)"),
              let helper = avatar.range(of: "static func waitingBlur(", range: onChange.upperBound..<avatar.endIndex) else {
            return XCTFail("adaptiveOnChange(of: urlString) ou waitingBlur introuvable")
        }
        let initBlock = String(avatar[avatar.startIndex..<onChange.lowerBound])
        let onChangeBlock = String(avatar[onChange.lowerBound..<helper.lowerBound])
        XCTAssertTrue(initBlock.contains("Self.waitingBlur(urlString: urlString, thumbHash: thumbHash)"),
                      "L'init ne pose un flou que pour une photo à venir.")
        XCTAssertTrue(onChangeBlock.contains("Self.waitingBlur(urlString: newUrl, thumbHash: thumbHash)"),
                      "Un changement d'URL recalcule le flou de la NOUVELLE personne.")
        XCTAssertTrue(onChangeBlock.contains("thumbHashImage = nil"),
                      "Une URL qui disparaît efface le flou de la personne précédente.")
        XCTAssertEqual(avatar.components(separatedBy: "UIImage.fromThumbHash(").count - 1, 1,
                       "Le flou ne se décode qu'en un site, waitingBlur.")
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
