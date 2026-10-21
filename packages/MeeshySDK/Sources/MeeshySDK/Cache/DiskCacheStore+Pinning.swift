import Foundation
import os

extension DiskCacheStore {
    // MARK: - Pinning (eviction exemption — R5 offline replay)

    /// Marks `key` as non-evictable until `until`. Building block only: the
    /// store never decides WHAT deserves a pin — the app-side policy does
    /// (e.g. "media of a viewed story until the story expires"). Pinning a
    /// key whose download has not landed yet is valid: the exemption applies
    /// as soon as the file exists.
    public func pin(_ key: String, until: Date) {
        loadPinsIfNeeded()
        pinExpiries[Self.fileKey(for: key)] = until
        persistPins()
    }

    public func unpin(_ key: String) {
        loadPinsIfNeeded()
        guard pinExpiries.removeValue(forKey: Self.fileKey(for: key)) != nil else { return }
        persistPins()
    }

    /// `true` while `key` holds a pin whose expiry is in the future.
    public func isPinned(_ key: String) -> Bool {
        loadPinsIfNeeded()
        return isPinActive(fileKey: Self.fileKey(for: key), now: Date())
    }

    func isPinActive(fileKey: String, now: Date) -> Bool {
        loadPinsIfNeeded()
        guard let until = pinExpiries[fileKey] else { return false }
        return until > now
    }

    /// Drops pins past their expiry so the registry (and sidecar) cannot grow
    /// unbounded. Called by both eviction sweeps.
    func purgeExpiredPins(now: Date) {
        loadPinsIfNeeded()
        let before = pinExpiries.count
        pinExpiries = pinExpiries.filter { $0.value > now }
        if pinExpiries.count != before { persistPins() }
    }

    var pinsSidecarURL: URL {
        baseDirectory.appendingPathComponent(".pins.json")
    }

    func loadPinsIfNeeded() {
        guard !pinsLoaded else { return }
        pinsLoaded = true
        guard fileManager.fileExists(atPath: pinsSidecarURL.path) else { return }
        do {
            let data = try Data(contentsOf: pinsSidecarURL)
            pinExpiries = try JSONDecoder().decode([String: Date].self, from: data)
        } catch {
            logger.error("Pin sidecar unreadable, starting empty: \(error.localizedDescription)")
        }
    }

    func persistPins() {
        do {
            let data = try JSONEncoder().encode(pinExpiries)
            try data.write(to: pinsSidecarURL, options: .atomic)
        } catch {
            logger.error("Pin sidecar write failed: \(error.localizedDescription)")
        }
    }
}
