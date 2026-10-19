import Foundation
import UIKit
import MeeshySDK

protocol CallActivityAvatarSourcing: Sendable {
    func avatarImageData(forUserId userId: String) async -> Data?
}

struct LiveCallActivityAvatarSource: CallActivityAvatarSourcing {
    static let requestedPixelSize = CGFloat(LiveActivityAvatarStore.maxPixelSize * 2)

    func avatarImageData(forUserId userId: String) async -> Data? {
        guard let url = await avatarURL(forUserId: userId) else { return nil }
        let image = await CacheCoordinator.shared.images.image(for: url, maxPixelSize: Self.requestedPixelSize)
        return image?.pngData()
    }

    private func avatarURL(forUserId userId: String) async -> String? {
        switch await CacheCoordinator.shared.profiles.load(for: userId) {
        case .fresh(let users, _), .stale(let users, _):
            return users.first?.avatar.flatMap { $0.isEmpty ? nil : $0 }
        case .expired, .empty:
            return nil
        }
    }
}

@MainActor
protocol CallActivityAvatarPublishing: AnyObject {
    @discardableResult
    func publish(
        activityID: String,
        remoteUserId: String,
        onPublished: @escaping @MainActor () -> Void
    ) -> Task<Void, Never>
    func withdraw(activityID: String)
    func sweep(keeping activityIDs: Set<String>)
}

@MainActor
final class CallActivityAvatarPublisher: CallActivityAvatarPublishing {
    nonisolated deinit {}

    private let source: any CallActivityAvatarSourcing
    private let store: LiveActivityAvatarStore?
    private var tasks: [String: Task<Void, Never>] = [:]

    init(
        source: any CallActivityAvatarSourcing = LiveCallActivityAvatarSource(),
        store: LiveActivityAvatarStore? = LiveActivityAvatarStore.appGroup()
    ) {
        self.source = source
        self.store = store
    }

    @discardableResult
    func publish(
        activityID: String,
        remoteUserId: String,
        onPublished: @escaping @MainActor () -> Void
    ) -> Task<Void, Never> {
        if let existing = tasks[activityID] { return existing }
        let source = source
        let store = store
        let task = Task { @MainActor in
            guard let data = await source.avatarImageData(forUserId: remoteUserId),
                  !Task.isCancelled,
                  let store else { return }
            let written = await Self.persist(data, forActivityID: activityID, in: store)
            guard !Task.isCancelled else {
                store.remove(forActivityID: activityID)
                return
            }
            if written { onPublished() }
        }
        tasks[activityID] = task
        return task
    }

    func withdraw(activityID: String) {
        tasks.removeValue(forKey: activityID)?.cancel()
        store?.remove(forActivityID: activityID)
    }

    func sweep(keeping activityIDs: Set<String>) {
        tasks.keys
            .filter { !activityIDs.contains($0) }
            .forEach { tasks.removeValue(forKey: $0)?.cancel() }
        store?.removeAll(keeping: activityIDs)
    }

    @concurrent
    private static func persist(_ data: Data, forActivityID activityID: String, in store: LiveActivityAvatarStore) async -> Bool {
        (try? store.write(imageData: data, forActivityID: activityID)) != nil
    }
}
