import SwiftUI
import MeeshySDK

// MARK: - MessageOverlayMenu

struct MessageOverlayMenu: View {
    let message: Message
    let contactColor: String
    @Binding var isPresented: Bool
    var onReply: (() -> Void)?
    var onCopy: (() -> Void)?
    var onEdit: (() -> Void)?
    var onForward: (() -> Void)?
    var onDelete: (() -> Void)?
    var onPin: (() -> Void)?
    var onReact: ((String) -> Void)?
    var onShowInfo: (() -> Void)?
    var onAddReaction: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isVisible = false

    private let quickEmojis = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}", "\u{1F525}", "\u{1F389}"]

    var body: some View {
        ZStack {
            dismissBackground
            menuContent
                .scaleEffect(isVisible ? 1 : 0.85)
                .opacity(isVisible ? 1 : 0)
        }
        .ignoresSafeArea()
        .onAppear {
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                isVisible = true
            }
        }
    }

    // MARK: - Dismiss Background

    private var dismissBackground: some View {
        Color.black
            .opacity(isVisible ? 0.5 : 0)
            .background(.ultraThinMaterial.opacity(isVisible ? 1 : 0))
            .animation(.easeOut(duration: 0.25), value: isVisible)
            .onTapGesture { dismiss() }
    }

    // MARK: - Menu Content

    private var menuContent: some View {
        VStack(spacing: 16) {
            Spacer()
            emojiRow
            messagePreview
            actionGrid
            Spacer()
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Quick Emoji Row

    private var emojiRow: some View {
        HStack(spacing: 8) {
            ForEach(quickEmojis, id: \.self) { emoji in
                Button {
                    dismissThen { onReact?(emoji) }
                } label: {
                    Text(emoji)
                        .font(.system(size: 24))
                }
                .buttonStyle(EmojiButtonStyle())
            }

            Button {
                dismissThen { onAddReaction?() }
            } label: {
                ZStack {
                    Circle()
                        .fill(theme.mode.isDark ? Color.white.opacity(0.15) : Color.gray.opacity(0.15))
                        .frame(width: 34, height: 34)
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(theme.mode.isDark ? .white.opacity(0.7) : .gray)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(emojiRowBackground)
    }

    private var emojiRowBackground: some View {
        Capsule()
            .fill(.ultraThinMaterial)
            .overlay(
                Capsule()
                    .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6))
            )
            .overlay(
                Capsule()
                    .stroke(
                        theme.mode.isDark
                            ? Color.white.opacity(0.15)
                            : Color.black.opacity(0.06),
                        lineWidth: 0.5
                    )
            )
            .shadow(color: .black.opacity(0.25), radius: 16, y: 6)
    }

    // MARK: - Message Preview

    private var messagePreview: some View {
        HStack {
            if message.isMe { Spacer(minLength: 40) }

            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 6) {
                if !message.isMe, let name = message.senderName {
                    Text(name)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: message.senderColor ?? contactColor))
                }

                previewContent

                HStack(spacing: 4) {
                    if message.isEdited {
                        Text("modifie")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    Text(message.createdAt.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(theme.textMuted)

                    if message.isMe {
                        deliveryStatusIcon
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(previewBubbleBackground)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(
                        theme.mode.isDark
                            ? Color.white.opacity(0.15)
                            : Color.black.opacity(0.06),
                        lineWidth: 0.5
                    )
            )
            .shadow(
                color: (message.isMe ? Color(hex: "FF2E63") : Color.black).opacity(0.15),
                radius: 8,
                y: 3
            )

            if !message.isMe { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder
    private var previewContent: some View {
        if message.isDeleted {
            HStack(spacing: 4) {
                Image(systemName: "nosign")
                    .font(.system(size: 12))
                Text("Message supprime")
                    .italic()
            }
            .font(.system(size: 14))
            .foregroundColor(theme.textMuted)
        } else if !message.content.isEmpty {
            Text(message.content)
                .font(.system(size: 15))
                .foregroundColor(message.isMe ? .white : theme.textPrimary)
                .lineLimit(4)
                .multilineTextAlignment(message.isMe ? .trailing : .leading)
        } else if let attachment = message.attachments.first {
            attachmentIndicator(for: attachment)
        }
    }

    private func attachmentIndicator(for attachment: MessageAttachment) -> some View {
        HStack(spacing: 6) {
            Image(systemName: attachmentIcon(for: attachment.type))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: attachment.thumbnailColor))

            Text(attachmentLabel(for: attachment))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(message.isMe ? .white.opacity(0.9) : theme.textSecondary)
        }
    }

    private func attachmentIcon(for type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    private func attachmentLabel(for attachment: MessageAttachment) -> String {
        switch attachment.type {
        case .image: return "Photo"
        case .video:
            if let duration = attachment.durationFormatted {
                return "Video (\(duration))"
            }
            return "Video"
        case .audio:
            if let duration = attachment.durationFormatted {
                return "Audio (\(duration))"
            }
            return "Audio"
        case .file:
            let name = attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
            return "\(name) - \(attachment.fileSizeFormatted)"
        case .location: return "Position"
        }
    }

    private var previewBubbleBackground: some View {
        ZStack {
            if message.isMe {
                LinearGradient(
                    colors: [Color(hex: "FF2E63").opacity(0.9), Color(hex: "FF6B6B").opacity(0.9)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            } else {
                theme.mode.isDark
                    ? Color.white.opacity(0.1)
                    : Color(hex: "F5F2ED")
            }
            Color.clear.background(.ultraThinMaterial.opacity(0.5))
        }
    }

    @ViewBuilder
    private var deliveryStatusIcon: some View {
        switch message.deliveryStatus {
        case .sending:
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.5))
        case .sent:
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.6))
        case .delivered:
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white.opacity(0.7))
                .overlay(
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white.opacity(0.7))
                        .offset(x: 4)
                )
        case .read:
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(Color(hex: "4ECDC4"))
                .overlay(
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: "4ECDC4"))
                        .offset(x: 4)
                )
        }
    }

    // MARK: - Action Grid

    private var actionGrid: some View {
        let actions = availableActions
        let rows = stride(from: 0, to: actions.count, by: 3).map { start in
            Array(actions[start..<min(start + 3, actions.count)])
        }

        return VStack(spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 10) {
                    ForEach(row) { action in
                        actionButton(action)
                    }
                    if row.count < 3 {
                        ForEach(0..<(3 - row.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity, minHeight: 72)
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(actionGridBackground)
    }

    private var actionGridBackground: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.7))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(
                        theme.mode.isDark
                            ? Color.white.opacity(0.12)
                            : Color.black.opacity(0.06),
                        lineWidth: 0.5
                    )
            )
            .shadow(color: .black.opacity(0.2), radius: 20, y: 8)
    }

    private func actionButton(_ action: OverlayAction) -> some View {
        Button {
            dismissThen { action.handler() }
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(Color(hex: action.color).opacity(theme.mode.isDark ? 0.2 : 0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: action.icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(hex: action.color))
                }
                Text(action.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(ActionButtonStyle())
    }

    // MARK: - Available Actions

    private var availableActions: [OverlayAction] {
        var actions: [OverlayAction] = []

        actions.append(OverlayAction(
            id: "reply",
            icon: "arrowshape.turn.up.left.fill",
            label: "Repondre",
            color: "4ECDC4",
            handler: { onReply?() }
        ))

        let hasTextContent = !message.content.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines).isEmpty
        if hasTextContent {
            actions.append(OverlayAction(
                id: "copy",
                icon: "doc.on.doc.fill",
                label: "Copier",
                color: "9B59B6",
                handler: { onCopy?() }
            ))
        }

        actions.append(OverlayAction(
            id: "forward",
            icon: "arrowshape.turn.up.forward.fill",
            label: "Transferer",
            color: "F8B500",
            handler: { onForward?() }
        ))

        actions.append(OverlayAction(
            id: "pin",
            icon: "pin.fill",
            label: "Epingler",
            color: "3498DB",
            handler: { onPin?() }
        ))

        actions.append(OverlayAction(
            id: "info",
            icon: "info.circle.fill",
            label: "Infos",
            color: "45B7D1",
            handler: { onShowInfo?() }
        ))

        if message.isMe {
            if hasTextContent {
                actions.append(OverlayAction(
                    id: "edit",
                    icon: "pencil",
                    label: "Modifier",
                    color: "F8B500",
                    handler: { onEdit?() }
                ))
            }

            actions.append(OverlayAction(
                id: "delete",
                icon: "trash.fill",
                label: "Supprimer",
                color: "FF6B6B",
                handler: { onDelete?() }
            ))
        }

        return actions
    }

    // MARK: - Dismiss

    private func dismiss() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
        }
    }

    private func dismissThen(_ action: @escaping () -> Void) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                action()
            }
        }
    }
}

// MARK: - Overlay Action Model

private struct OverlayAction: Identifiable {
    let id: String
    let icon: String
    let label: String
    let color: String
    let handler: () -> Void
}

// MARK: - Emoji Button Style

private struct EmojiButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.35 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: configuration.isPressed)
    }
}

// MARK: - Action Button Style

private struct ActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
