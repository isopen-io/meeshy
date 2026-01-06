//
//  AudioCacheService.swift
//  Meeshy
//
//  Cache service for audio translations and voice profiles
//  Multi-level caching strategy for optimal performance
//

import Foundation
import os.log
import CryptoKit

// MARK: - Audio Cache Service

/// Cache service for audio translations and voice profiles
/// Implements multi-level caching: Memory → Disk
actor AudioCacheService {

    // MARK: - Singleton

    static let shared = AudioCacheService()

    // MARK: - Logger

    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Meeshy", category: "AudioCacheService")

    // MARK: - Memory Cache Storage

    private var transcriptionCache: [String: CachedItem<AudioTranscription>] = [:]
    private var translationCache: [String: CachedItem<String>] = [:]
    private var audioTranslationCache: [String: CachedItem<AudioTranslation>] = [:]
    private var voiceProfileCache: [String: CachedItem<VoiceProfile>] = [:]

    // MARK: - Configuration

    private let transcriptionTTL: TimeInterval = 7 * 24 * 3600      // 7 days
    private let translationTTL: TimeInterval = 7 * 24 * 3600        // 7 days
    private let audioTTL: TimeInterval = 24 * 3600                   // 24 hours
    private let voiceTTL: TimeInterval = 30 * 24 * 3600             // 30 days
    private let maxCacheSize = 500

    // MARK: - Disk Cache

    private let diskCacheDirectory: URL

    // MARK: - Stats

    private var stats = AudioCacheStats()

    // MARK: - Init

    private init() {
        // Setup disk cache directory
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        diskCacheDirectory = cacheDir.appendingPathComponent("AudioTranslationCache", isDirectory: true)

        // Create directory if needed
        try? FileManager.default.createDirectory(at: diskCacheDirectory, withIntermediateDirectories: true)

        // Start periodic cleanup
        Task {
            await startPeriodicCleanup()
        }
    }

    // MARK: - Transcription Cache

    /// Cache a transcription result
    func cacheTranscription(_ transcription: AudioTranscription, for messageId: String) {
        let key = AudioCacheKey.transcription(audioHash: messageId).key
        transcriptionCache[key] = CachedItem(
            value: transcription,
            expiresAt: Date().addingTimeInterval(transcriptionTTL)
        )
        stats.transcriptionWrites += 1
        cleanupIfNeeded()
        logger.debug("[Cache] Transcription cached for \(messageId)")
    }

    /// Get cached transcription
    func getCachedTranscription(messageId: String) -> AudioTranscription? {
        let key = AudioCacheKey.transcription(audioHash: messageId).key
        guard let cached = transcriptionCache[key], !cached.isExpired else {
            transcriptionCache.removeValue(forKey: key)
            stats.transcriptionMisses += 1
            return nil
        }
        stats.transcriptionHits += 1
        return cached.value
    }

    // MARK: - Text Translation Cache

    /// Cache a text translation (same text + lang pair = same translation)
    func cacheTranslation(_ translatedText: String, original: String, source: String, target: String) {
        let hash = original.sha256Hash
        let key = AudioCacheKey.translation(textHash: hash, source: source, target: target).key
        translationCache[key] = CachedItem(
            value: translatedText,
            expiresAt: Date().addingTimeInterval(translationTTL)
        )
        stats.translationWrites += 1
        logger.debug("[Cache] Translation cached: \(source)->\(target)")
    }

    /// Get cached text translation
    func getCachedTranslation(original: String, source: String, target: String) -> String? {
        let hash = original.sha256Hash
        let key = AudioCacheKey.translation(textHash: hash, source: source, target: target).key
        guard let cached = translationCache[key], !cached.isExpired else {
            translationCache.removeValue(forKey: key)
            stats.translationMisses += 1
            return nil
        }
        stats.translationHits += 1
        return cached.value
    }

    // MARK: - Audio Translation Cache

    /// Cache an audio translation result
    func cacheAudioTranslation(_ translation: AudioTranslation, attachmentId: String) {
        let key = AudioCacheKey.generatedAudio(
            attachmentId: attachmentId,
            targetLanguage: translation.targetLanguage
        ).key

        audioTranslationCache[key] = CachedItem(
            value: translation,
            expiresAt: Date().addingTimeInterval(audioTTL)
        )

        // Also persist to disk for longer term caching
        Task {
            await saveToDisk(translation, key: key)
        }

        stats.audioWrites += 1
        logger.debug("[Cache] Audio translation cached for \(attachmentId):\(translation.targetLanguage)")
    }

    /// Get cached audio translation
    func getCachedAudioTranslation(attachmentId: String, targetLanguage: String) -> AudioTranslation? {
        let key = AudioCacheKey.generatedAudio(
            attachmentId: attachmentId,
            targetLanguage: targetLanguage
        ).key

        // Check memory cache first
        if let cached = audioTranslationCache[key], !cached.isExpired {
            stats.audioHits += 1
            return cached.value
        }

        // Check disk cache
        if let diskCached: AudioTranslation = loadFromDisk(key: key) {
            // Restore to memory cache
            audioTranslationCache[key] = CachedItem(
                value: diskCached,
                expiresAt: Date().addingTimeInterval(audioTTL)
            )
            stats.audioHits += 1
            return diskCached
        }

        audioTranslationCache.removeValue(forKey: key)
        stats.audioMisses += 1
        return nil
    }

    // MARK: - Voice Profile Cache

    /// Cache a voice profile
    func cacheVoiceProfile(_ profile: VoiceProfile) {
        let key = AudioCacheKey.voiceEmbedding(userId: profile.userId).key
        voiceProfileCache[key] = CachedItem(
            value: profile,
            expiresAt: Date().addingTimeInterval(voiceTTL)
        )

        // Persist to disk
        Task {
            await saveToDisk(profile, key: key)
        }

        stats.voiceWrites += 1
        logger.debug("[Cache] Voice profile cached for user \(profile.userId)")
    }

    /// Get cached voice profile
    func getCachedVoiceProfile(userId: String) -> VoiceProfile? {
        let key = AudioCacheKey.voiceEmbedding(userId: userId).key

        // Check memory first
        if let cached = voiceProfileCache[key], !cached.isExpired {
            stats.voiceHits += 1
            return cached.value
        }

        // Check disk
        if let diskCached: VoiceProfile = loadFromDisk(key: key) {
            voiceProfileCache[key] = CachedItem(
                value: diskCached,
                expiresAt: Date().addingTimeInterval(voiceTTL)
            )
            stats.voiceHits += 1
            return diskCached
        }

        voiceProfileCache.removeValue(forKey: key)
        stats.voiceMisses += 1
        return nil
    }

    /// Invalidate voice profile cache (after profile update)
    func invalidateVoiceProfile(userId: String) {
        let key = AudioCacheKey.voiceEmbedding(userId: userId).key
        voiceProfileCache.removeValue(forKey: key)
        removeFromDisk(key: key)
        logger.debug("[Cache] Voice profile invalidated for user \(userId)")
    }

    // MARK: - Disk Cache Operations

    private func saveToDisk<T: Encodable>(_ item: T, key: String) async {
        let fileURL = diskCacheDirectory.appendingPathComponent("\(key.sha256Hash).json")
        do {
            let data = try JSONEncoder().encode(item)
            try data.write(to: fileURL)
        } catch {
            logger.error("[DiskCache] Failed to save: \(error.localizedDescription)")
        }
    }

    private func loadFromDisk<T: Decodable>(key: String) -> T? {
        let fileURL = diskCacheDirectory.appendingPathComponent("\(key.sha256Hash).json")
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }

        do {
            let data = try Data(contentsOf: fileURL)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            logger.error("[DiskCache] Failed to load: \(error.localizedDescription)")
            return nil
        }
    }

    private func removeFromDisk(key: String) {
        let fileURL = diskCacheDirectory.appendingPathComponent("\(key.sha256Hash).json")
        try? FileManager.default.removeItem(at: fileURL)
    }

    // MARK: - Cleanup

    private func cleanupIfNeeded() {
        let totalSize = transcriptionCache.count + translationCache.count +
                       audioTranslationCache.count + voiceProfileCache.count

        if totalSize > maxCacheSize {
            cleanupExpired()
        }
    }

    private func cleanupExpired() {
        let now = Date()

        transcriptionCache = transcriptionCache.filter { !$0.value.isExpired(at: now) }
        translationCache = translationCache.filter { !$0.value.isExpired(at: now) }
        audioTranslationCache = audioTranslationCache.filter { !$0.value.isExpired(at: now) }
        voiceProfileCache = voiceProfileCache.filter { !$0.value.isExpired(at: now) }

        logger.debug("[Cache] Cleanup complete")
    }

    private func startPeriodicCleanup() async {
        while true {
            try? await Task.sleep(nanoseconds: 3600_000_000_000) // 1 hour
            cleanupExpired()
        }
    }

    // MARK: - Clear Specific Caches

    func clearTranscriptionCache() {
        transcriptionCache.removeAll()
    }

    func clearTranslationCache() {
        translationCache.removeAll()
    }

    func clearAudioTranslationCache() {
        audioTranslationCache.removeAll()
    }

    func clearVoiceProfileCache() {
        voiceProfileCache.removeAll()
    }

    func clearAll() {
        transcriptionCache.removeAll()
        translationCache.removeAll()
        audioTranslationCache.removeAll()
        voiceProfileCache.removeAll()

        // Clear disk cache
        try? FileManager.default.removeItem(at: diskCacheDirectory)
        try? FileManager.default.createDirectory(at: diskCacheDirectory, withIntermediateDirectories: true)

        stats = AudioCacheStats()
        logger.info("[Cache] All caches cleared")
    }

    // MARK: - Stats

    func getStats() -> AudioCacheStats {
        return stats
    }

    /// Calculate hit rate for each cache type
    func getHitRates() -> CacheHitRates {
        CacheHitRates(
            transcription: stats.transcriptionHitRate,
            translation: stats.translationHitRate,
            audio: stats.audioHitRate,
            voice: stats.voiceHitRate
        )
    }
}

// MARK: - Supporting Types

struct CachedItem<T> {
    let value: T
    let expiresAt: Date

    var isExpired: Bool {
        Date() > expiresAt
    }

    func isExpired(at date: Date) -> Bool {
        date > expiresAt
    }
}

struct AudioCacheStats {
    var transcriptionHits: Int = 0
    var transcriptionMisses: Int = 0
    var transcriptionWrites: Int = 0

    var translationHits: Int = 0
    var translationMisses: Int = 0
    var translationWrites: Int = 0

    var audioHits: Int = 0
    var audioMisses: Int = 0
    var audioWrites: Int = 0

    var voiceHits: Int = 0
    var voiceMisses: Int = 0
    var voiceWrites: Int = 0

    var transcriptionHitRate: Double {
        let total = transcriptionHits + transcriptionMisses
        return total > 0 ? Double(transcriptionHits) / Double(total) : 0
    }

    var translationHitRate: Double {
        let total = translationHits + translationMisses
        return total > 0 ? Double(translationHits) / Double(total) : 0
    }

    var audioHitRate: Double {
        let total = audioHits + audioMisses
        return total > 0 ? Double(audioHits) / Double(total) : 0
    }

    var voiceHitRate: Double {
        let total = voiceHits + voiceMisses
        return total > 0 ? Double(voiceHits) / Double(total) : 0
    }

    var overallHitRate: Double {
        let totalHits = transcriptionHits + translationHits + audioHits + voiceHits
        let totalMisses = transcriptionMisses + translationMisses + audioMisses + voiceMisses
        let total = totalHits + totalMisses
        return total > 0 ? Double(totalHits) / Double(total) : 0
    }
}

struct CacheHitRates {
    let transcription: Double
    let translation: Double
    let audio: Double
    let voice: Double

    var formatted: String {
        """
        Transcription: \(String(format: "%.1f%%", transcription * 100))
        Translation: \(String(format: "%.1f%%", translation * 100))
        Audio: \(String(format: "%.1f%%", audio * 100))
        Voice: \(String(format: "%.1f%%", voice * 100))
        """
    }
}

// MARK: - String Extension for Hashing

extension String {
    var sha256Hash: String {
        let inputData = Data(self.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.compactMap { String(format: "%02x", $0) }.joined().prefix(32).description
    }
}
