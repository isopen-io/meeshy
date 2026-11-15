import Foundation
import MeeshySDK
import MeeshyUI

@MainActor
enum ImagerCardRequest {

    static var currentViewer: MessageCardSubject.Viewer {
        let user = AuthManager.shared.currentUser
        return MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName, username: user?.username)
    }

    static func isComposed(_ post: FeedPost) -> Bool {
        ReelSceneRouting.sceneDocument(for: post) != nil || post.storyEffects != nil
    }

    static func post(_ post: FeedPost, quick: Bool = false,
                     viewer: MessageCardSubject.Viewer? = nil,
                     preferredLanguages: [String]? = nil,
                     service: StoryPhotoSaveService = .shared) -> MessageCardExportRequest? {
        let viewer = viewer ?? currentViewer
        let lead = isComposed(post) ? MessageCardLead(id: "scene:\(post.id)") { await service.renderSceneFile(of: post) } : nil
        var painted = post
        if lead != nil { painted.media = [] }
        let audio = MessageCardExportMenu.servedAudioLanguages(
            of: painted.media, originalLanguage: post.originalLanguage,
            prism: ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved)
        guard let subject = MessageCardSubject.of(
            post: painted, viewer: viewer,
            preferredLanguages: preferredLanguages ?? ReaderPrism.resolve(for: AuthManager.shared.currentUser),
            read: MessageTextRenderer.plainText, audioLanguages: audio,
            leadMedia: lead.map { [$0.placeholder] } ?? []
        ) else { return nil }
        return request(subject, accentColor: post.authorColor, viewer: viewer, quick: quick, lead: lead)
    }

    static func story(_ story: StoryItem, author: StoryExportAuthor?, accentColor: String, quick: Bool = false,
                      service: StoryPhotoSaveService = .shared) -> MessageCardExportRequest {
        let lead = MessageCardLead(id: "story:\(story.id)") { await service.renderStoryWorkFile(of: story, author: author) }
        return work(lead: lead, authorName: author?.name, sentAt: story.createdAt, accentColor: accentColor, quick: quick)
    }

    static func scene(_ scene: GallerySceneItem, accentColor: String, quick: Bool = false,
                      service: StoryPhotoSaveService = .shared) -> MessageCardExportRequest {
        let lead = MessageCardLead(id: scene.id) { await service.renderSceneFile(of: scene) }
        return work(lead: lead, authorName: scene.authorUsername, sentAt: scene.carrier.createdAt,
                    accentColor: accentColor, quick: quick)
    }

    private static func work(lead: MessageCardLead, authorName: String?, sentAt: Date, accentColor: String,
                             quick: Bool) -> MessageCardExportRequest {
        let name = authorName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let reply = MessageCardPart(author: name.isEmpty ? "Meeshy" : name, text: "", handle: name.isEmpty ? nil : name)
        let signed = MessageCardMediaAuthor(name: reply.author, handle: reply.handle)
        let subject = MessageCardSubject(quoted: nil, reply: reply, sentAt: sentAt,
                                         media: [lead.placeholder.by(signed)], heroID: lead.id)
        return request(subject, accentColor: accentColor, viewer: currentViewer, quick: quick, lead: lead)
    }

    private static func request(_ subject: MessageCardSubject, accentColor: String, viewer: MessageCardSubject.Viewer,
                                quick: Bool, lead: MessageCardLead?) -> MessageCardExportRequest {
        MessageCardExportRequest(
            subject: subject,
            languages: [],
            subjectIn: { _ in nil },
            handle: viewer.username,
            conversationTitle: nil,
            accentColor: accentColor,
            quick: quick,
            lead: lead
        )
    }
}

extension MessageCardExportRequest {
    var quickly: MessageCardExportRequest {
        MessageCardExportRequest(subject: subject, languages: languages, subjectIn: subjectIn, handle: handle,
                                 conversationTitle: conversationTitle, accentColor: accentColor, quick: true,
                                 composition: composition, lead: lead)
    }
}
