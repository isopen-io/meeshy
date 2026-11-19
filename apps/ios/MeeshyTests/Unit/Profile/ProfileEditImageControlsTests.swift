import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'édition de ma vitrine change la bannière et l'avatar par les commandes de la planche `Moi-Edition`, et règle le
/// décor sur place (#19548) : ce que chaque commande DIT, quand elle se refuse, et ce que les vignettes du décor nomment.
@MainActor
final class ProfileEditImageControlsTests: XCTestCase {

    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }

    private func code(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    // MARK: - Retoucher

    func test_retouch_withoutAPhoto_isRefusedAndSaysWhy() {
        XCTAssertEqual(ProfileEditRetouch.disabledReason(avatar: nil), served("profile.edit.retouch.noPhoto"))
        XCTAssertEqual(ProfileEditRetouch.disabledReason(avatar: ""), served("profile.edit.retouch.noPhoto"))
    }

    func test_retouch_withAPhoto_isOffered() {
        XCTAssertNil(ProfileEditRetouch.disabledReason(avatar: "https://cdn.meeshy.me/a.jpg"))
    }

    func test_currentPhoto_isReadThroughTheImageStoreOfTheAvatars() async {
        let photo = UIImage()
        let loader = PhotoStoreDouble(images: ["https://cdn.meeshy.me/a.jpg": photo])

        let loaded = await ProfileEditRetouch.currentPhoto("https://cdn.meeshy.me/a.jpg", loader: loader)

        XCTAssertTrue(loaded === photo, "Retoucher ouvre la retouche sur MA photo actuelle")
    }

    func test_currentPhoto_withoutAPhotoOrUnreadable_givesNothing() async {
        let loader = PhotoStoreDouble(images: [:])
        let missing = await ProfileEditRetouch.currentPhoto(nil, loader: loader)
        let unreadable = await ProfileEditRetouch.currentPhoto("https://cdn.meeshy.me/b.jpg", loader: loader)
        XCTAssertNil(missing)
        XCTAssertNil(unreadable)
    }

    // MARK: - Les vignettes du décor

    func test_decorTiles_areTheThreeSidesInTheOrderOfThePlanche() {
        let tiles = ProfileEditDecorTiles.make(decor: nil, bannerPhoto: nil, language: "fr")

        XCTAssertEqual(tiles.map(\.id), [.avatarRing, .banner, .bannerFrame])
        XCTAssertEqual(tiles.map(\.title), [served("profile.decor.ring.section"), served("profile.decor.banner.section"),
                                            served("profile.decor.frame.section")])
    }

    func test_decorTiles_withNothingEquipped_sayNone() {
        let tiles = ProfileEditDecorTiles.make(decor: nil, bannerPhoto: nil, language: "fr")

        XCTAssertEqual(tiles.map { $0.subtitle ?? "" }, Array(repeating: served("profile.decor.none"), count: 3))
    }

    func test_decorTiles_withABannerPhoto_sayImage_becauseThePhotoWinsOverTheBackgrounds() {
        let decor = ServedProfileDecor(banner: ServedProfileDecorItem(pack: "unknown-pack", item: "unknown-design", origin: .builtin))

        let tiles = ProfileEditDecorTiles.make(decor: decor, bannerPhoto: "https://cdn.meeshy.me/banner.jpg", language: "fr")

        XCTAssertEqual(tiles[1].subtitle, served("profile.decor.image"))
    }

    func test_decorTiles_nameWhatIsEquipped_andFallBackOnItsKey() {
        let decor = ServedProfileDecor(
            avatarRing: ServedProfileDecorItem(pack: "unknown-pack", item: "ring-key", origin: .builtin),
            banner: ServedProfileDecorItem(pack: "unknown-pack", item: "banner-key", origin: .builtin),
            bannerFrame: ServedProfileDecorItem(pack: "unknown-pack", item: "frame-key", origin: .builtin)
        )

        let tiles = ProfileEditDecorTiles.make(decor: decor, bannerPhoto: nil, language: "fr")

        XCTAssertEqual(tiles.map { $0.subtitle ?? "" }, ["ring-key", "banner-key", "frame-key"])
        XCTAssertEqual(tiles[0].name, served("profile.decor.ring.section") + ", ring-key",
                       "VoiceOver lit le côté puis ce qui y est équipé")
    }

    // MARK: - Fait du kit (loi 12)

    func test_editControls_areMadeOfTheKit_andNoHandDrawnCapsuleRemains() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertFalse(profile.contains("pencil.circle.fill"), "plus de crayon dessiné sur l'avatar")
        XCTAssertFalse(profile.contains("Capsule().fill(Color.black.opacity(0.5))"), "plus de capsule noire sur la bannière")
        XCTAssertTrue(profile.contains("MeeshyButton(ProfileEditImageCopy.changeBanner"), "« Changer la bannière » est K40")
        XCTAssertTrue(profile.contains("MeeshyGlassButton(systemImage: \"camera.fill\""), "l'appareil photo est K02")
        XCTAssertTrue(profile.contains("size: .s32"), "la pastille d'action de coin est la petite taille de K02")
        XCTAssertTrue(profile.contains("ProfileEditImageCommands("), "« Photo · Retoucher · Décor » sous l'avatar")
        XCTAssertTrue(profile.contains("ProfileEditDecorSection("), "le décor se règle en édition")
        let controls = try code("Meeshy/Features/Profile/Views/ProfileEditImageControls.swift")
        XCTAssertTrue(controls.contains("MeeshyTileStrip("), "les vignettes du décor sont K19")
        XCTAssertTrue(controls.contains("MeeshySectionHeader(title: ProfileEditImageCopy.decor"), "l'en-tête « Décor » est K44")
    }

    func test_retouch_opensTheRetouchOnTheCurrentPhoto_andDecorOpensTheDecorSheet() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("onRetouch: retouchCurrentPhoto"))
        XCTAssertTrue(profile.contains("avatarImageForEditor = image"), "la photo actuelle entre dans EntityImageRetouch")
        XCTAssertTrue(profile.contains("onDecor: { decorShown = true }"))
        XCTAssertTrue(profile.contains("decorShown: $decorShown"))
        let controls = try code("Meeshy/Features/Profile/Views/ProfileEditImageControls.swift")
        XCTAssertTrue(controls.contains("ProfileDecorSheetPresentation(isPresented: $decorShown"),
                      "la même feuille du décor que depuis « Mon activité »")
        XCTAssertTrue(controls.contains("photosPicker(isPresented: $avatarPickerShown, selection: $avatarItem"),
                      "l'appareil photo et « Photo » ouvrent le sélecteur de ma photo, qui passe par la retouche")
        XCTAssertTrue(profile.contains("onOpenMyPacks: { open(.myPacks) }"), "« Mes packs » ouvre mes packs")
    }
}

/// Le magasin d'images des avatars, pour les témoins : il rend ce qu'on lui a confié, rien d'autre.
private nonisolated struct PhotoStoreDouble: MediaImageLoading {
    let images: [String: UIImage]

    func image(for urlString: String) async -> UIImage? { images[urlString] }
    func image(for urlString: String, maxPixelSize: CGFloat) async -> UIImage? { images[urlString] }
    func data(for urlString: String) async throws -> Data { throw URLError(.fileDoesNotExist) }
    func store(_ data: Data, for key: String) async {}
    func persistedFileURL(for key: String) async -> URL? { nil }
}
