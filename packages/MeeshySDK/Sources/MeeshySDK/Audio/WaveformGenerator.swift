import AVFoundation

public actor WaveformGenerator {

    public static let shared = WaveformGenerator()
    private init() {}

    /// Extrait ~sampleCount amplitudes normalisées (0.0–1.0) depuis une URL audio locale.
    public func generateSamples(from url: URL, sampleCount: Int = 80) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        guard duration.seconds > 0 else { return [] }

        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            return []
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        reader.add(output)
        reader.startReading()
        defer { if reader.status == .reading { reader.cancelReading() } }

        var allSamples: [Float] = []
        while let buffer = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            guard let blockBuffer = CMSampleBufferGetDataBuffer(buffer) else { continue }
            let length = CMBlockBufferGetDataLength(blockBuffer)
            var data = Data(count: length)
            _ = data.withUnsafeMutableBytes { ptr in
                CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0,
                                           dataLength: length, destination: ptr.baseAddress!)
            }
            let samples = data.withUnsafeBytes { ptr -> [Float] in
                let int16Ptr = ptr.bindMemory(to: Int16.self)
                return int16Ptr.map { Float(abs($0)) / Float(Int16.max) }
            }
            allSamples.append(contentsOf: samples)
        }

        guard !allSamples.isEmpty else { return [] }

        // Réduire à sampleCount amplitudes (moyennes de buckets)
        let bucketSize = allSamples.count / sampleCount
        guard bucketSize > 0 else { return Array(allSamples.prefix(sampleCount)) }

        return (0..<sampleCount).map { i in
            let start = i * bucketSize
            let end = min(start + bucketSize, allSamples.count)
            let bucket = allSamples[start..<end]
            return bucket.reduce(0, +) / Float(bucket.count)
        }
    }
}
