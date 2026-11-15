import XCTest
import MeeshySDK
@testable import Meeshy

/// World Wide se tient en tête de la liste sans être épinglée, et s'archive
/// comme les autres (#10347). Témoins écrits sur les DEUX peaux du
/// groupement — drapeau Lentille OFF (legacy) et ON — par le paramètre
/// `lentilleEnabled`, jamais en écrivant dans `UserDefaults.standard`.
@MainActor
final class ConversationListWorldFirstTests: XCTestCase {

    private let now = Date()

    private func makeConversation(
        id: String,
        identifier: String? = nil,
        type: MeeshyConversation.ConversationType = .direct,
        minutesAgo: Double,
        isPinned: Bool = false,
        sectionId: String? = nil,
        isArchived: Bool = false,
        title: String? = nil
    ) -> Conversation {
        Conversation(
            id: id,
            identifier: identifier ?? id,
            type: type,
            title: title ?? id,
            lastMessageAt: now.addingTimeInterval(-minutesAgo * 60),
            isPinned: isPinned,
            sectionId: sectionId,
            isArchivedByUser: isArchived
        )
    }

    private func makeWorldWide(minutesAgo: Double = 60 * 24 * 30, isPinned: Bool = false, sectionId: String? = nil, isArchived: Bool = false) -> Conversation {
        makeConversation(id: "conv-world", identifier: MeeshyConversation.worldWideIdentifier, type: .global, minutesAgo: minutesAgo, isPinned: isPinned, sectionId: sectionId, isArchived: isArchived, title: "World Wide")
    }

    private func grouped(
        _ conversations: [Conversation],
        filters: Set<ConversationFilter> = [],
        searchText: String = "",
        categories: [ConversationSection] = [],
        lentilleEnabled: Bool
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        let filtered = ConversationListViewModel.filterConversations(conversations, searchText: searchText, filters: filters)
        return ConversationListViewModel.groupConversations(filtered, categories: categories, draftSummaries: [:], lentilleEnabled: lentilleEnabled)
    }

    private func flattenedIds(_ groups: [(section: ConversationSection, conversations: [Conversation])]) -> [String] {
        groups.flatMap { $0.conversations.map(\.id) }
    }

    // MARK: - En tête, épinglée ou non

    func test_groupConversations_lentilleOff_unpinnedInactiveWorldWide_leadsAbovePinnedRecent() {
        let groups = grouped([
            makeConversation(id: "pinned", minutesAgo: 1, isPinned: true),
            makeConversation(id: "recent", minutesAgo: 2),
            makeWorldWide(),
        ], lentilleEnabled: false)

        XCTAssertEqual(groups.first?.section.id, ConversationListWorldHead.sectionId)
        XCTAssertEqual(groups.first?.conversations.map(\.id), ["conv-world"])
        XCTAssertEqual(flattenedIds(groups), ["conv-world", "pinned", "recent"])
    }

    func test_groupConversations_lentilleOn_unpinnedInactiveWorldWide_leadsAbovePinnedRecent() {
        let groups = grouped([
            makeConversation(id: "pinned", minutesAgo: 1, isPinned: true),
            makeConversation(id: "recent", minutesAgo: 2),
            makeWorldWide(),
        ], lentilleEnabled: true)

        XCTAssertEqual(groups.first?.section.id, ConversationListWorldHead.sectionId)
        XCTAssertEqual(flattenedIds(groups), ["conv-world", "pinned", "recent"])
    }

    func test_groupConversations_lentilleOff_worldWideInAUserCategory_stillLeadsAboveEveryCategory() {
        let work = ConversationSection(id: "cat-work", name: "Travail", icon: "briefcase.fill", color: "3498DB", order: 1)
        let groups = grouped([
            makeConversation(id: "pinned", minutesAgo: 1, isPinned: true),
            makeConversation(id: "colleague", minutesAgo: 2, sectionId: "cat-work"),
            makeWorldWide(sectionId: "cat-work"),
        ], categories: [work], lentilleEnabled: false)

        XCTAssertEqual(groups.map(\.section.id), [ConversationListWorldHead.sectionId, "pinned", "cat-work"])
        XCTAssertEqual(flattenedIds(groups), ["conv-world", "pinned", "colleague"])
    }

    func test_groupConversations_pinnedWorldWide_leadsOnce_andLeavesThePinnedSection() {
        for lentilleEnabled in [false, true] {
            let groups = grouped([
                makeConversation(id: "pinned", minutesAgo: 1, isPinned: true),
                makeWorldWide(isPinned: true),
            ], lentilleEnabled: lentilleEnabled)

            XCTAssertEqual(groups.first?.section.id, ConversationListWorldHead.sectionId, "lentille \(lentilleEnabled)")
            XCTAssertEqual(flattenedIds(groups), ["conv-world", "pinned"], "lentille \(lentilleEnabled)")
        }
    }

    // MARK: - Hors de la tête

    func test_groupConversations_archivedWorldWide_isAbsentFromTheMainList() {
        for lentilleEnabled in [false, true] {
            let groups = grouped([
                makeConversation(id: "recent", minutesAgo: 2),
                makeWorldWide(isArchived: true),
            ], lentilleEnabled: lentilleEnabled)

            XCTAssertFalse(groups.contains { ConversationListWorldHead.isHead(sectionId: $0.section.id) }, "lentille \(lentilleEnabled)")
            XCTAssertEqual(flattenedIds(groups), ["recent"], "lentille \(lentilleEnabled)")
        }
    }

    func test_groupConversations_archiveCorpus_worldWideFollowsTheArchivesPath() {
        for lentilleEnabled in [false, true] {
            let groups = grouped([
                makeConversation(id: "archived-recent", minutesAgo: 2, isArchived: true),
                makeWorldWide(isArchived: true),
            ], filters: [.archived], lentilleEnabled: lentilleEnabled)

            XCTAssertFalse(groups.contains { ConversationListWorldHead.isHead(sectionId: $0.section.id) }, "lentille \(lentilleEnabled)")
            XCTAssertEqual(flattenedIds(groups), ["archived-recent", "conv-world"], "lentille \(lentilleEnabled)")
        }
    }

    func test_groupConversations_searchThatExcludesWorldWide_hasNoHead() {
        for lentilleEnabled in [false, true] {
            let groups = grouped([
                makeConversation(id: "amina", minutesAgo: 2),
                makeWorldWide(),
            ], searchText: "amina", lentilleEnabled: lentilleEnabled)

            XCTAssertEqual(flattenedIds(groups), ["amina"], "lentille \(lentilleEnabled)")
        }
    }

    func test_groupConversations_typeFilterThatKeepsWorldWide_leadsWithIt() {
        for lentilleEnabled in [false, true] {
            let groups = grouped([
                makeConversation(id: "meeshy-global", identifier: "meeshy", type: .global, minutesAgo: 1),
                makeWorldWide(),
            ], filters: [.globales], lentilleEnabled: lentilleEnabled)

            XCTAssertEqual(flattenedIds(groups), ["conv-world", "meeshy-global"], "lentille \(lentilleEnabled)")
        }
    }

    func test_groupConversations_meeshyGlobal_isNotLifted() {
        for lentilleEnabled in [false, true] {
            let groups = grouped([
                makeConversation(id: "recent", minutesAgo: 1),
                makeConversation(id: "meeshy-global", identifier: "meeshy", type: .global, minutesAgo: 60),
            ], lentilleEnabled: lentilleEnabled)

            XCTAssertFalse(groups.contains { ConversationListWorldHead.isHead(sectionId: $0.section.id) }, "lentille \(lentilleEnabled)")
            XCTAssertEqual(flattenedIds(groups), ["recent", "meeshy-global"], "lentille \(lentilleEnabled)")
        }
    }

    // MARK: - La tête se rend sans en-tête, toujours dépliée

    func test_isSingleUngroupedSection_headAboveMyConversations_isStillTheFlatList() {
        XCTAssertTrue(ConversationListView.isSingleUngroupedSection(sectionIds: [ConversationListWorldHead.sectionId, "other"]))
        XCTAssertFalse(ConversationListView.isSingleUngroupedSection(sectionIds: [ConversationListWorldHead.sectionId, "pinned", "other"]))
    }

    func test_showsSectionHeader_head_isHidden_otherSectionsKeepTheirs() {
        XCTAssertFalse(ConversationListView.showsSectionHeader(sectionId: ConversationListWorldHead.sectionId, isSingleUngroupedSection: false))
        XCTAssertTrue(ConversationListView.showsSectionHeader(sectionId: "pinned", isSingleUngroupedSection: false))
        XCTAssertFalse(ConversationListView.showsSectionHeader(sectionId: "other", isSingleUngroupedSection: true))
    }

    func test_head_isNeitherCollapsibleNorADropTarget_andAlwaysShowsItsRow() {
        let head = ConversationListWorldHead.sectionId
        XCTAssertFalse(ConversationListView.isSectionCollapsible(sectionId: head))
        XCTAssertFalse(ConversationListView.acceptsSectionDrop(sectionId: head))
        XCTAssertTrue(ConversationListView.isSectionContentVisible(sectionId: head, expandedSections: [], isSingleUngroupedSection: false))
    }
}
