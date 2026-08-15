import XCTest
@testable import Meeshy

/// F-087 (WS-8) — `EpisodeSegmenter.segment` : coupure sur trou temporel
/// > 6 h, changement complet de locuteurs, ou franchissement de jour ;
/// fusion des petits épisodes ; plafond 8. Critères §WS-8 (vol. 2 cas 06·A/B).
final class EpisodeSegmenterTests: XCTestCase {

    private let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()
    private let locale = Locale(identifier: "fr_FR")

    private func date(_ day: Int, _ hour: Int = 12, _ minute: Int = 0) -> Date {
        var comps = DateComponents()
        comps.year = 2026; comps.month = 1; comps.day = day; comps.hour = hour; comps.minute = minute
        return calendar.date(from: comps)!
    }

    private func message(
        _ id: String, sender: String, day: Int, hour: Int = 12, minute: Int = 0, reply: String? = nil, system: Bool = false
    ) -> EpisodeInputMessage {
        EpisodeInputMessage(id: id, senderId: sender, createdAt: date(day, hour, minute), replyToId: reply, isSystem: system)
    }

    // MARK: - Cas de base

    func test_emptyInput_producesNoEpisodes() {
        XCTAssertEqual(EpisodeSegmenter.segment(messages: [], calendar: calendar, locale: locale), [])
    }

    func test_singleMessage_producesOneEpisodeContainingIt() {
        let messages = [message("m1", sender: "u1", day: 1)]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertEqual(episodes.count, 1)
        XCTAssertEqual(episodes[0].messageIds, ["m1"])
    }

    // MARK: - Partition exacte (critère §WS-8 : « 100 messages / 5 jours ⇒ ≤ 8 épisodes »)

    func test_hundredMessagesOverFiveDays_producesAtMostEightNonEmptyEpisodes_exactPartition() {
        var messages: [EpisodeInputMessage] = []
        var idx = 0
        for day in 1...5 {
            for hour in stride(from: 8, to: 28, by: 1) where idx < 100 {
                let sender = "u\(idx % 4)"
                messages.append(message("m\(idx)", sender: sender, day: day + hour / 24, hour: hour % 24))
                idx += 1
            }
        }
        messages = Array(messages.prefix(100))

        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)

        XCTAssertLessThanOrEqual(episodes.count, EpisodeSegmenter.maxEpisodes)
        XCTAssertTrue(episodes.allSatisfy { !$0.messageIds.isEmpty })

        let allIds = episodes.flatMap(\.messageIds)
        XCTAssertEqual(Set(allIds).count, allIds.count, "aucun id ne doit apparaître dans deux épisodes")
        XCTAssertEqual(Set(allIds), Set(messages.map(\.id)), "partition EXACTE — tous les ids, aucun de plus")
    }

    // MARK: - Coupure sur trou temporel > 6h

    func test_gapOverSixHours_cutsANewEpisode() {
        let messages = [
            message("m1", sender: "u1", day: 1, hour: 8),
            message("m2", sender: "u1", day: 1, hour: 9),
            message("m3", sender: "u1", day: 1, hour: 10),
            message("m4", sender: "u1", day: 1, hour: 11),
            // > 6h gap
            message("m5", sender: "u1", day: 1, hour: 20),
            message("m6", sender: "u1", day: 1, hour: 21),
            message("m7", sender: "u1", day: 1, hour: 22),
            message("m8", sender: "u1", day: 1, hour: 23),
        ]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertEqual(episodes.count, 2)
        XCTAssertEqual(episodes[0].messageIds, ["m1", "m2", "m3", "m4"])
        XCTAssertEqual(episodes[1].messageIds, ["m5", "m6", "m7", "m8"])
    }

    func test_gapUnderSixHours_staysInSameEpisode() {
        let messages = [
            message("m1", sender: "u1", day: 1, hour: 8),
            message("m2", sender: "u1", day: 1, hour: 10),
            message("m3", sender: "u1", day: 1, hour: 12),
            message("m4", sender: "u1", day: 1, hour: 13),
        ]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertEqual(episodes.count, 1)
    }

    // MARK: - Franchissement de jour

    func test_dayBoundaryCrossing_cutsANewEpisode() {
        let messages = [
            message("m1", sender: "u1", day: 1, hour: 22),
            message("m2", sender: "u1", day: 1, hour: 23),
            message("m3", sender: "u1", day: 1, hour: 23, minute: 30),
            message("m4", sender: "u1", day: 1, hour: 23, minute: 45),
            // < 6h gap but crosses midnight
            message("m5", sender: "u1", day: 2, hour: 1),
            message("m6", sender: "u1", day: 2, hour: 1, minute: 30),
            message("m7", sender: "u1", day: 2, hour: 2),
            message("m8", sender: "u1", day: 2, hour: 2, minute: 30),
        ]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertEqual(episodes.count, 2)
        XCTAssertEqual(episodes[0].messageIds, ["m1", "m2", "m3", "m4"])
    }

    // MARK: - Fusion des petits épisodes dans le voisin le plus proche

    func test_tinyEpisode_isMergedIntoNearestNeighbor_neverLeftAlone() {
        let messages = [
            message("m1", sender: "u1", day: 1, hour: 8),
            message("m2", sender: "u1", day: 1, hour: 9),
            message("m3", sender: "u1", day: 1, hour: 10),
            message("m4", sender: "u1", day: 1, hour: 11),
            // gap > 6h : nouvel épisode, mais SEULEMENT 2 messages (< minEpisodeMessages)
            message("m5", sender: "u1", day: 1, hour: 20),
            message("m6", sender: "u1", day: 1, hour: 21),
        ]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        // Le second groupe (2 messages) est fusionné — aucun épisode < 4
        // messages ne doit survivre s'il existe un voisin à fusionner dedans.
        XCTAssertTrue(episodes.allSatisfy { $0.messageIds.count >= EpisodeSegmenter.minEpisodeMessages })
        XCTAssertEqual(episodes.flatMap(\.messageIds).count, 6)
    }

    // MARK: - Plafond maxEpisodes

    func test_manyGaps_stillCapsAtMaxEpisodes() {
        // 20 groupes de 4 messages, chacun séparé par > 6h — sans plafond,
        // ça ferait 20 épisodes.
        var messages: [EpisodeInputMessage] = []
        for group in 0..<20 {
            let day = 1 + group / 3
            let hourBase = (group % 3) * 8
            for offset in 0..<4 {
                messages.append(message("g\(group)_m\(offset)", sender: "u1", day: day, hour: hourBase, minute: offset))
            }
        }
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertLessThanOrEqual(episodes.count, EpisodeSegmenter.maxEpisodes)
        XCTAssertEqual(Set(episodes.flatMap(\.messageIds)).count, messages.count, "partition exacte préservée après plafonnement")
    }

    // MARK: - Titre déterministe TOUJOURS présent

    func test_deterministicTitle_isAlwaysPresent_andAgentTitleIsNil() {
        let messages = [
            message("m1", sender: "u1", day: 1, hour: 8),
            message("m2", sender: "u1", day: 1, hour: 9),
        ]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertFalse(episodes[0].deterministicTitle.isEmpty)
        XCTAssertTrue(episodes[0].deterministicTitle.contains("·"))
        XCTAssertNil(episodes[0].agentTitle)
        XCTAssertFalse(episodes[0].isAgentTitled)
        XCTAssertEqual(episodes[0].displayTitle, episodes[0].deterministicTitle)
    }

    func test_deterministicTitle_stableAcrossRepeatedComputation() {
        let messages = [
            message("m1", sender: "u1", day: 1, hour: 8),
            message("m2", sender: "u1", day: 1, hour: 9),
            message("m3", sender: "u1", day: 3, hour: 9),
        ]
        let first = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        let second = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertEqual(first.map(\.deterministicTitle), second.map(\.deterministicTitle))
    }

    // MARK: - Participants déduits, triés

    func test_participantIds_areDeduplicatedAndSorted() {
        let messages = [
            message("m1", sender: "uB", day: 1, hour: 8),
            message("m2", sender: "uA", day: 1, hour: 9),
            message("m3", sender: "uB", day: 1, hour: 10),
        ]
        let episodes = EpisodeSegmenter.segment(messages: messages, calendar: calendar, locale: locale)
        XCTAssertEqual(episodes[0].participantIds, ["uA", "uB"])
    }
}
