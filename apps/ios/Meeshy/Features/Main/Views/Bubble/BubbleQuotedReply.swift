import SwiftUI
import MeeshySDK
import MeeshyUI

/// Reply preview affichee a l'interieur d'une bulle (citation du message
/// auquel on repond). Delegue a `BubbleStoryReplyPreview` quand la cible
/// est une story.
///
/// Was: ThemedMessageBubble.quotedReplyView (lines 961-1031) +
/// storyReplyPreview (lines 1034-1086) + replyAttachmentIcon (lines 1088-1097).
///
/// `ReplyReference` n'est ni Equatable ni Hashable cote SDK
/// (Codable & Sendable seulement), donc on projette les champs
/// rendus dans `ReplySlice` pour comparer manuellement.
struct BubbleQuotedReply: View, Equatable {
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.parentIsMe == rhs.parentIsMe &&
        lhs.accentHex == rhs.accentHex &&
        lhs.isDark == rhs.isDark &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        Self.replySlice(lhs.reply) == Self.replySlice(rhs.reply)
    }

    /// Champs effectivement lus par le body. Tout changement dans le rendu
    /// doit synchroniser cette projection.
    private static func replySlice(_ reply: ReplyReference) -> ReplySlice {
        ReplySlice(
            messageId: reply.messageId,
            authorName: reply.authorName,
            authorColor: reply.authorColor,
            previewText: reply.previewText,
            isMe: reply.isMe,
            attachmentType: reply.attachmentType,
            attachmentThumbnailUrl: reply.attachmentThumbnailUrl,
            isStoryReply: reply.isStoryReply,
            storyPublishedAt: reply.storyPublishedAt,
            storyReactionCount: reply.storyReactionCount,
            storyCommentCount: reply.storyCommentCount,
            storyThumbnailUrl: reply.storyThumbnailUrl
        )
    }

    fileprivate struct ReplySlice: Equatable {
        let messageId: String
        let authorName: String
        let authorColor: String
        let previewText: String
        let isMe: Bool
        let attachmentType: String?
        let attachmentThumbnailUrl: String?
        let isStoryReply: Bool
        let storyPublishedAt: Date?
        let storyReactionCount: Int?
        let storyCommentCount: Int?
        let storyThumbnailUrl: String?
    }

    private var theme: ThemeManager { ThemeManager.shared }

    private var mentionTint: Color {
        Color(hex: "818CF8") // indigo400 — distinct des liens URL
    }

    var body: some View {
        let accentBarColor = Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let nameColor: Color = parentIsMe
            ? .white.opacity(0.9)
            : Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let previewColor: Color = parentIsMe
            ? .white.opacity(0.65)
            : theme.textMuted
        let bgColor: Color = parentIsMe
            ? Color.white.opacity(0.15)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))

        HStack(spacing: 0) {
            // Left accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(parentIsMe ? Color.white.opacity(0.7) : accentBarColor)
                .frame(width: 4)

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(reply.isMe ? "Vous" : reply.authorName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(nameColor)
                        .lineLimit(1)

                    if reply.isStoryReply {
                        BubbleStoryReplyPreview(reply: reply, previewColor: previewColor)
                    } else {
                        HStack(spacing: 5) {
                            if let attType = reply.attachmentType {
                                Image(systemName: BubbleQuotedReply.replyAttachmentIcon(attType))
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(previewColor)
                            }

                            MessageTextRenderer.render(
                                reply.previewText.isEmpty ? "Media" : reply.previewText,
                                fontSize: 12, color: previewColor,
                                mentionColor: mentionTint, accentColor: previewColor,
                                mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                            )
                            .lineLimit(2)
                            .tint(previewColor)
                        }
                    }
                }

                Spacer(minLength: 0)

                // Attachment thumbnail or story thumbnail
                if let thumbUrl = (reply.isStoryReply ? reply.storyThumbnailUrl : reply.attachmentThumbnailUrl), !thumbUrl.isEmpty {
                    CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 38, height: 38)) {
                        Color(hex: reply.authorColor).opacity(0.3)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 38, height: 38)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
        }
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(bgColor)
        )
        .padding(.horizontal, 6)
        .padding(.top, 6)
        .contentShape(Rectangle())
    }

    // MARK: - Attachment icon helper (was: replyAttachmentIcon)

    static func replyAttachmentIcon(_ type: String) -> String {
        switch type {
        case "image": return "photo"
        case "video": return "video"
        case "audio": return "waveform"
        case "file": return "doc"
        case "location": return "mappin"
        default: return "paperclip"
        }
    }
}

// MARK: - Story reply preview

/// Was: ThemedMessageBubble.storyReplyPreview(_:previewColor:) (lines 1034-1086).
///
/// `previewColor` est derive du contexte parent (white.opacity(0.65) si
/// `parentIsMe`, sinon `theme.textMuted`) — il n'est pas reductible a un
/// hex de la couleur de contact, donc on garde `Color` directement.
/// SwiftUI.Color est Hashable depuis iOS 13+ (synthese Equatable OK).
struct BubbleStoryReplyPreview: View, Equatable {
    let reply: ReplyReference
    let previewColor: Color

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.previewColor == rhs.previewColor &&
        Self.previewSlice(lhs.reply) == Self.previewSlice(rhs.reply)
    }

    private static func previewSlice(_ reply: ReplyReference) -> PreviewSlice {
        PreviewSlice(
            storyPublishedAt: reply.storyPublishedAt,
            storyReactionCount: reply.storyReactionCount,
            storyCommentCount: reply.storyCommentCount
        )
    }

    fileprivate struct PreviewSlice: Equatable {
        let storyPublishedAt: Date?
        let storyReactionCount: Int?
        let storyCommentCount: Int?
    }

    @ViewBuilder
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "camera.fill")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(previewColor)
            Text("Story")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(previewColor)

            if let date = reply.storyPublishedAt {
                Text("\u{2022}")
                    .font(.system(size: 8))
                    .foregroundColor(previewColor.opacity(0.6))
                Text(date, style: .relative)
                    .font(.system(size: 10))
                    .foregroundColor(previewColor.opacity(0.8))
            }

            let reactions = reply.storyReactionCount ?? 0
            let comments = reply.storyCommentCount ?? 0
            if reactions > 0 || comments > 0 {
                Text("(")
                    .font(.system(size: 10))
                    .foregroundColor(previewColor.opacity(0.6))
                if reactions > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 8))
                        Text("\(reactions)")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(previewColor.opacity(0.8))
                }
                if reactions > 0 && comments > 0 {
                    Text("\u{2022}")
                        .font(.system(size: 6))
                        .foregroundColor(previewColor.opacity(0.5))
                }
                if comments > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "bubble.right.fill")
                            .font(.system(size: 8))
                        Text("\(comments)")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(previewColor.opacity(0.8))
                }
                Text(")")
                    .font(.system(size: 10))
                    .foregroundColor(previewColor.opacity(0.6))
            }
        }
    }
}
