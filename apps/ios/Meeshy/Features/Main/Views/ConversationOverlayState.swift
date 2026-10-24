import SwiftUI
import MeeshySDK

// MARK: - L'état des surcouches de la conversation
//
// Extrait de `ConversationView.swift` (budget de taille, #9907) — l'état ne
// change pas de forme, il change de fichier.

struct ConversationOverlayState {
    @Indirect var overlayMessage: Message? = nil
    /// **La pièce que l'appui long vise** (#9907). Posée par l'appui long sur
    /// une TUILE d'un message à plusieurs pièces : l'aperçu montre alors CETTE
    /// pièce seule, avec le défilement vers les autres, et le menu agit sur
    /// elle. `nil` ⇒ l'aperçu du message entier. Le défilement de l'aperçu la
    /// réécrit : la pièce affichée est toujours la cible des actions.
    var overlayPieceId: String? = nil
    /// **Le cadre de la cellule pressée, en coordonnées de fenêtre** (#11208).
    /// Résolu côté UIKit au geste (`MessageListViewController.cellFrameInWindow`)
    /// et gardé ici : l'aperçu s'ouvre À LA PLACE de la cellule, quel que soit
    /// le mode de lecture. `frameTracker` ne suit que la Rivière, son repli.
    /// `nil` hors appui long, ou quand la cellule n'est pas matérialisée.
    var overlaySourceFrame: CGRect? = nil
    var showOverlayMenu = false
    var longPressEnabled = false
    /// **L'état à restituer à la fermeture du menu longpress (#4004).**
    /// `presentLongPressMenu` désactive le clavier/le panneau d'options AVANT
    /// de présenter le menu — sans cette mémoire, ils resteraient fermés une
    /// fois le menu refermé, même si l'auteur était en train de taper.
    /// `nil` tant qu'aucun longpress n'a capturé d'état à restituer.
    var restoreAfterLongPress: (isTyping: Bool, showOptions: Bool)? = nil
    /// **Mode sélection multiple (#4005).** `true` pendant que la liste bascule
    /// en sélection ; chaque bulle devient tappable pour ajouter/retirer de
    /// `selectedMessageIds`, plafonné à `ConversationOverlayState.
    /// selectionCap`. Quitter le mode (bouton Annuler) vide la sélection —
    /// jamais de sélection résiduelle qui réapparaît au prochain appui long.
    var isSelectionModeActive = false
    var selectedMessageIds: Set<String> = []
    /// Maximum de messages ET pièces jointes sélectionnables au total
    /// (retour porteur 2026-08-27, #4005).
    static let selectionCap = 100
    @Indirect var detailSheetMessage: Message? = nil
    /// Message whose call-detail sheet (transcript-aware, `CallSummaryDetailSheet`)
    /// is presented — separate from `detailSheetMessage`, which stays wired to
    /// `MessageMoreSheet` for regular messages.
    @Indirect var callDetailMessage: Message? = nil
    var moreSheetInitialItem: MoreItem? = nil
    /// Message dont le picker d'emoji complet (réaction) est présenté.
    @Indirect var fullReactionPickerMessage: Message? = nil
    var quickReactionMessageId: String? = nil

    /// Bubble cell frame (window coordinates) of the message whose
    /// add-reaction button opened the quick-reaction bar. Anchors the bar's
    /// placement; `nil` falls back to the legacy bottom-pinned position.
    var quickReactionAnchorFrame: CGRect? = nil
    var emojiOnlyMode = false
    var deleteConfirmMessageId: String? = nil
    /// #4024 — confirmation de suppression GROUPÉE (mode sélection multiple),
    /// distincte de `deleteConfirmMessageId` (suppression d'UN message).
    var deleteConfirmSelectionActive = false
    /// Message dont la feuille de partage système (`UIActivityViewController`)
    /// est présentée — action « Partager » du menu « Plus… ».
    @Indirect var shareMessage: Message? = nil
    var showStoryViewer = false
    var storyViewerUserId: String? = nil
    var storyViewerGroupIndex: Int = 0
    var storyViewerSlideIndex: Int = 0
    /// La story EXACTE visée (réponse à une story) : le lecteur la retrouve par
    /// son id. La position seule retombait sur la première story vivante quand
    /// la story citée avait expiré, ou glissait si le plateau avait bougé.
    var storyViewerPostId: String? = nil
    /// `true` quand le viewer est ouvert depuis l'avatar d'un expéditeur
    /// (première non-vue) ; `false` quand une story-reply cible une slide
    /// précise via `storyViewerSlideIndex`.
    var storyViewerStartAtFirstUnviewed = false
    var showReplyThread = false
    var replyThreadParentId: String? = nil
}

// MARK: - Le message tenu, relu dans le fil (#12627)

/// **Ce que les surcouches tiennent se relit dans le fil, jamais dans la copie
/// prise au geste** (#12627). La copie gardait copiable un message supprimé pour
/// tous pendant que le menu restait ouvert, et un envoi `cid_…` accusé n'y offrait
/// ni réponse ni suppression.
///
/// L'identité est STABLE à travers l'accusé : la ligne optimiste (`cid_…`) cède sa
/// place à la ligne servie (`pendingServerIds`), et l'une se retrouve par l'autre.
nonisolated enum OverlayHeldMessage {

    enum Resolution {
        case live(Message)
        case withdrawn

        var liveMessage: Message? {
            guard case .live(let message) = self else { return nil }
            return message
        }
    }

    /// Ce que l'hôte observe : un emplacement ne change qu'au retrait ou à un
    /// changement d'identité, jamais pour une épingle ou une réaction — celles-là
    /// se recomposent au rendu, sans réécrire l'état ni rejouer l'entrée.
    enum Slot: Equatable {
        case empty
        case live(String)
        case withdrawn
    }

    /// Les identités sous lesquelles le fil peut porter le message tenu : l'id
    /// servi d'abord (l'accusé gagne sur la ligne optimiste qu'il remplace).
    static func identities(of held: Message, pendingServerIds: [String: String]) -> [String] {
        let acknowledged = pendingServerIds[held.id]
        let optimistic = pendingServerIds.first { $0.value == held.id }?.key
        return [acknowledged, held.id, held.clientMessageId, optimistic].compactMap { $0 }
    }

    /// Retiré : absent du fil, supprimé DEPUIS le geste, échu ou en combustion.
    /// Un message déjà supprimé au geste garde son menu de pierre tombale
    /// (« Supprimer pour moi ») : il n'a rien perdu depuis.
    static func resolve(
        _ held: Message,
        pendingServerIds: [String: String],
        now: Date,
        lookup: (String) -> Message?
    ) -> Resolution {
        guard let live = identities(of: held, pendingServerIds: pendingServerIds).compactMap(lookup).first else {
            return .withdrawn
        }
        let deletedSinceTheGesture = live.isDeleted && !held.isDeleted
        let expired = live.expiresAt.map { $0 <= now } ?? false
        return deletedSinceTheGesture || expired || live.isBurning ? .withdrawn : .live(live)
    }

    static func slot(of held: Message?, _ resolve: (Message) -> Resolution) -> Slot {
        guard let held else { return .empty }
        return resolve(held).liveMessage.map { Slot.live($0.id) } ?? Slot.withdrawn
    }
}

/// La surcouche après relecture, et si un retrait s'est fait SOUS LES YEUX du
/// lecteur (menu ou feuille ouverts) — VoiceOver le dit alors.
///
/// `changesState` : faux quand tout ce qui est tenu vit encore sous le même id —
/// l'hôte n'écrit alors rien, et l'ouverture du menu ne paie aucun rendu de plus.
struct OverlayHeldReconciliation {
    let state: ConversationOverlayState
    let announcesWithdrawal: Bool
    let changesState: Bool
}

extension ConversationOverlayState {

    /// Les quatre surcouches qui tiennent un message et en exposent le contenu :
    /// le menu, la feuille « Plus… », le partage et le sélecteur de réaction.
    func heldSlots(_ resolve: (Message) -> OverlayHeldMessage.Resolution) -> [OverlayHeldMessage.Slot] {
        [overlayMessage, detailSheetMessage, shareMessage, fullReactionPickerMessage]
            .map { OverlayHeldMessage.slot(of: $0, resolve) }
    }

    /// Referme ce qui tient un message retiré ; réancre le menu sur l'id servi
    /// (la cellule masquée sous l'aperçu se lit à `overlayMessage.id`).
    func reconciled(_ resolve: (Message) -> OverlayHeldMessage.Resolution) -> OverlayHeldReconciliation {
        let menu = overlayMessage.map(resolve)
        let menuWithdrawn = menu.map { $0.liveMessage == nil } ?? false
        let sheetWithdrawn = detailSheetMessage.map { resolve($0).liveMessage == nil } ?? false
        let shareWithdrawn = shareMessage.map { resolve($0).liveMessage == nil } ?? false
        let pickerWithdrawn = fullReactionPickerMessage.map { resolve($0).liveMessage == nil } ?? false

        var next = self
        next.overlayMessage = menuWithdrawn ? nil : (menu?.liveMessage ?? overlayMessage)
        next.showOverlayMenu = showOverlayMenu && !menuWithdrawn
        next.overlayPieceId = menuWithdrawn ? nil : overlayPieceId
        next.detailSheetMessage = sheetWithdrawn ? nil : detailSheetMessage
        next.moreSheetInitialItem = sheetWithdrawn ? nil : moreSheetInitialItem
        next.shareMessage = shareWithdrawn ? nil : shareMessage
        next.fullReactionPickerMessage = pickerWithdrawn ? nil : fullReactionPickerMessage

        let withdrawn = menuWithdrawn || sheetWithdrawn || shareWithdrawn || pickerWithdrawn
        let reanchored = menu?.liveMessage.map { $0.id != overlayMessage?.id } ?? false
        let shown = (menuWithdrawn && showOverlayMenu) || sheetWithdrawn || shareWithdrawn || pickerWithdrawn
        return OverlayHeldReconciliation(state: next, announcesWithdrawal: shown, changesState: withdrawn || reanchored)
    }
}

extension OverlayHeldMessage {

    /// Le message tenu, relu dans le fil du ViewModel par son identité stable.
    @MainActor
    static func resolve(_ held: Message, in viewModel: ConversationViewModel, now: Date = Date()) -> Resolution {
        resolve(held, pendingServerIds: viewModel.pendingServerIds, now: now) { id in
            viewModel.messageIndex(for: id).map { viewModel.messages[$0] }
        }
    }
}
