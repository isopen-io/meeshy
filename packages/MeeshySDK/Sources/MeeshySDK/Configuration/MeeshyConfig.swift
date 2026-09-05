import Foundation

public final class MeeshyConfig: @unchecked Sendable {
    public static let shared = MeeshyConfig()

    private static let remoteOrigin = "https://gate.meeshy.me"
    private static let localOrigin = "http://localhost:3000"
    private static let defaultApiPath = "/api/v1"

    /// Le segment sous lequel la passerelle sert un fichier, RELATIF au préfixe
    /// d'API — jamais préfixé ici : `apiBaseURL` porte déjà l'hôte et la version.
    private static let attachmentFileRoute = "/attachments/file/"

    /// Le schéma qui déclare qu'une clé vient du magasin STATIQUE (#4625).
    ///
    /// Miroir Swift de `STATIC_STORE_SCHEME` (`packages/shared/api/media-ref.ts`)
    /// et de `MediaUrlResolver.STATIC_STORE_SCHEME` (Android). Les trois lisent
    /// la même donnée : le changer ici seul servirait les avatars d'un seul
    /// client.
    private static let staticStoreScheme = "static:"
    private static let environmentKey = "meeshy_selected_environment"
    private static let customHostKey = "meeshy_custom_host"

    public enum ServerEnvironment: String, CaseIterable, Sendable {
        case production = "gate.meeshy.me"
        case staging = "gate.staging.meeshy.me"
        case localhost = "localhost:3000"
        case custom = "custom"

        public var label: String {
            switch self {
            case .production: return "Production"
            case .staging: return "Staging"
            case .localhost: return "Localhost"
            case .custom: return "Custom"
            }
        }

        public var origin: String {
            switch self {
            case .production: return "https://gate.meeshy.me"
            case .staging: return "https://gate.staging.meeshy.me"
            case .localhost: return "http://localhost:3000"
            case .custom: return ""
            }
        }
    }

    /// Full API base URL including version path (e.g. "https://gate.meeshy.me/api/v1")
    public var apiBaseURL: String = "\(remoteOrigin)\(defaultApiPath)"

    /// Server origin without path (e.g. "https://gate.meeshy.me")
    public var serverOrigin: String {
        guard let url = URL(string: apiBaseURL),
              let scheme = url.scheme,
              let host = url.host else { return apiBaseURL }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }

    public var socketBaseURL: String { serverOrigin }

    /// Public web origin for user-facing share / deep links (e.g.
    /// "https://meeshy.me"). Distinct from ``serverOrigin``, which is the API
    /// host (`gate.meeshy.me`): the apple-app-site-association and every
    /// Universal Link are served from the WEB origin, never the API origin.
    /// Any link a user can copy, share or tap MUST be built from this — a
    /// `gate.meeshy.me/join/…` URL neither verifies as a Universal Link (no
    /// AASA on the gateway) nor matches the in-app `DeepLinkParser` host set,
    /// so it would silently fall through to an API 404.
    ///
    /// Derivation strips the leading `gate.` API subdomain
    /// (`gate.meeshy.me` → `meeshy.me`, `gate.staging.meeshy.me` →
    /// `staging.meeshy.me`) and remaps the localhost dev port (API `:3000`
    /// → web `:3100`). Hosts without a `gate.` prefix are returned verbatim.
    public var webOrigin: String {
        guard let url = URL(string: serverOrigin),
              let scheme = url.scheme,
              let host = url.host else { return serverOrigin }
        if host == "localhost" || host == "127.0.0.1" {
            return "\(scheme)://\(host):3100"
        }
        let webHost = host.hasPrefix("gate.") ? String(host.dropFirst("gate.".count)) : host
        return "\(scheme)://\(webHost)"
    }

    /// L'origine du magasin STATIQUE — `static.<domaine web>` (#4625).
    ///
    /// Dérivée de `webOrigin`, jamais configurée à part : c'est le même
    /// déploiement, et un second réglage à tenir à jour finirait par diverger
    /// exactement comme les adresses figées en base que cette issue retire.
    /// `gate.meeshy.me` → `static.meeshy.me` ; `gate.staging.meeshy.me` →
    /// `static.staging.meeshy.me`.
    ///
    /// En développement, Next sert `public/` à la RACINE de son origine
    /// (`http://localhost:3100/u/i/…`) : il n'y a pas de sous-domaine à poser,
    /// et `webOrigin` est déjà la bonne réponse — port compris, ce qu'un
    /// `URL.host` aurait perdu.
    public var staticOrigin: String {
        let web = webOrigin
        guard let url = URL(string: web), let scheme = url.scheme, let host = url.host else { return web }
        if Self.isLocalhost(host.lowercased()) { return web }
        return "\(scheme)://static.\(host)"
    }

    public var appBundleId: String = "me.meeshy.app"

    /// Base64-encoded SHA-256 hashes of pinned SubjectPublicKeyInfo (SPKI)
    /// blobs, per RFC 7469. Populate this set to enable public-key pinning
    /// in ``CertificatePinningDelegate``. An empty set keeps the historical
    /// behaviour (system chain validation only) so the app does not lock
    /// itself out before the operator has computed the production pins.
    ///
    /// Include **at least two** pins — the leaf key in use today plus a
    /// backup/rotation key — so rotation does not require shipping a new
    /// app binary. See `apps/ios/Documentation/CERTIFICATE_PINNING.md`
    /// for the procedure to compute pins from `gate.meeshy.me`.
    public var certificatePins: Set<String> = []

    private init() {}

    /// Resolve a potentially relative media URL (e.g. "/api/v1/attachments/file/...")
    /// into an absolute URL by prepending the server origin.
    /// Validates scheme (https only, http for localhost) and blocks private IPs (SSRF protection).
    ///
    /// Contract: a `file://` URL is returned verbatim — it is NEVER prefixed
    /// with the server origin and NEVER subject to the SSRF host checks. Local
    /// optimistic media (camera capture, recorded audio, picked file) is
    /// referenced by its on-device `file://` URL; it does not touch the
    /// network. Returning it unchanged makes the `cacheImageForPreview()` seed
    /// key and `DiskCacheStore.image(for:)`'s `file://` filesystem fast-path
    /// line up. See Sprint 3 RC3.1.
    public static func resolveMediaURL(_ urlString: String) -> URL? {
        if urlString.hasPrefix("file://"),
           let fileURL = URL(string: urlString),
           fileURL.isFileURL {
            return fileURL
        }
        let resolved: String
        if urlString.hasPrefix(Self.staticStoreScheme) {
            // Le magasin se DÉCLARE dans la donnée (#4625). Il le fallait :
            // aucune FORME de clé ne dit d'où elle vient — `u/i/2025/11/a.jpg`
            // (statique) et `avatars/user/<id>.jpg` (passerelle) se ressemblent
            // trop pour qu'un consommateur les sépare à vue, et chacun de ceux
            // qui essayaient inventait sa propre règle.
            //
            // Sans cette branche, les 272 avatars du magasin statique, réduits à
            // leur clé, partaient se chercher sur la passerelle — où ils ne sont
            // pas. Ils ne s'affichaient jusqu'ici QUE parce qu'ils portaient
            // encore leur hôte.
            let brut = String(urlString.dropFirst(Self.staticStoreScheme.count))
            let cle = brut.drop(while: { $0 == "/" })
            guard !cle.isEmpty else { return nil }
            let encodee = cle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String(cle)
            resolved = shared.staticOrigin + "/" + encodee
        } else if urlString.hasPrefix("http://") || urlString.hasPrefix("https://") {
            resolved = urlString
        } else if urlString.hasPrefix("/") {
            resolved = shared.serverOrigin + urlString
        } else {
            // Une chaîne sans barre initiale n'est pas un chemin : c'est la CLÉ
            // DE STOCKAGE du média (`2025/10/<id>/photo.png`), la seule chose que
            // la base doit porter (#4324). Ni hôte, ni préfixe d'API, ni version
            // n'y figurent — ce sont des décisions de déploiement, et c'est au
            // SDK de poser la route qui les porte.
            //
            // Sans cette branche, `serverOrigin + "/" + clé` rendait
            // `https://gate.meeshy.me/2025/10/…` : le segment de service
            // manquait, et les 514 attachements déjà stockés sous cette forme
            // étaient illisibles sur iOS comme sur Android.
            //
            // La route suit `apiBaseURL` — donc le préfixe CONFIGURÉ, jamais une
            // version écrite ici. `.urlPathAllowed` encode ce qu'une URL ne peut
            // pas porter tel quel sans toucher aux barres obliques, qui sont les
            // séparateurs du chemin et non des caractères à échapper.
            // Deux formes ne sont PAS des clés, et se reconnaissent avant de
            // poser quoi que ce soit : la chaîne VIDE (aucun média désigné) et
            // celle qui porte DÉJÀ le segment de service, à qui une seconde
            // route donnerait `…/attachments/file/api/v1/attachments/file/…`.
            let porteDejaLaRoute = urlString.contains(Self.attachmentFileRoute.dropFirst())
            if urlString.isEmpty || porteDejaLaRoute {
                resolved = shared.serverOrigin + "/" + urlString
            } else {
                let cle = urlString.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? urlString
                resolved = shared.apiBaseURL + Self.attachmentFileRoute + cle
            }
        }
        guard let url = URL(string: resolved),
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else { return nil }

        guard scheme == "https" || (scheme == "http" && isLocalhost(host)) else { return nil }
        guard !isPrivateIP(host) else { return nil }

        return url
    }

    private static func isLocalhost(_ host: String) -> Bool {
        host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    private static func isPrivateIP(_ host: String) -> Bool {
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4 else { return false }
        if parts[0] == 10 { return true }
        if parts[0] == 172 && (16...31).contains(parts[1]) { return true }
        if parts[0] == 192 && parts[1] == 168 { return true }
        if parts[0] == 169 && parts[1] == 254 { return true }
        if parts[0] == 127 { return true }
        return false
    }

    /// Call once at app startup to configure the SDK
    public func configure(apiURL: String, bundleId: String? = nil) {
        self.apiBaseURL = apiURL
        if let bundleId { self.appBundleId = bundleId }
    }

    /// Switch between remote and local gateway, preserving the API version path
    public func setUseLocalGateway(_ local: Bool) {
        let origin = local ? Self.localOrigin : Self.remoteOrigin
        let path = URL(string: apiBaseURL)?.path ?? Self.defaultApiPath
        apiBaseURL = origin + path
    }

    /// Currently selected environment, persisted in UserDefaults
    public var selectedEnvironment: ServerEnvironment {
        get {
            guard let raw = UserDefaults.standard.string(forKey: Self.environmentKey),
                  let env = ServerEnvironment(rawValue: raw) else { return .production }
            return env
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: Self.environmentKey)
        }
    }

    /// Custom host string for the .custom environment
    public var customHost: String {
        get { UserDefaults.standard.string(forKey: Self.customHostKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: Self.customHostKey) }
    }

    /// Apply the selected environment, updating apiBaseURL
    public func applyEnvironment(_ env: ServerEnvironment, customHost: String? = nil) {
        selectedEnvironment = env
        let origin: String
        switch env {
        case .custom:
            let host = customHost ?? self.customHost
            self.customHost = host
            origin = host.hasPrefix("http") ? host : "https://\(host)"
        default:
            origin = env.origin
        }
        apiBaseURL = origin + Self.defaultApiPath
    }

    /// Restore the persisted environment on app launch
    public func restoreEnvironment() {
        let env = selectedEnvironment
        guard env != .production else { return }
        applyEnvironment(env)
    }
}
