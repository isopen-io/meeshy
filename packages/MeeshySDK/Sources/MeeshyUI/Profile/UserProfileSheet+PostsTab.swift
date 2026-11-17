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
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.sm), count: 2),
                          spacing: MeeshySpacing.sm) {
                    ForEach(posts, id: \.id) { post in
                        MeeshyMediaTile(item: ProfilePostsFallbackTile.item(for: post), shape: .square,
                                        tint: Color(hex: accentColor), content: { size in
                            CachedAsyncImage(url: ProfilePostsFallbackTile.thumbnail(of: post), targetSize: size,
                                             showsStatusOverlays: false) {
                                Color(hex: accentColor).opacity(MeeshyOpacity.light)
                            }
                            .scaledToFill()
                        })
                        .aspectRatio(1, contentMode: .fit)
                    }
                }
                .padding(.horizontal, MeeshySpacing.xl)
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

/// Une publication du repli en VALEUR pour une tuile du kit (K49) : son image quand elle en a une, sinon son texte.
/// Le repli ne mène nulle part : la tuile n'est pas un bouton.
enum ProfilePostsFallbackTile {

    static func thumbnail(of post: APIPost) -> String? {
        let visual = post.media?.first { $0.mediaType == .image || $0.mediaType == .video }
        guard let visual else { return nil }
        if let thumbnail = visual.thumbnailUrl, !thumbnail.isEmpty { return thumbnail }
        guard visual.mediaType == .image, let url = visual.fileUrl, !url.isEmpty else { return nil }
        return url
    }

    static func item(for post: APIPost) -> MeeshyMediaGridItem {
        let text = (post.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let hasPicture = thumbnail(of: post) != nil
        let label = text.isEmpty
            ? String(localized: "profile.posts.noText", defaultValue: "Publication sans texte", bundle: .module)
            : String(text.prefix(80))
        return MeeshyMediaGridItem(id: post.id, kind: hasPicture ? .media : .text, label: label,
                                   text: hasPicture || text.isEmpty ? nil : text)
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
