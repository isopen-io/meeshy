import Foundation
import GRDB

public struct DatabaseStorageUnavailable: Error, Sendable, Equatable {
    public init() {}
}

enum OpenedDatabaseQueue {
    case persistent(DatabaseQueue)
    case memoryFallback(DatabaseQueue, diskError: String)
    case unavailable(diskError: String, memoryError: String)

    var queue: DatabaseQueue? {
        switch self {
        case .persistent(let queue), .memoryFallback(let queue, _): return queue
        case .unavailable: return nil
        }
    }
}

enum ResilientDatabaseQueue {
    static func open(
        path: String?,
        openDisk: (String) throws -> DatabaseQueue = { try DatabaseQueue(path: $0) },
        openMemory: () throws -> DatabaseQueue = { try DatabaseQueue() }
    ) -> OpenedDatabaseQueue {
        guard let path else { return openMemoryOnly(openMemory) }
        do {
            return .persistent(try openDisk(path))
        } catch {
            return fallbackToMemory(diskError: error.localizedDescription, openMemory)
        }
    }

    private static func openMemoryOnly(_ openMemory: () throws -> DatabaseQueue) -> OpenedDatabaseQueue {
        do {
            return .persistent(try openMemory())
        } catch {
            return .unavailable(diskError: "no path", memoryError: error.localizedDescription)
        }
    }

    private static func fallbackToMemory(
        diskError: String,
        _ openMemory: () throws -> DatabaseQueue
    ) -> OpenedDatabaseQueue {
        do {
            return .memoryFallback(try openMemory(), diskError: diskError)
        } catch {
            return .unavailable(diskError: diskError, memoryError: error.localizedDescription)
        }
    }
}
