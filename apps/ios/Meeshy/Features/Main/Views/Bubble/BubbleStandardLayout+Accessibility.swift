// MARK: - BubbleStandardLayout — libellé VoiceOver de la bulle
//
// Extrait de `BubbleStandardLayout.swift`, hors budget de taille : le lot
// #8892 ajoute « est dans la conversation » à l'avatar de l'auteur, on
// extrait d'abord le libellé combiné, on ajoute ensuite.

import SwiftUI
import MeeshySDK
import MeeshyUI

extension BubbleStandardLayout {

    var messageAccessibilityLabel: String {
        var parts: [String] = []
        if !content.isMe, let senderName = content.senderName {
            parts.append(senderName)
        } else if !content.isMe {
            parts.append(String(localized: "a11y.message.unknown_sender", bundle: .main))
        }
        if let replyLabel = replyAccessibilityLabel {
            parts.append(replyLabel)
        }
        if let raw = content.text?.raw, !raw.isEmpty, !content.isBlurred {
            parts.append(raw)
        }
        if !visualAttachments.isEmpty {
            let imageCount = visualAttachments.filter { $0.type == .image }.count
            let videoCount = visualAttachments.filter { $0.type == .video }.count
            if imageCount > 0 {
                parts.append(String(format: String(localized: "a11y.message.images", bundle: .main), imageCount))
            }
            if videoCount > 0 {
                parts.append(String(format: String(localized: "a11y.message.videos", bundle: .main), videoCount))
            }
        }
        if !audioAttachments.isEmpty {
            parts.append(String(format: String(localized: "a11y.message.audios", bundle: .main), audioAttachments.count))
        }
        parts.append(contentsOf: Self.nonMediaAccessibilityParts(
            hasSharedPlace: content.location != nil,
            nonMedia: nonMediaAttachments
        ))
        parts.append(content.meta.timeString)
        if content.isMe {
            parts.append(MessageAccessibilityLabelComposer.deliveryStatusAccessibilityLabel(content.meta.deliveryStatus))
        }
        if content.editedAt != nil {
            parts.append(String(localized: "a11y.message.edited", bundle: .main))
        }
        if content.isPinned {
            parts.append(String(localized: "a11y.message.pinned", bundle: .main))
        }
        parts.append(contentsOf: MessageProtectionChrome.accessibilityLabels(for: content.protection))
        let summaries = content.reactions
        if !summaries.isEmpty {
            let reactionText = summaries.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append(String(format: String(localized: "a11y.message.reactions", bundle: .main), reactionText))
        }
        return parts.joined(separator: ", ")
    }
}
