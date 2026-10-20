import XCTest

/// **Le décor de profil se dit pareil sur iOS et le web** (#10715).
///
/// Trois écarts relevés aux relectures de #10632, chacun gardé ici :
/// - la tuile « sans design » de la BANNIÈRE disait « Aucun » quand le web dit
///   « Photo » — c'est pourtant la photo de bannière qui s'affiche alors ;
/// - VoiceOver ne distinguait les deux sections que par leur en-tête : chaque
///   section est un conteneur NOMMÉ, miroir du `radiogroup` nommé du web ;
/// - le repeint de MON compte sur `profile:decor-updated` vivait dans la rangée
///   du profil : hors de cet écran, le décor attendait la relecture de `/me`.
///   La règle est au SDK (`MeeshyUser.applying`), appliquée par le socket.
final class ProfileDecorSheetParityGuardTests: XCTestCase {

    private static let sheetPath = "Meeshy/Features/Main/Views/ProfileDecorSheet.swift"

    private func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.sheetPath))
    }

    func test_laSourceLueNEstPasVide() throws {
        XCTAssertTrue(try source().contains("struct ProfileDecorSheet"))
    }

    /// #11165 — la tuile s'appelle « Image », montre la bannière actuelle et ouvre la sélection d'image.
    func test_laTuileSansDesignDeLaBanniereSAppelleImageEtOuvreLaSelection() throws {
        let source = try source()
        XCTAssertTrue(source.contains("\"profile.decor.image\""))
        XCTAssertFalse(source.contains("\"profile.decor.photo\""), "« Photo » est devenu « Image »")
        XCTAssertTrue(source.contains("PhotosPicker(selection: $pickedBanner, matching: .images)"), "toucher la tuile ouvre la sélection d'image")
        XCTAssertTrue(source.contains("ringTile(ref: nil, design: nil, label: noneLabel)"), "le contour garde « Aucun »")
    }

    func test_chaqueSectionEstUnConteneurNommePourVoiceOver() throws {
        let source = try source()
        XCTAssertEqual(source.components(separatedBy: ".decorSection(title)").count - 1, 3, "contour, bannière, cadre de bannière")
        XCTAssertTrue(source.contains("accessibilityElement(children: .contain)"))
    }

    func test_leRepeintDeMonCompteNeDependPlusDeLaRangeeDuProfil() throws {
        let source = try source()
        XCTAssertFalse(
            source.contains("publisher(for: .profileDecorUpdated).receive"),
            "le repeint vit au SDK (`AuthManager.apply`, appelé par le socket) : une vue qui le refait ne le fait que quand elle est affichée"
        )
    }
}
