import Foundation

public extension MessageCardSubject {

    static func of(post: FeedPost, viewer: Viewer, preferredLanguages: [String],
                   read: (String) -> String = { $0 },
                   audioLanguages: [String: String] = [:],
                   leadMedia: [MessageCardSubjectMedia] = []) -> MessageCardSubject? {
        let disappears = postDisappears(post)
        guard !disappears || !leadMedia.isEmpty else { return nil }
        let served = post.resolved(preferredLanguages: preferredLanguages)
        let written = disappears ? nil : MessageCardText.nonBlank(served.displayContent)
        let text = written.flatMap { MessageCardText.nonBlank(read($0)) }
        let media = leadMedia + (disappears ? [] : paintableMedia(of: post.media, audioLanguages: audioLanguages))
        guard text != nil || !media.isEmpty else { return nil }
        let isViewer = !viewer.id.isEmpty && post.authorId == viewer.id
        let reply = MessageCardPart(
            author: author(isViewer: isViewer, names: [post.author, post.authorUsername], viewer: viewer),
            text: text ?? "",
            handle: post.authorUsername
        )
        let signed = MessageCardMediaAuthor(reply, isQuoted: false)
        return MessageCardSubject(quoted: nil, reply: reply, sentAt: post.timestamp,
                                  media: media.map { $0.by(signed) }, heroID: leadMedia.first?.media.id)
    }

    private static func postDisappears(_ post: FeedPost) -> Bool {
        let type = (post.type ?? "").uppercased()
        return type == "STORY" || type == "STATUS"
    }
}
