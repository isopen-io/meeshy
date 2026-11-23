import Foundation
import Testing
@testable import MeeshySDK

/// **Un lien suivi n'est une carte de contenu que si sa résolution le dit**
/// (#19332, contrat § 1), et **le premier lien de CONTENU d'un texte** reçoit
/// la carte — pas forcément son premier lien.
struct ContentLinkResolutionTests {

    private static let id = "66f0c0ffee0000000000c0de"

    // MARK: - Lien suivi résolu

    @Test func trackedContent_typedTrackingTarget_isTheContent() {
        for type in PostType.allCases {
            let resolved = ResolvedTrackedLink(kind: "tracking", targetType: type.rawValue, targetId: Self.id)
            #expect(ContentLinkTarget.trackedContent(of: resolved) == ContentPathTarget(postId: Self.id, type: type))
        }
    }

    @Test func trackedContent_externalTargetWhoseOriginalIsAContentAddress_isThatContent() {
        let resolved = ResolvedTrackedLink(kind: "tracking", targetType: "EXTERNAL",
                                           originalUrl: "https://meeshy.me/reel/\(Self.id)")
        #expect(ContentLinkTarget.trackedContent(of: resolved) == ContentPathTarget(postId: Self.id, type: .reel))
    }

    @Test func trackedContent_typedTargetWithoutObjectId_fallsBackToTheOriginalAddress() {
        let resolved = ResolvedTrackedLink(kind: "tracking", targetType: "POST", targetId: "123",
                                           originalUrl: "https://meeshy.me/post/\(Self.id)")
        #expect(ContentLinkTarget.trackedContent(of: resolved) == ContentPathTarget(postId: Self.id, type: .post))
    }

    @Test func trackedContent_invitationProfileOrSite_isNotAContent() {
        let notContents = [
            ResolvedTrackedLink(kind: "conversation", targetType: "CONVERSATION", targetId: Self.id),
            ResolvedTrackedLink(kind: "tracking", targetType: "PROFILE", targetId: Self.id),
            ResolvedTrackedLink(kind: "tracking", targetType: "EXTERNAL", originalUrl: "https://exemple.org/post/\(Self.id)"),
            ResolvedTrackedLink(kind: "tracking", targetType: "EXTERNAL", originalUrl: "https://meeshy.me/l/Ab3xYz"),
            ResolvedTrackedLink(kind: nil, targetType: "POST", targetId: Self.id),
        ]
        for resolved in notContents {
            #expect(ContentLinkTarget.trackedContent(of: resolved) == nil, "\(resolved.kind ?? "nil") \(resolved.targetType ?? "nil")")
        }
    }

    // MARK: - Le premier lien de contenu d'un texte

    @Test func first_skipsALeadingExternalLink() {
        let urls = ["https://exemple.org/page", "https://meeshy.me/l/Ab3xYz", "https://meeshy.me/post/\(Self.id)"]
        #expect(ContentLinkMatch.first(among: urls) == ContentLinkMatch(url: urls[1], target: .tracked(token: "Ab3xYz")))
    }

    @Test func first_withoutAnyContentLink_isNil() {
        #expect(ContentLinkMatch.first(among: ["https://exemple.org/page", "https://meeshy.me/u/amani"]) == nil)
        #expect(ContentLinkMatch.first(among: []) == nil)
    }

    @Test func first_neverCitesTheCarryingPost_butTakesTheNextContentLink() {
        let other = "66f0c0ffee0000000000beef"
        let urls = ["https://meeshy.me/post/\(Self.id.uppercased())", "https://meeshy.me/reel/\(other)"]
        let match = ContentLinkMatch.first(among: urls, excludingPostId: Self.id)
        #expect(match?.target == .content(ContentPathTarget(postId: other, type: .reel)))
    }

    @Test func first_readsTheLinksOfAText_inReadingOrder() {
        let text = "Regarde https://exemple.org puis 🔗 Publication de Amani : https://meeshy.me/post/\(Self.id)"
        let match = ContentLinkMatch.first(among: LinkPreviewFetcher.urls(in: text))
        #expect(match?.target == .content(ContentPathTarget(postId: Self.id, type: .post)))
        #expect(LinkPreviewFetcher.firstURL(in: text) == LinkPreviewFetcher.urls(in: text).first)
    }
}
