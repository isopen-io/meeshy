import Testing
import Foundation
@testable import MeeshySDK

/// Le plan de l'écran de partage unique (#10949, #10947) — la table reprend CAS
/// POUR CAS celle du témoin TypeScript (`packages/shared/utils/share-plan.test.ts`) :
/// mêmes entrées, mêmes verdicts. Une ligne ajoutée d'un côté s'ajoute de l'autre.
@Suite("SharePlanner — un seul écran de partage, la loi de sortie décide")
struct SharePlanTests {

    private static let mb = 1024 * 1024
    private static let ephemeral = MessageEffectFlags.ephemeral.rawValue
    private static let afterRead = MessageEffectFlags.ephemeralAfterRead.rawValue
    private static let blurredBit = MessageEffectFlags.blurred.rawValue

    private static func image(_ id: String = "img") -> ShareMedia { ShareMedia(id: id, mimeType: "image/jpeg", bytes: 2 * mb) }
    private static func video(_ id: String = "vid", durationMs: Int = 14_000) -> ShareMedia {
        ShareMedia(id: id, mimeType: "video/mp4", bytes: 20 * mb, durationMs: durationMs)
    }
    private static func audio(_ id: String = "aud") -> ShareMedia { ShareMedia(id: id, mimeType: "audio/m4a", bytes: mb, durationMs: 30_000) }
    private static func file(_ id: String = "doc") -> ShareMedia { ShareMedia(id: id, mimeType: "application/pdf", bytes: mb) }

    private static func message(
        id: String = "m1",
        text: String? = "Bonjour",
        isViewOnce: Bool? = nil,
        isBlurred: Bool? = nil,
        effectFlags: UInt32? = nil,
        ephemeralDuration: Double? = nil,
        encrypted: Bool = false,
        citesProtected: Bool = false,
        pieces: [ShareMedia] = []
    ) -> ShareMessage {
        ShareMessage(
            id: id, text: text, isViewOnce: isViewOnce, isBlurred: isBlurred, effectFlags: effectFlags,
            ephemeralDuration: ephemeralDuration, encrypted: encrypted, citesProtected: citesProtected, pieces: pieces
        )
    }

    private static func actions(_ entry: ShareEntry) -> Set<ShareAction> { Set(SharePlanner.plan(entry: entry).actions) }

    struct Row: Sendable {
        let label: String
        let entry: ShareEntry
        let expected: Set<ShareAction>
    }

    static let matrix: [Row] = [
        Row(label: "texte venu d’une autre app", entry: .text("Hello"), expected: [.send, .publishPost, .publishStory, .studio]),
        Row(label: "lien", entry: .link(url: "https://festival-lumiere.org", text: nil),
            expected: [.send, .caption, .publishPost, .publishStory, .studio, .copyLink, .shareOut]),
        Row(label: "1 image", entry: .media([image()], text: nil), expected: [.send, .caption, .publishPost, .publishStory, .studio]),
        Row(label: "1 vidéo qui qualifie", entry: .media([video()], text: nil),
            expected: [.send, .caption, .publishPost, .publishStory, .publishReel, .studio]),
        Row(label: "2 à 20 médias", entry: .media([image("a"), image("b"), video("c")], text: nil),
            expected: [.send, .caption, .reorder, .grouping, .publishPost, .publishStory, .publishReel, .studio]),
        Row(label: "un audio : story sur fond uni et post audio, jamais un réel (D13)", entry: .media([audio()], text: nil),
            expected: [.send, .caption, .publishPost, .publishStory, .studio]),
        Row(label: "un fichier", entry: .media([file()], text: nil), expected: [.send, .caption]),
        Row(label: "deux fichiers", entry: .media([file("a"), file("b")], text: nil), expected: [.send, .caption, .reorder, .grouping]),
        Row(label: "une pièce d’un message (#9914)",
            entry: .piece(message: message(pieces: [image("p1"), image("p2"), image("p3")]), attachmentId: "p3"),
            expected: [.send, .caption, .publishPost, .publishStory, .studio, .save, .shareOut]),
        Row(label: "un message entier à une photo", entry: .messages([message(pieces: [image("p1")])]),
            expected: [.send, .caption, .publishPost, .publishStory, .studio, .save, .imager, .copyText, .shareOut]),
        Row(label: "un message entier à plusieurs pièces : ses pièces se retirent",
            entry: .messages([message(pieces: [image("p1"), image("p2")])]),
            expected: [.send, .caption, .reorder, .publishPost, .publishStory, .publishReel, .studio, .save, .imager, .copyText, .shareOut]),
        Row(label: "un message texte", entry: .messages([message()]), expected: [.send, .caption, .imager, .copyText]),
        Row(label: "plusieurs messages", entry: .messages([message(id: "a"), message(id: "b")]),
            expected: [.send, .caption, .reorder, .imager, .copyText]),
        Row(label: "une publication", entry: .card(.post, url: "https://meeshy.me/p/1"),
            expected: [.send, .caption, .publishPost, .publishStory, .copyLink, .shareOut]),
        Row(label: "une story — republiable et recomposable (D14, #12644)", entry: .card(.story, url: "https://meeshy.me/s/1"),
            expected: [.send, .caption, .publishPost, .publishStory, .publishReel, .studio, .copyLink, .shareOut]),
        Row(label: "un réel", entry: .card(.reel, url: "https://meeshy.me/r/1"),
            expected: [.send, .caption, .publishPost, .publishStory, .copyLink, .shareOut]),
        Row(label: "un profil (D15)", entry: .card(.profile, url: "https://meeshy.me/u/lea"), expected: [.send, .caption, .copyLink, .shareOut]),
        Row(label: "une invitation", entry: .card(.invitation, url: "https://meeshy.me/join/x"), expected: [.send, .caption, .copyLink, .shareOut]),
    ]

    @Test("entrées × actions (contenu ordinaire), la matrice de la planche", arguments: matrix)
    func entryActions(row: Row) {
        #expect(Self.actions(row.entry) == row.expected, "\(row.label)")
    }

    @Test func singlePhotoIsNotAReelAndSaysWhy() {
        let plan = SharePlanner.plan(entry: .media([Self.image()], text: nil))
        #expect(plan.withheld.contains(ShareWithheld(action: .publishReel, reason: .singlePhotoNotAReel)))
    }

    @Test func shortVideoDoesNotQualifyAsReel() {
        let plan = SharePlanner.plan(entry: .media([Self.video("v", durationMs: 1_000)], text: nil))
        #expect(!plan.actions.contains(.publishReel))
        #expect(plan.withheld.contains(ShareWithheld(action: .publishReel, reason: .notAReel)))
    }

    @Test func mixOfFilesAndMediaDoesNotPublish() {
        #expect(!Self.actions(.media([Self.image(), Self.file()], text: nil)).contains(.publishPost))
    }

    @Test func overTenMediaWithdrawsPublicationWithReason() {
        let media = (0...ShareLimits.maxPublicationMedia).map { Self.image("i\($0)") }
        let plan = SharePlanner.plan(entry: .media(media, text: nil))
        #expect(!plan.actions.contains(.publishPost))
        #expect(plan.withheld.contains(ShareWithheld(action: .publishPost, reason: .tooManyForPublication)))
    }

    @Test func titleSaysForwardWhenSourceIsAMessage() {
        #expect(SharePlanner.plan(entry: .messages([Self.message()])).title == .forward)
        #expect(SharePlanner.plan(entry: .piece(message: Self.message(pieces: [Self.image("p")]), attachmentId: "p")).title == .forward)
        #expect(SharePlanner.plan(entry: .media([Self.image()], text: nil)).title == .send)
    }

    // MARK: - Nature du contenu × actions

    @Test func timedFlameForwardsWithPreselectedDurationAndNothingElse() {
        let plan = SharePlanner.plan(entry: .messages([Self.message(effectFlags: Self.ephemeral, ephemeralDuration: 3600)]))
        #expect(Set(plan.actions) == [.send, .caption])
        #expect(plan.flameMaxDurationSeconds == 3600)
        #expect(plan.withheld.map(\.reason).contains(.flame))
        #expect(plan.withheld.map(\.action).contains(.imager))
        #expect(plan.withheld.map(\.action).contains(.copyText))
    }

    @Test func viewOnceInASelectionIsWithdrawnAndTheRestKeepsItsOrder() {
        let plan = SharePlanner.plan(entry: .messages([
            Self.message(id: "a"), Self.message(id: "b"),
            Self.message(id: "c", isViewOnce: true, pieces: [Self.image("p")]), Self.message(id: "d"),
        ]))
        #expect(plan.kept == ["a", "b", "d"])
        #expect(plan.withdrawn == [ShareWithdrawal(id: "c", reason: .viewOnce)])
        #expect(plan.blocked == nil)
        #expect(plan.canSend == false)
    }

    @Test func afterReadFlameIsWithdrawnLikewise() {
        let plan = SharePlanner.plan(entry: .messages([
            Self.message(id: "a"), Self.message(id: "b", effectFlags: Self.ephemeral | Self.afterRead),
        ]))
        #expect(plan.withdrawn == [ShareWithdrawal(id: "b", reason: .afterRead)])
    }

    @Test func everythingProtectedBlocksAndNothingLeaves() {
        let plan = SharePlanner.plan(entry: .messages([Self.message(isViewOnce: true)]))
        #expect(plan.blocked == .viewOnce)
        #expect(plan.actions.isEmpty)
        #expect(plan.canSend == false)
    }

    @Test func aViewOncePieceDoesNotForwardAlone() {
        var piece = Self.image("b")
        piece.isViewOnce = true
        let plan = SharePlanner.plan(entry: .piece(message: Self.message(pieces: [Self.image("a"), piece]), attachmentId: "b"))
        #expect(plan.blocked == .viewOnce)
    }

    @Test func aPieceOutsideTheMessageDoesNotLeave() {
        let plan = SharePlanner.plan(entry: .piece(message: Self.message(pieces: [Self.image("a")]), attachmentId: "zzz"))
        #expect(plan.blocked == .unavailable)
    }

    @Test func blurredForwardsWithInheritedBlurAndNothingElse() {
        let plan = SharePlanner.plan(entry: .messages([Self.message(isBlurred: true, effectFlags: Self.blurredBit, pieces: [Self.image("p")])]))
        #expect(Set(plan.actions) == [.send, .caption])
        #expect(plan.blurInherited)
        #expect(plan.withheld.contains(ShareWithheld(action: .publishPost, reason: .blurred)))
        #expect(plan.withheld.contains(ShareWithheld(action: .save, reason: .blurred)))
    }

    @Test func aBlurredPieceInTheForwardedMessageIsInherited() {
        var blurred = Self.image("b")
        blurred.isBlurred = true
        let plan = SharePlanner.plan(entry: .messages([Self.message(pieces: [Self.image("a"), blurred])]))
        #expect(plan.blurInherited)
        #expect(!plan.actions.contains(.save))
    }

    @Test func encryptedDoesNotPublishCopiesOnDeviceAndWarnsTowardsClearDestinations() {
        let plan = SharePlanner.plan(
            entry: .messages([Self.message(encrypted: true)]),
            destinations: [
                ShareDestination(id: "compta", encrypted: true),
                ShareDestination(id: "equipe", encrypted: false),
                ShareDestination(id: "ana"),
            ]
        )
        #expect(!plan.actions.contains(.publishPost))
        #expect(Set(plan.actions).isSuperset(of: [.send, .copyText, .imager]))
        #expect(plan.encryption == ShareEncryption(warnDestinationIds: ["equipe", "ana"]))
    }

    @Test func anEncryptedPieceKeepsSaveAndLosesPublication() {
        let plan = SharePlanner.plan(entry: .piece(message: Self.message(encrypted: true, pieces: [Self.image("a")]), attachmentId: "a"))
        #expect(plan.actions.contains(.save))
        #expect(plan.withheld.contains(ShareWithheld(action: .publishStory, reason: .encrypted)))
        #expect(plan.encryption?.copyOnDevice == true)
    }

    @Test func aClearSourceWarnsOfNothing() {
        #expect(SharePlanner.plan(entry: .messages([Self.message()]), destinations: [ShareDestination(id: "x")]).encryption == nil)
    }

    @Test func aMessageCitingProtectedContentDoesNotImage() {
        let plan = SharePlanner.plan(entry: .messages([Self.message(citesProtected: true)]))
        #expect(!plan.actions.contains(.imager))
        #expect(plan.withheld.contains(ShareWithheld(action: .imager, reason: .citesProtected)))
    }

    // MARK: - Ensemble / séparément, légende (D3, D4)

    @Test func togetherByDefaultFromTwoPiecesAndCaptionIsTheMessageText() {
        let plan = SharePlanner.plan(entry: .media([Self.image("a"), Self.image("b")], text: nil))
        #expect(plan.grouping == .together)
        #expect(plan.caption == ShareCaption(placement: .messageText))
        #expect(plan.caption?.maxLength == 5000)
    }

    @Test func aSinglePieceOffersNoGrouping() {
        #expect(SharePlanner.plan(entry: .media([Self.image()], text: nil)).grouping == nil)
    }

    @Test func aForwardCaptionLeavesAsASeparateMessage() {
        #expect(SharePlanner.plan(entry: .messages([Self.message()])).caption?.placement == .separateMessage)
        #expect(SharePlanner.plan(entry: .piece(message: Self.message(pieces: [Self.image("p")]), attachmentId: "p")).caption?.placement == .separateMessage)
    }

    @Test func aTextFromAnotherAppHasNoCaption() {
        #expect(SharePlanner.plan(entry: .text("x")).caption == nil)
    }

    // MARK: - Plafonds (D10, V9)

    @Test func twoFilesOverTheFileCapTrimTheLastTwo() {
        let media = (0..<(ShareLimits.maxFiles + 2)).map { ShareMedia(id: "f\($0)", mimeType: "image/jpeg", bytes: Self.mb) }
        let plan = SharePlanner.plan(entry: .media(media, text: nil), destinations: [ShareDestination(id: "d")])
        #expect(plan.limits.files == ShareLimits.maxFiles + 2)
        #expect(plan.limits.trimCount == 2)
        #expect(plan.canSend == false)
    }

    @Test func bytesAloneCanForceATrim() {
        let overHalf = ShareLimits.maxTotalBytes / 2 + Self.mb
        let media = [
            ShareMedia(id: "a", mimeType: "video/mp4", bytes: overHalf, durationMs: 10_000),
            ShareMedia(id: "b", mimeType: "video/mp4", bytes: overHalf, durationMs: 10_000),
        ]
        #expect(SharePlanner.plan(entry: .media(media, text: nil)).limits.trimCount == 1)
    }

    @Test func beyondTenRecipientsSendingWaits() {
        let destinations = (0...ShareLimits.maxRecipients).map { ShareDestination(id: "d\($0)") }
        let plan = SharePlanner.plan(entry: .text("x"), destinations: destinations)
        #expect(plan.limits.overRecipients == 1)
        #expect(plan.canSend == false)
    }

    @Test func underTheCapsWithOneRecipientWeSend() {
        #expect(SharePlanner.plan(entry: .media([Self.image()], text: nil), destinations: [ShareDestination(id: "ana")]).canSend)
    }

    @Test func withoutRecipientNothingLeavesYet() {
        #expect(SharePlanner.plan(entry: .media([Self.image()], text: nil)).canSend == false)
    }

    @Test func limitsMirrorTheSharedPackage() {
        #expect(ShareLimits.maxFiles == 100)
        #expect(ShareLimits.maxTotalBytes == 5 * 1024 * 1024 * 1024)
        #expect(ShareLimits.maxRecipients == 10)
        #expect(ShareLimits.maxPublicationMedia == 10)
    }
}
