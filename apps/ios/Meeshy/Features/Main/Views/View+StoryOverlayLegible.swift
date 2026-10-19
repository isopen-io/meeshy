import SwiftUI

extension View {
    /// Halo pour le texte/les icônes qui flottent directement au-dessus d'une
    /// story (aucune box, aucun scrim — spec user 2026-05-28). Réplique le
    /// traitement approuvé de la sidebar (`StoryActionButton`, 2026-06-03) : une
    /// ombre serrée pour des glyphes nets + une ombre plus diffuse pour détacher
    /// le contenu d'un fond clair ou chargé. `strong` pour les longs paragraphes.
    ///
    /// `isLightText` choisit le SENS du halo : un halo NOIR détache un texte
    /// clair (blanc) d'un fond CLAIR — comportement historique, toujours le
    /// défaut. Un texte SOMBRE (`StoryCommentRowView.legibleOverlayColor` sur
    /// fond de story clair) a besoin de l'inverse : un halo BLANC pour se
    /// détacher d'un fond sombre/chargé, sinon le halo se fond dans le texte
    /// lui-même et redevient invisible (bug user 2026-08-11).
    func storyOverlayLegible(strong: Bool = false, isLightText: Bool = true) -> some View {
        let haloColor: Color = isLightText ? .black : .white
        return self
            .shadow(color: haloColor.opacity(strong ? 0.7 : 0.55), radius: strong ? 3 : 2, y: 1)
            .shadow(color: haloColor.opacity(strong ? 0.45 : 0.3), radius: strong ? 8 : 6)
    }
}
