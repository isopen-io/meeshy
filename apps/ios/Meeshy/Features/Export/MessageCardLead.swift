import Foundation
import MeeshySDK

struct MessageCardLead {
    let id: String
    let render: @MainActor () async -> URL?

    static let videoExtensions: Set<String> = ["mp4", "mov", "m4v"]

    var placeholder: MessageCardSubjectMedia {
        MessageCardSubjectMedia(media: MessageCardMedia(id: id, kind: .video, aspect: Double(SceneShape.aspect)), fileURL: "")
    }

    func media(rendered file: URL) -> MessageCardSubjectMedia {
        let kind: MessageCardMediaKind = Self.videoExtensions.contains(file.pathExtension.lowercased()) ? .video : .image
        return MessageCardSubjectMedia(media: MessageCardMedia(id: id, kind: kind, aspect: Double(SceneShape.aspect)),
                                       fileURL: file.absoluteString)
    }
}

extension MessageCardSubject {
    func replacing(lead: MessageCardSubjectMedia) -> MessageCardSubject {
        MessageCardSubject(quoted: quoted, reply: reply, sentAt: sentAt, quotedAt: quotedAt,
                           media: media.map { $0.media.id == lead.media.id ? lead.by($0.author) : $0 },
                           heroID: heroID)
    }
}
