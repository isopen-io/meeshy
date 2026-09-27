import Foundation

/// Reconnaître une carte de visite et la nommer par son CONTACT (#8101, #8142, #8148).
///
/// Fonctions pures, lues par la bulle, l'écran des médias et la ligne d'aperçu
/// de la liste des conversations — un seul site pour « est-ce une vCard ? » et
/// « comment s'appelle-t-elle ? ». Miroir de `isContactCardAttachment` et de
/// `contactCardNameFromFileName` (`packages/shared/utils/vcard.ts`).
public enum ContactCardFile {
    public static let mimeType = "text/vcard"
    public static let fileExtension = "vcf"

    private static let aliases: Set<String> = ["text/vcard", "text/x-vcard", "text/directory"]
    private static let extensions: Set<String> = ["vcf", "vcard"]
    private static let temporaryPrefix = try! NSRegularExpression(
        pattern: "^contact_[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}_"
    )

    /// Un alias vCard, ou — un `.vcf` déposé depuis Fichiers arrive souvent en
    /// `application/octet-stream` — un type générique sur un nom `.vcf` / `.vcard`.
    public static func isContactCard(mimeType: String, fileName: String) -> Bool {
        let bare = mimeType.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        if aliases.contains(bare) { return true }
        guard bare.isEmpty || bare == "application/octet-stream" || bare.hasPrefix("text/") else { return false }
        let ext = (fileName as NSString).pathExtension.lowercased()
        return extensions.contains(ext)
    }

    /// Le nom tel que l'auteur l'a nommé : sans extension ni le préfixe
    /// `contact_<UUID>_` que les envois d'avant #8142 portent encore. `nil`
    /// quand il ne reste aucun nom.
    public static func displayName(fromFileName fileName: String) -> String? {
        let trimmed = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowered = trimmed.lowercased()
        let suffix = [".vcf", ".vcard"].first(where: lowered.hasSuffix)
        let base = suffix.map { String(trimmed.dropLast($0.count)) } ?? trimmed
        let range = NSRange(base.startIndex..., in: base)
        let stripped = temporaryPrefix.stringByReplacingMatches(in: base, range: range, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return stripped.isEmpty ? nil : stripped
    }

    /// Ce qu'une surface qui NOMME un média dit d'une carte de visite (#8122) :
    /// « 👤 Zoé », ou « 👤 Contact partagé » sans nom — jamais le fichier.
    /// `nil` quand la pièce n'est pas une carte de visite.
    public static func mediaLabel(mimeType: String, fileName: String) -> String? {
        guard isContactCard(mimeType: mimeType, fileName: fileName) else { return nil }
        let name = displayName(fromFileName: fileName)
            ?? NSLocalizedString("contact-card.shared", value: "Contact partagé", comment: "")
        return "👤 \(name)"
    }
}
