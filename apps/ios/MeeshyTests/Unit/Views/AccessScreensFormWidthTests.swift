import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Chaque page d'accès tient au centre — sur iPad comme sur iPhone** (#6644).
///
/// « Les pages doivent être responsives et même sur tablette ou ordinateur
/// avoir le style de la page de connexion (au centre) […] Les pages
/// d'inscription, reset de mot de passe 2FA, MFA doivent être centrés même
/// hors smartphone ! » (directive porteur 2026-09-15)
///
/// L'inscription et l'accueil se bornaient eux-mêmes à
/// `MeeshyLayout.formMaxWidth`, la connexion l'était par son hôte ; les feuilles
/// qu'elle ouvre et les écrans de sécurité ne l'étaient pas, et s'étiraient sur
/// les 1 032 points d'un iPad Pro 13" — un bouton de 984 points sous une phrase
/// centrée.
///
/// **Pourquoi un montage et pas une lecture de source.** Chercher
/// `iPadFormWidth()` dans un fichier est vert dès que l'appel y figure — posé
/// sur le mauvais conteneur, dans une branche morte, ou chez un hôte que le
/// témoin ne monte pas. Celui-ci monte l'écran RÉEL dans une fenêtre à la
/// taille d'un iPad, en portrait puis en paysage, et relève le cadre que
/// VoiceOver annonce pour son action principale : il ne dépasse pas la colonne,
/// et son centre est celui de la fenêtre. Il reste rouge tant que la borne ne
/// s'applique pas à ce que l'utilisateur voit.
///
/// **Et l'iPhone ne bouge pas.** La borne est un plafond : à 402 points, la
/// même action occupe toujours la largeur de l'écran moins ses marges, centrée.
@MainActor
final class AccessScreensFormWidthTests: XCTestCase {

    /// iPad Pro 13" — le plus large des iPad, là où une colonne non bornée se
    /// voit le plus.
    private static let iPadPortrait = CGSize(width: 1032, height: 1376)
    private static let iPadLandscape = CGSize(width: 1376, height: 1032)
    private static let iPhone = CGSize(width: 402, height: 874)

    // MARK: - Mot de passe oublié, puis le nouveau mot de passe

    func test_forgotPassword_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "auth.forgotPassword.submit") {
            MeeshyForgotPasswordView()
        }
    }

    func test_newPassword_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "auth.newPassword.submit") {
            MeeshyNewPasswordView(resetToken: "reset-token", onSignIn: {})
        }
    }

    // MARK: - Connexion par e-mail, et le code 2FA de la connexion

    func test_emailSignIn_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "auth.magiclink.submit") {
            MagicLinkView()
                .environmentObject(AuthManager.shared)
        }
    }

    /// L'étape 2FA de la connexion ne s'atteint qu'avec un compte qui l'a
    /// activée : le témoin la pose par l'état qui la déclenche, et le rend.
    ///
    /// C'est aussi le témoin de la connexion elle-même : sa borne était posée
    /// par `MeeshyApp` autour de l'écran, si bien que `LoginView` montée seule
    /// s'étirait — une borne tenue par l'hôte ne se mesure pas sur l'écran.
    func test_loginTwoFactorStep_holdsItsColumnAtTheCentre() {
        let manager = AuthManager.shared
        let previous = manager.requires2FA
        manager.requires2FA = true
        defer { manager.requires2FA = previous }

        assertCentredColumn(identifier: "auth.login.submit") {
            LoginView()
                .environmentObject(manager)
        }
    }

    // MARK: - Sécurité du compte : 2FA, mot de passe, vérification de l'e-mail

    func test_twoFactorSetup_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "twoFactor.setup.next") {
            TwoFactorSetupView(
                viewModel: TwoFactorViewModel(service: MockTwoFactorService()),
                onComplete: {},
                onCancel: {}
            )
        }
    }

    func test_twoFactorDisable_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "twoFactor.disable.submit") {
            TwoFactorDisableView(
                viewModel: TwoFactorViewModel(service: MockTwoFactorService()),
                onComplete: {},
                onCancel: {}
            )
        }
    }

    func test_twoFactorBackupCodes_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "twoFactor.backupCodes.submit") {
            TwoFactorBackupCodesView(
                viewModel: TwoFactorViewModel(service: MockTwoFactorService()),
                onDismiss: {}
            )
        }
    }

    func test_changePassword_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "auth.password.change.submit") {
            ChangePasswordView()
        }
    }

    func test_emailVerification_holdsItsColumnAtTheCentre() {
        assertCentredColumn(identifier: "emailVerification.submit") {
            EmailVerificationView(email: "ada@meeshy.me", authService: MockAuthServiceSDK(), onVerified: { _ in })
        }
    }

    // MARK: - L'accueil : bornée en largeur, et ses boutons gardent leur hauteur

    /// Mesuré au simulateur iPad le 2026-09-15 : l'accueil tenait bien sa
    /// colonne de 600 pt, mais « Créer un compte » et « Se connecter » y
    /// faisaient chacun près de 500 pt de HAUT. Leur forme était posée dans le
    /// bouton avec un `minHeight` sans plafond — une forme prend toute la
    /// hauteur qu'on lui propose, et la pile lui proposait l'écran. Une page
    /// « responsive » ne se juge pas qu'à sa largeur.
    func test_welcome_holdsItsColumn_andItsButtonsKeepAnActionHeight() {
        assertCentredColumn(identifier: "welcome.createAccount") {
            WelcomeView(hasCompletedOnboarding: .constant(false))
        }

        for size in [Self.iPadPortrait, Self.iPadLandscape, Self.iPhone] {
            let screen = RenderedScreen(WelcomeView(hasCompletedOnboarding: .constant(false)), size: size)
            defer { screen.dismount() }
            for identifier in ["welcome.createAccount", "welcome.signIn"] {
                guard let frame = screen.frame(of: identifier) else {
                    XCTFail("« \(identifier) » n'est pas rendu dans une fenêtre \(Int(size.width)) × \(Int(size.height))")
                    continue
                }
                XCTAssertLessThan(
                    frame.height,
                    120,
                    "« \(identifier) » fait \(Int(frame.height)) pt de haut dans une fenêtre \(Int(size.width)) × \(Int(size.height)) : "
                    + "un bouton d'action n'occupe pas l'écran"
                )
            }
        }
    }

    // MARK: - La mesure

    /// Monte l'écran trois fois — iPad portrait, iPad paysage, iPhone — et
    /// relève le cadre annoncé de `identifier`. Une fabrique plutôt qu'une
    /// valeur : un écran qui porte un modèle de vue le garderait d'un montage
    /// à l'autre, et le second mesurerait l'état laissé par le premier.
    private func assertCentredColumn<Screen: View>(
        identifier: String,
        file: StaticString = #filePath,
        line: UInt = #line,
        @ViewBuilder _ makeScreen: () -> Screen
    ) {
        for size in [Self.iPadPortrait, Self.iPadLandscape] {
            let screen = RenderedScreen(makeScreen(), size: size, file: file, line: line)
            defer { screen.dismount() }
            guard let frame = screen.frame(of: identifier) else {
                XCTFail(
                    "« \(identifier) » n'est pas rendu dans une fenêtre \(Int(size.width)) × \(Int(size.height))",
                    file: file,
                    line: line
                )
                continue
            }
            XCTAssertLessThanOrEqual(
                frame.width,
                MeeshyLayout.formMaxWidth,
                "« \(identifier) » s'étire sur \(Int(frame.width)) pt dans une fenêtre de \(Int(size.width)) pt : "
                + "la colonne n'est pas bornée à \(Int(MeeshyLayout.formMaxWidth)) pt",
                file: file,
                line: line
            )
            XCTAssertEqual(
                frame.midX,
                size.width / 2,
                accuracy: 1,
                "« \(identifier) » n'est pas au centre d'une fenêtre de \(Int(size.width)) pt",
                file: file,
                line: line
            )
        }

        let phone = RenderedScreen(makeScreen(), size: Self.iPhone, file: file, line: line)
        defer { phone.dismount() }
        guard let frame = phone.frame(of: identifier) else {
            XCTFail("« \(identifier) » n'est pas rendu sur iPhone", file: file, line: line)
            return
        }
        XCTAssertGreaterThan(
            frame.width,
            Self.iPhone.width * 0.75,
            "sur iPhone la borne ne mord pas : « \(identifier) » garde la largeur de l'écran moins ses marges",
            file: file,
            line: line
        )
        XCTAssertEqual(frame.midX, Self.iPhone.width / 2, accuracy: 1, file: file, line: line)
    }
}
