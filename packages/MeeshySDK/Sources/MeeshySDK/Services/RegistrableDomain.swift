import Foundation

/// Le domaine ENREGISTRABLE d'une URL (eTLD+1) — la seule trace d'un lien
/// sortant qui quitte l'appareil (#10505). Ni chemin, ni requête, ni
/// sous-domaine, ni adresse IP.
///
/// Les suffixes publics à deux niveaux les plus courants sont connus ; pour
/// les autres, les deux derniers libellés. Une approximation assumée : elle
/// peut REGROUPER deux sites d'un même suffixe rare, jamais exposer plus que
/// le domaine.
public enum RegistrableDomain {
    static let multiLabelSuffixes: Set<String> = [
        "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
        "com.au", "net.au", "org.au", "edu.au", "gov.au",
        "co.nz", "org.nz", "co.jp", "ne.jp", "or.jp", "ac.jp",
        "co.kr", "or.kr", "com.br", "com.ar", "com.mx", "com.co", "com.pe",
        "com.cn", "com.hk", "com.tw", "com.sg", "com.my", "com.tr", "com.ua",
        "co.in", "co.za", "co.il", "co.th", "co.id", "com.ng", "com.gh",
        "com.eg", "com.sa", "com.pk", "com.ph", "com.vn",
        "gouv.fr", "asso.fr", "co.ma", "gov.ma", "co.ke", "co.tz", "co.ug",
        "com.ci", "co.cm", "com.sn",
        "github.io", "blogspot.com", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev",
    ]

    public static func of(_ url: URL) -> String? {
        guard let host = url.host?.lowercased(), !host.isEmpty else { return nil }
        return of(host: host)
    }

    public static func of(host rawHost: String) -> String? {
        let host = rawHost.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
        guard !host.isEmpty, !isIPAddress(host), host.contains(".") else { return nil }
        let labels = host.split(separator: ".").map(String.init)
        guard labels.count >= 2 else { return nil }
        let lastTwo = labels.suffix(2).joined(separator: ".")
        let take = multiLabelSuffixes.contains(lastTwo) ? 3 : 2
        guard labels.count >= take else { return nil }
        return labels.suffix(take).joined(separator: ".")
    }

    static func isIPAddress(_ host: String) -> Bool {
        if host.contains(":") { return true }
        let parts = host.split(separator: ".")
        return parts.count == 4 && parts.allSatisfy { UInt8($0) != nil }
    }
}
