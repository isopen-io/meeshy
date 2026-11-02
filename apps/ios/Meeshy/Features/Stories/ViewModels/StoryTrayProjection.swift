import Foundation
import MeeshySDK
import MeeshyUI

nonisolated struct StoryTrayProjection {
    static let empty = StoryTrayProjection(groups: [], ownerId: nil, at: .distantPast)

    let ownerId: String?
    let computedAt: Date

    private let cachedVisible: [StoryGroup]
    private let groups: [StoryGroup]
    private let indexByUserId: [String: Int]
    private let groupByUserId: [String: StoryGroup]

    init(groups: [StoryGroup], ownerId: String?, at now: Date) {
        self.ownerId = ownerId
        self.computedAt = now
        self.groups = groups
        self.cachedVisible = Self.visible(in: groups, excluding: ownerId ?? "", at: now)
        self.indexByUserId = Dictionary(
            groups.enumerated().map { offset, group in (group.id, offset) },
            uniquingKeysWith: { first, _ in first }
        )
        self.groupByUserId = Dictionary(
            groups.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    func visibleGroups(for userId: String, at now: Date) -> [StoryGroup] {
        let age = now.timeIntervalSince(computedAt)
        guard userId == (ownerId ?? ""), age >= 0, age < Self.freshnessWindow else {
            return Self.visible(in: groups, excluding: userId, at: now)
        }
        return cachedVisible
    }

    func ownGroup(for userId: String) -> StoryGroup? {
        guard !userId.isEmpty else { return nil }
        return groupByUserId[userId]
    }

    func group(forUserId userId: String) -> StoryGroup? {
        groupByUserId[userId]
    }

    func index(forUserId userId: String) -> Int? {
        indexByUserId[userId]
    }

    func ringState(forUserId userId: String, at now: Date) -> StoryRingState {
        guard let group = groupByUserId[userId], !group.isFullyExpired(at: now) else { return .none }
        return group.hasUnviewed ? .unread : .read
    }

    private static var freshnessWindow: TimeInterval {
        TimeInterval(StoryViewModel.expirySweepInterval.components.seconds)
    }

    private static func visible(in groups: [StoryGroup], excluding userId: String, at now: Date) -> [StoryGroup] {
        groups.filter { $0.id != userId && !$0.isFullyExpired(at: now) }
    }
}
