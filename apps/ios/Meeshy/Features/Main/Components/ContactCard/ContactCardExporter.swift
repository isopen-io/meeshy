import Foundation
import Contacts
import MeeshySDK

/// Transforme le contact CHOISI dans le carnet en fichier vCard 3.0 (#8101).
///
/// Le nom est celui que l'AUTEUR a donné au contact : `CNContactVCardSerialization`
/// écrit la fiche telle quelle. La photo n'est jamais jointe (poids, et elle
/// ne sert pas la carte). Si la sérialisation système échoue (fiche partielle
/// rendue par le sélecteur), le rédacteur pur du SDK écrit la même carte
/// depuis les champs lisibles.
enum ContactCardExporter {

    struct Export: Equatable {
        let data: Data
        let fileName: String
        let displayName: String
    }

    static func export(_ contact: CNContact) -> Export? {
        let card = vCard(from: contact)
        guard !card.isEmpty else { return nil }
        let data = systemSerialization(of: contact) ?? Data(VCardWriter.write(card).utf8)
        return Export(data: data, fileName: fileName(for: card.displayName), displayName: card.displayName)
    }

    /// Écrit l'export dans un fichier temporaire, prêt pour le tiroir de
    /// pièces jointes du composer (même voie qu'un fichier importé).
    static func writeTemporaryFile(_ export: Export, directory: URL = FileManager.default.temporaryDirectory) throws -> URL {
        // Le nom du fichier téléversé devient `originalName` : il porte le nom du
        // contact et rien d'autre (#8142) — l'unicité vit dans le DOSSIER.
        let folder = directory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent(export.fileName)
        try export.data.write(to: url, options: .atomic)
        return url
    }

    static func fileName(for displayName: String) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:?%*|\"<>\n\r\t")
        let cleaned = displayName.components(separatedBy: forbidden).joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let base = cleaned.isEmpty ? "contact" : String(cleaned.prefix(60))
        return base + "." + ContactCardMime.fileExtension
    }

    private static func systemSerialization(of contact: CNContact) -> Data? {
        guard let mutable = contact.mutableCopy() as? CNMutableContact else { return nil }
        if mutable.isKeyAvailable(CNContactImageDataKey) { mutable.imageData = nil }
        guard let data = try? CNContactVCardSerialization.data(with: [mutable]),
              VCardParser.parse(data) != nil else { return nil }
        return data
    }

    /// La carte lisible d'une fiche du carnet — seulement les clés que la
    /// fiche porte vraiment (un `CNContact` partiel lève sur une clé absente).
    static func vCard(from contact: CNContact) -> VCard {
        func available(_ key: String) -> Bool { contact.isKeyAvailable(key) }
        let formatted = contact.areKeysAvailable([CNContactFormatter.descriptorForRequiredKeys(for: .fullName)])
            ? CNContactFormatter.string(from: contact, style: .fullName)
            : nil
        let name = available(CNContactGivenNameKey) && available(CNContactFamilyNameKey)
            ? VCardName(family: contact.familyName, given: contact.givenName)
            : nil
        let phones = available(CNContactPhoneNumbersKey)
            ? contact.phoneNumbers.map { VCardEntry(value: $0.value.stringValue, types: types(for: $0.label)) }
            : []
        let emails = available(CNContactEmailAddressesKey)
            ? contact.emailAddresses.map { VCardEntry(value: $0.value as String, types: types(for: $0.label)) }
            : []
        let addresses = available(CNContactPostalAddressesKey)
            ? contact.postalAddresses.map { labeled in
                VCardAddress(
                    street: labeled.value.street, locality: labeled.value.city, region: labeled.value.state,
                    postalCode: labeled.value.postalCode, country: labeled.value.country, types: types(for: labeled.label)
                )
            }
            : []
        let urls = available(CNContactUrlAddressesKey) ? contact.urlAddresses.map { VCardEntry(value: $0.value as String) } : []
        let birthday = available(CNContactBirthdayKey) ? contact.birthday.flatMap(birthdayString) : nil
        return VCard(
            formattedName: formatted.flatMap { $0.isEmpty ? nil : $0 },
            name: name?.composed.isEmpty == false ? name : nil,
            phones: phones,
            emails: emails,
            addresses: addresses,
            organization: available(CNContactOrganizationNameKey) ? nonEmpty(contact.organizationName) : nil,
            title: available(CNContactJobTitleKey) ? nonEmpty(contact.jobTitle) : nil,
            urls: urls,
            birthday: birthday,
            note: nil
        )
    }

    private static func types(for label: String?) -> [String] {
        switch label {
        case CNLabelPhoneNumberMobile: return ["cell"]
        case CNLabelPhoneNumberiPhone: return ["iphone", "cell"]
        case CNLabelPhoneNumberMain: return ["main"]
        case CNLabelPhoneNumberHomeFax, CNLabelPhoneNumberWorkFax, CNLabelPhoneNumberOtherFax: return ["fax"]
        case CNLabelPhoneNumberPager: return ["pager"]
        case CNLabelHome: return ["home"]
        case CNLabelWork: return ["work"]
        case CNLabelOther: return ["other"]
        default: return []
        }
    }

    private static func birthdayString(_ components: DateComponents) -> String? {
        guard let month = components.month, let day = components.day else { return nil }
        let monthDay = String(format: "%02d-%02d", month, day)
        guard let year = components.year else { return "--" + monthDay }
        return String(format: "%04d-", year) + monthDay
    }

    private static func nonEmpty(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
