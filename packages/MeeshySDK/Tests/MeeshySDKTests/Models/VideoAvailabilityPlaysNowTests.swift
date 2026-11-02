import Testing
@testable import MeeshySDK

/// #12027 — une vidéo se JOUE maintenant quand son fichier est sur le disque,
/// ou quand un téléchargement déjà autorisé de ce fichier est lisible : toute
/// surface lit alors la tête pendant que le reste arrive. Jamais quand rien
/// n'est en cours — aucune surface n'ouvre de transfert par la lecture.
struct VideoAvailabilityPlaysNowTests {

    private let fileUrl = "https://gate.meeshy.me/api/v1/attachments/file/clip.mp4"

    @Test func fileOnDisk_playsNow() {
        #expect(VideoAvailability.ready.playsNow(fileUrl: fileUrl, hasReadableTransfer: { _ in false }))
    }

    @Test func downloadingAndReadable_playsFromTheHead() {
        #expect(VideoAvailability.downloading(progress: 0.1).playsNow(fileUrl: fileUrl, hasReadableTransfer: { _ in true }))
    }

    @Test func downloadingButNotReadable_waits() {
        #expect(!VideoAvailability.downloading(progress: 0.1).playsNow(fileUrl: fileUrl, hasReadableTransfer: { _ in false }))
    }

    @Test func notDownloaded_neverPlays_evenIfATransferIsReadable() {
        #expect(!VideoAvailability.needsDownload.playsNow(fileUrl: fileUrl, hasReadableTransfer: { _ in true }))
    }

    @Test func localFile_isNeverATransfer() {
        #expect(!VideoAvailability.playsWhileDownloading(fileUrl: "file:///tmp/clip.mp4", hasReadableTransfer: { _ in true }))
    }

    @Test func asksTheResolvedCacheKey() {
        var asked: [String] = []
        _ = VideoAvailability.playsWhileDownloading(fileUrl: fileUrl) {
            asked.append($0)
            return false
        }
        #expect(asked == [fileUrl])
    }
}
