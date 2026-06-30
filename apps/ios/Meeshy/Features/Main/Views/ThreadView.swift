import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ThreadView: View {
    let parentMessage: MeeshyMessage
    let conversationId: String

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var replyText = ""
    @State private var replies: [MeeshyMessage] = []
    @State private var isLoading = false
    @State private var isSending = false
    @State private var sendError: String?

    private var accentColor: String {
        parentMessage.senderColor ?? MeeshyColors.brandPrimaryHex
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
                composerBar
            }
        }
        .task { await loadReplies() }
        .withStatusBubble()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.callout.weight(.semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "a11y.back", bundle: .main))

            Spacer()

            Text(String(localized: "thread.title", defaultValue: "Discussion", bundle: .main))
                .font(.body.weight(.bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(String(localized: "thread.repliesCount", defaultValue: "\(replies.count) reponses", bundle: .main))
                .font(.caption.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                parentMessageView
                repliesDivider
                repliesList
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private var parentMessageView: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: parentMessage.senderName ?? "?",
                    context: .messageBubble,
                    accentColor: accentColor,
                    moodEmoji: statusViewModel.statusForUser(userId: parentMessage.senderId)?.moodEmoji,
                    onMoodTap: statusViewModel.moodTapHandler(for: parentMessage.senderId)
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(parentMessage.senderName ?? String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(parentMessage.createdAt, style: .relative)
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            Text(parentMessage.content)
                .font(.subheadline)
                .foregroundColor(theme.textPrimary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    private var repliesDivider: some View {
        HStack {
            Rectangle()
                .fill(Color(hex: accentColor).opacity(0.3))
                .frame(height: 1)

            Text(String(localized: "thread.repliesCount", defaultValue: "\(replies.count) reponses", bundle: .main))
                .font(.caption2.weight(.bold))
                .foregroundColor(Color(hex: accentColor))
                .padding(.horizontal, 8)

            Rectangle()
                .fill(Color(hex: accentColor).opacity(0.3))
                .frame(height: 1)
        }
    }

    private var repliesList: some View {
        LazyVStack(spacing: 8) {
            ForEach(replies) { reply in
                replyRow(reply)
            }
        }
    }

    private func replyRow(_ message: MeeshyMessage) -> some View {
        HStack(alignment: .top, spacing: 10) {
            MeeshyAvatar(
                name: message.senderName ?? "?",
                context: .postComment,
                accentColor: message.senderColor ?? accentColor,
                moodEmoji: statusViewModel.statusForUser(userId: message.senderId)?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: message.senderId)
            )

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(message.senderName ?? String(localized: "common.unknown", defaultValue: "Unknown", bundle: .main))
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(hex: message.senderColor ?? accentColor))

                    Text(message.createdAt, style: .relative)
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                }

                Text(message.content)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    // MARK: - Composer

    private var composerBar: some View {
        VStack(spacing: 4) {
            if let sendError {
                Text(sendError)
                    .font(.caption2)
                    .foregroundColor(MeeshyColors.error)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .transition(.opacity)
                    .accessibilityLabel(String(localized: "Erreur d'envoi", defaultValue: "Send error"))
                    .accessibilityValue(sendError)
            }

            HStack(spacing: 10) {
                TextField(String(localized: "thread.reply.placeholder", defaultValue: "Repondre...", bundle: .main), text: $replyText)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(theme.surfaceGradient(tint: accentColor))
                            .overlay(
                                Capsule()
                                    .stroke(theme.border(tint: accentColor), lineWidth: 1)
                            )
                    )
                    .disabled(isSending)

                Button {
                    HapticFeedback.light()
                    sendReply()
                } label: {
                    if isSending {
                        ProgressView()
                            .tint(Color(hex: accentColor))
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.callout.weight(.semibold))
                            .foregroundColor(
                                replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    ? theme.textMuted
                                    : Color(hex: accentColor)
                            )
                    }
                }
                .disabled(isSending || replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 10)
        .background(isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.8))
    }

    // MARK: - Actions

    private func loadReplies() async {
        isLoading = true
        let user = AuthManager.shared.currentUser
        do {
            replies = try await ThreadRepliesLoader().loadReplies(
                conversationId: conversationId,
                parentMessageId: parentMessage.id,
                currentUserId: user?.id ?? "",
                currentUsername: user?.username
            )
        } catch {
            // Match prior behaviour: silently swallow on error so the
            // empty-state UI is shown. ThreadView has no dedicated error
            // surface (no `loadError` state) — that's an existing
            // limitation, not something this refactor changes.
        }
        isLoading = false
    }

    private func sendReply() {
        let text = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let savedText = replyText
        replyText = ""
        isSending = true
        sendError = nil

        Task {
            do {
                let request = SendMessageRequest(content: text, replyToId: parentMessage.id)
                _ = try await MessageService.shared.send(
                    conversationId: conversationId,
                    request: request
                )
                isSending = false
                await loadReplies()
            } catch {
                replyText = savedText
                sendError = error.localizedDescription
                isSending = false
            }
        }
    }
}
