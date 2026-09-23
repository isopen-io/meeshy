import Foundation
import Testing
@testable import MeeshySDK

/// #7350 (I-2) — ce qui RESTE non lu après une lecture partielle, borné par la
/// frontière du premier non-lu (`FirstUnreadBoundary`, S1). Le serveur avance
/// son curseur jusqu'au bout du PRÉFIXE CONTIGU de messages vus depuis la
/// frontière (`MessageReadStatusService.ts`, « mode exact ») : c'est ce que
/// la loi rejoue localement, pour que la ligne de liste montre 94 — et non
/// 0 — dès la fermeture d'un fil où 5 des 99 non-lus ont été affichés.
@Suite("FirstUnreadBoundary.remainingUnread")
struct FirstUnreadRemainingTests {

    private let viewer = "viewer-1"
    private let other = "other-2"
    private let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func unreadWindow(count: Int) -> [FirstUnreadCandidateMessage] {
        (0..<count).map { index in
            FirstUnreadCandidateMessage(
                id: "m\(index)",
                senderId: other,
                createdAt: t0.addingTimeInterval(TimeInterval(index))
            )
        }
    }

    private func remaining(
        window: [FirstUnreadCandidateMessage],
        seen: Set<String>,
        unreadAtOpen: Int,
        windowIsAtTip: Bool,
        caughtUp: String? = nil
    ) -> Int {
        FirstUnreadBoundary.remainingUnread(
            messages: window,
            lastReadMessageId: nil,
            lastReadAt: nil,
            lastReadMessageCreatedAt: nil,
            joinedAt: nil,
            viewerId: viewer,
            seenIds: seen,
            unreadAtOpen: unreadAtOpen,
            windowIsAtTip: windowIsAtTip,
            caughtUpMessageId: caughtUp
        )
    }

    /// Un rattrapage déplace le curseur SERVEUR jusqu'au message rattrapé
    /// (`caughtUpToMessageId`), quels que soient les messages sautés en
    /// descendant. Mesurer ensuite le préfixe depuis la frontière d'OUVERTURE
    /// rendrait 95 — le trou d'avant le rattrapage — là où le serveur dit 1.
    @Test("après un rattrapage, la frontière est le message RATTRAPÉ : un nouveau non vu compte 1")
    func afterCatchingUp_theCaughtUpMessageIsTheFrontier() {
        let window = unreadWindow(count: 100)
        let seen: Set<String> = ["m0", "m1", "m2", "m3", "m4", "m50", "m98"]

        #expect(remaining(window: window, seen: seen, unreadAtOpen: 99, windowIsAtTip: true, caughtUp: "m98") == 1)
    }

    @Test("après un rattrapage sans message plus récent, rien ne reste")
    func afterCatchingUp_withNothingNewer_nothingRemains() {
        let window = unreadWindow(count: 99)

        #expect(remaining(window: window, seen: ["m0", "m98"], unreadAtOpen: 99, windowIsAtTip: true, caughtUp: "m98") == 0)
    }

    @Test("un rattrapé ABSENT de la fenêtre ne déplace rien : la frontière d'ouverture reste")
    func caughtUpOutsideTheWindow_keepsTheOpeningFrontier() {
        let window = unreadWindow(count: 99)
        let seen = Set(window.prefix(5).map(\.id))

        #expect(remaining(window: window, seen: seen, unreadAtOpen: 99, windowIsAtTip: true, caughtUp: "ailleurs") == 94)
    }

    @Test("99 non-lus, 5 affichés ⇒ 94 — la fenêtre tient tous les non-lus")
    func fiveSeenOfNinetyNine_atTip_leavesNinetyFour() {
        let window = unreadWindow(count: 99)
        let seen = Set(window.prefix(5).map(\.id))

        #expect(remaining(window: window, seen: seen, unreadAtOpen: 99, windowIsAtTip: true) == 94)
    }

    @Test("99 non-lus, 5 affichés ⇒ 94 — fenêtre ouverte SUR le séparateur, sans atteindre le présent")
    func fiveSeenOfNinetyNine_windowAroundBoundary_leavesNinetyFour() {
        let window = unreadWindow(count: 30)
        let seen = Set(window.prefix(5).map(\.id))

        #expect(remaining(window: window, seen: seen, unreadAtOpen: 99, windowIsAtTip: false) == 94)
    }

    @Test("seul le préfixe CONTIGU depuis la frontière compte : un trou arrête le curseur")
    func gapInSeenMessages_stopsAtTheGap() {
        let window = unreadWindow(count: 10)
        let seen: Set<String> = ["m0", "m1", "m3", "m4"]

        #expect(remaining(window: window, seen: seen, unreadAtOpen: 10, windowIsAtTip: true) == 8)
    }

    @Test("rien d'affiché ⇒ le compte d'ouverture est rendu intact")
    func nothingSeen_keepsTheOpeningCount() {
        #expect(remaining(window: unreadWindow(count: 12), seen: [], unreadAtOpen: 12, windowIsAtTip: true) == 12)
    }

    @Test("au présent, des non-lus PLUS ANCIENS que la fenêtre retiennent le curseur serveur")
    func olderUnreadOutsideTheWindow_keepTheOpeningCount() {
        let window = unreadWindow(count: 30)
        let seen = Set(window.map(\.id))

        #expect(remaining(window: window, seen: seen, unreadAtOpen: 99, windowIsAtTip: true) == 99)
    }

    @Test("un message du LECTEUR n'est ni compté ni requis dans le préfixe")
    func viewerMessages_areIgnored() {
        let window = [
            FirstUnreadCandidateMessage(id: "a", senderId: other, createdAt: t0),
            FirstUnreadCandidateMessage(id: "mine", senderId: viewer, createdAt: t0.addingTimeInterval(1)),
            FirstUnreadCandidateMessage(id: "b", senderId: other, createdAt: t0.addingTimeInterval(2)),
            FirstUnreadCandidateMessage(id: "c", senderId: other, createdAt: t0.addingTimeInterval(3)),
        ]

        #expect(remaining(window: window, seen: ["a", "b"], unreadAtOpen: 3, windowIsAtTip: true) == 1)
    }

    @Test("jamais négatif, même si le serveur annonçait moins que la fenêtre n'en montre")
    func neverNegative() {
        let window = unreadWindow(count: 8)

        #expect(remaining(window: window, seen: Set(window.map(\.id)), unreadAtOpen: 3, windowIsAtTip: false) == 0)
    }
}
