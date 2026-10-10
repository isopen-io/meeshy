import Foundation
import MeeshySDK

/// Ce qu'une ligne de Sécurité > Sessions DIT d'une session (#9612) — tout
/// ce que le serveur sert, en mots : l'appareil par son nom, le logiciel et sa
/// version, le lieu APPROXIMATIF et l'adresse, le fuseau, l'ouverture et son
/// moyen, la dernière activité.
///
/// Une valeur pure, construite une fois par session : la cellule ne calcule
/// rien et se compare par égalité.
struct SessionRowPresentation: Equatable, Identifiable {
    let id: String
    let title: String
    let systemImage: String
    let isCurrent: Bool
    /// « Meeshy 1.2.0 (1874) · iOS 18.2 », « Chrome 129 · macOS 14.5 · Web ».
    let software: String?
    /// « Lyon, France (approximatif) · 203.0.113.4 ».
    let place: String?
    let timezone: String?
    /// « Ouverte le 1 oct. 2026 · Connexion par lien magique ».
    let opened: String
    let activity: String?

    init(_ session: UserSession, now: Date = Date(), locale: Locale = .current) {
        id = session.id
        isCurrent = session.isCurrent
        title = Self.title(of: session)
        systemImage = Self.systemImage(of: session)
        software = Self.software(of: session)
        place = Self.place(of: session, locale: locale)
        timezone = session.timezone.map {
            String(format: String(localized: "sessions.timezone", defaultValue: "Fuseau : %@", bundle: .main), $0)
        }
        opened = Self.opened(session, locale: locale)
        activity = Self.activity(of: session, now: now, locale: locale)
    }

    // MARK: - L'appareil

    /// Le nom servi ; sinon celui que son modèle permet de déduire ; sinon le
    /// navigateur et son système ; sinon « Appareil inconnu ».
    static func title(of session: UserSession) -> String {
        if let name = session.deviceName.filled { return name }
        if let model = session.deviceModel.filled, let named = DeviceModelName.readable(forIdentifier: model, environment: [:]) {
            return named
        }
        if let vendor = session.deviceVendor.filled, let model = session.deviceModel.filled {
            return model.hasPrefix(vendor) ? model : "\(vendor) \(model)"
        }
        if let browser = session.browserName.filled, let os = session.osName.filled {
            return String(format: String(localized: "sessions.device.browserOnSystem", defaultValue: "%1$@ sur %2$@", bundle: .main), browser, os)
        }
        if let browser = session.browserName.filled { return browser }
        return String(localized: "sessions_unknown_device", defaultValue: "Appareil inconnu", bundle: .main)
    }

    static func systemImage(of session: UserSession) -> String {
        switch session.deviceType?.lowercased() {
        case "tablet": return "ipad"
        case "mobile": return "iphone"
        case "desktop": return "desktopcomputer"
        default: break
        }
        switch session.platform {
        case "ios": return session.deviceModel?.hasPrefix("iPad") == true ? "ipad" : "iphone"
        case "android-shell": return "candybarphone"
        case "web", "pwa": return "globe"
        default: return session.isMobile == true ? "iphone" : "desktopcomputer"
        }
    }

    // MARK: - Le logiciel

    static func software(of session: UserSession) -> String? {
        let meeshy = session.appVersion.filled.map { version in
            session.appBuild.filled.map { "Meeshy \(version) (\($0))" } ?? "Meeshy \(version)"
        }
        let browser = session.browserName.filled.map { name in
            session.browserVersion.filled.map { "\(name) \(Self.majorVersion($0))" } ?? name
        }
        let systemName = session.osName.filled ?? (session.platform == "ios" ? "iOS" : nil)
        let system = systemName.map { name in
            session.osVersion.filled.map { "\(name) \($0)" } ?? name
        }
        let parts = [meeshy, browser, system, platformLabel(session.platform)].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// La plateforme ne se nomme que quand le système ne la dit pas déjà.
    static func platformLabel(_ platform: String?) -> String? {
        switch platform {
        case "web": return String(localized: "sessions.platform.web", defaultValue: "Web", bundle: .main)
        case "pwa": return String(localized: "sessions.platform.pwa", defaultValue: "Web (application installée)", bundle: .main)
        case "android-shell": return String(localized: "sessions.platform.android", defaultValue: "Application Android", bundle: .main)
        default: return nil
        }
    }

    private static func majorVersion(_ version: String) -> String {
        version.split(separator: ".").first.map(String.init) ?? version
    }

    // MARK: - Le lieu

    /// La ville se dit APPROXIMATIVE : elle est tirée de l'adresse IP (#9609).
    static func place(of session: UserSession, locale: Locale) -> String? {
        let country = session.country.filled.map { locale.localizedString(forRegionCode: $0) ?? $0 }
        let city = session.city.filled
        let named = [city, country].compactMap { $0 }.joined(separator: ", ")
        let located: String? = named.isEmpty ? session.location.filled : named
        let approximate = located.map {
            String(format: String(localized: "sessions.place.approximate", defaultValue: "%@ (approximatif)", bundle: .main), $0)
        }
        let parts = [approximate, session.ipAddress.filled].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Le temps

    static func opened(_ session: UserSession, locale: Locale) -> String {
        let date = session.createdAt.formatted(.dateTime.day().month(.abbreviated).year().locale(locale))
        let opened = String(format: String(localized: "sessions.opened", defaultValue: "Ouverte le %@", bundle: .main), date)
        guard let method = loginMethodLabel(session.loginMethod) else { return opened }
        return "\(opened) · \(method)"
    }

    static func loginMethodLabel(_ method: String?) -> String? {
        switch method {
        case "password": return String(localized: "sessions.loginMethod.password", defaultValue: "Connexion par mot de passe", bundle: .main)
        case "two_factor": return String(localized: "sessions.loginMethod.twoFactor", defaultValue: "Connexion par mot de passe et code", bundle: .main)
        case "magic_link": return String(localized: "sessions.loginMethod.magicLink", defaultValue: "Connexion par lien magique", bundle: .main)
        case "registration": return String(localized: "sessions.loginMethod.registration", defaultValue: "Ouverte à l'inscription", bundle: .main)
        case "email_verification": return String(localized: "sessions.loginMethod.emailVerification", defaultValue: "Connexion par vérification de l'e-mail", bundle: .main)
        case "oauth": return String(localized: "sessions.loginMethod.oauth", defaultValue: "Connexion par un compte externe", bundle: .main)
        case "anonymous": return String(localized: "sessions.loginMethod.anonymous", defaultValue: "Session invitée", bundle: .main)
        default: return nil
        }
    }

    static func activity(of session: UserSession, now: Date, locale: Locale) -> String? {
        if session.isCurrent {
            return String(localized: "sessions.activity.now", defaultValue: "Active maintenant", bundle: .main)
        }
        guard let lastActive = session.lastActive else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        let relative = formatter.localizedString(for: min(lastActive, now), relativeTo: now)
        return String(format: String(localized: "sessions.activity.last", defaultValue: "Dernière activité %@", bundle: .main), relative)
    }
}

private extension Optional where Wrapped == String {
    /// La valeur, si elle dit quelque chose.
    var filled: String? {
        guard let value = self?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
