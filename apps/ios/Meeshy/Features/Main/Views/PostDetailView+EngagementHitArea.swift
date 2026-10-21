import SwiftUI
import MeeshyUI

/// **Une cible tactile se pense autour d'un GLYPHE, jamais autour de sa
/// police** (#4086, mesuré le 2026-09-02).
///
/// Relevé sur la rangée d'actions du détail :
///
/// ```
/// 32 × 17   Je n'aime plus
/// 22 × 19   Commentaires
/// 25 × 17   Republier
/// 17 × 20   Ajouter aux favoris
/// ```
///
/// Soit environ le TIERS du minimum d'Apple (44 pt) dans chaque dimension.
/// `EngagementGlyph` ne pose que `.font(MeeshyFont.relative(size))` — aucun
/// cadre, aucune forme de contact — donc le bouton fait exactement la taille de
/// ses caractères. Personne n'a « choisi » 17 pt : c'est la hauteur du glyphe.
///
/// > La règle des 44 pt s'applique là où elle est CONVOQUÉE — autour d'une
/// > icône qu'on encadre. Un label qui se dimensionne tout seul, glyphe ou mot,
/// > ne la convoque jamais : elle n'est pas violée, elle est absente.
///
/// L'agrandissement ne déplace RIEN : le retrait qui étend la zone est annulé
/// par un retrait négatif de même valeur. Même patron que
/// `captionAffordanceHitArea` (`MediaCaptionOverlay`), même raison.
extension View {
    func engagementHitArea() -> some View {
        // 14 et non 13 : le plus PETIT glyphe de la rangée fait 17 pt
        // (`EngagementGlyph(size: 17)` par défaut), et 17 + 2 × 13 = 43 — un
        // point sous le minimum. Mesuré à l'écran, pas calculé : deux des cinq
        // cibles sortaient à 43 après le premier réglage.
        self.padding(.vertical, MeeshySpacing.mdPlus)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .contentShape(Rectangle())
            .padding(.vertical, -14)
            .padding(.horizontal, -14)
    }
}
