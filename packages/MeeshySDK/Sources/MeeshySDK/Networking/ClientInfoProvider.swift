import Foundation
import CoreLocation

public actor ClientInfoProvider {
    public static let shared = ClientInfoProvider()

    private var cachedStaticHeaders: [String: String]?
    private var cachedCity: String?
    private var cachedRegion: String?
    private var geoCacheExpiry: Date = .distantPast

    /// Instance unique et durable, PAS un `CLLocationManager()` jetable créé à
    /// chaque appel de `enrichWithLocation`. Avant l'octroi de l'autorisation,
    /// le garde `status == .authorizedWhenInUse` (ci-dessous) sortait toujours
    /// en amont : ce chemin ne s'exécutait jamais et le défaut restait
    /// invisible. Dès l'octroi, il se réveille d'un coup sur TOUTES les
    /// requêtes API — c'est le seul chemin réveillé globalement par l'octroi,
    /// hors du picker lui-même, ce qui colle exactement au symptôme « crash
    /// juste après avoir accordé la permission ». CoreLocation attend un
    /// manager rattaché à une runloop et réutilisé, pas un objet éphémère
    /// construit/détruit en rafale sur `MainActor.run`.
    private let geoManager = CLLocationManager()

    private init() {}

    // MARK: - Public API

    public func buildHeaders() async -> [String: String] {
        var headers = staticHeaders()

        // Locale appareil — diffusée via deux headers distincts par convention :
        //   - `X-Meeshy-Locale` : signal d'enrichissement client (telemetry, geo)
        //   - `X-Device-Locale` : signal Prisme Linguistique 4e priorité,
        //                        lu par le middleware gateway pour persister
        //                        `User.deviceLocale`. Spec :
        //                        docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md
        // Format RFC 5646 (underscore → dash) car `Locale.current.identifier`
        // retourne `"fr_FR"` (POSIX) tandis que le serveur attend `"fr-FR"`.
        let localeRFC5646 = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
        headers["X-Meeshy-Locale"]   = localeRFC5646
        headers["X-Device-Locale"]   = localeRFC5646
        headers["X-Meeshy-Timezone"] = TimeZone.current.identifier
        if let country = Locale.current.region?.identifier {
            headers["X-Meeshy-Country"] = country
        }

        await enrichWithLocation(&headers)

        return headers
    }

    // MARK: - Static Headers (cached for session lifetime)

    private func staticHeaders() -> [String: String] {
        if let cached = cachedStaticHeaders {
            return cached
        }

        let headers: [String: String] = [
            "X-Meeshy-Version": appVersion(),
            "X-Meeshy-Build": appBuild(),
            "X-Meeshy-Platform": "ios",
            "X-Meeshy-Device": deviceModel(),
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
        cachedStaticHeaders = headers
        return headers
    }

    // MARK: - Private helpers

    /// Un SEUL lecteur de `CFBundleShortVersionString` dans le SDK : la porte
    /// de version et la télémétrie doivent parler de la même version, sans quoi
    /// un jour l'une dirait « 1.2.0 » quand l'autre dit « 1.2 ».
    private func appVersion() -> String {
        AppVersionHeader.value()
    }

    private func appBuild() -> String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    private func osVersion() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    private func deviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(bitPattern: value)))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }

    private func enrichWithLocation(_ headers: inout [String: String]) async {
        // Return cached result if still fresh (1h TTL) — avant tout accès CoreLocation
        if Date() < geoCacheExpiry, let city = cachedCity {
            headers["X-Meeshy-City"] = city
            if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            return
        }

        // Check permission passively via instance property (iOS 14+) — never request.
        // `geoManager` est une propriété ISOLÉE à cet acteur : on la lit
        // directement depuis le contexte isolé de l'acteur, sans hop
        // `MainActor.run`. Le hop précédent capturait `geoManager` (un
        // `CLLocationManager`, non `Sendable`) dans une fermeture `@Sendable`
        // pour traverser vers le MainActor — Swift 6 refuse d'envoyer une
        // valeur isolée à l'acteur vers un autre domaine d'isolation
        // (« task or actor isolated value cannot be sent »). Lire une
        // propriété qu'on possède déjà, depuis SON PROPRE acteur, ne traverse
        // aucune frontière d'isolation : aucun hop n'est nécessaire.
        let status = geoManager.authorizationStatus
        let locationResult: CLLocation? = (status == .authorizedWhenInUse || status == .authorizedAlways)
            ? geoManager.location
            : nil
        guard let location = locationResult else {
            // Cache négatif : sans lui, l'absence de relevé (autorisation tout
            // juste accordée mais CoreLocation n'a pas encore de position, ou
            // refusée) relançait le cycle CoreLocation + géocodage complet à
            // CHAQUE requête API suivante — potentiellement des dizaines de
            // fois par seconde sur un flux de requêtes en rafale.
            geoCacheExpiry = Date().addingTimeInterval(300) // 5 min
            return
        }

        do {
            let placemarks = try await CLGeocoder().reverseGeocodeLocation(location)
            if let placemark = placemarks.first {
                cachedCity   = placemark.locality
                cachedRegion = placemark.administrativeArea
                geoCacheExpiry = Date().addingTimeInterval(3600) // 1h

                if let city = cachedCity { headers["X-Meeshy-City"] = city }
                if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            }
        } catch {
            // Échec de géocodage (réseau, throttling Apple...) : même cache
            // négatif que l'absence de relevé, pour la même raison — un échec
            // silencieux ne doit pas relancer un cycle complet à la requête
            // suivante.
            geoCacheExpiry = Date().addingTimeInterval(300) // 5 min
        }
    }
}
