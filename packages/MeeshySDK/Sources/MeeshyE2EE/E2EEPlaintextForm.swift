import Foundation

/// Un clair rendu par libsignal ne se lit que s'il est un JSON que tous les
/// lecteurs du contrat #18940 jugent pareil. `JSONDecoder` ne vérifie une
/// chaîne qu'au moment de la décoder : un échappement inconnu, un caractère de
/// contrôle brut ou une demi-paire de substitution (`\ud800` sans sa seconde
/// moitié) passaient ici dès qu'ils se trouvaient dans une clé que ce lecteur
/// ignore, quand le contrat rend le même clair illisible. Il reconnaissait de
/// plus une marque d'ordre d'octets et l'UTF-16. La forme se juge donc AVANT la
/// sonde et le lecteur, sur tout le document : de l'UTF-8 strict (une
/// demi-paire encodée en octets, `ED A0 80`, n'en est pas), sans marque d'ordre
/// d'octets, sans octet de contrôle hors des blancs JSON, et des chaînes bien
/// formées partout (RFC 8259 § 7 et § 8.2).
///
/// Et sans plus de `maxDepth` niveaux d'imbrication (#19112) : la borne du
/// contrat (`E2EE_MAX_DEPTH`) se compte hors des chaînes, avant toute analyse,
/// quelle que soit la version annoncée. `JSONDecoder` s'arrêtait à sa propre
/// borne : un clair de 65 à quelques centaines de niveaux se lisait ici et nulle
/// part ailleurs.
enum E2EEPlaintextForm {
    /// `E2EE_MAX_DEPTH` du contrat : un contenu a 1 niveau, un signal 2 au plus.
    static let maxDepth = 64

    static func isWellFormed(_ plaintext: Data) -> Bool {
        let units = Array(plaintext)
        guard !units.starts(with: E2EEJSONByte.byteOrderMark), isStrictUTF8(units) else { return false }
        var scan = E2EEJSONStringScan(units: units)
        return scan.passes()
    }

    /// Le refus, sous la forme que `E2EEEnvelopeOpener.isVerdict` juge : un
    /// clair mal formé est illisible, jamais « pas maintenant ».
    static func validate(_ plaintext: Data) throws {
        guard isWellFormed(plaintext) else {
            throw DecodingError.dataCorrupted(DecodingError.Context(codingPath: [], debugDescription: "E2EE plaintext is not well-formed JSON"))
        }
    }

    private static func isStrictUTF8(_ units: [UInt8]) -> Bool {
        var iterator = units.makeIterator()
        var decoder = UTF8()
        while true {
            switch decoder.decode(&iterator) {
            case .scalarValue: continue
            case .emptyInput: return true
            case .error: return false
            }
        }
    }
}

private enum E2EEJSONByte {
    static let byteOrderMark: [UInt8] = [0xEF, 0xBB, 0xBF]
    static let quote = UInt8(ascii: "\"")
    static let backslash = UInt8(ascii: "\\")
    static let escapedUnit = UInt8(ascii: "u")
    static let openers: Set<UInt8> = [UInt8(ascii: "["), UInt8(ascii: "{")]
    static let closers: Set<UInt8> = [UInt8(ascii: "]"), UInt8(ascii: "}")]
    static let firstPrintable: UInt8 = 0x20
    /// Les blancs JSON qui ne sont pas l'espace : tabulation, saut de ligne, retour chariot.
    static let controlWhitespace: Set<UInt8> = [0x09, 0x0A, 0x0D]
    /// `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t` : les seuls échappements d'un caractère.
    static let singleEscapes = Set("\"\\/bfnrt".utf8)

    static func hexValue(_ unit: UInt8) -> UInt16? {
        switch unit {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): return UInt16(unit - UInt8(ascii: "0"))
        case UInt8(ascii: "a")...UInt8(ascii: "f"): return UInt16(unit - UInt8(ascii: "a") + 10)
        case UInt8(ascii: "A")...UInt8(ascii: "F"): return UInt16(unit - UInt8(ascii: "A") + 10)
        default: return nil
        }
    }
}

/// Un parcours linéaire des OCTETS qui juge ce que `JSONDecoder` remet à plus
/// tard : hors d'une chaîne, aucun octet de contrôle autre qu'un blanc, et pas
/// plus de `maxDepth` niveaux (`[` et `{` ouvrent, `]` et `}` ferment) ; dans
/// une chaîne, aucun octet de contrôle brut, aucun échappement inconnu, et
/// aucune demi-paire échappée. Une barre oblique inverse échappée (`\\`) se
/// saute en bloc : `"\\ud800"` est un texte, pas une demi-paire, et `"\\"`
/// ferme sa chaîne. Les octets, jamais des `Character` : un `Character` fusionne
/// une marque combinante avec le guillemet qui la précède.
private struct E2EEJSONStringScan {
    let units: [UInt8]
    private var index = 0

    init(units: [UInt8]) {
        self.units = units
    }

    mutating func passes() -> Bool {
        var depth = 0
        while index < units.count {
            let unit = units[index]
            index += 1
            if unit == E2EEJSONByte.quote {
                guard closesString() else { return false }
            } else if E2EEJSONByte.openers.contains(unit) {
                depth += 1
                guard depth <= E2EEPlaintextForm.maxDepth else { return false }
            } else if E2EEJSONByte.closers.contains(unit) {
                depth -= 1
            } else if unit < E2EEJSONByte.firstPrintable, !E2EEJSONByte.controlWhitespace.contains(unit) {
                return false
            }
        }
        return true
    }

    private mutating func closesString() -> Bool {
        while index < units.count {
            let unit = units[index]
            index += 1
            if unit == E2EEJSONByte.quote { return true }
            if unit < E2EEJSONByte.firstPrintable { return false }
            if unit == E2EEJSONByte.backslash, !escapeIsWellFormed() { return false }
        }
        return false
    }

    private mutating func escapeIsWellFormed() -> Bool {
        guard index < units.count else { return false }
        let escaped = units[index]
        index += 1
        guard escaped == E2EEJSONByte.escapedUnit else { return E2EEJSONByte.singleEscapes.contains(escaped) }
        guard let unit = codeUnit() else { return false }
        if UTF16.isTrailSurrogate(unit) { return false }
        guard UTF16.isLeadSurrogate(unit) else { return true }
        guard index + 1 < units.count, units[index] == E2EEJSONByte.backslash, units[index + 1] == E2EEJSONByte.escapedUnit else {
            return false
        }
        index += 2
        guard let trail = codeUnit() else { return false }
        return UTF16.isTrailSurrogate(trail)
    }

    /// Les quatre chiffres hexadécimaux d'un `\uXXXX`, consommés.
    private mutating func codeUnit() -> UInt16? {
        guard index + 4 <= units.count else { return nil }
        let digits = units[index..<index + 4]
        index += 4
        return digits.reduce(UInt16?.some(0)) { partial, digit in
            guard let partial, let value = E2EEJSONByte.hexValue(digit) else { return nil }
            return partial << 4 | value
        }
    }
}
