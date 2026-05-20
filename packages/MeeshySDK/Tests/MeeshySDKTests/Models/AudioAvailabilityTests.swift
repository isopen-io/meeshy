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
}
