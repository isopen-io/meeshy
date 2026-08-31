import XCTest
@testable import MeeshySDK

/// **Les trois politiques qu'`APIClient` déduisait d'une comparaison de chaîne
/// (#4282).**
///
/// Elles vivaient en ligne, dans le corps de `requestWithHeaders` :
///
/// ```swift
/// let isRefreshOrAuth = endpoint == "/auth/refresh"
///     || endpoint.hasPrefix("/auth/login") || endpoint.hasPrefix("/auth/register")
///     || endpoint.hasPrefix("/auth/magic-link")
/// let endpointAllowsRetry = !endpoint.hasPrefix("/signal/")
/// ```
///
/// Deux décisions de produit — « qui ne tente pas de rafraîchir son jeton », «
/// qui échoue vite » — dont AUCUNE n'avait de témoin, parce qu'aucune n'avait
/// de nom. Ce lot leur en donne un ; ces témoins figent le comportement AVANT
/// que la migration ne déplace la source de la décision du chemin vers le type.
///
/// C'est le point important pour la suite : ces témoins ne décrivent pas la
/// forme cible, ils décrivent l'EXISTANT. Une migration qui les casse aura
/// changé le comportement, pas seulement l'écriture.
final class MeeshyEndpointPolicyTests: XCTestCase {

    // MARK: - Qui ne tente PAS de rafraîchir son jeton

    /// Ces quatre familles SERVENT à obtenir un jeton : en demander un pour les
    /// appeler bouclerait.
    func test_lesRoutesQuiDeliverentUnJeton_neTententAucunRafraichissement() {
        for path in ["/auth/refresh", "/auth/login", "/auth/login/2fa",
                     "/auth/register", "/auth/magic-link/request",
                     "/auth/magic-link/validate"] {
            XCTAssertNotEqual(
                MeeshyEndpointPolicy.authKind(forLegacyPath: path), .bearer,
                "\(path) tenterait un rafraîchissement de jeton pour obtenir un jeton."
            )
        }
    }

    func test_uneRouteOrdinaire_tenteLeRafraichissement() {
        for path in ["/conversations", "/users/me", "/posts/feed", "/auth/me"] {
            XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: path), .bearer, path)
        }
    }

    // MARK: - Ce qu'un 401 VEUT DIRE

    /// Un 401 sur `/auth/login` dit « mauvais mot de passe », jamais « session
    /// expirée » : afficher le second sur une saisie erronée enverrait
    /// l'utilisateur se reconnecter à une session qui n'a jamais existé.
    func test_seuleLaConnexion_faitDun401UneErreurDIdentifiants() {
        XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/login"), .credentials)
        XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/login/2fa"), .credentials)

        // Inscription et lien magique ne rendent JAMAIS 401 (tout part en 400
        // via `sendBadRequest`, vérifié côté gateway) — les ranger dans
        // `.credentials` serait une affirmation que le serveur ne soutient pas.
        XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/register"), .none)
        XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/magic-link/validate"), .none)
        XCTAssertEqual(MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/refresh"), .none)
    }

    // MARK: - Ce qui échoue vite

    /// Le 503 du Signal Protocol annonce un état PERMANENT, jamais une
    /// surcharge : réessayer brûle 2 s + 4 s de temporisation et ne peut pas
    /// aboutir, pendant que l'appelant attend son repli en clair.
    func test_leSignalProtocol_neSeReessayeJamais() {
        XCTAssertEqual(MeeshyEndpointPolicy.retryPolicy(forLegacyPath: "/signal/keys"), .never)
        XCTAssertEqual(MeeshyEndpointPolicy.retryPolicy(forLegacyPath: "/signal/bundle/abc"), .never)
    }

    func test_toutLeReste_seReessaye() {
        for path in ["/conversations", "/messages/123", "/auth/login", "/signalements"] {
            XCTAssertEqual(MeeshyEndpointPolicy.retryPolicy(forLegacyPath: path), .standard, path)
        }
    }

    // MARK: - Le type DÉCLARE, la chaîne DÉDUIT

    /// Une adresse typée porte sa politique ; la déduction par chemin n'existe
    /// que pour les sites d'appel non encore migrés. Ce témoin prouve que les
    /// deux voies rendent le même verdict sur une route où elles se croisent —
    /// sans quoi la migration changerait le comportement en silence, route par
    /// route, sans qu'aucun test ne tombe.
    func test_lesDeuxVoies_rendentLeMemeVerdict() {
        XCTAssertEqual(AuthEndpoint.login.authKind,
                       MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/login"))
        XCTAssertEqual(AuthEndpoint.refresh.authKind,
                       MeeshyEndpointPolicy.authKind(forLegacyPath: "/auth/refresh"))
        XCTAssertEqual(ConversationsEndpoint.root.authKind,
                       MeeshyEndpointPolicy.authKind(forLegacyPath: "/conversations"))
    }
}


/// **Les cinq chemins qui rendaient 404 (#4588).**
///
/// Mesuré sur `gate.staging.meeshy.me` le 2026-08-31 : `/auth/phone/verify`,
/// `/auth/phone/send-code`, `/auth/password-reset/reset`, `/auth/email/verify`
/// et `/auth/email/resend-verification` rendaient **404**, pendant que leurs
/// vraies adresses rendaient 400 sur un corps vide — la preuve que la route
/// existe et a validé. Quatre fonctions à appelants vivants ne pouvaient pas
/// aboutir, dont la réinitialisation de mot de passe.
///
/// Deux d'entre elles avaient une JUMELLE CORRECTE dans le même fichier, à
/// quelques lignes. Un geste écrit deux fois diverge, et la moitié fausse ne se
/// signale jamais : elle compile, son nom est plausible, elle est appelée, et
/// son 404 ressemble à une panne réseau.
///
/// Ce témoin ne rejoue pas la mesure — il interdit le RETOUR de la forme qui
/// l'a rendue possible : un chemin écrit à la main dans le service d'auth.
final class AuthServiceEndpointsAreTypedTests: XCTestCase {

    /// La racine du paquet, trouvée en REMONTANT jusqu'au `Package.swift`.
    ///
    /// Compter les composants du chemin (« quatre fois `deletingLastPath` »)
    /// est ce que j'ai écrit d'abord, et c'était faux d'un cran — le témoin
    /// cherchait `MeeshySDK/MeeshySDK/Sources/…`. Le compte se périme dès qu'un
    /// fichier de test change de sous-dossier ; l'ancre, elle, ne bouge pas.
    private func packageRoot() throws -> URL {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            if FileManager.default.fileExists(
                atPath: directory.appendingPathComponent("Package.swift").path) {
                return directory
            }
            directory = directory.deletingLastPathComponent()
        }
        throw NSError(domain: "AuthServiceEndpointsAreTypedTests", code: 1, userInfo: [
            NSLocalizedDescriptionKey:
                "Package.swift introuvable en remontant depuis \(#filePath) — ce témoin ne " +
                "peut plus lire les sources qu'il protège."
        ])
    }

    private func authServiceSource() throws -> String {
        try String(
            contentsOf: packageRoot()
                .appendingPathComponent("Sources/MeeshySDK/Auth/AuthService.swift"),
            encoding: .utf8)
    }

    func test_leServiceDAuth_nEcritPlusAucunCheminALaMain() throws {
        let source = try authServiceSource()
        XCTAssertFalse(
            source.contains("endpoint: \""),
            "Un chemin d'API écrit à la main est revenu dans AuthService. Le catalogue " +
            "généré est la seule source : un chemin qui n'existe pas côté serveur ne doit " +
            "pas POUVOIR être écrit."
        )
    }

    /// Fusible : le témoin ci-dessus est négatif, et passerait au vert sur une
    /// lecture vide — c'est-à-dire le jour où le fichier serait déplacé.
    func test_leTemoin_litVraimentSaSource() throws {
        let source = try authServiceSource()
        XCTAssertGreaterThan(source.count, 5_000)
        XCTAssertTrue(source.contains("AuthEndpoint."), "le service consomme bien le catalogue")
    }

    /// Les cinq adresses corrigées existent au catalogue, et portent bien le
    /// chemin que le serveur sert. Sans lui, le témoin négatif ci-dessus serait
    /// satisfait par n'importe quel cas — y compris un mauvais.
    func test_lesCinqAdressesCorrigees_portentLeCheminQueLeServeurSert() {
        XCTAssertEqual(AuthEndpoint.resetPassword.path, "/api/v1/auth/reset-password")
        XCTAssertEqual(AuthEndpoint.sendPhoneCode.path, "/api/v1/auth/send-phone-code")
        XCTAssertEqual(AuthEndpoint.verifyPhone.path, "/api/v1/auth/verify-phone")
        XCTAssertEqual(AuthEndpoint.verifyEmail.path, "/api/v1/auth/verify-email")
        XCTAssertEqual(AuthEndpoint.resendVerification.path, "/api/v1/auth/resend-verification")
    }
}
