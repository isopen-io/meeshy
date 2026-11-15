import Foundation
import MeeshySDK

// MARK: - La zone LECTURE d'une citation audio (#8320)

/// Directive porteur du 2026-09-27 : dans une réponse, toucher la zone
/// lecture de la citation d'un audio JOUE l'audio cité sur place ; un second
/// toucher le met en pause. Le reste de la citation ramène au message
/// (`MessageListViewController.scrollToMessage`, inchangé).
///
/// AUCUN SECOND LECTEUR : la lecture passe par le coordinateur PARTAGÉ
/// (`ConversationAudioCoordinator`) — lire une citation arrête l'audio en
/// cours, comme partout. La file ne porte que la pièce citée : une citation
/// n'enchaîne pas sur les vocaux qui suivent l'original.
///
/// LA PISTE suit le Prisme audio du vocal d'origine :
/// - message cité EN MÉMOIRE → `effectiveAudioTrackUrl`, la loi du widget
///   (bascule manuelle du drapeau, puis Prisme) ;
/// - HORS de la fenêtre → les pistes que la citation porte
///   (`ReplyReference.quotedAudioTracks`), départagées par
///   `AudioTrackLanguageResolver` sur le même prisme.
///
/// Un audio PROTÉGÉ (vue unique, flouté, chiffré), supprimé ou expiré ne
/// joue jamais : la citation le déclare (`offersQuotedAudioPlayback`) ET le
/// message réel relu en mémoire le confirme.
extension ConversationViewModel {

    /// La pièce citée prête à jouer, ou `nil` quand rien d'honnête ne l'est.
    func quotedAudioItem(for reference: ReplyReference, now: Date = Date()) -> QueuedAudio? {
        guard reference.offersQuotedAudioPlayback(now: now) else { return nil }
        if let quoted = messages.first(where: { $0.id == reference.messageId }) {
            return QuotedAudioResolver.inWindow(reference, quoted: quoted, now: now) {
                self.effectiveAudioTrackUrl(for: $0, message: $1)
            }
        }
        return QuotedAudioResolver.outOfWindow(
            reference, conversationId: conversationId,
            readerLanguages: ConversationLanguagePreferences(user: authManager.currentUser).resolved
        )
    }

    /// Joue la citation, ou met en pause / reprend si c'est déjà elle qui joue.
    /// Rend `false` quand rien ne peut être joué — l'hôte retombe alors sur le
    /// saut au message d'origine.
    @discardableResult
    func toggleQuotedAudio(_ reference: ReplyReference, now: Date = Date()) -> Bool {
        guard let item = quotedAudioItem(for: reference, now: now) else { return false }
        if audioCoordinator.activeContext?.attachmentId == item.attachmentId {
            audioCoordinator.togglePlayPause()
            return true
        }
        audioCoordinator.play(
            current: item,
            tail: [],
            conversationName: currentConversationName,
            conversationArtworkURL: currentConversationArtworkURL
        )
        return true
    }
}
