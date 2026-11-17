import Foundation
import Testing
@testable import MeeshySDK

/// « VOIR COMME » (#18869, planche `Moi-Apercu`) — ce que ma Vitrine montre à un lecteur d'un cercle,
/// ce qu'elle lui ferme et le cercle qui l'ouvre, et ce que chaque cercle AJOUTE. Tout se lit dans
/// la fiche par cercle, elle-même verdict de la loi d'accès : aucune liste écrite à la main.
struct VitrineSeenAsTests {

    @Test func aPublicReaderCanOnlyAskToWrite() {
        let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(.public))
        #expect(seen.contact == .requestToWrite)
        #expect(seen.showsPresence == false)
        #expect(seen.showsGame == false)
    }

    @Test func anAcquaintanceWritesDirectly() {
        let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(.acquaintance))
        #expect(seen.contact == .write)
    }

    @Test func aPublicReaderSeesEveryGuardedRowLockedWithTheCircleThatOpensIt() {
        let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(.public))
        #expect(seen.lockedRows == [
            VitrineSeenAs.LockedRow(row: .presence, opensAt: .friend),
            VitrineSeenAs.LockedRow(row: .game, opensAt: .friend),
            VitrineSeenAs.LockedRow(row: .sparks, opensAt: .close),
            VitrineSeenAs.LockedRow(row: .device, opensAt: .close),
            VitrineSeenAs.LockedRow(row: .liveLocation, opensAt: .blood),
        ])
    }

    @Test func aFriendSeesPresenceAndGameButNotSparks() {
        let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(.friend))
        #expect(seen.showsPresence)
        #expect(seen.showsGame)
        #expect(seen.lockedRows.map(\.row) == [.sparks, .device, .liveLocation])
    }

    @Test func aBloodReaderHasNothingLocked() {
        let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(.blood))
        #expect(seen.lockedRows.isEmpty)
    }

    @Test func aServedViewWithoutCapabilitiesLocksEverything() {
        let empty = ProfileCircleView(isSelf: false, level: .blood, sharesCommunity: false, capabilities: [:])
        let seen = VitrineSeenAs.make(view: empty)
        #expect(seen.contact == .unavailable)
        #expect(seen.showsPresence == false)
        #expect(seen.lockedRows.map(\.row) == VitrineSeenAs.Row.allCases)
        #expect(seen.lockedRows.map(\.opensAt) == [.friend, .friend, .close, .close, .blood])
    }

    @Test func theLadderRunsFromPublicToBlood() {
        #expect(VitrineLadder.steps.map(\.level) == RelationLevel.allCases)
    }

    @Test func eachStepAddsExactlyTheFeaturesTheLawOpensThere() {
        for step in VitrineLadder.steps {
            for feature in step.features {
                #expect(feature.minimumLevel == step.level, "\(feature.rawValue)")
            }
        }
        let listed = Set(VitrineLadder.steps.flatMap(\.features))
        let expected = Set(RelationFeature.allCases).subtracting(VitrineLadder.unannounced)
        #expect(listed == expected)
    }

    @Test func theLadderNeverAnnouncesTheAutomaticAcquaintance() {
        #expect(VitrineLadder.steps.flatMap(\.features).contains(.acquaintanceAuto) == false)
    }

    @Test func theCommunityStepAddsTheNameInWhoViewed() {
        let community = VitrineLadder.steps.first { $0.level == .community }
        #expect(community?.features == [.viewsIdentity])
    }

    @Test func theCurrentStepIsTheOneOfTheCircleSeen() {
        #expect(VitrineLadder.isReached(.friend, seenAs: .close))
        #expect(VitrineLadder.isReached(.blood, seenAs: .close) == false)
    }
}
