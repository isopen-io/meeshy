import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Posts tab
//
// The rich posts rendering (FeedPostCard) is injected by the app (Phase E) via
// `postsContent`. When absent, the SDK shows a minimal self-contained fallback
// (`ProfilePostsFallback`) so the SDK compiles and renders something on its own.

extension UserProfileSheet {

    @ViewBuilder
    var postsTab: some View {
        if let postsContent, let userId = resolvedUserId, !userId.isEmpty {
            postsContent(userId)
        } else if let userId = resolvedUserId, !userId.isEmpty {
            ProfilePostsFallback(userId: userId, accentColor: resolvedAccent)
        } else {
            ProfilePostsEmpty(accentColor: resolvedAccent)
        }
    }
}

// MARK: - SDK fallback list (minimal — app injects the real one)

private struct ProfilePostsFallback: View {
    let userId: String
    let accentColor: String

    @ObservedObject private var theme = ThemeManager.shared
    @State private var posts: [APIPost] = []
    @State private var isLoading = false
    @State private var didLoad = false

    var body: some View {
        Group {
            if posts.isEmpty && isLoading {
                VStack(spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 14)
                            .fill(theme.surface(tint: accentColor, intensity: 0.1))
                            .frame(height: 72)
                            .shimmer()
                    }
                }
                .padding(.horizontal, 20)
            } else if posts.isEmpty {
                ProfilePostsEmpty(accentColor: accentColor)
            } else {
                VStack(spacing: 12) {
                    ForEach(posts, id: \.id) { post in
                        ProfilePostRow(post: post, accentColor: accentColor)
                            .padding(.horizontal, 20)
                    }
                }
            }
        }
        .task {
            guard !didLoad else { return }
            didLoad = true
            isLoading = true
            do {
                let response = try await PostService.shared.getUserPosts(userId: userId)
                posts = response.data
            } catch {}
            isLoading = false
        }
    }
}

private struct ProfilePostRow: View, Equatable {
    let post: APIPost
    let accentColor: String

    static func == (lhs: ProfilePostRow, rhs: ProfilePostRow) -> Bool {
        lhs.post.id == rhs.post.id && lhs.accentColor == rhs.accentColor
    }

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let content = post.content, !content.isEmpty {
                Text(content)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)
            } else {
                Text(String(localized: "profile.posts.noText", defaultValue: "Publication sans texte", bundle: .module))
                    .font(.system(size: 13))
                    .foregroundColor(theme.textMuted)
                    .italic()
            }

            HStack(spacing: 12) {
                Label("\(post.likeCount ?? 0)", systemImage: "heart")
                Label("\(post.commentCount ?? 0)", systemImage: "bubble.right")
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(theme.surfaceGradient(tint: accentColor))
        .glassCard(cornerRadius: 14)
    }
}

private struct ProfilePostsEmpty: View {
    let accentColor: String
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "square.text.square")
                .font(.system(size: 28))
                .foregroundColor(theme.textMuted.opacity(0.5))
                .accessibilityHidden(true)
            Text(String(localized: "profile.posts.empty", defaultValue: "Aucun poste", bundle: .module))
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}
