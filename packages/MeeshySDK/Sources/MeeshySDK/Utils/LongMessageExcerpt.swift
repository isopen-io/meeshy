import Foundation

/// Loi de l'extrait d'un message long (#8147) — miroir Swift de
/// `longMessageExcerpt` (`packages/shared/utils/long-message.ts`), rejouée
/// sur les MÊMES vecteurs (`packages/shared/fixtures/long-message/excerpt.vectors.json`).
///
/// Contrat, identique au TypeScript :
/// 1. L'unité est le GRAPHÈME (`Character`) : un emoji composé, un drapeau ou
///    le couple `\r\n` comptent pour un.
/// 2. `graphèmes ≤ threshold` ⇒ rien n'est tronqué (`excerpt` rend `nil`).
/// 3. Sinon la cible vaut `floor(ratio × graphèmes)` ; on cherche, de la cible
///    vers le début, le dernier séparateur d'indice `1 ≤ i ≤ cible` ; l'extrait
///    est le préfixe `[0, i)`.
/// 4. On retire de sa fin les séparateurs et la ponctuation d'OUVERTURE : un
///    extrait ne finit jamais sur « ( » ni sur une espace.
/// 5. Aucun séparateur utile (CJK sans espace, mot géant, préfixe vidé) ⇒
///    coupe brute aux `cible` premiers graphèmes.
/// 6. Pas d'ellipse : l'interface ajoute « … Lire la suite ». L'extrait reste
///    toujours sous la moitié du texte.
///
/// Le texte passé est le texte SERVI par le Prisme : l'extrait n'est jamais
/// calculé sur une autre langue que celle affichée.
public enum LongMessageExcerpt {
    public static let threshold = 512
    public static let ratio = 0.25

    /// Espace, tabulation, sauts de ligne et espace idéographique. L'espace
    /// insécable n'en est PAS : elle interdit justement la coupe.
    static let wordSeparators: Set<Character> = [" ", "\t", "\n", "\r", "\r\n", "\u{3000}"]

    static let openingPunctuation: Set<Character> = [
        "(", "[", "{", "«", "‹", "“", "‘", "„", "¿", "¡", "「", "『", "（", "【", "《", "〈",
    ]

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
        let target = Int((Double(graphemes.count) * ratio).rounded(.down))
        let boundary = (1...target).last { wordSeparators.contains(graphemes[$0]) }
        let atWord = boundary.map { trimTail(graphemes[0..<$0]) } ?? []
        let kept = atWord.isEmpty ? graphemes[0..<target] : atWord
        return String(kept)
    }

    private static func trimTail(_ graphemes: ArraySlice<Character>) -> ArraySlice<Character> {
        guard let last = graphemes.lastIndex(where: { !isDroppableTail($0) }) else { return [] }
        return graphemes[graphemes.startIndex...last]
    }

    private static func isDroppableTail(_ grapheme: Character) -> Bool {
        wordSeparators.contains(grapheme) || openingPunctuation.contains(grapheme)
    }
}
