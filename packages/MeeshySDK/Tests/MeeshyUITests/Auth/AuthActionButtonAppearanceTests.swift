import XCTest
@testable import MeeshyUI

/// #10884 — l'action principale d'un écran d'accès bloquée par son hôte
/// (`.disabled(...)`, formulaire incomplet) doit SE VOIR bloquée : un fond
/// identique à l'état actif faisait taper l'utilisateur sans effet. L'envoi en
/// cours, lui, garde la couleur de marque — l'action est lancée, pas refusée.
final class AuthActionButtonAppearanceTests: XCTestCase {

    private static let whiteLabelLuminance = 1.0

    func test_resolve_enabled_fillsWithBrandPrimary() {
        let appearance = AuthActionButtonAppearance.resolve(isEnabled: true)

        XCTAssertEqual(appearance.fillHex, MeeshyColors.brandPrimaryHex)
    }

    func test_resolve_disabled_fillsWithNeutralNotBrand() {
        let appearance = AuthActionButtonAppearance.resolve(isEnabled: false)

        XCTAssertEqual(appearance.fillHex, MeeshyColors.neutral500Hex)
        XCTAssertNotEqual(appearance.fillHex, AuthActionButtonAppearance.resolve(isEnabled: true).fillHex)
    }

    func test_resolve_disabled_keepsWhiteLabelAtWCAGAAContrast() throws {
        let fill = try XCTUnwrap(CanvasChromeScheme.relativeLuminance(hex: AuthActionButtonAppearance.resolve(isEnabled: false).fillHex))

        let ratio = CanvasChromeScheme.contrastRatio(Self.whiteLabelLuminance, fill)

        XCTAssertGreaterThanOrEqual(ratio, 4.5)
    }
}
