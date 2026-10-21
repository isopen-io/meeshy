import XCTest
@testable import MeeshyUI

/// #10093 — la bannière et la photo d'une fiche s'ouvrent en VRAI plein écran, et seulement quand il y a une image.
///
/// Recette du 2026-10-11 sur staging : la visionneuse s'ouvrait DANS la feuille à mi-hauteur (posée dans le `ZStack`
/// de la fiche, elle ne pouvait pas en déborder), et toucher une bannière SANS image ouvrait en grand l'avatar à
/// initiales — un plein écran de rien.
@MainActor
final class ProfileFullscreenImageTests: XCTestCase {

    func test_opening_servedImage_opensIt() throws {
        let image = try XCTUnwrap(ProfileFullscreenImage.opening("https://cdn/banner.jpg", fallbackText: "Bob"))

        XCTAssertEqual(image.url, "https://cdn/banner.jpg")
        XCTAssertEqual(image.fallbackText, "Bob")
    }

    func test_opening_noImage_opensNothing() {
        XCTAssertNil(ProfileFullscreenImage.opening(nil, fallbackText: "Bob"))
        XCTAssertNil(ProfileFullscreenImage.opening("", fallbackText: "Bob"))
        XCTAssertNil(ProfileFullscreenImage.opening("   ", fallbackText: "Bob"))
    }

    /// La feuille PRÉSENTE la visionneuse (`fullScreenCover`, qui recouvre la feuille et tout l'écran) au lieu de la
    /// poser dans sa propre pile, bornée à la hauteur de la feuille.
    func test_userProfileSheet_presentsTheViewerOverTheSheet_neverInsideIt() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile")
        let sheet = try String(contentsOf: sources.appendingPathComponent("UserProfileSheet.swift"), encoding: .utf8)
        let header = try String(contentsOf: sources.appendingPathComponent("UserProfileSheet+Header.swift"), encoding: .utf8)

        XCTAssertTrue(sheet.contains(".fullScreenCover(item: $fullscreenImage)"))
        XCTAssertFalse(sheet.contains("if showFullscreenImage"))
        XCTAssertFalse(header.contains("openFullscreenImage(url: displayUser.bannerURL"),
                       "la bannière sans image (le dégradé) ne doit rien ouvrir")
    }
}
