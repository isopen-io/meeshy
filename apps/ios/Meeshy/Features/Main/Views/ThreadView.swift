import SwiftUI
import MeeshySDK
import MeeshyUI

struct ThreadView: View {
    let parentMessage: MeeshyMessage
    let conversationId: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @State private var replyText = ""
    @State private var replies: [MeeshyMessage] = []
    @State private var isLoading = false

    private var accentColor: String {
        parentMessage.senderColor ?? "4ECDC4"
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
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Discussion")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text("\(replies.count) reponses")
                .font(.system(size: 12, weight: .medium))
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
                    mode: .custom(32),
                    accentColor: accentColor
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(parentMessage.senderName ?? "Inconnu")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(parentMessage.createdAt, style: .relative)
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            Text(parentMessage.content)
                .font(.system(size: 15))
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

            Text("\(replies.count) reponses")
                .font(.system(size: 11, weight: .bold))
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
                mode: .custom(28),
                accentColor: message.senderColor ?? "4ECDC4"
            )

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(message.senderName ?? "Inconnu")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: message.senderColor ?? "4ECDC4"))

                    Text(message.createdAt, style: .relative)
                        .font(.system(size: 10))
                        .foregroundColor(theme.textMuted)
                }

                Text(message.content)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    // MARK: - Composer

    private var composerBar: some View {
        HStack(spacing: 10) {
            TextField("Repondre...", text: $replyText)
                .font(.system(size: 14))
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

            Button {
                HapticFeedback.light()
                sendReply()
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(
                        replyText.trimmingCharacters(in: .whitespaces).isEmpty
                            ? theme.textMuted
                            : Color(hex: accentColor)
                    )
            }
            .disabled(replyText.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.8))
    }

    // MARK: - Actions

    private func loadReplies() async {
        isLoading = true
        do {
            let response: OffsetPaginatedAPIResponse<[APIMessage]> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/messages",
                queryItems: [
                    URLQueryItem(name: "replyToId", value: parentMessage.id),
                    URLQueryItem(name: "limit", value: "50"),
                ]
            )
            replies = response.data.map { $0.toMessage(currentUserId: AuthManager.shared.currentUser?.id ?? "") }
        } catch {}
        isLoading = false
    }

    private func sendReply() {
        guard !replyText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let content = replyText
        replyText = ""

        Task {
            do {
                let body = SendMessageRequest(content: content, replyToId: parentMessage.id)
                let bodyData = try JSONEncoder().encode(body)
                let _: APIResponse<SendMessageResponseData> = try await APIClient.shared.request(
                    endpoint: "/conversations/\(conversationId)/messages",
                    method: "POST",
                    body: bodyData
                )
                await loadReplies()
            } catch {}
        }
    }
}
