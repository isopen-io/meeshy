import Foundation

/// LES BORNES BASSES D'UNE IDENTITÉ SAISIE (#13825) — la source UNIQUE, lue par
/// tout formulaire qui crée ou modifie un pseudo, un prénom, un nom ou un nom
/// affiché : inscription, profil, parcours invité.
///
/// Un pseudo a au moins `pseudoMin` caractères, un prénom, un nom ou un nom
/// affiché au moins `personNameMin`, une fois rognés : « A » ou « B » sont
/// refusés, « Al », « Li » ou « Sy » passent, et le pseudo « Al » aussi est
/// refusé. La CONNEXION d'un compte existant n'est pas concernée : elle ne lit
/// pas ces bornes, un pseudo de deux caractères déjà créé doit pouvoir s'ouvrir.
public enum IdentityRules {

    /// Longueur minimale d'un pseudo, rogné.
    public static let pseudoMin = 3
    /// Longueur minimale d'un prénom, d'un nom ou d'un nom affiché, rogné.
    public static let personNameMin = 2

    public enum Field: Equatable, Sendable {
        case pseudo
        case firstName
        case lastName
        case displayName
    }

    public static func minimum(for field: Field) -> Int {
        field == .pseudo ? pseudoMin : personNameMin
    }

    /// Le pseudo se compte en points de code (comme le schéma Ajv de la
    /// passerelle), un nom en caractères VISIBLES (`visibleNameLength`).
    private static func length(of value: String, for field: Field) -> Int {
        guard field != .pseudo else {
            return value.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars.count
        }
        return visibleNameLength(value)
    }

    // MARK: - Longueur visible d'un nom

    private static let invisibleOrControl: Set<UInt32> = Set(
        [0x200B, 0xFEFF, 0x000B, 0x000C] + Array(0x0000...0x0008) + Array(0x000E...0x001F)
            + Array(0x007F...0x009F) + Array(0xFFF9...0xFFFB)
    )
    private static let hangulFillers: Set<UInt32> = [0x115F, 0x1160, 0x3164, 0xFFA0]
    private static let pictographicPunctuation: Set<UInt32> = [0x203C, 0x2049, 0x3030, 0x303D]
    private static let pictographicPlane: ClosedRange<UInt32> = 0x1F000...0x1FFFD

    /// Le nombre de caractères qu'un nom laisse VOIR — miroir de
    /// `packages/shared/utils/visible-name-length.ts` (le TypeScript fait foi),
    /// la mesure du plancher de la passerelle (#13825). Balises, invisibles et
    /// contrôles retirés, forme NFC, puis comptage des caractères perçus qui
    /// portent une lettre, un chiffre ou un émoji : « 😀😀 » vaut 2, « É »
    /// décomposé 1, une lettre suivie d'une marque de direction, d'un gluon ou
    /// d'un trait d'union conditionnel 1, un remplissage hangul 0.
    ///
    /// Swift n'expose pas `Extended_Pictographic` : un caractère se voit ici
    /// s'il porte une lettre, un chiffre, un symbole (So, Sm) ou un point de
    /// code pictographique. Sur-approximation assumée — jamais l'inverse :
    /// l'écran ne refuse aucun nom que la passerelle accepte.
    public static func visibleNameLength(_ value: String) -> Int {
        let untagged = value.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
        let cleaned = String(String.UnicodeScalarView(untagged.unicodeScalars.filter { !invisibleOrControl.contains($0.value) }))
        return cleaned.precomposedStringWithCanonicalMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .filter(isVisibleCharacter)
            .count
    }

    private static func isVisibleCharacter(_ character: Character) -> Bool {
        character.unicodeScalars.contains { scalar in
            !hangulFillers.contains(scalar.value) && isVisibleScalar(scalar)
        }
    }

    private static func isVisibleScalar(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber, .otherSymbol, .mathSymbol:
            return true
        default:
            return pictographicPunctuation.contains(scalar.value) || pictographicPlane.contains(scalar.value)
        }
    }

    // MARK: - Pseudo d'un invité

    /// Ce que la passerelle garde d'un pseudo d'invité (`sanitizeUsername` :
    /// lettres ASCII, chiffres, `_ . -`).
    private static func servedGuestPseudoLength(_ value: String) -> Int {
        value.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars.filter { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || "_.-".unicodeScalars.contains(scalar))
        }.count
    }

    /// Le pseudo d'un INVITÉ (lien partagé, World) se mesure sur la base que la
    /// passerelle en SERT (`servedGuestNicknameViolation`) : « Al# » ou « Zoé »
    /// n'y gardent que deux caractères.
    public static func meetsGuestPseudoMinimum(_ value: String) -> Bool {
        servedGuestPseudoLength(value) >= pseudoMin
    }

    /// Un pseudo d'invité TAPÉ dont la passerelle ne garderait pas `pseudoMin`
    /// caractères. Le blanc n'est pas « trop court » : la passerelle nomme alors l'invité.
    public static func isGuestPseudoTooShort(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !meetsGuestPseudoMinimum(value)
    }

    /// `true` quand la saisie, rognée, atteint la borne. Une saisie vide ne
    /// l'atteint pas : c'est à l'appelant de dire si le vide est légitime.
    public static func meetsMinimum(_ value: String, for field: Field) -> Bool {
        length(of: value, for: field) >= minimum(for: field)
    }

    /// `true` quand quelque chose a été TAPÉ et reste sous la borne — le
    /// moment où le formulaire dit le minimum. Le vide n'est pas « trop court ».
    public static func isTooShort(_ value: String, for field: Field) -> Bool {
        let length = length(of: value, for: field)
        return length > 0 && length < minimum(for: field)
    }

    /// Les champs de profil tapés et sous leur borne, dans l'ordre de l'écran.
    public static func shortFields(firstName: String, lastName: String, displayName: String) -> [Field] {
        [(Field.firstName, firstName), (.lastName, lastName), (.displayName, displayName)]
            .filter { isTooShort($0.1, for: $0.0) }
            .map(\.0)
    }
}
