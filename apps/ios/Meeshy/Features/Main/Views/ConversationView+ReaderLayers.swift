import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les deux lecteurs alternatifs de la conversation : la Rivière et le Résumé
//
// Extraits de `ConversationView.swift` (cohésion). Ce sont deux HÔTES dédiés,
// additifs au fil : ils ne rendent jamais bulle par bulle
// (`MessageListViewController.rendersThread`), donc ne font jamais avancer le
// curseur de lecture par le chemin habituel, et ils rendent la main au fil
// (Script) par les mêmes retours — d'où `showScript`. L'hôte garde le choix du
// mode, la pile (`zIndex`, transition) et l'identité du Résumé ; chaque couche
// ne porte que le câblage de SON lecteur.

/// Chantier Rivière iOS, lot 1 (2026-08-21) — le mode `.river` route vers un
/// HÔTE DÉDIÉ : la géométrie vient de la loi partagée (`RiverLaneResolver`), le
/// texte du Prisme (traduction préférée ou original), et un avis système n'est
/// la voix de personne (`RiverConversationMapping`).
struct ConversationRiverLayer: View {
    let viewModel: ConversationViewModel
    let conversationId: String?
    let topInset: CGFloat
    let bottomInset: CGFloat
    @Binding var scrollState: ConversationScrollState
    @Binding var overlayState: ConversationOverlayState
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var router: Router
    let showScript: () -> Void
    /// #11224 — LE point d'entrée du menu d'un message (`presentLongPressMenu`).
    let presentMenu: (Message) -> Void
    let openViewOnce: (String) -> Bool
    let openMedia: (MessageAttachment) -> Void

    var body: some View {
        // `Color.clear.overlay { … }` plutôt que l'hôte nu : la Rivière
        // est LARGE par nature (jusqu'à sept couloirs de 300 pt) et un
        // `ScrollView` rend la taille IDÉALE de son contenu quand on ne
        // lui propose rien — ce ZStack s'élargissait alors à ~2100 pt et
        // CENTRAIT tous ses autres enfants dessus, en-tête compris
        // (mesuré au simulateur : bouton « Retour » à x = −683, hors
        // écran, malgré son `zIndex(100)`). Un `overlay` reçoit la
        // taille de son hôte et ne la fait JAMAIS grandir : le
        // débordement s'arrête ici.
        Color.clear.overlay(RiverConversationHost(
            messages: viewModel.messages,
            viewerId: viewModel.currentUserIdForView,
            // Îlot dynamique + bande de boutons de l'en-tête flottant
            // (`floatingHeaderSection`, zIndex 100) : la Rivière PINGLE
            // sa bande de couloirs en haut de son pane, elle doit donc
            // commencer SOUS l'en-tête — contrairement au fil, dont les
            // bulles ont le droit de défiler dessous.
            topInset: topInset,
            // R-7 : la même réserve basse que le fil — le composeur
            // n'est jamais une zone où une bulle reste prise.
            bottomInset: bottomInset,
            // L2b/2b-7 : la frappe atteint le lecteur quel que soit
            // son mode — le pane Rivière est OPAQUE et couvrait la
            // cellule de frappe du Fil. Même source que le Fil
            // (`typingParticipants`, avec leur visage), même vue (`TypingIndicatorBubble`).
            //
            // ⚠️ Cette lecture n'est PAS vivante (#5961, suivi #5962).
            // Elle s'appuyait sur `typingObserver`, dont on a mesuré
            // qu'il observait le store d'un ViewModel jeté : le corps ne
            // repasse pas sur `typing:start`/`stop`, donc la Rivière
            // affiche le roster figé de son dernier rendu. Le correctif
            // est le même que pour la pastille de retour en bas —
            // `ConversationTypingRosterHost` — mais il se pose ici DANS
            // un `AnyView` imbriqué d'un corps déjà lourd, et se livre
            // à part pour ne pas mêler un risque de profondeur de type
            // à un correctif mesuré.
            typingParticipants: viewModel.typingParticipants,
            // R-5 : identité vivante — les MÊMES sources que le Fil
            // (`MessageListViewController` : présence par expéditeur,
            // anneau de story sauf pour soi, fiche par le routeur).
            presence: { message in PresenceManager.shared.presenceState(forSenderOf: message) },
            here: { message in PresenceManager.shared.here(userId: message.viewingKey, conversationId: conversationId ?? "") },
            storyRing: { message in
                message.isMe ? .none : storyViewModel.storyRingState(forUserId: message.viewingKey)
            },
            onOpenProfile: { user in
                router.openProfile(user, inConversation: conversationId)
            },
            onViewStory: { userId in
                overlayState.storyViewerUserId = userId
                overlayState.storyViewerSlideIndex = 0; overlayState.storyViewerPostId = nil
                overlayState.storyViewerStartAtFirstUnviewed = true
                overlayState.showStoryViewer = true
            },
            // Lot 3 : même retour au Fil que le Résumé — Script, puis atterrissage.
            onOpenInThread: { messageId in
                showScript()
                scrollState.scrollToMessageId = messageId
                scrollState.scrollToMessageTrigger += 1
            },
            // #11224 — l'appui long ouvre LE menu du message, avec les gardes
            // de la liste : la loi d'actions, l'aperçu dans le mode du fil.
            onLongPress: { messageId in
                guard overlayState.longPressEnabled, overlayState.quickReactionMessageId == nil,
                      let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                presentMenu(msg)
            },
            // #7618 — MÊME canal que le Fil : la puce OUVRE, la
            // sortie consomme. La Rivière consommait au toucher.
            onConsumeViewOnce: { messageId, completion in
                completion(openViewOnce(messageId))
            },
            onMediaTap: openMedia,
            onPlayQuotedAudio: { viewModel.toggleQuotedAudio($0) },
            // #3901 — la Rivière ne rend jamais bulle par bulle
            // (`MessageListViewController.rendersThread`), donc ne
            // peut jamais faire avancer le curseur de lecture par le
            // chemin habituel (`seenIds`). Le curseur avance ici,
            // SANS jamais geler de `readAt` individuel, quand le
            // lecteur atteint le présent.
            onReachPresent: {
                viewModel.markCaughtUpFromSummaryOrRiver()
            },
            // #11233 — le texte que la bulle du Fil AFFICHE (drapeau compris) :
            // « Copier », ouvert depuis la Rivière, copie ce qu'elle montre.
            text: { message in MessageExitTransport.displayedText(message, in: viewModel) }
        ))
    }
}

/// WS-9 (F-088) — le mode `.summary` route vers un HÔTE DÉDIÉ (contrat §WS-9 :
/// « le mode résumé a peut-être besoin d'un hôte dédié »). `LivingSummaryHost`
/// construit son propre `@StateObject` — ce site d'appel ne passe que des
/// primitives, zéro `@State` neuf ici.
struct ConversationSummaryLayer: View {
    let viewModel: ConversationViewModel
    let isDark: Bool
    let isAnonymous: Bool
    @Binding var scrollState: ConversationScrollState
    let showScript: () -> Void
    let reply: (Message) -> Void

    var body: some View {
        LivingSummaryHost(
            messages: viewModel.messages,
            viewerId: viewModel.currentUserIdForView,
            viewerUsername: AuthManager.shared.currentUser?.username,
            windowCoversUnread: !viewModel.hasOlderMessages,
            analysisProvider: isAnonymous ? nil : ConversationAnalysisService.shared,
            conversationId: viewModel.conversationId,
            isDark: isDark,
            // #7452 — les messages protégés encore vivants, recomposés
            // à chaque passe de ce corps (ils dérivent de
            // `viewModel.messages`). Le digest, lui, ne se recompose
            // jamais : c'est pourquoi il ne contient PLUS leur texte.
            protections: LivingSummaryProtections.entries(messages: viewModel.messages),
            onReplyToPerson: { entry in
                showScript()
                guard let targetId = entry.evidenceMessageIds.first,
                      let msg = viewModel.messages.first(where: { $0.id == targetId }) else { return }
                reply(msg)
                scrollState.scrollToMessageId = targetId
                scrollState.scrollToMessageTrigger += 1
            },
            onOpenEpisode: { episode in
                showScript()
                guard let targetId = episode.messageIds.first else { return }
                scrollState.scrollToMessageId = targetId
                scrollState.scrollToMessageTrigger += 1
            },
            onResumeThread: {
                showScript()
                // La VRAIE frontière (#7222), pas « le premier message
                // d'autrui » : `firstUnreadMessageId` est posé par
                // `FirstUnreadBoundary.resolve` sur le curseur de
                // lecture, pas sur l'auteur.
                if let firstUnread = viewModel.firstUnreadMessageId {
                    scrollState.scrollToMessageId = firstUnread
                    scrollState.scrollToMessageTrigger += 1
                }
            }
        )
    }
}
