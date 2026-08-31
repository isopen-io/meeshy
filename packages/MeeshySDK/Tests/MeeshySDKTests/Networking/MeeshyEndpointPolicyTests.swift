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
