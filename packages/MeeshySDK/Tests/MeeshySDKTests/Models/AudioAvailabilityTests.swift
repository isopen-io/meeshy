import Testing
@testable import MeeshySDK

struct AudioAvailabilityTests {
    @Test func resolve_localFileThatExists_isReady() {
        let result = AudioAvailability.resolve(
            isLocalFile: true, localFileExists: true, isServerCached: false
        )
        #expect(result == .ready)
    }

    @Test func resolve_localFileMissing_needsDownload() {
        let result = AudioAvailability.resolve(
            isLocalFile: true, localFileExists: false, isServerCached: false
        )
        #expect(result == .needsDownload)
    }

    @Test func resolve_serverAudioCached_isReady() {
        let result = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: true
        )
        #expect(result == .ready)
    }

    @Test func resolve_serverAudioNotCached_needsDownload() {
        let result = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: false
        )
        #expect(result == .needsDownload)
    }

    // MARK: - Downloading payload (bytes carried alongside progress)

    @Test func downloading_carriesBytesForLabelRendering() {
        let state: AudioAvailability = .downloading(
            progress: 0.48, downloadedBytes: 408_000, totalBytes: 870_400
        )
        guard case .downloading(let progress, let downloaded, let total) = state else {
            Issue.record("expected .downloading case")
            return
        }
        #expect(progress == 0.48)
        #expect(downloaded == 408_000)
        #expect(total == 870_400)
    }

    @Test func downloading_convenienceInit_defaultsBytesToZero() {
        let state: AudioAvailability = .downloading(progress: 0.3)
        guard case .downloading(let progress, let downloaded, let total) = state else {
            Issue.record("expected .downloading case")
            return
        }
        #expect(progress == 0.3)
        #expect(downloaded == 0)
        #expect(total == 0)
    }
}
