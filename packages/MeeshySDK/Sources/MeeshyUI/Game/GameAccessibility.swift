import SwiftUI

// MARK: - Décoratif masqué, libellé porté par l'hôte (#9380)
//
// Une brique du jeu DESSINE ; elle ne sait pas ce qu'elle veut dire dans
// l'écran qui la pose (« niveau 34 », « rang Voix II », « 9 Meeshes »). Sans
// libellé, elle est décorative et VoiceOver la saute — un écu muet lu comme
// « image » vaudrait pire que le silence. L'hôte, qui connaît la phrase
// localisée, la passe : la brique devient alors UN élément, ses dessins
// internes restant ignorés.

struct GameAccessibilityModifier: ViewModifier {
    let label: String?

    func body(content: Content) -> some View {
        if let label {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isImage)
        } else {
            content.accessibilityHidden(true)
        }
    }
}

extension View {
    /// `nil` ⇒ décoratif (masqué) ; sinon un élément unique portant `label`.
    func gameAccessibility(label: String?) -> some View {
        modifier(GameAccessibilityModifier(label: label))
    }
}

// MARK: - Dynamic Type pour les chiffres des objets

/// Le facteur à appliquer aux chiffres posés DANS un objet dessiné (le numéro
/// d'une Meesh, le niveau d'un anneau, le seuil d'un badge). Un objet de taille
/// fixe ne grandit pas avec le texte, mais son chiffre doit rester lisible : le
/// facteur suit la catégorie de taille, borné pour que le chiffre ne sorte pas
/// de la pièce qui le porte.
struct GameTypeScale {
    /// Valeur `@ScaledMetric` brute (1 en taille par défaut).
    let raw: CGFloat

    static let maximum: CGFloat = 1.3

    var factor: CGFloat { min(max(raw, 1), Self.maximum) }
}
