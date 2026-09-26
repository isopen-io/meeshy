import Foundation

/// Une carte de visite partagée (#8101) — la projection LISIBLE d'un fichier
/// vCard 2.1 / 3.0 / 4.0. Le nom est celui que l'AUTEUR a donné au contact
/// dans son carnet : la carte ne le recalcule jamais depuis Meeshy.
public struct VCard: Equatable, Sendable {
    public var formattedName: String?
    public var name: VCardName?
    public var phones: [VCardEntry]
    public var emails: [VCardEntry]
    public var addresses: [VCardAddress]
    public var organization: String?
    public var title: String?
    public var urls: [VCardEntry]
    public var birthday: String?
    public var note: String?

    public init(
        formattedName: String? = nil,
        name: VCardName? = nil,
        phones: [VCardEntry] = [],
        emails: [VCardEntry] = [],
        addresses: [VCardAddress] = [],
        organization: String? = nil,
        title: String? = nil,
        urls: [VCardEntry] = [],
        birthday: String? = nil,
        note: String? = nil
    ) {
        self.formattedName = formattedName
        self.name = name
        self.phones = phones
        self.emails = emails
        self.addresses = addresses
        self.organization = organization
        self.title = title
        self.urls = urls
        self.birthday = birthday
        self.note = note
    }

    /// Le nom à afficher : `FN`, sinon `N` recomposé, sinon l'organisation,
    /// sinon le premier numéro ou e-mail — jamais une chaîne vide tant que la
    /// carte porte au moins une donnée.
    public var displayName: String {
        [formattedName, name?.composed, organization, phones.first?.value, emails.first?.value]
            .lazy
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
    }

    /// Le numéro montré sous le nom dans la bulle : le préféré s'il est
    /// marqué, sinon le premier.
    public var primaryPhone: VCardEntry? {
        phones.first { $0.isPreferred } ?? phones.first
    }

    public var isEmpty: Bool {
        displayName.isEmpty && addresses.isEmpty && urls.isEmpty && note == nil && birthday == nil
    }

    /// `BDAY` interprété : `1990-05-12`, `19900512`, `--05-12`, `--0512`, ou
    /// un horodatage `1990-05-12T00:00:00Z`. `nil` si le format est inconnu —
    /// l'appelant affiche alors la valeur brute.
    public var birthdayComponents: DateComponents? {
        guard let raw = birthday?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
        let datePart = String(raw.split(separator: "T", maxSplits: 1).first ?? "")
        if datePart.hasPrefix("--") {
            let digits = datePart.dropFirst(2).filter(\.isNumber)
            guard digits.count == 4, let month = Int(digits.prefix(2)), let day = Int(digits.suffix(2)) else { return nil }
            return Self.validated(DateComponents(month: month, day: day))
        }
        let digits = datePart.filter(\.isNumber)
        guard digits.count == 8,
              let year = Int(digits.prefix(4)),
              let month = Int(digits.dropFirst(4).prefix(2)),
              let day = Int(digits.suffix(2)) else { return nil }
        return Self.validated(DateComponents(year: year, month: month, day: day))
    }

    private static func validated(_ components: DateComponents) -> DateComponents? {
        guard let month = components.month, (1...12).contains(month),
              let day = components.day, (1...31).contains(day) else { return nil }
        return components
    }
}

/// `N` — nom structuré (famille ; prénom ; autres ; préfixe ; suffixe).
public struct VCardName: Equatable, Sendable {
    public var family: String
    public var given: String
    public var additional: String
    public var prefix: String
    public var suffix: String

    public init(family: String = "", given: String = "", additional: String = "", prefix: String = "", suffix: String = "") {
        self.family = family
        self.given = given
        self.additional = additional
        self.prefix = prefix
        self.suffix = suffix
    }

    public var composed: String {
        [prefix, given, additional, family, suffix]
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

/// Un numéro, un e-mail ou une URL, avec ses types (`cell`, `work`, `pref`…)
/// en minuscules et l'éventuel libellé libre (`X-ABLabel` d'Apple).
public struct VCardEntry: Equatable, Hashable, Sendable {
    public var value: String
    public var types: [String]
    public var label: String?

    public init(value: String, types: [String] = [], label: String? = nil) {
        self.value = value
        self.types = types
        self.label = label
    }

    public var isPreferred: Bool { types.contains("pref") }

    /// Les clés de libellé que le client LOCALISE — mêmes clés que
    /// `VCARD_KNOWN_LABELS` (`packages/shared/types/contact-card.ts`).
    public static let knownLabels: [String] = ["mobile", "home", "work", "main", "iphone", "fax", "pager", "other"]

    /// Le libellé à montrer : le libellé de l'auteur s'il existe (clé connue
    /// ou texte libre), sinon la clé déduite des types (`cell` → `mobile`).
    /// `nil` quand rien ne qualifie la valeur.
    public var labelKey: String? {
        if let label { return label }
        let priority: [(String, String)] = [
            ("fax", "fax"), ("pager", "pager"), ("iphone", "iphone"), ("cell", "mobile"),
            ("main", "main"), ("home", "home"), ("work", "work"), ("other", "other"),
        ]
        return priority.first { types.contains($0.0) }?.1
    }

    static func knownLabel(forAppleSystemLabel system: String) -> String? {
        switch system.lowercased() {
        case "mobile": return "mobile"
        case "home": return "home"
        case "work": return "work"
        case "main": return "main"
        case "iphone": return "iphone"
        case "homefax", "workfax", "otherfax": return "fax"
        case "pager": return "pager"
        case "other": return "other"
        default: return nil
        }
    }
}

/// `ADR` — les sept composants du format (boîte postale ; complément ; rue ;
/// ville ; région ; code postal ; pays).
public struct VCardAddress: Equatable, Hashable, Sendable {
    public var poBox: String
    public var extended: String
    public var street: String
    public var locality: String
    public var region: String
    public var postalCode: String
    public var country: String
    public var types: [String]
    public var label: String?

    public init(
        poBox: String = "", extended: String = "", street: String = "",
        locality: String = "", region: String = "", postalCode: String = "",
        country: String = "", types: [String] = [], label: String? = nil
    ) {
        self.poBox = poBox
        self.extended = extended
        self.street = street
        self.locality = locality
        self.region = region
        self.postalCode = postalCode
        self.country = country
        self.types = types
        self.label = label
    }

    /// L'adresse sur plusieurs lignes : rue (et compléments), puis
    /// « code postal ville », puis région, puis pays.
    public var formatted: String {
        let cityLine = [postalCode, locality]
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return [poBox, street, extended, cityLine, region, country]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }
}
