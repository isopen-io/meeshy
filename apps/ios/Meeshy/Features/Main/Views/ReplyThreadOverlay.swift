import SwiftUI
import MeeshySDK
import MeeshyUI
import os

struct ReplyThreadOverlay: View {
    let conversationId: String
    let parentMessageId: String
    let accentColor: String
    let isDark: Bool
    let allMessages: [MeeshyMessage]
    let translationResolver: (String) -> String?
    @Binding var isPresented: Bool

    @State private var parentMessage: MeeshyMessage?
    @State private var replies: [MeeshyMessage] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var dragOffset: CGFloat = 0

    private let theme = ThemeManager.shared

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.opacity(0.3)
                    .background(.ultraThinMaterial)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }

                cardContent(maxHeight: geo.size.height * 0.7)
                    .offset(y: max(0, dragOffset))
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                if value.translation.height > 0 {
                                    dragOffset = value.translation.height
                                }
                            }
                            .onEnded { value in
                                if value.translation.height > 100 {
                                    dismiss()
                                } else {
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                        dragOffset = 0
                                    }
                                }
                            }
                    )
                    .transition(.scale(scale: 0.95).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: isPresented)
        .onAppear { resolveThread() }
    }

    // MARK: - Thread Resolution

    private func resolveThread() {
        let messageIndex = Dictionary(uniqueKeysWithValues: allMessages.map { ($0.id, $0) })

        guard let parent = messageIndex[parentMessageId] else {
            Task { await loadThreadFromAPI() }
            return
        }

        parentMessage = parent
        replies = collectLocalReplies(rootId: parentMessageId, index: messageIndex)
        isLoading = false
    }

    private func collectLocalReplies(rootId: String, index: [String: MeeshyMessage]) -> [MeeshyMessage] {
        var result: [MeeshyMessage] = []
        var frontier: Set<String> = [rootId]

        for _ in 0..<10 {
            if frontier.isEmpty { break }

            let batch = allMessages.filter { msg in
                guard let replyToId = msg.replyToId else { return false }
                return frontier.contains(replyToId)
            }

            if batch.isEmpty { break }

            result.append(contentsOf: batch)
            frontier = Set(batch.map(\.id))
        }

        return result.sorted { $0.createdAt < $1.createdAt }
    }

    private func loadThreadFromAPI() async {
        isLoading = true
        loadError = nil
        do {
            let response: APIResponse<ThreadData> = try await APIClient.shared.request(
                endpoint: "/conversations/\(conversationId)/threads/\(parentMessageId)"
            )
            let data = response.data
            let userId = AuthManager.shared.currentUser?.id ?? ""
            let username = AuthManager.shared.currentUser?.username
            parentMessage = data.parent.toMessage(currentUserId: userId, currentUsername: username)
            replies = data.replies.map { $0.toMessage(currentUserId: userId, currentUsername: username) }
        } catch {
            Logger.messages.error("Failed to load thread: \(error.localizedDescription)")
            loadError = "Impossible de charger la discussion"
        }
        isLoading = false
    }

    // MARK: - Card

    private func cardContent(maxHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            dragIndicator
            header
            Divider().background(theme.border(tint: accentColor))

            if isLoading {
                skeletonContent
            } else if let error = loadError {
                errorContent(error)
            } else if let parent = parentMessage {
                scrollContent(parent: parent)
            }
        }
        .frame(maxHeight: maxHeight)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.horizontal, 16)
        .shadow(color: Color(hex: accentColor).opacity(0.15), radius: 20, y: 10)
    }

    private var dragIndicator: some View {
        Capsule()
            .fill(theme.textMuted)
            .frame(width: 36, height: 4)
            .padding(.top, 10)
            .padding(.bottom, 4)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Discussion")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(theme.textPrimary)

                if !replies.isEmpty {
                    Text("\(replies.count) reponse\(replies.count > 1 ? "s" : "")")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Content

    private func scrollContent(parent: MeeshyMessage) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                parentMessageRow(parent)

                if !replies.isEmpty {
                    repliesDivider
                    repliesList
                } else {
                    Text("Aucune reponse pour le moment")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 20)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
    }

    private func displayContent(for message: MeeshyMessage) -> String {
        translationResolver(message.id) ?? message.content
    }

    private func parentMessageRow(_ msg: MeeshyMessage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: msg.senderName ?? "?",
                    context: .messageBubble,
                    accentColor: msg.senderColor ?? accentColor
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(msg.senderName ?? "Inconnu")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(msg.createdAt, style: .relative)
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            Text(displayContent(for: msg))
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(hex: accentColor).opacity(0.1))
        )
    }

    private var repliesDivider: some View {
        HStack {
            Rectangle()
                .fill(Color(hex: accentColor).opacity(0.3))
                .frame(height: 1)

            Text("\(replies.count) reponse\(replies.count > 1 ? "s" : "")")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Color(hex: accentColor))
                .padding(.horizontal, 8)

            Rectangle()
                .fill(Color(hex: accentColor).opacity(0.3))
                .frame(height: 1)
        }
    }

    private var repliesList: some View {
        LazyVStack(spacing: 6) {
            ForEach(replies) { reply in
                replyRow(reply)
            }
        }
    }

    private func replyRow(_ message: MeeshyMessage) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let reply = message.replyTo, reply.messageId != parentMessageId {
                miniReplyChip(reply)
            }

            HStack(alignment: .top, spacing: 10) {
                MeeshyAvatar(
                    name: message.senderName ?? "?",
                    context: .postComment,
                    accentColor: message.senderColor ?? accentColor
                )

                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(message.senderName ?? "Inconnu")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: message.senderColor ?? accentColor))

                        Text(message.createdAt, style: .relative)
                            .font(.system(size: 10))
                            .foregroundColor(theme.textMuted)
                    }

                    Text(displayContent(for: message))
                        .font(.system(size: 14))
                        .foregroundColor(theme.textPrimary)
                }

                Spacer()
            }
        }
        .padding(.vertical, 4)
    }

    private func miniReplyChip(_ reply: ReplyReference) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color(hex: reply.authorColor))
                .frame(width: 3)

            Text("\u{21A9} \(reply.isMe ? "Vous" : reply.authorName): \(reply.previewText)")
                .font(.system(size: 11))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .frame(height: 20)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
        )
        .padding(.leading, 42)
    }

    // MARK: - Error

    private func errorContent(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundColor(theme.textMuted)

            Text(message)
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)

            Button {
                Task { await loadThreadFromAPI() }
            } label: {
                Text("Reessayer")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
            }
        }
        .padding(24)
    }

    // MARK: - Skeleton

    private var skeletonContent: some View {
        VStack(spacing: 12) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(spacing: 10) {
                    Circle()
                        .fill(theme.textMuted.opacity(0.3))
                        .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 4) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(theme.textMuted.opacity(0.3))
                            .frame(width: 80, height: 10)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(theme.textMuted.opacity(0.2))
                            .frame(height: 10)
                    }
                    Spacer()
                }
            }
        }
        .padding(16)
        .shimmer()
    }

    // MARK: - Actions

    private func dismiss() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isPresented = false
        }
    }
}
