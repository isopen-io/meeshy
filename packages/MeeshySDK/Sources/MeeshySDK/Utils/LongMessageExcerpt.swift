import Foundation

/// Loi de l'extrait d'un message long — miroir Swift de `longMessageExcerpt`
/// (`packages/shared/utils/long-message.ts`), rejouée sur les MÊMES vecteurs
/// (`packages/shared/fixtures/long-message/excerpt.vectors.json`).
///
/// Un message de plus de `threshold` graphèmes n'en montre qu'un quart
/// (`ratio`), coupé à la dernière frontière de mot qui tient dans ce quart —
/// repli au graphème quand le quart ne contient aucune frontière (CJK, un
/// seul mot très long). L'extrait ne porte jamais l'ellipse : l'interface
/// l'ajoute avec « Lire la suite ». Il reste toujours sous la moitié du texte.
///
/// Le texte passé est le texte SERVI par le Prisme (traduction préférée,
/// sinon l'original) : l'extrait n'est jamais recalculé sur une autre langue.
public enum LongMessageExcerpt {
    public static let threshold = 512
    public static let ratio = 0.25

    /// `true` ssi `text` compte PLUS de `threshold` graphèmes — ne parcourt
    /// que `threshold + 1` caractères, jamais le message entier.
    public static func isLong(_ text: String) -> Bool {
        text.index(text.startIndex, offsetBy: threshold + 1, limitedBy: text.endIndex) != nil
    }

    /// L'extrait à afficher, ou `nil` si le message n'est pas long (il
    /// s'affiche alors en entier, sans « Lire la suite »).
    public static func excerpt(_ text: String) -> String? {
        guard isLong(text) else { return nil }
        let graphemes = Array(text)
        let budget = Int((Double(graphemes.count) * ratio).rounded(.down))
        let cut = lastWordBoundary(in: graphemes, atOrBefore: budget) ?? budget
        return String(graphemes[0..<cut])
    }

    private static func lastWordBoundary(in graphemes: [Character], atOrBefore budget: Int) -> Int? {
        let boundary = stride(from: budget, through: 1, by: -1).first { index in
            graphemes[index].isWhitespace && !graphemes[index - 1].isWhitespace
        }
        return boundary
    }
}
