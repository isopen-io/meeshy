import Foundation
import MeeshySDK

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

// MARK: - Branche vide et queue de liste (#8759)

extension ConversationListView {

    /// `groupedConversations` est calculé HORS du thread principal, après
    /// `conversations` (debounce 16 ms + tâche détachée). Au démarrage, le
    /// cache pose `conversations` alors que le dernier groupement a été fait
    /// sur un corpus VIDE : pendant ce trou, la liste semblait vide, la queue
    /// « Et maintenant ? » montait sous le rail, puis redescendait quand les
    /// sections arrivaient (retour porteur 2026-09-29, mesuré au simulateur :
    /// titre à y = 270 pt pendant deux images, puis poussé hors de l'écran).
    ///
    /// Un groupement vide fait sur un corpus NON vide est, lui, définitif
    /// (tout archivé, filtre sans résultat) : il ne doit jamais être pris pour
    /// une attente.
    nonisolated static func groupingAwaitsCorpus(
        groupedIsEmpty: Bool,
        lastGroupedCorpusCount: Int,
        corpusCount: Int
    ) -> Bool {
        groupedIsEmpty && lastGroupedCorpusCount == 0 && corpusCount > 0
    }

    nonisolated static func emptyBranch(
        loadState: LoadState,
        loadFailed: Bool,
        searchTextIsEmpty: Bool,
        groupingAwaitsCorpus: Bool = false
    ) -> ConversationListEmptyBranch {
        if groupingAwaitsCorpus { return .skeleton }
        switch loadState {
        case .idle, .loading:
            // Cold, cache-less first fetch still in flight: a still-loading
            // state is never a definitive result, so this wins over an
            // active search — never show "no results" while we don't yet
            // know whether the cache is genuinely empty (fix 2026-07-21).
            return .skeleton
        default:
            guard searchTextIsEmpty else { return .searchNoResults }
            return loadFailed ? .syncError : .createFirstConversation
        }
    }

    /// La queue ne se pose que sous un contenu CONNU. Sous un squelette, elle
    /// disait « Aucune conversation » à un compte qui en a, puis les rangées
    /// réelles la repoussaient : elle attend que la liste soit là.
    nonisolated static func showsQuickActionsTail(emptyBranch: ConversationListEmptyBranch?) -> Bool {
        emptyBranch != .skeleton
    }

    /// `nil` ⇒ la liste a des sections à rendre.
    var currentEmptyBranch: ConversationListEmptyBranch? {
        guard conversationViewModel.groupedConversations.isEmpty else { return nil }
        return Self.emptyBranch(
            loadState: conversationViewModel.loadState,
            loadFailed: conversationViewModel.loadFailed,
            searchTextIsEmpty: conversationViewModel.searchText.isEmpty,
            groupingAwaitsCorpus: Self.groupingAwaitsCorpus(
                groupedIsEmpty: true,
                lastGroupedCorpusCount: conversationViewModel.groupedCorpusCount,
                corpusCount: conversationViewModel.conversations.count
            )
        )
    }
}
