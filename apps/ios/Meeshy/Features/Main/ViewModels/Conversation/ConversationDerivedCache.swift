import Foundation
import MeeshySDK

@MainActor
final class ConversationDerivedCache {
    nonisolated deinit {}

    enum IndexCache: Equatable {
        case uncomputed
        case resolved(Int?)
    }

    var messageIdIndex: [String: Int]?
    var lastReceivedIndex: IndexCache = .uncomputed
    var lastSentIndex: IndexCache = .uncomputed
    var mediaSenderInfoMap: [String: ConversationViewModel.MediaSenderInfo]?
    var allVisualAttachments: [MessageAttachment]?
    var allAudioItems: [ConversationViewModel.AudioItem]? { didSet { audioItemsByMessageId = nil } }
    var audioItemsByMessageId: [String: [ConversationViewModel.AudioItem]]?
    var mediaCaptionMap: [String: String]?
    var mentionDisplayNames: [String: String]?
    var mentionCandidates: [MentionCandidate]?
    var topActiveMembers: [ConversationActiveMember]?

    /// Un changement de `messages` n'invalide que ce qu'il peut avoir changé : la STRUCTURE (nombre,
    /// premier, dernier) gouverne les mentions et les membres actifs ; les médias, keyés par pièce, se
    /// vident aussi quand une confirmation d'envoi remplace les pièces locales sans toucher à la structure (#10690).
    func invalidate(previous: [Message]?, current: [Message]) {
        let structureChanged = previous.map { Self.structureDiffers($0, current) } ?? true
        let mediaChanged = structureChanged || !Self.sameAttachmentIdentities(current, previous ?? [])

        messageIdIndex = nil
        lastReceivedIndex = .uncomputed
        lastSentIndex = .uncomputed
        if structureChanged {
            topActiveMembers = nil
            mentionDisplayNames = nil
            mentionCandidates = nil
        }
        if mediaChanged {
            mediaSenderInfoMap = nil
            allVisualAttachments = nil
            mediaCaptionMap = nil
            allAudioItems = nil
        }
    }

    func invalidateTranslationDerived() {
        mediaCaptionMap = nil
    }

    func invalidateAudioDerived() {
        allAudioItems = nil
    }

    /// Une réaction ne change ni le nombre, ni le premier, ni le dernier message : la projection plein
    /// écran, gouvernée par la structure, resservirait des pièces d'AVANT la réaction (#6789).
    func invalidateVisualAttachments() {
        allVisualAttachments = nil
    }

    nonisolated static func sameAttachmentIdentities(_ lhs: [Message], _ rhs: [Message]) -> Bool {
        guard lhs.count == rhs.count else { return false }
        return zip(lhs, rhs).allSatisfy { new, old in
            new.attachments.count == old.attachments.count
                && zip(new.attachments, old.attachments).allSatisfy { $0.id == $1.id && $0.fileUrl == $1.fileUrl }
        }
    }

    private nonisolated static func structureDiffers(_ previous: [Message], _ current: [Message]) -> Bool {
        current.count != previous.count
            || current.first?.id != previous.first?.id
            || current.last?.id != previous.last?.id
    }
}
