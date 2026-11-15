import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
struct CommentImagerTarget {
    let comment: FeedComment
    let showOriginal: Bool
    let accentColor: String
    var root: FeedComment? = nil
    var loadedReplies: [FeedComment] = []
    var post: FeedPost? = nil
    var story: PostCommentCardStory? = nil

    var viewer: MessageCardSubject.Viewer { ImagerCardRequest.currentViewer }

    private var audioPrism: [String] {
        ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved
    }

    var thread: [FeedComment] {
        (root.map { [$0] } ?? []) + loadedReplies
    }

    var compositionSource: PostCommentCardSource {
        PostCommentCardSource.reading(post: post, target: comment, thread: thread, viewer: viewer, showOriginal: showOriginal, story: story)
    }

    func request(for target: FeedComment, quoting quoted: FeedComment?) -> MessageCardExportRequest? {
        MessageCardExportMenu.request(
            comment: target,
            showOriginal: target.id == comment.id && showOriginal,
            accentColor: accentColor,
            viewer: viewer,
            handle: viewer.username,
            quoting: quoted,
            audioPrism: audioPrism
        )
    }

    var ownRequest: MessageCardExportRequest? {
        guard post != nil || story != nil else { return request(for: comment, quoting: root) }
        let composed = MessageCardExportMenu.request(
            post: post, story: story, comment: comment, thread: thread, showOriginal: showOriginal, accentColor: accentColor,
            viewer: viewer, handle: viewer.username, audioPrism: audioPrism
        )
        guard composed == nil, PostCommentCardComposition.fallsBackToCommentAlone(compositionSource) else { return composed }
        return request(for: comment, quoting: root)
    }

    var canImagine: Bool {
        guard post != nil || story != nil else { return ownRequest != nil }
        let source = compositionSource
        guard PostCommentCardComposition.modes(of: source).isEmpty else { return true }
        return PostCommentCardComposition.fallsBackToCommentAlone(source) && request(for: comment, quoting: root) != nil
    }
}

struct CommentImagerButton: View {
    let target: CommentImagerTarget
    var glyphSize: CGFloat = 14
    var tint: Color = .secondary

    var body: some View {
        if target.canImagine, let request = target.ownRequest {
            ImagerWandButton(
                hint: String(localized: "comment.imager.hint", defaultValue: "Fait de ce commentaire une carte image.", bundle: .main),
                glyphSize: glyphSize,
                tint: tint,
                action: { Self.present(request) },
                quick: MessageCardExportMenu.hasDefaultFormat ? { Self.present(request.quickly) } : nil
            )
        }
    }

    private static func present(_ request: MessageCardExportRequest) {
        HapticFeedback.light()
        MessageCardExportPresenter.present(request)
    }
}
