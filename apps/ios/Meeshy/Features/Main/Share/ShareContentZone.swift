import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'aperçu d'un message dans « Ce qui part » — même mot que la ligne de liste
/// et que le web : le texte, sinon « Sticker », sinon le type de la pièce et son nombre.
nonisolated enum ShareMessagePreview {
    static var stickerLabel: String {
        String(localized: "attachment.sticker", defaultValue: "Sticker", bundle: .meeshyShare)
    }

    static func text(for message: Message) -> String {
        if !message.content.isEmpty { return message.content }
        if message.sticker != nil { return stickerLabel }
        guard let first = message.attachments.first else {
            return String(localized: "forward.media-placeholder", defaultValue: "[Média]", bundle: .meeshyShare)
        }
        let count = message.attachments.count
        let kind = kindLabel(first)
        return count > 1 ? "\(kind) · \(count)" : kind
    }

    static func kindLabel(_ attachment: MessageAttachment) -> String {
        switch attachment.kind {
        case .image: return String(localized: "forward.preview.image", defaultValue: "Photo", bundle: .meeshyShare)
        case .video: return String(localized: "forward.preview.video", defaultValue: "Vidéo", bundle: .meeshyShare)
        case .audio: return String(localized: "forward.preview.audio", defaultValue: "Audio", bundle: .meeshyShare)
        default: return String(localized: "forward.preview.file", defaultValue: "Fichier", bundle: .meeshyShare)
        }
    }
}

/// **Zone 1 — ce qui part**, dans l'ordre d'envoi. Un message protégé retiré
/// d'une sélection y reste visible, atténué, avec son motif (D6, V3) ; une
/// flamme porte sa rangée de durée (V7) ; une pièce seule offre « Tout le
/// message » (V2).
struct ShareContentZone: View {
    @ObservedObject var model: ShareSheetViewModel
    let plan: SharePlan
    let accentColor: String
    let isDark: Bool

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            header
            content
            withdrawnNote
            durationRow
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }

    private var header: some View {
        HStack {
            Text(headerTitle)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if plan.limits.trimCount > 0, case .incoming = model.subject {
                Button(ShareSheetCopy.removeLast(plan.limits.trimCount)) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { model.trimOverflow() }
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
                .frame(minHeight: MeeshyControlSize.tapTarget)
            }
            if case .piece = model.subject {
                Button(ShareSheetCopy.wholeMessage) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { model.widenToWholeMessage() }
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(Color(hex: accentColor))
                .frame(minHeight: MeeshyControlSize.tapTarget)
            }
        }
    }

    private var headerTitle: String {
        switch model.subject {
        case .messages(let messages, _, _) where messages.count > 1:
            return ShareSheetCopy.messagesKept(plan.kept.count, of: messages.count)
        case .piece(let message, let attachmentId, _, _):
            let pieces = message.attachments.filter { $0.type != .location }
            let index = (pieces.firstIndex { $0.id == attachmentId } ?? 0) + 1
            return "\(ShareSheetCopy.contentZone) · \(ShareSheetCopy.pieceOf(index, pieces.count))"
        case .incoming(let incoming) where !incoming.media.isEmpty:
            return "\(ShareSheetCopy.contentZone) · \(incoming.media.count)"
        default:
            return ShareSheetCopy.contentZone
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.subject {
        case .messages(let messages, _, _):
            ForEach(messages, id: \.id) { message in messageCard(message, total: messages.count) }
        case .piece(let message, let attachmentId, _, _):
            if let piece = message.attachments.first(where: { $0.id == attachmentId }) {
                pieceCard(piece, of: message)
            }
        case .text(let text):
            card(icon: "text.alignleft", title: text, subtitle: nil)
        case .link(let url):
            card(icon: "link", title: url.host ?? url.absoluteString, subtitle: url.absoluteString)
        case .card(let shareCard):
            card(icon: Self.icon(for: shareCard.kind), title: shareCard.title, subtitle: shareCard.subtitle, imageURL: shareCard.imageURL)
        case .incoming(let incoming):
            ForEach(incoming.shortfalls, id: \.self) { shortfall in
                Label(ShareSheetCopy.shortfall(shortfall), systemImage: Self.symbol(for: shortfall))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !incoming.media.isEmpty {
                ShareIncomingStrip(
                    media: incoming.media,
                    fittingCount: incoming.media.count - plan.limits.trimCount,
                    accentColor: accentColor,
                    isDark: isDark,
                    onRemove: { id in withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { model.removeIncoming(id) } },
                    onMove: { id, offset in withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { model.moveIncoming(id, by: offset) } }
                )
            }
            if let text = incoming.text, !text.isEmpty {
                if let link = incoming.link {
                    card(icon: "link", title: link.host ?? text, subtitle: text)
                } else {
                    card(icon: "text.alignleft", title: text, subtitle: nil)
                }
            }
        }
    }

    private static func symbol(for shortfall: ShareShortfall) -> String {
        switch shortfall {
        case .unprepared: return "exclamationmark.icloud"
        case .overBudget: return "externaldrive.badge.exclamationmark"
        case .refusedSource: return "doc.badge.ellipsis"
        }
    }

    private static func icon(for kind: ShareCardKind) -> String {
        switch kind {
        case .post: return "square.text.square"
        case .story: return "circle.dashed"
        case .reel: return "play.rectangle"
        case .profile: return "person.crop.circle"
        case .invitation: return "person.badge.plus"
        }
    }

    private func isRemoved(_ message: Message) -> Bool { model.removedMessageIds.contains(message.id) }

    private func withdrawal(of message: Message) -> ShareWithdrawal? { plan.withdrawn.first { $0.id == message.id } }

    @ViewBuilder
    private func messageCard(_ message: Message, total: Int) -> some View {
        if !isRemoved(message) {
            let withdrawn = withdrawal(of: message)
            HStack(spacing: MeeshySpacing.sm) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(Color(hex: accentColor))
                    .frame(width: 3, height: 32)
                if let first = message.attachments.first, withdrawn == nil {
                    thumbnail(first).captureShield(message.contentExitLaw.capture.shieldsCapture())
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(message.senderName ?? "?")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                        .lineLimit(1)
                    Text(withdrawn.map { _ in ShareSheetCopy.withdrawn(withdrawn?.reason ?? .unavailable) } ?? ShareMessagePreview.text(for: message))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(2)
                        .captureShield(message.contentExitLaw.capture.shieldsCapture())
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                if plan.kept.count > 1, withdrawn == nil {
                    Button { withAnimation { model.removeMessage(message.id) } } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(theme.textMuted)
                            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    }
                    .accessibilityLabel(ShareSheetCopy.remove)
                }
            }
            .padding(MeeshySpacing.sm)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(MeeshyColors.surfaceFill(isDark: isDark)))
            .opacity(withdrawn == nil ? 1 : 0.55)
            .accessibilityAction(named: Text(ShareSheetCopy.remove)) { model.removeMessage(message.id) }
        }
    }

    private func pieceCard(_ piece: MessageAttachment, of message: Message) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            thumbnail(piece, size: 64)
            VStack(alignment: .leading, spacing: 2) {
                Text(ShareMessagePreview.kindLabel(piece))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(message.senderName ?? "")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(theme.textMuted)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func card(icon: String, title: String, subtitle: String?, imageURL: String? = nil) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            if let imageURL {
                ProgressiveCachedImage(thumbHash: nil, thumbnailUrl: imageURL, fullUrl: imageURL) {
                    Color(hex: accentColor).opacity(MeeshyOpacity.medium)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs))
            } else {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.xl))
                    .foregroundColor(Color(hex: accentColor))
                    .frame(width: 48, height: 48)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(Color(hex: accentColor).opacity(MeeshyOpacity.light)))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(3)
                if let subtitle {
                    Text(subtitle)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(MeeshyColors.surfaceFill(isDark: isDark)))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func thumbnail(_ attachment: MessageAttachment, size: CGFloat = 32) -> some View {
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        let fullUrl = attachment.type == .image && !attachment.fileUrl.isEmpty ? attachment.fileUrl : nil
        if thumbUrl != nil || fullUrl != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(thumbHash: attachment.thumbHash, thumbnailUrl: thumbUrl, fullUrl: fullUrl ?? thumbUrl) {
                Color(hex: accentColor).opacity(MeeshyOpacity.medium)
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
            .blur(radius: attachment.declaresBlur ? 12 : 0)
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var withdrawnNote: some View {
        if let first = plan.withdrawn.first, !plan.kept.isEmpty {
            Label("\(ShareSheetCopy.withdrawn(first.reason)) \(ShareSheetCopy.othersLeave(plan.kept.count))", systemImage: "eye.slash")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var durationRow: some View {
        if let max = plan.flameMaxDurationSeconds {
            let choices = ContentExitLaw.ForwardVerdict.allowed(maxDurationSeconds: max).durationChoices
            ShareDurationRow(
                choices: choices,
                selectedSeconds: model.chosenDurationSeconds.flatMap { chosen in choices.contains { $0.seconds == chosen } ? chosen : nil } ?? max,
                accentColor: accentColor,
                isDark: isDark,
                onSelect: { seconds in
                    HapticFeedback.light()
                    model.chosenDurationSeconds = seconds
                }
            )
            .equatable()
        }
    }
}
