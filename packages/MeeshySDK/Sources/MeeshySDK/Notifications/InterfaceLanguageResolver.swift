import Foundation

/// Où l'app dépose la langue de son interface, pour ses extensions (#8951).
///
/// Une extension de notification tourne dans son propre processus : l'override
/// `AppleLanguages` que l'app pose au lancement ne l'atteint pas, et elle
/// parlait la langue de l'APPAREIL sous des actions enregistrées dans celle de
/// l'APP. Le groupe d'app est le seul canal que les trois processus partagent.
public protocol InterfaceLanguageProviding {
    var publishedCode: String? { get }
    func publish(_ code: String?)
}

public struct AppGroupInterfaceLanguageStore: InterfaceLanguageProviding {
    public static let appGroupSuite = "group.me.meeshy.apps"
    public static let key = "meeshy.interface.language"

    private let suiteName: String

    public init(suiteName: String = Self.appGroupSuite) {
        self.suiteName = suiteName
    }

    public var publishedCode: String? {
        UserDefaults(suiteName: suiteName)?.string(forKey: Self.key)
    }

    public func publish(_ code: String?) {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }
        guard let code = code?.trimmingCharacters(in: .whitespacesAndNewlines), !code.isEmpty else {
            defaults.removeObject(forKey: Self.key)
            return
        }
        defaults.set(code, forKey: Self.key)
    }
}

/// La langue dans laquelle une notification parle — UNE fonction pour l'app
/// (catégories et actions) et ses deux extensions (NSE, extension de contenu).
///
/// Ordre : la langue publiée par l'app si le bundle la porte, sinon les
/// langues de l'appareil dans leur ordre, sinon le bundle tel quel.
public enum InterfaceLanguageResolver {

    public static func localization(
        published: String?,
        available: [String],
        devicePreferred: [String]
    ) -> String? {
        let candidates = available.filter { $0.caseInsensitiveCompare("Base") != .orderedSame }
        let preferences = [published].compactMap { $0 } + devicePreferred
        return preferences.lazy.compactMap { match($0, in: candidates) }.first
    }

    public static func bundle(
        for base: Bundle = .main,
        store: InterfaceLanguageProviding = AppGroupInterfaceLanguageStore(),
        devicePreferred: [String] = Locale.preferredLanguages
    ) -> Bundle {
        guard let code = localization(
            published: store.publishedCode,
            available: base.localizations,
            devicePreferred: devicePreferred
        ),
            let path = base.path(forResource: code, ofType: "lproj"),
            let localized = Bundle(path: path)
        else { return base }
        return localized
    }

    private static func match(_ raw: String, in candidates: [String]) -> String? {
        let wanted = canonical(raw)
        guard !wanted.isEmpty else { return nil }
        if let exact = candidates.first(where: { canonical($0) == wanted }) {
            return exact
        }
        let base = language(of: wanted)
        return candidates.first(where: { canonical($0) == base })
            ?? candidates.first(where: { language(of: canonical($0)) == base })
    }

    private static func canonical(_ code: String) -> String {
        code.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
    }

    private static func language(of canonicalCode: String) -> String {
        canonicalCode.split(separator: "-").first.map(String.init) ?? canonicalCode
    }
}
