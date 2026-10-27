import Foundation

/// C4b — la moitié CLIENTE de la porte de version (plan
/// `docs/superpowers/plans/2026-08-20-meeshy-composer-lot-c.md`, tâche C4).
///
/// Le gateway porte déjà la moitié serveur (lot A, A5/A6) :
/// `services/gateway/src/utils/appVersion.ts`. Ce type en est le MIROIR, pas
/// une seconde opinion — les deux moitiés d'une porte qui compareraient
/// différemment produiraient soit un client qui se croit à jour quand le
/// serveur le refuse, soit un client qui se barre lui-même alors que le serveur
/// le sert.
///
/// L'algorithme reproduit est celui-ci, ligne à ligne :
/// ```ts
/// const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
/// for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d; }
/// ```
/// Trois composantes, jamais quatre ; composante illisible = 0 (c'est
/// `parseInt`, qui lit le PRÉFIXE numérique et ne « rate » pas) ; plancher vide
/// = porte désarmée ; version absente = jamais en dessous (le web n'envoie pas
/// cet en-tête, et le FORMAT juge les binaires d'avant l'en-tête).
public enum AppVersionHeader {

    /// Le gateway lit `request.headers['x-app-version']`
    /// (`services/gateway/src/routes/posts/core.ts`).
    public static let versionHeaderName = "X-App-Version"

    /// `getAppStoreUrl(platform)` : `android` ⇒ Play Store, tout le reste ⇒
    /// App Store. Sans cet en-tête, un iPhone recevrait un `storeUrl` d'App
    /// Store par défaut — correct aujourd'hui, mais par accident.
    public static let platformHeaderName = "X-App-Platform"

    public static let platformValue = "ios"

    /// Repli quand le bundle n'a pas de `CFBundleShortVersionString` (hôtes de
    /// test, extensions minimales). `0.0.0` est délibérément SOUS tout plancher
    /// armé : dans le doute, la porte se ferme.
    public static let fallbackVersion = "0.0.0"

    /// La short version du bundle — exactement ce que l'App Store affiche, et
    /// exactement ce que le plancher `MIN_APP_VERSION` compare.
    public static func value(bundle: Bundle = .main) -> String {
        guard let short = bundle.infoDictionary?["CFBundleShortVersionString"] as? String,
              !short.isEmpty else {
            return fallbackVersion
        }
        return short
    }

    /// Miroir de `compareAppVersions` — rend un ordre sur les TROIS premières
    /// composantes uniquement.
    public static func compare(_ lhs: String, _ rhs: String) -> Int {
        let a = components(of: lhs)
        let b = components(of: rhs)
        for index in 0..<3 {
            let delta = (index < a.count ? a[index] : 0) - (index < b.count ? b[index] : 0)
            if delta != 0 { return delta }
        }
        return 0
    }

    /// Miroir de `isBelowFloor(header, floor)`.
    public static func isBelow(_ version: String?, floor: String) -> Bool {
        guard !floor.isEmpty else { return false }
        guard let version, !version.isEmpty else { return false }
        return compare(version, floor) < 0
    }

    /// La question que pose le bootstrap : CE binaire est-il sous le plancher
    /// que le gateway vient d'annoncer ?
    public static func isBelow(floor: String) -> Bool {
        isBelow(value(), floor: floor)
    }

    /// `parseInt(n, 10) || 0` : le préfixe numérique, ou zéro.
    private static func components(of version: String) -> [Int] {
        version.split(separator: ".", omittingEmptySubsequences: false).map { part in
            var digits = ""
            for character in part {
                if digits.isEmpty && character == "-" {
                    digits.append(character)
                    continue
                }
                guard character.isASCII, character.isNumber else { break }
                digits.append(character)
            }
            return Int(digits) ?? 0
        }
    }
}

/// Ce que le gateway dit dans un `426` — `minVersion` et `storeUrl` sont
/// étalés **à la racine** du corps par `sendError`
/// (`services/gateway/src/utils/response.ts` : `...(options?.details ?? {})`),
/// pas nichés sous un `details`. Se tromper de niveau rendrait la porte muette
/// sur l'URL du store.
public struct UpgradeRequirement: Sendable, Equatable {

    public let minVersion: String

    /// Résolu par le SERVEUR à partir de `X-App-Platform` — le client ne
    /// l'invente jamais. `nil` quand le corps est illisible : la rupture tient
    /// quand même, seul le bouton « ouvrir le store » retombe sur son repli.
    public let storeUrl: String?

    public init(minVersion: String, storeUrl: String?) {
        self.minVersion = minVersion
        self.storeUrl = storeUrl
    }

    private struct Wire: Decodable {
        let minVersion: String?
        let storeUrl: String?
    }

    /// Un corps illisible ne doit pas ANNULER la rupture : c'est le statut 426
    /// qui la déclenche, pas la qualité du JSON. D'où une exigence NUE plutôt
    /// qu'un `nil`.
    public static func decoded(fromResponseBody data: Data) -> UpgradeRequirement {
        guard let wire = try? JSONDecoder().decode(Wire.self, from: data) else {
            return UpgradeRequirement(minVersion: "", storeUrl: nil)
        }
        return UpgradeRequirement(minVersion: wire.minVersion ?? "", storeUrl: wire.storeUrl)
    }
}

public extension Notification.Name {
    /// Postée par `APIClient` sur tout `426`, et par le bootstrap de la porte
    /// quand le plancher lu à `GET /app/min-version` dépasse la version du
    /// binaire. Les deux racines (`RootView`, `iPadRootView`) l'observent.
    static let meeshyUpgradeRequired = Notification.Name("me.meeshy.upgradeRequired")
}

public extension UpgradeRequirement {

    static let minVersionUserInfoKey = "minVersion"
    static let storeUrlUserInfoKey = "storeUrl"

    /// Poste sur la file PRINCIPALE : les observateurs sont des vues SwiftUI,
    /// et le 426 arrive depuis la file réseau d'URLSession.
    func post(via center: NotificationCenter = .default) {
        var userInfo: [String: String] = [Self.minVersionUserInfoKey: minVersion]
        if let storeUrl { userInfo[Self.storeUrlUserInfoKey] = storeUrl }
        DispatchQueue.main.async {
            center.post(name: .meeshyUpgradeRequired, object: nil, userInfo: userInfo)
        }
    }

    init?(notification: Notification) {
        guard notification.name == .meeshyUpgradeRequired else { return nil }
        let userInfo = notification.userInfo ?? [:]
        self.init(
            minVersion: userInfo[Self.minVersionUserInfoKey] as? String ?? "",
            storeUrl: userInfo[Self.storeUrlUserInfoKey] as? String
        )
    }
}

/// Le point unique où un statut HTTP devient une rupture cliente. Isolé du
/// funnel d'`APIClient` pour être éprouvable : le funnel, lui, tient une
/// `URLSession` réelle avec épinglage de certificat, qu'aucun test ne peut
/// détourner.
public enum UpgradeGateSignal {

    /// Rend l'exigence — et la poste — UNIQUEMENT sur `426`. Tout autre statut
    /// rend `nil` sans rien poster : un `403` qui barrerait l'app serait une
    /// porte fantôme.
    @discardableResult
    public static func signal(
        statusCode: Int,
        body: Data,
        center: NotificationCenter = .default
    ) -> UpgradeRequirement? {
        guard statusCode == 426 else { return nil }
        let requirement = UpgradeRequirement.decoded(fromResponseBody: body)
        requirement.post(via: center)
        return requirement
    }
}
