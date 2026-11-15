import AVFoundation
import os
import MeeshySDK

/// L'assemblage des segments d'une prise : une prise coupée par une bascule
/// d'objectif se referme en UN fichier. `CameraModel.mergeSegments` en est la façade.
nonisolated enum CameraSegmentMerger {

    /// **Concatène des pistes DÉJÀ ENCODÉES quand elles le permettent** — le
    /// contrat de la vue `4b`, pas une optimisation : « valider concatène des
    /// pistes déjà encodées, ce qui rend la sortie quasi instantanée quelle que
    /// soit la durée ». Le preset est décidé par `CameraSegmentMergePolicy`
    /// d'après les formats RÉELLEMENT lus : passthrough sur des segments
    /// homogènes (le cas nominal — plusieurs `MAINTENIR` sur la même caméra),
    /// ré-encodage quand une bascule de caméra a produit des dimensions
    /// différentes, où le passthrough rendrait `nil` et perdrait la prise.
    ///
    /// Concatenates ordered video segments (each a camera-switch boundary) into
    /// one continuous file via `AVMutableComposition` + export. `nonisolated`
    /// so the composition/export work (CPU-bound, can take a few seconds for
    /// longer recordings) never blocks the main actor.
    ///
    /// **Chaque segment garde l'orientation de SA caméra** (#9464) : des
    /// transformations égales se reportent sur la piste composée (passthrough
    /// intact) ; différentes, chaque segment reçoit son calque debout et la
    /// fusion ré-encode (`CameraSegmentOrientation`).
    ///
    /// Covered by `CameraModelSegmentMergeTests` (empty input), source guards
    /// (`CameraModelSwitchDuringRecordingTests`) and ONE light round-trip of two
    /// tiny synthetic segments (`CameraSegmentOrientationTests`) — kept to a
    /// handful of frames, because heavier synthetic media proved fragile in CI.
    static func merge(_ urls: [URL]) async -> URL? {
        guard !urls.isEmpty else { return nil }
        let composition = AVMutableComposition()
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { return nil }

        var cursor = CMTime.zero
        // Les formats des pistes insérées — ce qui décide d'un passthrough
        // (vue 4b : « concatène des pistes DÉJÀ ENCODÉES »). Voir
        // `CameraSegmentMergePolicy`.
        var videoFormats: [SegmentVideoFormat] = []
        // L'orientation de chaque segment — celle de SA caméra (#9464).
        var placements: [CameraSegmentPlacement] = []
        var insertedSegmentCount = 0
        for url in urls {
            let asset = AVURLAsset(url: url)
            let duration: CMTime
            do {
                duration = try await asset.load(.duration)
            } catch {
                Logger.media.error("Failed to load duration for a recording segment, skipping it: \(error.localizedDescription, privacy: .public)")
                continue
            }
            guard duration.isValid, duration > .zero else { continue }
            let range = CMTimeRange(start: .zero, duration: duration)
            insertedSegmentCount += 1
            do {
                if let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first {
                    try videoTrack.insertTimeRange(range, of: assetVideoTrack, at: cursor)
                    if let description = try await assetVideoTrack.load(.formatDescriptions).first {
                        videoFormats.append(SegmentVideoFormat(formatDescription: description))
                    }
                    let (natural, transform) = try await assetVideoTrack.load(.naturalSize, .preferredTransform)
                    placements.append(CameraSegmentPlacement(timeRange: CMTimeRange(start: cursor, duration: duration),
                                                             natural: natural, transform: transform))
                }
            } catch {
                Logger.media.error("Failed to insert the video track of a recording segment: \(error.localizedDescription, privacy: .public)")
            }
            do {
                if let assetAudioTrack = try await asset.loadTracks(withMediaType: .audio).first {
                    try audioTrack.insertTimeRange(range, of: assetAudioTrack, at: cursor)
                }
            } catch {
                Logger.media.error("Failed to insert the audio track of a recording segment: \(error.localizedDescription, privacy: .public)")
            }
            cursor = cursor + duration
        }
        // Une piste audio restée vide (prise muette) fait échouer l'export.
        if audioTrack.segments.isEmpty { composition.removeTrack(audioTrack) }
        let orientation = CameraSegmentOrientation.uniform(placements)
        if let orientation { videoTrack.preferredTransform = orientation }
        let redressement = orientation == nil
            ? CameraSegmentOrientation.composition(for: videoTrack, placements: placements)
            : nil
        let preset = redressement == nil
            ? CameraSegmentMergePolicy.preset(formats: videoFormats, readableSegmentCount: insertedSegmentCount)
            : AVAssetExportPresetHighestQuality
        guard cursor > .zero,
              let exportSession = AVAssetExportSession(asset: composition, presetName: preset)
        else { return nil }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_merged_\(UUID().uuidString).mov")
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mov
        exportSession.shouldOptimizeForNetworkUse = true
        exportSession.videoComposition = redressement

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            exportSession.exportAsynchronously { continuation.resume() }
        }
        return exportSession.status == .completed ? outputURL : nil
    }
}
