import XCTest
@testable import Meeshy
import MeeshySDK

/// #8081 — un refus de preuve d'adresse se DIT depuis le catalogue de l'app,
/// selon le `code` que la passerelle renvoie, jamais par la phrase du serveur
/// (écrite en français, quelle que soit la langue du lecteur).
///
/// Le bundle choisit la TABLE : chaque témoin lit la langue qu'il nomme, donc
/// il tient quelle que soit la langue du simulateur qui le joue.
@MainActor
final class EmailProofErrorTextTests: XCTestCase {

    private static let serverFrench = "Code de vérification invalide."

    private func bundle(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    private func rejected(_ code: String?, status: Int = 400, message: String = serverFrench) -> Error {
        MeeshyError.rejected(APIRejection(statusCode: status, code: code, message: message))
    }

    // MARK: - Le code, dans la langue de l'interface

    func test_codeMessage_invalidCode_rendsLeCatalogueAnglaisJamaisLeServeur() throws {
        let text = EmailProofErrorText.codeMessage(for: rejected("INVALID_VERIFICATION"), bundle: try bundle("en"))

        XCTAssertEqual(text, "Invalid verification code.")
        XCTAssertNotEqual(text, Self.serverFrench)
    }

    func test_codeMessage_invalidCode_suitLaLangueDuBundle() throws {
        let error = rejected("INVALID_VERIFICATION")
        XCTAssertEqual(EmailProofErrorText.codeMessage(for: error, bundle: try bundle("de")), "Ungültiger Bestätigungscode.")
        XCTAssertEqual(EmailProofErrorText.codeMessage(for: error, bundle: try bundle("es")), "Código de verificación no válido.")
    }

    func test_codeMessage_expiredCode() throws {
        let text = EmailProofErrorText.codeMessage(
            for: rejected("VERIFICATION_EXPIRED", message: "Le code de vérification a expiré."), bundle: try bundle("en"))
        XCTAssertEqual(text, "This code has expired. Request a new one.")
    }

    func test_codeMessage_weakPassword() throws {
        let text = EmailProofErrorText.codeMessage(
            for: rejected("WEAK_PASSWORD", message: "Password requirements: ..."), bundle: try bundle("en"))
        XCTAssertEqual(text, "This password is too weak. Choose a stronger one.")
    }

    func test_codeMessage_tooManyAttempts_429() throws {
        let error = MeeshyError.server(statusCode: 429, message: "Trop de tentatives de vérification.")
        XCTAssertEqual(EmailProofErrorText.codeMessage(for: error, bundle: try bundle("en")),
                       "Too many attempts. Try again in a few minutes.")
    }

    func test_codeMessage_offline() throws {
        XCTAssertEqual(EmailProofErrorText.codeMessage(for: MeeshyError.network(.noConnection), bundle: try bundle("en")),
                       "No connection. Check your network and try again.")
        XCTAssertEqual(EmailProofErrorText.codeMessage(for: URLError(.notConnectedToInternet), bundle: try bundle("en")),
                       "No connection. Check your network and try again.")
    }

    func test_codeMessage_unknownCodeOrServerError_rendsLeGeneriqueJamaisLeServeur() throws {
        let en = try bundle("en")
        for error in [
            rejected("VALIDATION_ERROR", message: "body must have required property 'email'"),
            rejected(nil),
            MeeshyError.server(statusCode: 500, message: "Erreur lors de la vérification") as Error,
            NSError(domain: "test", code: 1),
        ] {
            XCTAssertEqual(EmailProofErrorText.codeMessage(for: error, bundle: en), "Verification failed. Please try again.")
        }
    }

    // MARK: - Le lien et l'envoi, même règle

    func test_linkMessage_refus_rendsLeLienInvalideDuCatalogue() throws {
        let en = try bundle("en")
        let expected = EmailProofErrorText.linkMessage(for: rejected("INVALID_VERIFICATION"), bundle: en)
        XCTAssertNotEqual(expected, Self.serverFrench)
        XCTAssertEqual(EmailProofErrorText.linkMessage(
            for: MeeshyError.server(statusCode: 400, message: "This link has expired."), bundle: en), expected)
        XCTAssertEqual(EmailProofErrorText.linkMessage(for: MeeshyError.server(statusCode: 429, message: "x"), bundle: en),
                       "Too many attempts. Try again in a few minutes.")
    }

    func test_resendMessage_refus_rendsLeCatalogue() throws {
        let en = try bundle("en")
        XCTAssertEqual(EmailProofErrorText.resendMessage(
            for: MeeshyError.server(statusCode: 400, message: "Adresse déjà vérifiée"), bundle: en),
                       "Couldn't resend the verification code")
        XCTAssertEqual(EmailProofErrorText.resendMessage(for: MeeshyError.server(statusCode: 429, message: "x"), bundle: en),
                       "Too many attempts. Try again in a few minutes.")
    }

    // MARK: - L'écran le rend

    func test_viewModel_codeRefuse_neRendJamaisLeMessageServeur() async {
        let confirmer = RejectingConfirmer(error: rejected("INVALID_VERIFICATION", message: "texte brut du serveur"))
        let sut = EmailVerificationViewModel(
            email: "a@b.c", authService: MockAuthServiceSDK(), confirmer: confirmer,
            watcher: IdleWatcher(), watchInterval: .zero, watchLimit: .zero
        )

        await sut.verifyCode("000000")

        XCTAssertNotEqual(sut.error, "texte brut du serveur")
        XCTAssertEqual(sut.error, String(localized: "emailVerification.error.invalidCode",
                                         defaultValue: "Code de vérification invalide.", bundle: .main))
    }
}

@MainActor
private final class RejectingConfirmer: EmailVerificationConfirming {
    nonisolated deinit {}
    let error: Error
    init(error: Error) { self.error = error }
    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? { throw error }
    func openSession(_ proven: EmailProvenSession) {}
}

private final class IdleWatcher: EmailVerificationWatching, @unchecked Sendable {
    func emailVerificationStatus(pendingSessionToken: String) async throws -> EmailVerificationWatchStatus { .pending }
}
