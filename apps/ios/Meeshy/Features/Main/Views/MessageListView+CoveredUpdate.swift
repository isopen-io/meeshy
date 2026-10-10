// apps/ios/Meeshy/Features/Main/Views/MessageListView+CoveredUpdate.swift

import SwiftUI

/// **Sous la Rivière et le Résumé, SwiftUI ne remet plus à jour la liste (#3947).**
///
/// La veille arrête déjà le RENDU (`isHidden`), l'HORLOGE du suivi de lecture
/// et le PUITS du data source (`applyToDataSource`). Restait la mise à jour du
/// représentable : `ConversationView` le reconstruit à chaque passe de son
/// `body` avec une quarantaine de closures neuves, donc SwiftUI rappelait
/// `updateUIViewController` à CHAQUE passe — affectations, encarts, thème —
/// pour une liste que le pane opaque recouvre.
///
/// **On ne démonte pas** : la `UICollectionView` porte la position de lecture,
/// que le milestone promet de rendre intacte au retour. On ne fait que dire à
/// SwiftUI, par `.equatable()` au site d'appel, que deux passes successives
/// SOUS le pane sont la même liste tant que seules des closures ont changé.
///
/// Ce qui passe toujours :
///   • l'ENTRÉE sous le pane et le RÉVEIL — le mode change, c'est lui qui pose
///     la veille puis réapplique `.allItems` ;
///   • tout ORDRE (`flushSeenTrigger` au passage en arrière-plan, défilement,
///     saut, recherche de citation) — il atteint le contrôleur sans attendre ;
///   • toute VALEUR (encarts, couleur, sélection) — elle se pose quand elle
///     change, jamais d'un bloc au réveil sous les yeux du lecteur.
///
/// Les closures restent celles de la dernière mise à jour ; elles ne lisent
/// que des boîtes d'état partagées (`@State`, `@StateObject`), et le réveil les
/// remplace toutes.
extension MessageListView: Equatable {

    struct CoveredInputs: Equatable {
        let readingMode: ConversationReadingMode
        let store: ObjectIdentifier
        let conversationViewModel: ObjectIdentifier
        let currentUserId: String
        let accentColor: String
        let isDirect: Bool
        let bottomInset: CGFloat
        let bottomInsetTransition: ListInsetTransition?
        let topInset: CGFloat
        let headerBandHeight: CGFloat
        let scrollToBottomTrigger: Int
        let scrollToMessageId: String?
        let scrollToMessageTrigger: Int
        let flushSeenTrigger: Int
        let isSearchingQuotedMessage: Bool
        let isHeaderExpanded: Bool
        let overlaidMessageId: String?
        let isSelectionModeActive: Bool
        let selectedMessageIds: Set<String>
    }

    var coveredInputs: CoveredInputs {
        CoveredInputs(
            readingMode: readingMode,
            store: ObjectIdentifier(store),
            conversationViewModel: ObjectIdentifier(conversationViewModel),
            currentUserId: currentUserId,
            accentColor: accentColor,
            isDirect: isDirect,
            bottomInset: bottomInset,
            bottomInsetTransition: bottomInsetTransition,
            topInset: topInset,
            headerBandHeight: headerBandHeight,
            scrollToBottomTrigger: scrollToBottomTrigger,
            scrollToMessageId: scrollToMessageId,
            scrollToMessageTrigger: scrollToMessageTrigger,
            flushSeenTrigger: flushSeenTrigger,
            isSearchingQuotedMessage: isSearchingQuotedMessage,
            isHeaderExpanded: isHeaderExpanded,
            overlaidMessageId: overlaidMessageId,
            isSelectionModeActive: isSelectionModeActive,
            selectedMessageIds: selectedMessageIds
        )
    }

    static func skipsUpdate(from old: CoveredInputs, to new: CoveredInputs) -> Bool {
        guard !MessageListViewController.rendersThread(old.readingMode),
              !MessageListViewController.rendersThread(new.readingMode) else { return false }
        return old == new
    }

    static func == (lhs: MessageListView, rhs: MessageListView) -> Bool {
        skipsUpdate(from: lhs.coveredInputs, to: rhs.coveredInputs)
    }
}
