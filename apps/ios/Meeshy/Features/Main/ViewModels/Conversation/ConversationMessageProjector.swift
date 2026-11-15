import Foundation
import MeeshySDK

/// Les projections PURES d'une fenêtre de messages : médias, vocaux, légendes
/// et candidats de mention. Aucune ne lit l'état du modèle — celui-ci fournit
/// la fenêtre et mémoïse le résultat dans son ardoise.
enum ConversationMessageProjector {

    /// #7618 — une vue unique n'entre pas dans le défilement du plein écran :
    /// on ne l'atteint pas en balayant depuis une autre photo. Elle s'ouvre
    /// seule, par sa puce (`ConversationMediaGalleryLayer`). Un STICKER n'y entre
    /// pas non plus : son image jointe n'est pas une photo (#10630).
    static func visualAttachments(of messages: [Message]) -> [MessageAttachment] {
        messages.filter { !$0.holdsViewOnce && !ReceivedSticker.isGalleryExcluded($0) }.flatMap { msg in
            msg.attachments.filter { [.image, .video].contains($0.type) }
        }
    }

    static func audioItems(
        of messages: [Message],
        transcription: (MessageAttachment, String) -> MessageTranscription?,
        translatedByAttachment: [String: [MessageTranslatedAudio]],
        translatedByMessage: [String: [MessageTranslatedAudio]]
    ) -> [ConversationAudioItem] {
        messages.filter { !$0.holdsViewOnce }.flatMap { msg in
            msg.attachments
                .filter { $0.type == .audio }
                .map { att in
                    ConversationAudioItem(
                        id: att.id,
                        attachment: att,
                        message: msg,
                        // #10801 — la transcription de CETTE piste : celle du
                        // message n'appartient qu'à la pièce qu'elle nomme.
                        transcription: transcription(att, msg.id),
                        translatedAudios: translatedByAttachment[att.id]
                            ?? (translatedByMessage[msg.id] ?? []).filter { $0.attachmentId == att.id }
                    )
                }
        }
    }

    static func mentionCandidates(of messages: [Message]) -> [MentionCandidate] {
        var seen = Set<String>()
        var candidates: [MentionCandidate] = []
        for msg in messages {
            guard let username = msg.senderUsername, !seen.contains(username) else { continue }
            seen.insert(username)
            candidates.append(MentionCandidate(
                id: msg.viewingKey.isEmpty ? username : msg.viewingKey,
                username: username,
                displayName: msg.senderName ?? username,
                avatarURL: msg.senderAvatarURL,
                ring: msg.senderRing
            ))
        }
        return candidates
    }

    /// La fiche d'auteur vient de `ConversationMediaRules.senderInfo(of:)` —
    /// la même règle que l'index des médias (#8095) applique aux porteurs que
    /// la fenêtre n'a pas chargés.
    static func mediaSenderInfo(of messages: [Message]) -> [String: ConversationMediaSenderInfo] {
        var map = [String: ConversationMediaSenderInfo](minimumCapacity: messages.count)
        for msg in messages {
            let info = ConversationMediaRules.senderInfo(of: msg)
            for att in msg.attachments {
                map[att.id] = info
            }
        }
        return map
    }

    /// La règle de légende est `ConversationMediaRules.captions(of:servedText:)`
    /// (#8095), partagée avec l'index des médias ; le texte servi est celui du
    /// Prisme de la fenêtre, bascules manuelles comprises.
    static func captions(of messages: [Message], servedText: (Message) -> String) -> [String: String] {
        messages.reduce(into: [String: String]()) { map, msg in
            let captions = ConversationMediaRules.captions(of: msg, servedText: servedText(msg))
            map.merge(captions) { _, latest in latest }
        }
    }
}
