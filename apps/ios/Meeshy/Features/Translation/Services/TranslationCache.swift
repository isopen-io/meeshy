//
//  TranslationCache.swift
//  Meeshy
//
//  CoreData-based translation cache with expiration
//  iOS 16+
//

import Foundation
import CoreData
import CryptoKit  // MEMORY FIX: Import CryptoKit for proper SHA256

// MARK: - Cached Translation Data

struct CachedTranslationData: Codable {
    let id: String
    let originalText: String
    let translatedText: String
    let sourceLanguage: String
    let targetLanguage: String
    let confidence: Double
    let provider: String
    let timestamp: Date
    let expiresAt: Date

    var isExpired: Bool {
        Date() > expiresAt
    }
}

// MARK: - Translation Cache

actor TranslationCache {
    // MARK: - Singleton

    static let shared = TranslationCache()

    // MARK: - Properties

    private let container: NSPersistentContainer
    private let cacheExpirationDays: Int = 30
    private let maxCacheSize: Int = 10000

    // MARK: - Initialization

    private init() {
        container = NSPersistentContainer(name: "TranslationCache")

        // MEMORY FIX: Use Caches directory instead of Documents
        // Caches directory is purgeable by the system and doesn't contribute to backup size
        let storeURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
            .appendingPathComponent("TranslationCache.sqlite")

        let storeDescription = NSPersistentStoreDescription(url: storeURL)
        storeDescription.shouldMigrateStoreAutomatically = true
        storeDescription.shouldInferMappingModelAutomatically = true

        container.persistentStoreDescriptions = [storeDescription]

        container.loadPersistentStores { description, error in
            if let error = error {
                print("Translation Cache Error: Failed to load Core Data stack: \(error)")
            }
        }

        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergePolicy.mergeByPropertyObjectTrump

        // Clean expired entries on init
        Task {
            await cleanExpiredEntries()
        }
    }

    // MARK: - Cache Key Generation

    private func cacheKey(text: String, sourceLanguage: String, targetLanguage: String) -> String {
        let normalized = text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let combined = "\(normalized)_\(sourceLanguage)_\(targetLanguage)"
        return combined.sha256()
    }

    // MARK: - Public Methods

    /// Get cached translation
    func get(text: String, sourceLanguage: String, targetLanguage: String) async -> CachedTranslationData? {
        let key = cacheKey(text: text, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage)

        let context = container.newBackgroundContext()

        return await context.perform {
            let fetchRequest = NSFetchRequest<NSManagedObject>(entityName: "CachedTranslationEntity")
            fetchRequest.predicate = NSPredicate(format: "cacheKey == %@", key)
            fetchRequest.fetchLimit = 1

            do {
                guard let result = try context.fetch(fetchRequest).first else {
                    return nil
                }

                // Check expiration
                guard let expiresAt = result.value(forKey: "expiresAt") as? Date,
                      expiresAt > Date() else {
                    // Delete expired entry
                    context.delete(result)
                    try? context.save()
                    return nil
                }

                // Extract cached translation
                guard let originalText = result.value(forKey: "originalText") as? String,
                      let translatedText = result.value(forKey: "translatedText") as? String,
                      let sourceLanguage = result.value(forKey: "sourceLanguage") as? String,
                      let targetLanguage = result.value(forKey: "targetLanguage") as? String,
                      let confidence = result.value(forKey: "confidence") as? Double,
                      let provider = result.value(forKey: "provider") as? String,
                      let timestamp = result.value(forKey: "timestamp") as? Date else {
                    return nil
                }

                return CachedTranslationData(
                    id: key,
                    originalText: originalText,
                    translatedText: translatedText,
                    sourceLanguage: sourceLanguage,
                    targetLanguage: targetLanguage,
                    confidence: confidence,
                    provider: provider,
                    timestamp: timestamp,
                    expiresAt: expiresAt
                )

            } catch {
                print("Translation Cache Error: Failed to fetch: \(error)")
                return nil
            }
        }
    }

    /// Save translation to cache
    func save(_ result: TranslationResult) async {
        let key = cacheKey(
            text: result.originalText,
            sourceLanguage: result.sourceLanguage.rawValue,
            targetLanguage: result.targetLanguage.rawValue
        )

        let context = container.newBackgroundContext()

        await context.perform {
            // Check if entry already exists
            let fetchRequest = NSFetchRequest<NSManagedObject>(entityName: "CachedTranslationEntity")
            fetchRequest.predicate = NSPredicate(format: "cacheKey == %@", key)

            do {
                let existingResults = try context.fetch(fetchRequest)

                // Delete existing entry if found
                for existing in existingResults {
                    context.delete(existing)
                }

                // Create new entry
                guard let entity = NSEntityDescription.entity(
                    forEntityName: "CachedTranslationEntity",
                    in: context
                ) else {
                    print("Translation Cache Error: Failed to create entity")
                    return
                }

                let newEntry = NSManagedObject(entity: entity, insertInto: context)
                newEntry.setValue(key, forKey: "cacheKey")
                newEntry.setValue(result.originalText, forKey: "originalText")
                newEntry.setValue(result.translatedText, forKey: "translatedText")
                newEntry.setValue(result.sourceLanguage.rawValue, forKey: "sourceLanguage")
                newEntry.setValue(result.targetLanguage.rawValue, forKey: "targetLanguage")
                newEntry.setValue(result.confidence, forKey: "confidence")
                newEntry.setValue(result.provider, forKey: "provider")
                newEntry.setValue(result.timestamp, forKey: "timestamp")

                // Set expiration date
                let expiresAt = Calendar.current.date(
                    byAdding: .day,
                    value: self.cacheExpirationDays,
                    to: Date()
                ) ?? Date().addingTimeInterval(30 * 24 * 60 * 60)

                newEntry.setValue(expiresAt, forKey: "expiresAt")

                try context.save()

            } catch {
                print("Translation Cache Error: Failed to save: \(error)")
            }
        }

        // Check cache size and clean if needed
        await self.enforceMaxCacheSize()
    }

    /// Clear all cached translations
    func clearAll() async {
        let context = container.newBackgroundContext()

        await context.perform {
            let fetchRequest = NSFetchRequest<NSFetchRequestResult>(entityName: "CachedTranslationEntity")
            let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)

            do {
                try context.execute(deleteRequest)
                try context.save()
            } catch {
                print("Translation Cache Error: Failed to clear cache: \(error)")
            }
        }
    }

    /// Get cache statistics
    func getStatistics() async -> CacheStatistics {
        let context = container.newBackgroundContext()

        return await context.perform {
            let fetchRequest = NSFetchRequest<NSManagedObject>(entityName: "CachedTranslationEntity")

            do {
                let results = try context.fetch(fetchRequest)
                let totalEntries = results.count

                let now = Date()
                let expiredEntries = results.filter {
                    guard let expiresAt = $0.value(forKey: "expiresAt") as? Date else {
                        return true
                    }
                    return expiresAt <= now
                }.count

                var languagePairs: [String: Int] = [:]
                for result in results {
                    guard let source = result.value(forKey: "sourceLanguage") as? String,
                          let target = result.value(forKey: "targetLanguage") as? String else {
                        continue
                    }
                    let pair = "\(source)-\(target)"
                    languagePairs[pair, default: 0] += 1
                }

                return CacheStatistics(
                    totalEntries: totalEntries,
                    expiredEntries: expiredEntries,
                    activeEntries: totalEntries - expiredEntries,
                    languagePairs: languagePairs
                )

            } catch {
                print("Translation Cache Error: Failed to get statistics: \(error)")
                return CacheStatistics(
                    totalEntries: 0,
                    expiredEntries: 0,
                    activeEntries: 0,
                    languagePairs: [:]
                )
            }
        }
    }

    // MARK: - Private Methods

    private func cleanExpiredEntries() async {
        let context = container.newBackgroundContext()

        await context.perform {
            let fetchRequest = NSFetchRequest<NSManagedObject>(entityName: "CachedTranslationEntity")
            fetchRequest.predicate = NSPredicate(format: "expiresAt <= %@", Date() as NSDate)

            do {
                let expiredResults = try context.fetch(fetchRequest)

                for expired in expiredResults {
                    context.delete(expired)
                }

                if !expiredResults.isEmpty {
                    try context.save()
                    print("Translation Cache: Cleaned \(expiredResults.count) expired entries")
                }

            } catch {
                print("Translation Cache Error: Failed to clean expired entries: \(error)")
            }
        }
    }

    private func enforceMaxCacheSize() async {
        let context = container.newBackgroundContext()

        await context.perform {
            let fetchRequest = NSFetchRequest<NSManagedObject>(entityName: "CachedTranslationEntity")
            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]

            do {
                let results = try context.fetch(fetchRequest)

                if results.count > self.maxCacheSize {
                    let toDelete = results.count - self.maxCacheSize
                    let entriesToDelete = Array(results.prefix(toDelete))

                    for entry in entriesToDelete {
                        context.delete(entry)
                    }

                    try context.save()
                    print("Translation Cache: Removed \(toDelete) oldest entries to enforce size limit")
                }

            } catch {
                print("Translation Cache Error: Failed to enforce cache size: \(error)")
            }
        }
    }
}

// MARK: - Cache Statistics

struct CacheStatistics {
    let totalEntries: Int
    let expiredEntries: Int
    let activeEntries: Int
    let languagePairs: [String: Int]
}

// MARK: - String SHA256 Extension

extension String {
    // MEMORY FIX: Use proper CryptoKit SHA256 instead of broken byte sum
    // The previous implementation was just summing bytes, causing hash collisions
    func sha256() -> String {
        guard let data = self.data(using: .utf8) else { return self }

        // Use CryptoKit for proper SHA256 hashing
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}
