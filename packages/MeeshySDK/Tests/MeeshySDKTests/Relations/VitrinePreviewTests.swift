import Foundation
import Testing
@testable import MeeshySDK

/// L'aperçu de « Voir comme » (#18869) : il se peint TOUT DE SUITE depuis la loi (projection), puis
/// se corrige quand le serveur sert la vue du cercle demandé. Une charge qui n'est pas celle de CE
/// cercle (serveur ancien sans `viewAs`, réponse d'un autre cran arrivée en retard) n'est jamais
/// montrée : elle porterait ma fiche entière sous l'étiquette d'un cercle.
struct VitrinePreviewTests {

    private func served(viewAs: RelationLevel?, circle: ProfileCircleView?) -> PublicProfile {
        PublicProfile(user: MeeshyUser(id: "me", username: "aissa"), circle: circle, viewAs: viewAs)
    }

    @Test func withoutAServedPayloadThePreviewIsProjectedFromTheLaw() {
        let preview = VitrinePreview.make(level: .friend, served: nil)
        #expect(preview.source == .projected)
        #expect(preview.level == .friend)
        #expect(preview.profile == nil)
        #expect(preview.seen == VitrineSeenAs.make(view: ProfileCircleView.seenAs(.friend)))
    }

    @Test func theServedViewOfThisCircleReplacesTheProjection() {
        let view = ProfileCircleView(isSelf: false, level: .close, sharesCommunity: false, capabilities: [
            .presence: ProfileCapabilityState(isOpen: false, circle: .friend, consentRequired: false),
        ])
        let preview = VitrinePreview.make(level: .close, served: served(viewAs: .close, circle: view))
        #expect(preview.source == .served)
        #expect(preview.profile?.user.id == "me")
        #expect(preview.seen.showsPresence == false)
    }

    @Test func anOldServerIgnoringAsIsNeverShown() {
        let preview = VitrinePreview.make(level: .public, served: served(viewAs: nil, circle: nil))
        #expect(preview.source == .projected)
        #expect(preview.profile == nil)
    }

    @Test func aLateAnswerForAnotherCircleIsNeverShown() {
        let late = served(viewAs: .blood, circle: ProfileCircleView.seenAs(.blood))
        let preview = VitrinePreview.make(level: .public, served: late)
        #expect(preview.source == .projected)
        #expect(preview.seen.lockedRows.isEmpty == false)
    }

    @Test func aServedPayloadWithoutItsCircleKeepsTheProjectedRules() {
        let preview = VitrinePreview.make(level: .friend, served: served(viewAs: .friend, circle: nil))
        #expect(preview.source == .served)
        #expect(preview.seen == VitrineSeenAs.make(view: ProfileCircleView.seenAs(.friend)))
    }

    @Test func aMinorOwnerIsProjectedWithTheShield() {
        let preview = VitrinePreview.make(level: .acquaintance, served: nil, ownerMinor: .minor)
        #expect(preview.seen.contact == .write)
        let projected = ProfileCircleView.seenAs(.acquaintance, ownerMinor: .minor)
        #expect(preview.seen == VitrineSeenAs.make(view: projected))
    }

    @Test func thePresenceIsShownOnlyWhenTheCircleOpensItAndTheServerServedIt() {
        let online = PublicProfile(user: MeeshyUser(id: "me", username: "aissa", isOnline: true),
                                   circle: ProfileCircleView.seenAs(.friend), viewAs: .friend)
        #expect(VitrinePreview.make(level: .friend, served: online).isOnline == true)
        #expect(VitrinePreview.make(level: .friend, served: nil).isOnline == false)
        let publicOnline = PublicProfile(user: MeeshyUser(id: "me", username: "aissa", isOnline: true),
                                         circle: ProfileCircleView.seenAs(.public), viewAs: .public)
        #expect(VitrinePreview.make(level: .public, served: publicOnline).isOnline == false)
    }
}
