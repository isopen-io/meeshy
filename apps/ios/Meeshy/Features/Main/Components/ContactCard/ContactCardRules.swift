import Foundation
import MeeshySDK

// MARK: - Reconnaître une carte de visite

/// Une pièce jointe EST une carte de visite (#8101) quand son type MIME est
/// l'un des alias vCard, ou — un fichier `.vcf` déposé depuis Fichiers arrive
/// souvent en `application/octet-stream` — quand son nom finit en `.vcf` /
/// `.vcard`. Miroir de `isContactCardAttachment` (`packages/shared/utils/vcard.ts`).
enum ContactCardMime {
    static let mimeType = "text/vcard"
    static let fileExtension = "vcf"

    private static let aliases: Set<String> = ["text/vcard", "text/x-vcard", "text/directory"]
    private static let extensions: Set<String> = ["vcf", "vcard"]

    static func isContactCard(mimeType: String, fileName: String) -> Bool {
        let bare = mimeType.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        if aliases.contains(bare) { return true }
        guard bare.isEmpty || bare == "application/octet-stream" || bare.hasPrefix("text/") else { return false }
        let ext = (fileName as NSString).pathExtension.lowercased()
        return extensions.contains(ext)
    }
}

extension MessageAttachment {
    var isContactCard: Bool {
        ContactCardMime.isContactCard(mimeType: mimeType, fileName: originalName.isEmpty ? fileName : originalName)
    }
}

// MARK: - Actions offertes selon la relation

/// Ce que la carte propose pour un compte résolu (#8101).
///
/// - `self` : aucune action — c'est la carte du lecteur lui-même.
/// - `friend` : **Écrire** seul.
/// - `request-sent` : « Demande envoyée » (un ÉTAT, pas un bouton) + **Écrire**.
/// - `request-received` : **Accepter** + **Écrire** — quand la demande reçue
///   est connue localement ; sinon **Se connecter**, que le serveur traite.
/// - `none` : **Se connecter** + **Écrire**.
struct ContactAccountActions: Equatable {
    enum Connect: Equatable {
        case connect
        case accept(requestId: String)
        case pending
    }

    let connect: Connect?
    let canWrite: Bool

    static let none = ContactAccountActions(connect: nil, canWrite: false)

    static func resolve(relation: ContactRelation, pendingReceivedRequestId: String?) -> ContactAccountActions {
        switch relation {
        case .current:
            return .none
        case .friend:
            return ContactAccountActions(connect: nil, canWrite: true)
        case .requestSent:
            return ContactAccountActions(connect: .pending, canWrite: true)
        case .requestReceived:
            return ContactAccountActions(connect: pendingReceivedRequestId.map { .accept(requestId: $0) } ?? .connect, canWrite: true)
        case .none:
            return ContactAccountActions(connect: .connect, canWrite: true)
        }
    }
}

// MARK: - Les champs de la fiche

/// Une ligne de la fiche : TOUS les champs lisibles de la vCard, dans
/// l'ordre où un carnet les présente. Chaque ligne se copie par appui long.
struct ContactCardField: Identifiable, Equatable {
    enum Kind: String, Equatable {
        case phone, email, address, organization, title, url, birthday, note

        var systemImage: String {
            switch self {
            case .phone: return "phone.fill"
            case .email: return "envelope.fill"
            case .address: return "mappin.and.ellipse"
            case .organization: return "building.2.fill"
            case .title: return "briefcase.fill"
            case .url: return "link"
            case .birthday: return "gift.fill"
            case .note: return "note.text"
            }
        }
    }

    let id: String
    let kind: Kind
    let label: String
    let value: String

    static func fields(for card: VCard, birthdayFormatter: (DateComponents) -> String = ContactCardField.formatBirthday) -> [ContactCardField] {
        var fields: [ContactCardField] = []
        fields += card.phones.enumerated().map { index, entry in
            ContactCardField(id: "phone-\(index)", kind: .phone, label: ContactCardLabel.text(for: entry.labelKey, fallback: .phone), value: entry.value)
        }
        fields += card.emails.enumerated().map { index, entry in
            ContactCardField(id: "email-\(index)", kind: .email, label: ContactCardLabel.text(for: entry.labelKey, fallback: .email), value: entry.value)
        }
        fields += card.addresses.enumerated().map { index, address in
            let key = address.label ?? VCardEntry(value: "", types: address.types).labelKey
            return ContactCardField(id: "address-\(index)", kind: .address, label: ContactCardLabel.text(for: key, fallback: .address), value: address.formatted)
        }
        if let organization = card.organization {
            fields.append(ContactCardField(id: "organization", kind: .organization, label: ContactCardLabel.text(for: nil, fallback: .organization), value: organization))
        }
        if let title = card.title {
            fields.append(ContactCardField(id: "title", kind: .title, label: ContactCardLabel.text(for: nil, fallback: .title), value: title))
        }
        fields += card.urls.enumerated().map { index, entry in
            ContactCardField(id: "url-\(index)", kind: .url, label: ContactCardLabel.text(for: entry.labelKey, fallback: .url), value: entry.value)
        }
        if let birthday = card.birthday {
            let value = card.birthdayComponents.map(birthdayFormatter) ?? birthday
            fields.append(ContactCardField(id: "birthday", kind: .birthday, label: ContactCardLabel.text(for: nil, fallback: .birthday), value: value))
        }
        if let note = card.note {
            fields.append(ContactCardField(id: "note", kind: .note, label: ContactCardLabel.text(for: nil, fallback: .note), value: note))
        }
        return fields
    }

    nonisolated static func formatBirthday(_ components: DateComponents) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let hasYear = components.year != nil
        var filled = components
        filled.year = components.year ?? 2000
        guard let date = calendar.date(from: filled) else { return "" }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(hasYear ? "dMMMMyyyy" : "dMMMM")
        return formatter.string(from: date)
    }
}

/// Le libellé d'un champ : clé connue localisée (`mobile` → « Mobile »),
/// libellé libre de l'auteur tel quel, sinon le nom du champ.
enum ContactCardLabel {
    static func text(for key: String?, fallback: ContactCardField.Kind) -> String {
        guard let key else { return kindTitle(fallback) }
        switch key {
        case "mobile": return String(localized: "contact-card.label.mobile", defaultValue: "Mobile", bundle: .main)
        case "home": return String(localized: "contact-card.label.home", defaultValue: "Domicile", bundle: .main)
        case "work": return String(localized: "contact-card.label.work", defaultValue: "Travail", bundle: .main)
        case "main": return String(localized: "contact-card.label.main", defaultValue: "Principal", bundle: .main)
        case "iphone": return "iPhone"
        case "fax": return String(localized: "contact-card.label.fax", defaultValue: "Fax", bundle: .main)
        case "pager": return String(localized: "contact-card.label.pager", defaultValue: "Bip", bundle: .main)
        case "other": return String(localized: "contact-card.label.other", defaultValue: "Autre", bundle: .main)
        default: return key
        }
    }

    static func kindTitle(_ kind: ContactCardField.Kind) -> String {
        switch kind {
        case .phone: return String(localized: "contact-card.field.phone", defaultValue: "Téléphone", bundle: .main)
        case .email: return String(localized: "contact-card.field.email", defaultValue: "E-mail", bundle: .main)
        case .address: return String(localized: "contact-card.field.address", defaultValue: "Adresse", bundle: .main)
        case .organization: return String(localized: "contact-card.field.organization", defaultValue: "Organisation", bundle: .main)
        case .title: return String(localized: "contact-card.field.title", defaultValue: "Poste", bundle: .main)
        case .url: return String(localized: "contact-card.field.url", defaultValue: "Site web", bundle: .main)
        case .birthday: return String(localized: "contact-card.field.birthday", defaultValue: "Anniversaire", bundle: .main)
        case .note: return String(localized: "contact-card.field.note", defaultValue: "Note", bundle: .main)
        }
    }
}
