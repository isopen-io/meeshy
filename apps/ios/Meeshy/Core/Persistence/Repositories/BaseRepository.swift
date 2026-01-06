//
//  BaseRepository.swift
//  Meeshy
//
//  Base repository protocol for offline-first data access
//

import Foundation
import CoreData

protocol BaseRepository {
    associatedtype Entity: NSManagedObject
    associatedtype Model

    var coreDataManager: CoreDataManager { get }

    func create(_ model: Model) throws -> Entity
    func fetch(id: String) throws -> Model?
    func fetchAll() throws -> [Model]
    func update(id: String, with model: Model) throws
    func delete(id: String) throws
    func deleteAll() throws

    func toModel(_ entity: Entity) -> Model?
    func toEntity(_ model: Model, entity: Entity?) -> Entity
}

extension BaseRepository {
    var viewContext: NSManagedObjectContext? {
        coreDataManager.viewContext
    }

    var backgroundContext: NSManagedObjectContext? {
        coreDataManager.newBackgroundContext()
    }

    /// Get context or throw if CoreData is unavailable
    func getContext() throws -> NSManagedObjectContext {
        guard let context = viewContext else {
            throw RepositoryError.coreDataUnavailable
        }
        return context
    }

    /// Get background context or throw if CoreData is unavailable
    func getBackgroundContext() throws -> NSManagedObjectContext {
        guard let context = backgroundContext else {
            throw RepositoryError.coreDataUnavailable
        }
        return context
    }

    func save(context: NSManagedObjectContext? = nil) throws {
        guard let ctx = context ?? viewContext else {
            throw RepositoryError.coreDataUnavailable
        }

        guard ctx.hasChanges else { return }

        try ctx.save()
    }
}

// MARK: - Repository Error

enum RepositoryError: LocalizedError {
    case notFound
    case invalidData
    case saveFailed(Error)
    case fetchFailed(Error)
    case deleteFailed(Error)
    case coreDataUnavailable

    var errorDescription: String? {
        switch self {
        case .notFound:
            return "Entity not found"
        case .invalidData:
            return "Invalid data provided"
        case .saveFailed(let error):
            return "Save failed: \(error.localizedDescription)"
        case .fetchFailed(let error):
            return "Fetch failed: \(error.localizedDescription)"
        case .deleteFailed(let error):
            return "Delete failed: \(error.localizedDescription)"
        case .coreDataUnavailable:
            return "CoreData is not available"
        }
    }
}
