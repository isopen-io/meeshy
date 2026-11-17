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
            ProfilePostsFallback(userId: userId, accentColor: resolvedAccent, social: dependencies.social,
                                 authorName: isCurrentUser ? nil : displayUser.resolvedDisplayName)
        } else {
            ProfilePostsEmpty(authorName: isCurrentUser ? nil : displayUser.resolvedDisplayName)
        }
    }
}

// MARK: - SDK fallback list (minimal — app injects the real one)

private struct ProfilePostsFallback: View {
    let userId: String
    let accentColor: String
    let social: any ProfileSocialActionsProviding
    let authorName: String?

    @State private var posts: [APIPost] = []
    @State private var isLoading = false
    @State private var didLoad = false

    var body: some View {
        Group {
            if posts.isEmpty && isLoading {
                VStack(spacing: MeeshySpacing.md) {
                    ForEach(0..<3, id: \.self) { _ in
                        MeeshySkeleton(shape: .card(aspect: 4.5, radius: Double(MeeshyRadius.md)))
                    }
                }
                .padding(.horizontal, MeeshySpacing.xl)
            } else if posts.isEmpty {
                ProfilePostsEmpty(authorName: authorName)
            } else {
                VStack(spacing: MeeshySpacing.md) {
                    ForEach(posts, id: \.id) { post in
                        ProfilePostRow(post: post, accentColor: accentColor)
                            .equatable()
                            .padding(.horizontal, MeeshySpacing.xl)
                    }
                }
            }
        }
        .task {
            guard !didLoad else { return }
            didLoad = true
            isLoading = true
            do {
                posts = try await social.userPosts(of: userId)
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

    @ResolvedThemePalette private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            if let content = post.content, !content.isEmpty {
                Text(content)
                    .meeshyScaledFont(MeeshyFont.labelSize)
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(4)
                    .multilineTextAlignment(.leading)
            } else {
                Text(String(localized: "profile.posts.noText", defaultValue: "Publication sans texte", bundle: .module))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textMuted)
                    .italic()
            }

            HStack(spacing: MeeshySpacing.md) {
                Label("\(post.likeCount ?? 0)", systemImage: "heart")
                Label("\(post.commentCount ?? 0)", systemImage: "bubble.right")
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.mdPlus)
        .background(theme.surfaceGradient(tint: accentColor))
        .glassCard(cornerRadius: MeeshyRadius.md)
    }
}

/// Rien de publié : le bloc d'état compact du kit (K38). Chez un autre, il le nomme (planche `Etat-Vide`, #18873).
private struct ProfilePostsEmpty: View {
    let authorName: String?

    var body: some View {
        MeeshyStateBlock(kind: .empty, title: title, size: .compact, systemImage: "square.text.square")
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.vertical, MeeshySpacing.lg)
    }

    private var title: String {
        guard let authorName, !authorName.isEmpty else {
            return String(localized: "profile.posts.empty", defaultValue: "Aucune publication", bundle: .module)
        }
        return String(format: String(localized: "profile.posts.emptyOf", defaultValue: "%@ n'a encore rien publié", bundle: .module),
                      authorName)
    }
}
