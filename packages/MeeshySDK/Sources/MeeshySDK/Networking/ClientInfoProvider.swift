import Foundation

/// L'identité que ce client DÉCLARE à chaque requête et à la poignée de main
/// de la socket — le contrat de `packages/shared/utils/client-session.ts`
/// (#9610).
///
/// **Aucun lieu n'en part (#9612).** Ce fournisseur géocodait la position GPS
/// à chaque requête et envoyait ville et région : hors de l'usage pour lequel
/// l'utilisateur avait donné la localisation (partage de position, lieux à
/// proximité), et sans utilité pour le serveur, qui situe une session par son
/// adresse dans une base LOCALE (#9609) et ignorait déjà ces en-têtes. Le
/// relevé GPS et le géocodage inverse ont donc quitté ce fichier, et
/// CoreLocation avec eux. `X-Meeshy-Country` reste : il vient de la RÉGION
/// des réglages (`Locale.current.region`), pas d'une position, et la
/// passerelle en a besoin pour la conformité des appels en Chine
/// (`deviceCountry.ts`).
public actor ClientInfoProvider {
    public static let shared = ClientInfoProvider()

    private var cachedStaticHeaders: [String: String]?

    private init() {}

    // MARK: - Public API

    public func buildHeaders() async -> [String: String] {
        staticHeaders().merging(Self.localeHeaders()) { _, locale in locale }
    }

    /// **L'identité du client, lisible sans l'acteur.**
    ///
    /// C'est ce qu'une EXTENSION (NSE) doit envoyer pour être servie comme
    /// l'app : elle ne peut pas attendre cet acteur.
    /// Tant qu'elle recopiait ses en-têtes à la main, elle omettait
    /// `X-Canvas-Caps` — la passerelle lui servait la sentinelle « Mets à jour
    /// Meeshy » à la place du canvas, et l'app la peignait au tap de la
    /// notification (#7804). `buildHeaders()` compose les MÊMES deux moitiés :
    /// il n'existe qu'une orthographe de l'identité cliente.
    public nonisolated static func identityHeaders() -> [String: String] {
        makeStaticHeaders().merging(localeHeaders()) { _, locale in locale }
    }

    /// La clé de `handshake.auth` sous laquelle la socket remet le relevé
    /// (`CLIENT_SESSION_AUTH_KEY`).
    public static let clientSessionAuthKey = "client"

    /// Le champ du relevé (`ClientSessionInfo`) → l'en-tête qui le porte
    /// (`CLIENT_SESSION_HEADERS`). Une socket ne peut pas porter ces en-têtes
    /// — la liste CORS de Socket.IO est fermée — : elle remet les MÊMES
    /// valeurs, sous les noms de champs du contrat.
    static let clientSessionHeaderNames: [String: String] = [
        "appVersion": "X-Meeshy-Version",
        "appBuild": "X-Meeshy-Build",
        "platform": "X-Meeshy-Platform",
        "deviceModel": "X-Meeshy-Device",
        "osVersion": "X-Meeshy-OS",
        "timezone": "X-Meeshy-Timezone",
        "deviceLocale": "X-Device-Locale",
        "deviceName": "X-Meeshy-Device-Name"
    ]

    /// Ce que la poignée de main de la socket remet dans `handshake.auth` :
    /// `{ client: { appVersion, appBuild, … } }` — une PROJECTION des en-têtes
    /// de `identityHeaders()`, jamais une seconde lecture de l'appareil, pour
    /// que la requête et la socket ne puissent pas déclarer deux appareils.
    public nonisolated static func socketAuthPayload() -> [String: Any] {
        let headers = identityHeaders()
        let fields = clientSessionHeaderNames.reduce(into: [String: String]()) { fields, entry in
            if let value = headers[entry.value] { fields[entry.key] = value }
        }
        return [clientSessionAuthKey: fields]
    }

    /// Locale appareil — diffusée via deux headers distincts par convention :
    ///   - `X-Meeshy-Locale` : signal d'enrichissement client (telemetry, geo)
    ///   - `X-Device-Locale` : signal Prisme Linguistique 4e priorité,
    ///                        lu par le middleware gateway pour persister
    ///                        `User.deviceLocale`. Spec :
    ///                        docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md
    /// Format RFC 5646 (underscore → dash) car `Locale.current.identifier`
    /// retourne `"fr_FR"` (POSIX) tandis que le serveur attend `"fr-FR"`.
    private nonisolated static func localeHeaders() -> [String: String] {
        let localeRFC5646 = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
        var headers = [
            "X-Meeshy-Locale": localeRFC5646,
            "X-Device-Locale": localeRFC5646,
            "X-Meeshy-Timezone": TimeZone.current.identifier
        ]
        if let country = Locale.current.region?.identifier {
            headers["X-Meeshy-Country"] = country
        }
        return headers
    }

    // MARK: - Static Headers (cached for session lifetime)

    private func staticHeaders() -> [String: String] {
        if let cached = cachedStaticHeaders {
            return cached
        }
        let headers = Self.makeStaticHeaders()
        cachedStaticHeaders = headers
        return headers
    }

    private nonisolated static func makeStaticHeaders() -> [String: String] {
        let model = deviceModel()
        let identity: [String: String] = [
            "X-Meeshy-Version": appVersion(),
            "X-Meeshy-Build": appBuild(),
            "X-Meeshy-Platform": "ios",
            "X-Meeshy-Device": model,
            "X-Meeshy-OS": osVersion(),
            // Niveau de canvas que ce binaire sait LIRE (O17). Sans lui, le
            // gateway nous prend pour un client du passé et sert la SENTINELLE
            // — un fond `1E1B4B` uni à la place du canevas
            // (`storyEffectsV3.ts:467`). Or les deux composers écrivent déjà du
            // v3 natif, le web (`StoryComposer.tsx:288`) comme iOS
            // (`StoryEffects.encode(to:)` → `CanvasV3(migrating:)`) : le parc
            // natif ne voyait plus aucun canevas de story, pas même les siens,
            // alors que son décodeur (`StoryModels.swift:1769`) sait les peindre.
            //
            // Un NIVEAU, pas un booléen : le gateway compare `caps >= 3`. C'est
            // une constante du binaire, d'où sa place ici plutôt que dans
            // `buildHeaders()` — rien dans l'environnement ne la fait varier.
            "X-Canvas-Caps": "3",
            // Ce que ce binaire sait du JEU (#9392, rétrocompatibilité #9223) : la
            // VAGUE 2 ajoute les badges de 1 000 et 5 000 actions, que la passerelle
            // ne sert qu'aux clients qui les déclarent — les autres lisent les cinq
            // paliers d'origine. Un NIVEAU, comme `X-Canvas-Caps`, jamais un booléen.
            GameRoutes.versionHeader: String(GameRoutes.waveVersion),
            // Porte de version cliente (C4a/C4b, spec §C3). Le gateway lit
            // `x-app-version` pour juger le binaire face à `MIN_APP_VERSION`
            // (`services/gateway/src/utils/appVersion.ts`) et `x-app-platform`
            // pour résoudre le `storeUrl` du 426 (`android` ⇒ Play Store, tout
            // le reste ⇒ App Store). Leur place est ICI et pas dans le funnel
            // d'`APIClient` : c'est le point unique par lequel passent les DEUX
            // funnels (requête et siège de test), donc le seul endroit d'où un
            // en-tête ne peut pas manquer sur un chemin oublié.
            //
            // Redondants en apparence avec `X-Meeshy-Version`/`-Platform`, ils
            // ne le sont pas : ce sont deux CONTRATS distincts. La paire
            // `X-Meeshy-*` est de la télémétrie, la paire `X-App-*` est une
            // porte — renommer l'une ne doit pas déplacer l'autre.
            AppVersionHeader.versionHeaderName: AppVersionHeader.value(),
            AppVersionHeader.platformHeaderName: AppVersionHeader.platformValue
        ]
        // Le nom LISIBLE, déduit du modèle (#9610) — jamais `UIDevice.name`,
        // le nom que l'utilisateur a choisi. Absent quand le modèle ne dit rien
        // de sûr : le serveur garde alors ce qu'il déduit de l'agent.
        guard let name = DeviceModelName.readable(forIdentifier: model) else { return identity }
        return identity.merging(["X-Meeshy-Device-Name": name]) { current, _ in current }
    }

    // MARK: - Private helpers

    /// Un SEUL lecteur de `CFBundleShortVersionString` dans le SDK : la porte
    /// de version et la télémétrie doivent parler de la même version, sans quoi
    /// un jour l'une dirait « 1.2.0 » quand l'autre dit « 1.2 ».
    private nonisolated static func appVersion() -> String {
        AppVersionHeader.value()
    }

    private nonisolated static func appBuild() -> String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    private nonisolated static func osVersion() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    private nonisolated static func deviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(bitPattern: value)))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }
}
