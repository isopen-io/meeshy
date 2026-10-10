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
    /// Aperçu d'appui long en Focal : pixels de la cellule vivante + frame
    /// écran, capturés par le contrôleur au moment du geste. `nil` en mode
    /// bulles — l'overlay garde alors son `ThemedMessageBubble` historique.
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
    /// `true` quand le viewer est ouvert depuis l'avatar d'un expéditeur
    /// (première non-vue) ; `false` quand une story-reply cible une slide
    /// précise via `storyViewerSlideIndex`.
    var storyViewerStartAtFirstUnviewed = false
    var showReplyThread = false
    var replyThreadParentId: String? = nil
}
