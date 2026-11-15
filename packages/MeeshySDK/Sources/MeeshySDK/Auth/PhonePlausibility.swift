import Foundation

/// LA PLAUSIBILITÉ D'UN NUMÉRO (#6479) — miroir STRICT de
/// `packages/shared/utils/phone-plausibility.ts`.
///
/// Distincte de sa VALIDITÉ : `normalizePhoneWithCountry` (libphonenumber, côté
/// passerelle) répond « ce numéro peut-il exister dans ce pays », et dit oui à
/// `0600000000` comme à `0642424242`. Ce type répond à l'autre question —
/// « quelqu'un a-t-il tapé son numéro, ou rempli la case pour qu'elle se
/// taise ». Les deux se posent ; aucune ne remplace l'autre.
///
/// Directive porteur 2026-09-14 : « vérifier que c'est pas un faux numéro non
/// plus (> 8 chiffres, pas de chiffres identiques à la suite ex. 1111100000 ou
/// de répétition ex 42424242) ».
///
/// Les trois bornes sont recopiées du module TS et tenues par les mêmes
/// témoins — les trois exemples de la directive. Une divergence ici rendrait
/// le refus différent selon le client, sur la MÊME saisie.
public enum PhonePlausibility {

    /// « > 8 chiffres » — la borne du porteur, lue à la lettre.
    public static let minDigits = 9

    /// Quatre chiffres identiques d'affilée sont courants (`06 44 44 12 30`) ;
    /// cinq ne le sont plus, et `1111100000` en porte deux trains de cinq.
    public static let maxIdenticalRun = 5

    /// Au-delà de quatre chiffres, la répétition intégrale d'un groupe est trop
    /// rare pour distinguer un faux d'un vrai — et refuser un VRAI numéro coûte
    /// plus cher que d'en accepter un faux, puisque le numéro n'est même pas
    /// requis.
    public static let maxRepeatedUnit = 4

    public enum Refusal: String, Sendable, Equatable {
        case tooShort = "too-short"
        case identicalRun = "identical-run"
        case repeatedPattern = "repeated-pattern"
    }

    /// Les chiffres seuls — tout le reste (espaces, points, indicatif, tirets) sort.
    public static func digitsOnly(_ raw: String) -> String {
        raw.filter(\.isNumber)
    }

    /// Le motif du refus, ou `nil` quand le numéro est plausible.
    ///
    /// Une chaîne VIDE est plausible : le numéro n'est pas requis (#6424), et
    /// refuser l'absence rendrait obligatoire ce que le produit dit facultatif.
    public static func refusal(_ raw: String) -> Refusal? {
        let digits = digitsOnly(raw)
        if digits.isEmpty { return nil }
        if digits.count < minDigits { return .tooShort }
        if hasIdenticalRun(digits) { return .identicalRun }
        if isWhollyRepeated(digits) { return .repeatedPattern }
        return nil
    }

    public static func isPlausible(_ raw: String) -> Bool {
        refusal(raw) == nil
    }

    private static func hasIdenticalRun(_ digits: String) -> Bool {
        var run = 1
        var previous: Character?
        for character in digits {
            if let previous, character == previous {
                run += 1
            } else {
                run = 1
            }
            if run >= maxIdenticalRun { return true }
            previous = character
        }
        return false
    }

    /// `true` quand TOUTE la chaîne est un motif court répété — jamais quand
    /// elle le CONTIENT seulement.
    ///
    /// La nuance porte la règle : `0642424242` contient « 42 » quatre fois et
    /// reste un numéro parfaitement ordinaire.
    private static func isWhollyRepeated(_ digits: String) -> Bool {
        let characters = Array(digits)
        for unit in 1...maxRepeatedUnit {
            guard characters.count % unit == 0, characters.count / unit >= 3 else { continue }
            let head = characters.prefix(unit)
            let repeated = stride(from: 0, to: characters.count, by: unit)
                .allSatisfy { Array(characters[$0..<($0 + unit)]) == Array(head) }
            if repeated { return true }
        }
        return false
    }
}
