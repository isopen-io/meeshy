import SwiftUI
import MeeshySDK

// MARK: - L'état de défilement et de présentation média de la conversation
//
// Extrait de `ConversationView.swift` (cohésion) : l'état ne change pas de
// forme, il change de fichier. État de VUE — il décrit ce qui est à l'écran.

struct ConversationScrollState {
    var isNearBottom: Bool = true
    var unreadBadgeCount: Int = 0
    /// True while the message list is actively being dragged/decelerated.
    /// Efface les BOUTONS D'ACTION du header (appel, recherche) le temps du
    /// mouvement — loi commune `ScrollMotion`. Le header lui-même reste
    /// lisible, et la pill de jour garde sa bande à part
    /// (`MessageDayStickyPlacement.topOffset`).
    var isScrollingActiveList: Bool = false
    var scrollToBottomTrigger: Int = 0
    /// Incrémenté quand le lecteur déclare regarder le bas — ouverture, bouton
    /// « dernier message », départ en arrière-plan. Le pont `MessageListView`
    /// compare l'ancien et le nouveau pour vider l'accumulateur de lecture sans
    /// attendre le seuil de présence.
    var flushSeenTrigger: Int = 0
    var scrollToMessageId: String? = nil
    /// Counter incremented each time a scroll-to-message is requested via the
    /// server-loaded path (jumpToQuotedMessage). The MessageListView bridge
    /// compares old vs. new to fire the VC's scrollToMessage.
    var scrollToMessageTrigger: Int = 0
    var swipedMessageId: String? = nil
    var swipeOffset: CGFloat = 0
    var galleryStartAttachment: MessageAttachment? = nil
    /// Les vues uniques OUVERTES dont la consommation attend la fermeture du
    /// plein écran (#7499). État de VUE — il décrit ce qui est à l'écran, pas
    /// une donnée du fil — donc il vit ici et non dans le ViewModel.
    var pendingViewOnceConsumption = ViewOnceConsumption.Pending()
    var imageToPreview: UIImage? = nil
    var videoToPreview: URL? = nil

    // Media editor queues
    var photosToEdit: [UIImage] = []
    var videosToPreview: [URL] = []
    /// « Éditer » sur une pièce en attente : toutes les pièces en scènes (#9126).
    var retouchSeries: ConversationRetouchSeries? = nil
    var audioToEdit: PendingAudioEdit? = nil
    // "Éditer" from the recent-media strip — edited BEFORE staging (the edited
    // output goes through the camera-capture pipeline, never the original).
    var recentImageToEdit: UIImage? = nil
    var recentVideoToEdit: URL? = nil
}
