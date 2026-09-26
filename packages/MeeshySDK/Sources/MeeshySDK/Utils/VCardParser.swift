import Foundation

/// Lit un fichier vCard (2.1, 3.0, 4.0) et en rend la PREMIÈRE carte (#8101).
///
/// Fonction pure : aucun accès réseau, aucun singleton. Elle tolère ce que
/// les carnets exportent réellement — lignes pliées (RFC 6350 § 3.2),
/// `QUOTED-PRINTABLE` avec coupures douces et `CHARSET` (2.1), types nus
/// (`TEL;CELL:`), groupes Apple (`item1.TEL` + `item1.X-ABLabel`), URI `tel:`
/// (4.0), échappements `\n \, \; \\` (3.0/4.0). Les propriétés binaires
/// (`PHOTO`, `LOGO`, `KEY` en base64) sont ignorées.
public enum VCardParser {

    public static func parse(_ data: Data) -> VCard? {
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
            return nil
        }
        return parse(text)
    }

    public static func parse(_ text: String) -> VCard? {
        let lines = logicalLines(of: text)
        guard let begin = lines.firstIndex(where: { $0.uppercased() == "BEGIN:VCARD" }) else { return nil }
        let end = lines[begin...].firstIndex { $0.uppercased() == "END:VCARD" } ?? lines.endIndex
        let properties = lines[(begin + 1)..<end].compactMap(Property.init(line:))
        let card = build(from: properties)
        return card.isEmpty ? nil : card
    }

    // MARK: - Lignes logiques

    /// Déplie les lignes : une ligne qui commence par un espace ou une
    /// tabulation prolonge la précédente (le blanc de tête est retiré) ; une
    /// valeur `QUOTED-PRINTABLE` qui finit par `=` se poursuit sur la ligne
    /// suivante (coupure douce, vCard 2.1).
    static func logicalLines(of text: String) -> [String] {
        let raw = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
        var result: [String] = []
        var pendingSoftBreak = false
        for line in raw {
            if pendingSoftBreak, var last = result.popLast() {
                last.removeLast()
                last += line
                result.append(last)
                pendingSoftBreak = isQuotedPrintable(last) && last.hasSuffix("=")
                continue
            }
            if let first = line.first, first == " " || first == "\t", var last = result.popLast() {
                last += String(line.dropFirst())
                result.append(last)
                pendingSoftBreak = isQuotedPrintable(last) && last.hasSuffix("=")
                continue
            }
            guard !line.isEmpty else { continue }
            result.append(line)
            pendingSoftBreak = isQuotedPrintable(line) && line.hasSuffix("=")
        }
        return result
    }

    private static func isQuotedPrintable(_ line: String) -> Bool {
        guard let colon = unquotedIndex(of: ":", in: line) else { return false }
        return line[..<colon].uppercased().contains("QUOTED-PRINTABLE")
    }

    // MARK: - Propriété

    struct Property {
        let group: String?
        let name: String
        let params: [String: [String]]
        let rawValue: String

        init?(line: String) {
            guard let colon = VCardParser.unquotedIndex(of: ":", in: line) else { return nil }
            let head = String(line[..<colon])
            rawValue = String(line[line.index(after: colon)...])
            let segments = VCardParser.splitUnquoted(head, on: ";")
            guard let nameSegment = segments.first, !nameSegment.isEmpty else { return nil }
            let nameParts = nameSegment.split(separator: ".", maxSplits: 1).map(String.init)
            group = nameParts.count == 2 ? nameParts[0].lowercased() : nil
            name = (nameParts.last ?? nameSegment).uppercased()
            params = VCardParser.parseParams(segments.dropFirst())
        }

        var types: [String] {
            var types = (params["TYPE"] ?? []).map { $0.lowercased() }
            if params["PREF"] != nil, !types.contains("pref") { types.append("pref") }
            return types
        }

        var isBinary: Bool {
            let encoding = params["ENCODING"]?.first?.uppercased()
            return encoding == "B" || encoding == "BASE64" || params["VALUE"]?.first?.uppercased() == "BINARY"
        }

        /// La valeur décodée (QUOTED-PRINTABLE + CHARSET), encore ÉCHAPPÉE.
        var decodedValue: String {
            let isQP = params["ENCODING"]?.contains { $0.uppercased() == "QUOTED-PRINTABLE" } ?? false
            guard isQP else { return rawValue }
            let charset = params["CHARSET"]?.first
            return VCardParser.decodeQuotedPrintable(rawValue, charset: charset)
        }

        var text: String { VCardParser.unescape(decodedValue) }

        var components: [String] {
            VCardParser.splitUnescaped(decodedValue, on: ";").map(VCardParser.unescape)
        }
    }

    /// Paramètres : `KEY=v1,v2` ou nus (`CELL`, `QUOTED-PRINTABLE` en 2.1).
    /// Un paramètre nu est un TYPE, sauf les encodages et jeux de caractères
    /// que la 2.1 permettait d'écrire sans clé.
    static func parseParams<S: Sequence>(_ segments: S) -> [String: [String]] where S.Element == String {
        segments.reduce(into: [String: [String]]()) { params, segment in
            let pair = segment.split(separator: "=", maxSplits: 1).map(String.init)
            if pair.count == 2 {
                let key = pair[0].uppercased().trimmingCharacters(in: .whitespaces)
                let values = splitUnquoted(pair[1], on: ",").map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "\" ")) }
                params[key, default: []].append(contentsOf: values.flatMap { $0.split(separator: ",").map(String.init) })
                return
            }
            let bare = segment.trimmingCharacters(in: .whitespaces)
            switch bare.uppercased() {
            case "QUOTED-PRINTABLE", "BASE64", "B", "8BIT", "7BIT":
                params["ENCODING", default: []].append(bare)
            case "":
                break
            default:
                params["TYPE", default: []].append(bare)
            }
        }
    }

    // MARK: - Construction

    private static func build(from properties: [Property]) -> VCard {
        let labels = properties.reduce(into: [String: String]()) { labels, property in
            guard property.name == "X-ABLABEL", let group = property.group else { return }
            labels[group] = appleLabel(property.text)
        }
        func label(_ property: Property) -> String? { property.group.flatMap { labels[$0] } }

        return properties.reduce(into: VCard()) { card, property in
            guard !property.isBinary else { return }
            switch property.name {
            case "FN":
                card.formattedName = nonEmpty(property.text)
            case "N":
                let parts = property.components + Array(repeating: "", count: 5)
                let name = VCardName(family: parts[0], given: parts[1], additional: parts[2], prefix: parts[3], suffix: parts[4])
                card.name = name.composed.isEmpty ? nil : name
            case "TEL":
                let value = property.text.replacingOccurrences(of: "tel:", with: "", options: [.caseInsensitive, .anchored])
                guard let value = nonEmpty(value), !card.phones.contains(where: { $0.value == value }) else { return }
                card.phones.append(VCardEntry(value: value, types: property.types, label: label(property)))
            case "EMAIL":
                let value = property.text.replacingOccurrences(of: "mailto:", with: "", options: [.caseInsensitive, .anchored])
                guard let value = nonEmpty(value), !card.emails.contains(where: { $0.value.caseInsensitiveCompare(value) == .orderedSame }) else { return }
                card.emails.append(VCardEntry(value: value, types: property.types, label: label(property)))
            case "ADR":
                let parts = property.components + Array(repeating: "", count: 7)
                let address = VCardAddress(
                    poBox: parts[0], extended: parts[1], street: parts[2], locality: parts[3],
                    region: parts[4], postalCode: parts[5], country: parts[6],
                    types: property.types, label: label(property)
                )
                guard !address.formatted.isEmpty else { return }
                card.addresses.append(address)
            case "ORG":
                card.organization = nonEmpty(property.components.filter { !$0.isEmpty }.joined(separator: ", "))
            case "TITLE":
                card.title = nonEmpty(property.text)
            case "URL":
                guard let value = nonEmpty(property.text) else { return }
                card.urls.append(VCardEntry(value: value, types: property.types, label: label(property)))
            case "BDAY":
                card.birthday = nonEmpty(property.text)
            case "NOTE":
                card.note = nonEmpty(property.text)
            default:
                break
            }
        }
    }

    /// `_$!<Mobile>!$_` (libellé SYSTÈME d'Apple) → la clé normalisée
    /// `mobile` ; un libellé libre de l'auteur (« Perso ») reste tel quel.
    private static func appleLabel(_ raw: String) -> String? {
        guard raw.hasPrefix("_$!<"), raw.hasSuffix(">!$_") else { return nonEmpty(raw) }
        let system = String(raw.dropFirst(4).dropLast(4))
        return VCardEntry.knownLabel(forAppleSystemLabel: system) ?? nonEmpty(system)
    }

    private static func nonEmpty(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - Décodage

    static func decodeQuotedPrintable(_ value: String, charset: String?) -> String {
        var bytes: [UInt8] = []
        var iterator = Array(value.utf8).makeIterator()
        while let byte = iterator.next() {
            guard byte == UInt8(ascii: "=") else {
                bytes.append(byte)
                continue
            }
            guard let high = iterator.next() else { break }
            guard let low = iterator.next() else { break }
            if let hex = UInt8(String(bytes: [high, low], encoding: .ascii) ?? "", radix: 16) {
                bytes.append(hex)
            } else {
                bytes.append(contentsOf: [byte, high, low])
            }
        }
        let data = Data(bytes)
        return String(data: data, encoding: encoding(for: charset))
            ?? String(data: data, encoding: .isoLatin1)
            ?? value
    }

    private static func encoding(for charset: String?) -> String.Encoding {
        guard let charset, !charset.isEmpty else { return .utf8 }
        let cf = CFStringConvertIANACharSetNameToEncoding(charset as CFString)
        guard cf != kCFStringEncodingInvalidId else { return .utf8 }
        return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(cf))
    }

    static func unescape(_ value: String) -> String {
        var result = ""
        var escaping = false
        for character in value {
            if escaping {
                switch character {
                case "n", "N": result.append("\n")
                default: result.append(character)
                }
                escaping = false
            } else if character == "\\" {
                escaping = true
            } else {
                result.append(character)
            }
        }
        if escaping { result.append("\\") }
        return result
    }

    /// Découpe sur `separator` hors séquences échappées (`\;`) — les
    /// composants gardent leurs échappements, `unescape` les résout ensuite.
    static func splitUnescaped(_ value: String, on separator: Character) -> [String] {
        var parts: [String] = []
        var current = ""
        var escaping = false
        for character in value {
            if escaping {
                current.append(character)
                escaping = false
            } else if character == "\\" {
                current.append(character)
                escaping = true
            } else if character == separator {
                parts.append(current)
                current = ""
            } else {
                current.append(character)
            }
        }
        parts.append(current)
        return parts
    }

    static func splitUnquoted(_ value: String, on separator: Character) -> [String] {
        var parts: [String] = []
        var current = ""
        var quoted = false
        for character in value {
            if character == "\"" { quoted.toggle() }
            if character == separator && !quoted {
                parts.append(current)
                current = ""
            } else {
                current.append(character)
            }
        }
        parts.append(current)
        return parts
    }

    static func unquotedIndex(of target: Character, in line: String) -> String.Index? {
        var quoted = false
        for index in line.indices {
            let character = line[index]
            if character == "\"" { quoted.toggle() }
            if character == target && !quoted { return index }
        }
        return nil
    }
}
