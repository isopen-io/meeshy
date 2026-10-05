import Foundation

/// Écrit une `VCard` en vCard 3.0 (RFC 2426) : CRLF, échappements `\n \, \; \\`,
/// lignes pliées à 75 octets sans couper un caractère UTF-8 (#8101).
///
/// Repli de l'envoi quand `CNContactVCardSerialization` échoue, et forme de
/// référence des témoins : ce que le parseur relit de ce qu'il écrit est
/// la carte d'origine.
public enum VCardWriter {

    public static func write(_ card: VCard) -> String {
        var lines = ["BEGIN:VCARD", "VERSION:3.0"]
        let name = card.name ?? VCardName(given: card.displayName)
        lines.append("N:" + [name.family, name.given, name.additional, name.prefix, name.suffix].map(escape).joined(separator: ";"))
        lines.append("FN:" + escape(card.displayName))
        if let organization = card.organization { lines.append("ORG:" + escape(organization)) }
        if let title = card.title { lines.append("TITLE:" + escape(title)) }
        lines += card.phones.map { "TEL" + typeParam($0.types) + ":" + escape($0.value) }
        lines += card.emails.map { "EMAIL" + typeParam(["internet"] + $0.types) + ":" + escape($0.value) }
        lines += card.addresses.map { address in
            "ADR" + typeParam(address.types) + ":" + [
                address.poBox, address.extended, address.street, address.locality,
                address.region, address.postalCode, address.country,
            ].map(escape).joined(separator: ";")
        }
        lines += card.urls.map { "URL" + typeParam($0.types) + ":" + escape($0.value) }
        if let birthday = card.birthday { lines.append("BDAY:" + birthday) }
        if let note = card.note { lines.append("NOTE:" + escape(note)) }
        lines.append("END:VCARD")
        return lines.map(fold).joined(separator: "\r\n") + "\r\n"
    }

    private static func typeParam(_ types: [String]) -> String {
        let unique = types.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        return unique.isEmpty ? "" : ";TYPE=" + unique.map { $0.uppercased() }.joined(separator: ",")
    }

    static func escape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: ",", with: "\\,")
            .replacingOccurrences(of: ";", with: "\\;")
    }

    /// Plie à 75 octets : chaque suite commence par un espace.
    static func fold(_ line: String) -> String {
        var segments: [String] = []
        var current = ""
        var currentBytes = 0
        for character in line {
            let size = String(character).utf8.count
            let limit = segments.isEmpty ? 75 : 74
            if currentBytes + size > limit {
                segments.append(current)
                current = ""
                currentBytes = 0
            }
            current.append(character)
            currentBytes += size
        }
        segments.append(current)
        return segments.joined(separator: "\r\n ")
    }
}
