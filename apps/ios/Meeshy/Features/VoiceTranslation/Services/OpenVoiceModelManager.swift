//
//  OpenVoiceModelManager.swift
//  Meeshy
//
//  Manages downloading, caching, and loading of OpenVoice V2 ONNX models
//  for on-device voice cloning.
//
//  Models:
//  - speaker_embedding_extractor.onnx: Extracts speaker voice characteristics
//  - hifigan_vocoder.onnx: Converts mel spectrograms to audio waveforms
//
//  iOS 16+
//

import Foundation

// MARK: - OpenVoice Model Manager

/// Manages OpenVoice V2 ONNX model downloads and storage
@MainActor
final class OpenVoiceModelManager: ObservableObject {

    // MARK: - Types

    enum ModelType: String, CaseIterable {
        case speakerEmbedding = "speaker_embedding_extractor"
        case vocoder = "hifigan_vocoder"

        var filename: String {
            "\(rawValue).onnx"
        }

        var displayName: String {
            switch self {
            case .speakerEmbedding: return "Speaker Embedding"
            case .vocoder: return "HiFi-GAN Vocoder"
            }
        }

        /// Approximate size in MB
        var approximateSize: Double {
            switch self {
            case .speakerEmbedding: return 15.0
            case .vocoder: return 55.0
            }
        }
    }

    enum DownloadState: Equatable {
        case notDownloaded
        case downloading(progress: Double)
        case downloaded
        case error(String)
    }

    struct ModelInfo: Codable {
        let version: String
        let models: [String: ModelConfig]
        let audioConfig: AudioConfig
        let embeddingDim: Int

        struct ModelConfig: Codable {
            let filename: String
        }

        struct AudioConfig: Codable {
            let sampleRate: Int
            let nMels: Int
            let hopLength: Int

            enum CodingKeys: String, CodingKey {
                case sampleRate = "sample_rate"
                case nMels = "n_mels"
                case hopLength = "hop_length"
            }
        }

        enum CodingKeys: String, CodingKey {
            case version, models
            case audioConfig = "audio_config"
            case embeddingDim = "embedding_dim"
        }
    }

    // MARK: - Published State

    @Published private(set) var downloadStates: [ModelType: DownloadState] = [:]
    @Published private(set) var overallProgress: Double = 0
    @Published private(set) var isDownloading = false
    @Published private(set) var modelInfo: ModelInfo?

    // MARK: - Properties

    let modelDirectory: URL

    /// Base URL for model downloads (can be customized)
    var modelBaseURL: URL = URL(string: "https://huggingface.co/meeshy-ai/openvoice-onnx/resolve/main/")!

    // MARK: - Initialization

    init() {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        self.modelDirectory = documentsURL.appendingPathComponent("OpenVoiceModels", isDirectory: true)

        // Create directory if needed
        try? FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)

        // Initialize download states
        for modelType in ModelType.allCases {
            downloadStates[modelType] = isModelDownloaded(modelType) ? .downloaded : .notDownloaded
        }

        // Load model info if available
        loadModelInfo()
    }

    // MARK: - Model Status

    /// Check if a specific model is downloaded
    func isModelDownloaded(_ type: ModelType) -> Bool {
        let modelPath = modelDirectory.appendingPathComponent(type.filename)
        return FileManager.default.fileExists(atPath: modelPath.path)
    }

    /// Check if all required models are downloaded
    var areAllModelsDownloaded: Bool {
        ModelType.allCases.allSatisfy { isModelDownloaded($0) }
    }

    /// Get total size of downloaded models in bytes
    var downloadedModelsSize: Int64 {
        var totalSize: Int64 = 0

        for modelType in ModelType.allCases {
            let path = modelDirectory.appendingPathComponent(modelType.filename)
            if let attributes = try? FileManager.default.attributesOfItem(atPath: path.path),
               let size = attributes[.size] as? Int64 {
                totalSize += size
            }
        }

        return totalSize
    }

    /// Get path for a specific model
    func modelPath(for type: ModelType) -> URL {
        modelDirectory.appendingPathComponent(type.filename)
    }

    // MARK: - Download Models

    /// Download all required models
    func downloadAllModels() async throws {
        guard !isDownloading else { return }

        isDownloading = true
        overallProgress = 0

        defer {
            isDownloading = false
        }

        let modelsToDownload = ModelType.allCases.filter { !isModelDownloaded($0) }

        if modelsToDownload.isEmpty {
            overallProgress = 1.0
            return
        }

        let progressPerModel = 1.0 / Double(modelsToDownload.count)

        for (index, modelType) in modelsToDownload.enumerated() {
            do {
                try await downloadModel(modelType) { progress in
                    let baseProgress = Double(index) * progressPerModel
                    self.overallProgress = baseProgress + (progress * progressPerModel)
                }
            } catch {
                downloadStates[modelType] = .error(error.localizedDescription)
                throw error
            }
        }

        overallProgress = 1.0
    }

    /// Download a specific model
    func downloadModel(_ type: ModelType, progressCallback: ((Double) -> Void)? = nil) async throws {
        let destinationURL = modelPath(for: type)

        // Skip if already downloaded
        if isModelDownloaded(type) {
            downloadStates[type] = .downloaded
            progressCallback?(1.0)
            return
        }

        downloadStates[type] = .downloading(progress: 0)

        // For now, we'll create placeholder files since actual models need conversion
        // In production, download from your own hosted ONNX models
        try await downloadModelFromBundle(type, to: destinationURL, progressCallback: progressCallback)
    }

    /// Download model (placeholder - in production, use actual URL download)
    private func downloadModelFromBundle(
        _ type: ModelType,
        to destinationURL: URL,
        progressCallback: ((Double) -> Void)?
    ) async throws {
        // Check if model is in app bundle first
        if let bundlePath = Bundle.main.path(forResource: type.rawValue, ofType: "onnx") {
            try FileManager.default.copyItem(
                atPath: bundlePath,
                toPath: destinationURL.path
            )
            downloadStates[type] = .downloaded
            progressCallback?(1.0)
            return
        }

        // Create placeholder model info file
        let infoURL = modelDirectory.appendingPathComponent("model_info.json")
        if !FileManager.default.fileExists(atPath: infoURL.path) {
            let info = """
            {
                "version": "2.0",
                "models": {
                    "speaker_embedding_extractor": {"filename": "speaker_embedding_extractor.onnx"},
                    "hifigan_vocoder": {"filename": "hifigan_vocoder.onnx"}
                },
                "audio_config": {"sample_rate": 22050, "n_mels": 80, "hop_length": 256},
                "embedding_dim": 256
            }
            """
            try info.write(to: infoURL, atomically: true, encoding: .utf8)
        }

        // Note: In production, download actual ONNX models here
        // For now, mark as needing manual setup
        downloadStates[type] = .error("Model requires manual setup. Run convert_openvoice_to_onnx.py")

        throw OpenVoiceModelError.modelNotAvailable(type.displayName)
    }

    // MARK: - Model Info

    private func loadModelInfo() {
        let infoURL = modelDirectory.appendingPathComponent("model_info.json")

        guard let data = try? Data(contentsOf: infoURL) else { return }

        modelInfo = try? JSONDecoder().decode(ModelInfo.self, from: data)
    }

    // MARK: - Cleanup

    /// Delete all downloaded models
    func deleteAllModels() throws {
        for modelType in ModelType.allCases {
            let path = modelPath(for: modelType)
            if FileManager.default.fileExists(atPath: path.path) {
                try FileManager.default.removeItem(at: path)
            }
            downloadStates[modelType] = .notDownloaded
        }

        overallProgress = 0
    }

    /// Delete a specific model
    func deleteModel(_ type: ModelType) throws {
        let path = modelPath(for: type)
        if FileManager.default.fileExists(atPath: path.path) {
            try FileManager.default.removeItem(at: path)
        }
        downloadStates[type] = .notDownloaded
    }
}

// MARK: - Errors

enum OpenVoiceModelError: Error, LocalizedError {
    case modelNotAvailable(String)
    case downloadFailed(String)
    case invalidModelFile
    case conversionRequired

    var errorDescription: String? {
        switch self {
        case .modelNotAvailable(let name):
            return "Model '\(name)' is not available"
        case .downloadFailed(let message):
            return "Download failed: \(message)"
        case .invalidModelFile:
            return "Invalid model file format"
        case .conversionRequired:
            return "ONNX model conversion required. Run the Python script."
        }
    }
}
