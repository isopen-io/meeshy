import Foundation

/// Les règles PURES du pliage et de la cible de drop des sections de la
/// liste — extraites de `ConversationListView.swift` (hors budget) pour que
/// #8694 puisse y ajouter le compte de non-lus d'une section repliée sans
/// grossir l'hôte.
extension ConversationListView {

    /// Une section repliable est une section dont le pliage a un SENS
    /// PERSISTANT : `pinned` et les catégories utilisateur, dont
    /// `toggleSection` persiste l'état (`persistCategoryExpansion`, E4). Les
    /// sections calculées par la loi Lentille (`EN DIRECT`, `AUJOURD'HUI`…) ne
    /// sont persistées nulle part : repliées, elles se rouvriraient au
    /// prochain chargement. Elles restent donc dépliées et leur sticker n'est
    /// pas un bouton. Drapeau OFF : aucun id `lentille.` n'existe ⇒ toujours
    /// `true`, exactement comme aujourd'hui.
    nonisolated static func isSectionCollapsible(sectionId: String) -> Bool {
        !LentilleSectionIdentity.isLentilleOnly(sectionId: sectionId)
    }

    /// Cible de drop légitime. Même partition que `isSectionCollapsible` — une
    /// section calculée n'est ni pliable ni assignable — mais les deux règles
    /// restent distinctes : elles répondent à deux questions (« puis-je la
    /// replier ? », « puis-je y déposer ? ») qui pourraient diverger demain.
    nonisolated static func acceptsSectionDrop(sectionId: String) -> Bool {
        !LentilleSectionIdentity.isLentilleOnly(sectionId: sectionId)
    }

    /// Rangs visibles ? Réécriture PURE et testable de la condition
    /// d'aujourd'hui (`isSingleUngroupedSection || expandedSections.contains`),
    /// étendue du seul cas neuf : une section non repliable est toujours
    /// dépliée. Sous drapeau OFF la troisième clause est inatteignable — la
    /// condition dégénère au bit près en celle d'avant LWS-6.
    nonisolated static func isSectionContentVisible(
        sectionId: String,
        expandedSections: Set<String>,
        isSingleUngroupedSection: Bool
    ) -> Bool {
        if isSingleUngroupedSection { return true }
        if !isSectionCollapsible(sectionId: sectionId) { return true }
        return expandedSections.contains(sectionId)
    }
}
