//
//  CoreMLTranslationEngine.swift
//  Meeshy
//
//  Core ML-based translation engine using Meta's NLLB (No Language Left Behind) 600M
//  NLLB supports 200+ languages with a single multilingual model (~300MB quantized)
//  Provides on-device translation for iOS 16-17 and fallback for iOS 18+
//
//  NLLB Model Sources (Hugging Face):
//  - PyTorch: https://huggingface.co/facebook/nllb-200-distilled-600M
//  - ONNX: https://huggingface.co/facebook/nllb-200-distilled-600M-onnx (if available)
//
//  Core ML Conversion:
//  To convert NLLB to Core ML, use coremltools:
//  ```python
//  import coremltools as ct
//  from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
//
//  model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
//  tokenizer = AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
//
//  # Trace and convert (requires traced model)
//  mlmodel = ct.convert(traced_model, convert_to="mlprogram",
//                       compute_units=ct.ComputeUnit.CPU_AND_NE)
//  mlmodel.save("nllb-600m.mlpackage")
//  ```
//
//  Pre-converted Core ML models can be hosted on your CDN or found at:
//  - https://huggingface.co/coreml-community (community conversions)
//

import Foundation
import CoreML
import NaturalLanguage

// MARK: - Core ML Translation Engine

/// On-device translation engine using Meta's NLLB 600M (No Language Left Behind)
/// Single multilingual model supporting 200 languages, optimized for Apple Neural Engine
actor CoreMLTranslationEngine {

    // MARK: - Types

    struct TranslationResult {
        let sourceText: String
        let targetText: String
        let sourceLanguage: VoiceTranslationLanguage
        let targetLanguage: VoiceTranslationLanguage
        let confidence: Float
        let processingTime: TimeInterval
        let modelUsed: String
    }

    enum ModelType: String, CaseIterable {
        case nllb600M = "nllb-200-distilled-600M"    // Primary: ~300MB quantized, 200 languages
        case nllbSmall = "nllb-200-distilled-1.3B"   // ~600MB, higher quality
        case helsinkiOpusMT = "helsinki-opus-mt"     // Legacy: ~50-80MB per pair

        var baseURL: String {
            switch self {
            case .nllb600M:
                // Meta's NLLB 600M on Hugging Face
                return "https://huggingface.co/facebook/nllb-200-distilled-600M"
            case .nllbSmall:
                // Meta's NLLB 1.3B on Hugging Face
                return "https://huggingface.co/facebook/nllb-200-distilled-1.3B"
            case .helsinkiOpusMT:
                return "https://huggingface.co/Helsinki-NLP"
            }
        }

        /// Direct download URLs for model files
        var modelDownloadURL: String {
            switch self {
            case .nllb600M:
                return "https://huggingface.co/facebook/nllb-200-distilled-600M/resolve/main/model.safetensors"
            case .nllbSmall:
                return "https://huggingface.co/facebook/nllb-200-distilled-1.3B/resolve/main/model.safetensors"
            case .helsinkiOpusMT:
                return "" // Per-language pair URLs
            }
        }

        /// Tokenizer download URL (SentencePiece)
        var tokenizerDownloadURL: String {
            switch self {
            case .nllb600M:
                return "https://huggingface.co/facebook/nllb-200-distilled-600M/resolve/main/tokenizer.json"
            case .nllbSmall:
                return "https://huggingface.co/facebook/nllb-200-distilled-1.3B/resolve/main/tokenizer.json"
            case .helsinkiOpusMT:
                return ""
            }
        }

        /// SentencePiece model for NLLB tokenization
        var sentencePieceURL: String {
            switch self {
            case .nllb600M, .nllbSmall:
                return "https://huggingface.co/facebook/nllb-200-distilled-600M/resolve/main/sentencepiece.bpe.model"
            case .helsinkiOpusMT:
                return ""
            }
        }

        var isMultilingual: Bool {
            switch self {
            case .nllb600M, .nllbSmall:
                return true  // Single model handles all language pairs
            case .helsinkiOpusMT:
                return false // Requires separate model per pair
            }
        }

        var requiresTokenizer: Bool {
            true // All seq2seq models need SentencePiece tokenization
        }

        var estimatedSize: Int64 {
            switch self {
            case .nllb600M: return 300_000_000     // ~300MB quantized
            case .nllbSmall: return 600_000_000   // ~600MB
            case .helsinkiOpusMT: return 80_000_000  // ~80MB per pair
            }
        }
    }

    /// NLLB language codes (Flores-200 format)
    /// Reference: https://github.com/facebookresearch/flores/blob/main/flores200/README.md
    static let nllbLanguageCodes: [VoiceTranslationLanguage: String] = [
        .english: "eng_Latn",
        .french: "fra_Latn",
        .spanish: "spa_Latn",
        .german: "deu_Latn",
        .portuguese: "por_Latn",
        .italian: "ita_Latn",
        .dutch: "nld_Latn",
        .russian: "rus_Cyrl",
        .chinese: "zho_Hans",
        .japanese: "jpn_Jpan",
        .korean: "kor_Hang",
        .arabic: "arb_Arab"
    ]

    struct ModelInfo: Codable {
        let id: String                      // e.g., "en-fr"
        let type: String                    // ModelType raw value
        let sourceLanguage: String
        let targetLanguage: String
        let version: String
        let sizeBytes: Int64
        let vocabSize: Int
        let maxLength: Int
        let downloadURL: String
        let tokenizerURL: String
        let checksum: String
    }

    // MARK: - Properties

    private var loadedModels: [String: MLModel] = [:]
    private var nllbModel: MLModel?  // Legacy: Single NLLB model (fallback)
    private var nllbEncoder: MLModel?  // Split encoder model (preferred)
    private var nllbDecoder: MLModel?  // Split decoder model (preferred)
    private var tokenizers: [String: TranslationTokenizer] = [:]
    private var nllbTokenizer: NLLBTokenizer?  // SentencePiece tokenizer for NLLB
    private let modelsDirectory: URL
    private let bundledModelsDirectory: URL?
    private let modelConfig: MLModelConfiguration

    /// Whether split encoder/decoder models are available
    private var useSplitModels: Bool { nllbEncoder != nil && nllbDecoder != nil }

    // Download state
    private var downloadTasks: [String: Task<Void, Error>] = [:]
    private var downloadProgress: [String: Double] = [:]

    // Statistics
    private var translationCount = 0
    private var totalProcessingTime: TimeInterval = 0
    private var errors: [String] = []

    // MARK: - Singleton

    static let shared = CoreMLTranslationEngine()

    // MARK: - Initialization

    private init() {
        // Setup models directory for downloaded models
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        modelsDirectory = appSupport.appendingPathComponent("TranslationModels", isDirectory: true)

        // Get bundled models directory from app bundle
        bundledModelsDirectory = Bundle.main.resourceURL?.appendingPathComponent("MLModels")

        // Create directory if needed
        try? FileManager.default.createDirectory(at: modelsDirectory, withIntermediateDirectories: true)

        // Configure ML model - ANE optimized
        // NLLB_ANE model has fixed shapes (seq_len=64) and float16 for ANE compatibility
        modelConfig = MLModelConfiguration()
        modelConfig.computeUnits = .all  // Use ANE + GPU + CPU
    }

    // MARK: - Model Management

    // MARK: - ANE Model Constants

    /// Fixed sequence length for ANE model (must match conversion)
    private let aneSeqLength = 64

    /// Check if bundled NLLB model is available (prefers split encoder/decoder)
    func isBundledNLLBAvailable() -> Bool {
        // PREFERRED: Split encoder/decoder models (fixes autoregressive decoding)
        let splitEncoderPaths = [
            Bundle.main.url(forResource: "NLLBEncoder_seq64", withExtension: "mlmodelc"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLBEncoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBEncoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBEncoder_seq64.mlpackage")
        ].compactMap { $0 }

        let splitDecoderPaths = [
            Bundle.main.url(forResource: "NLLBDecoder_seq64", withExtension: "mlmodelc"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLBDecoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBDecoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBDecoder_seq64.mlpackage")
        ].compactMap { $0 }

        // Check for split models first
        for encoderPath in splitEncoderPaths {
            if FileManager.default.fileExists(atPath: encoderPath.path) {
                for decoderPath in splitDecoderPaths {
                    if FileManager.default.fileExists(atPath: decoderPath.path) {
                        print("✅ [NLLB] Found split encoder/decoder models")
                        print("   Encoder: \(encoderPath.path)")
                        print("   Decoder: \(decoderPath.path)")
                        return true
                    }
                }
            }
        }

        // FALLBACK: Combined ANE model (has autoregressive issues)
        let possiblePaths = [
            Bundle.main.url(forResource: "NLLB600M_ANE", withExtension: "mlmodelc"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLB600M_ANE.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLB600M_ANE.mlmodelc"),
            Bundle.main.url(forResource: "NLLB600M_ANE", withExtension: "mlpackage"),
            bundledModelsDirectory?.appendingPathComponent("NLLB600M_ANE.mlpackage")
        ].compactMap { $0 }

        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path.path) {
                print("⚠️ [NLLB] Found legacy combined model (may have autoregressive issues): \(path.path)")
                return true
            }
        }

        print("⚠️ [NLLB] Bundled model not found")
        return false
    }

    /// Check if NLLB tokenizer is available in bundle
    func isBundledTokenizerAvailable() -> Bool {
        let possiblePaths = [
            bundledModelsDirectory?.appendingPathComponent("NLLBTokenizer/tokenizer.json"),
            Bundle.main.url(forResource: "tokenizer", withExtension: "json", subdirectory: "NLLBTokenizer"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLBTokenizer/tokenizer.json")
        ].compactMap { $0 }

        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path.path) {
                print("✅ [NLLB] Found tokenizer at: \(path.path)")
                return true
            }
        }

        print("⚠️ [NLLB] Tokenizer not found")
        return false
    }

    /// Check if a model is available locally (NLLB supports all pairs with one model)
    func isModelAvailable(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) -> Bool {
        // First check if NLLB bundled model is available (supports all pairs)
        if isBundledNLLBAvailable() {
            // Check if language pair is supported by NLLB
            return Self.nllbLanguageCodes[source] != nil && Self.nllbLanguageCodes[target] != nil
        }

        // Fall back to checking per-pair models
        let modelKey = makeModelKey(source: source, target: target)
        let modelPath = modelsDirectory.appendingPathComponent("\(modelKey).mlmodelc")
        return FileManager.default.fileExists(atPath: modelPath.path)
    }

    /// Check if a model is loaded in memory
    func isModelLoaded(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) -> Bool {
        // NLLB model handles all pairs
        if nllbModel != nil {
            return Self.nllbLanguageCodes[source] != nil && Self.nllbLanguageCodes[target] != nil
        }

        let modelKey = makeModelKey(source: source, target: target)
        return loadedModels[modelKey] != nil
    }

    /// Load the bundled NLLB model (prefers split encoder/decoder)
    func loadBundledNLLB() async throws {
        // Already loaded?
        if useSplitModels { return }
        if nllbModel != nil { return }

        print("🔄 [NLLB] Loading bundled model...")

        // PREFERRED: Try to load split encoder/decoder first
        if try await loadSplitModels() {
            print("✅ [NLLB] Split encoder/decoder loaded successfully")
            try loadBundledTokenizer()
            return
        }

        // FALLBACK: Load combined model (has autoregressive issues)
        print("⚠️ [NLLB] Split models not found, trying combined model...")

        let possiblePaths = [
            Bundle.main.url(forResource: "NLLB600M_ANE", withExtension: "mlmodelc"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLB600M_ANE.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLB600M_ANE.mlmodelc"),
            Bundle.main.url(forResource: "NLLB600M_ANE", withExtension: "mlpackage"),
            bundledModelsDirectory?.appendingPathComponent("NLLB600M_ANE.mlpackage")
        ].compactMap { $0 }

        var nllbPath: URL?
        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path.path) {
                nllbPath = path
                break
            }
        }

        guard let modelPath = nllbPath else {
            throw CoreMLTranslationError.modelNotFound("NLLB models not found")
        }

        print("⚠️ [NLLB] Loading legacy combined model (may have issues): \(modelPath.path)")

        do {
            if modelPath.pathExtension == "mlmodelc" {
                nllbModel = try MLModel(contentsOf: modelPath, configuration: modelConfig)
            } else {
                let compiledURL = try await MLModel.compileModel(at: modelPath)
                nllbModel = try MLModel(contentsOf: compiledURL, configuration: modelConfig)
            }
        } catch {
            let cpuConfig = MLModelConfiguration()
            cpuConfig.computeUnits = .cpuOnly
            if modelPath.pathExtension == "mlmodelc" {
                nllbModel = try MLModel(contentsOf: modelPath, configuration: cpuConfig)
            } else {
                let compiledURL = try await MLModel.compileModel(at: modelPath)
                nllbModel = try MLModel(contentsOf: compiledURL, configuration: cpuConfig)
            }
        }

        try loadBundledTokenizer()
    }

    /// Load split encoder/decoder models
    private func loadSplitModels() async throws -> Bool {
        let splitEncoderPaths = [
            Bundle.main.url(forResource: "NLLBEncoder_seq64", withExtension: "mlmodelc"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLBEncoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBEncoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBEncoder_seq64.mlpackage")
        ].compactMap { $0 }

        let splitDecoderPaths = [
            Bundle.main.url(forResource: "NLLBDecoder_seq64", withExtension: "mlmodelc"),
            Bundle.main.resourceURL?.appendingPathComponent("NLLBDecoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBDecoder_seq64.mlmodelc"),
            bundledModelsDirectory?.appendingPathComponent("NLLBDecoder_seq64.mlpackage")
        ].compactMap { $0 }

        var encoderPath: URL?
        var decoderPath: URL?

        for path in splitEncoderPaths {
            if FileManager.default.fileExists(atPath: path.path) {
                encoderPath = path
                break
            }
        }

        for path in splitDecoderPaths {
            if FileManager.default.fileExists(atPath: path.path) {
                decoderPath = path
                break
            }
        }

        guard let encPath = encoderPath, let decPath = decoderPath else {
            return false
        }

        print("🔄 [NLLB] Loading split encoder from: \(encPath.path)")
        print("🔄 [NLLB] Loading split decoder from: \(decPath.path)")

        // Load encoder
        if encPath.pathExtension == "mlmodelc" {
            nllbEncoder = try MLModel(contentsOf: encPath, configuration: modelConfig)
        } else {
            let compiledURL = try await MLModel.compileModel(at: encPath)
            nllbEncoder = try MLModel(contentsOf: compiledURL, configuration: modelConfig)
        }

        // Load decoder
        if decPath.pathExtension == "mlmodelc" {
            nllbDecoder = try MLModel(contentsOf: decPath, configuration: modelConfig)
        } else {
            let compiledURL = try await MLModel.compileModel(at: decPath)
            nllbDecoder = try MLModel(contentsOf: compiledURL, configuration: modelConfig)
        }

        print("✅ [NLLB] Both encoder and decoder loaded")
        return true
    }

    /// Load the bundled NLLB tokenizer
    private func loadBundledTokenizer() throws {
        print("🔄 [NLLB] Loading tokenizer...")

        // Find tokenizer directory - Xcode may put it at bundle root or in MLModels
        let possiblePaths = [
            // In bundle root (Xcode copies folders)
            Bundle.main.resourceURL?.appendingPathComponent("NLLBTokenizer"),
            Bundle.main.bundleURL.appendingPathComponent("NLLBTokenizer"),
            // In MLModels subdirectory
            bundledModelsDirectory?.appendingPathComponent("NLLBTokenizer"),
            // Direct path
            Bundle.main.url(forResource: "NLLBTokenizer", withExtension: nil)
        ].compactMap { $0 }

        var tokenizerDir: URL?
        for path in possiblePaths {
            let tokenizerFile = path.appendingPathComponent("tokenizer.json")
            if FileManager.default.fileExists(atPath: tokenizerFile.path) {
                tokenizerDir = path
                print("✅ [NLLB] Found tokenizer at: \(path.path)")
                break
            }
        }

        guard let dir = tokenizerDir else {
            print("❌ [NLLB] Tokenizer not found at any path:")
            for path in possiblePaths {
                print("   - \(path.path)")
            }
            throw CoreMLTranslationError.tokenizerNotFound
        }

        nllbTokenizer = try NLLBTokenizer(directory: dir)
        print("✅ [NLLB] Tokenizer loaded successfully")
    }

    /// Load a translation model into memory
    func loadModel(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) async throws {
        let modelKey = makeModelKey(source: source, target: target)

        guard loadedModels[modelKey] == nil else {
            return // Already loaded
        }

        let modelPath = modelsDirectory.appendingPathComponent("\(modelKey).mlmodelc")
        let tokenizerPath = modelsDirectory.appendingPathComponent("\(modelKey).tokenizer.json")

        guard FileManager.default.fileExists(atPath: modelPath.path) else {
            throw CoreMLTranslationError.modelNotFound(modelKey)
        }

        // Load model (compileModel is async in iOS 16+)
        let compiledURL = try await MLModel.compileModel(at: modelPath)
        let model = try MLModel(contentsOf: compiledURL, configuration: modelConfig)
        loadedModels[modelKey] = model

        // Load tokenizer
        if FileManager.default.fileExists(atPath: tokenizerPath.path) {
            let tokenizer = try TranslationTokenizer(url: tokenizerPath)
            tokenizers[modelKey] = tokenizer
        }

        print("Loaded translation model: \(modelKey)")
    }

    /// Unload a model to free memory
    func unloadModel(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) {
        let modelKey = makeModelKey(source: source, target: target)
        loadedModels.removeValue(forKey: modelKey)
        tokenizers.removeValue(forKey: modelKey)
    }

    /// Unload all models
    func unloadAllModels() {
        loadedModels.removeAll()
        tokenizers.removeAll()
    }

    // MARK: - Translation

    /// Translate text using loaded Core ML model
    func translate(
        _ text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage
    ) async throws -> TranslationResult {
        let startTime = CFAbsoluteTimeGetCurrent()

        print("🔍 [CoreML] translate() called: \(source.rawValue) -> \(target.rawValue)")
        print("   NLLB bundled available: \(isBundledNLLBAvailable())")
        print("   NLLB model loaded: \(nllbModel != nil)")

        // Try NLLB first (preferred - multilingual)
        if isBundledNLLBAvailable() || nllbModel != nil {
            print("🔄 [CoreML] Using NLLB for translation")
            return try await translateWithNLLB(text, from: source, to: target, startTime: startTime)
        }

        print("⚠️ [CoreML] NLLB not available, falling back to per-pair models")

        // Fall back to per-pair models
        let modelKey = makeModelKey(source: source, target: target)

        // Ensure model is loaded
        if loadedModels[modelKey] == nil {
            try await loadModel(source: source, target: target)
        }

        guard let model = loadedModels[modelKey] else {
            throw CoreMLTranslationError.modelNotFound(modelKey)
        }

        guard let tokenizer = tokenizers[modelKey] else {
            // Fall back to simple word-based translation if no tokenizer
            let translatedText = try await translateWithoutTokenizer(
                text: text,
                model: model,
                source: source,
                target: target
            )

            let processingTime = CFAbsoluteTimeGetCurrent() - startTime
            updateStats(processingTime: processingTime)

            return TranslationResult(
                sourceText: text,
                targetText: translatedText,
                sourceLanguage: source,
                targetLanguage: target,
                confidence: 0.8,
                processingTime: processingTime,
                modelUsed: modelKey
            )
        }

        // Tokenize input
        let inputTokens = tokenizer.encode(text)

        // Prepare model input
        let translatedTokens = try await performInference(
            tokens: inputTokens,
            model: model,
            maxLength: tokenizer.maxLength
        )

        // Decode output
        let translatedText = tokenizer.decode(translatedTokens)

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        updateStats(processingTime: processingTime)

        return TranslationResult(
            sourceText: text,
            targetText: translatedText,
            sourceLanguage: source,
            targetLanguage: target,
            confidence: 0.9,
            processingTime: processingTime,
            modelUsed: modelKey
        )
    }

    /// Translate using NLLB multilingual model
    private func translateWithNLLB(
        _ text: String,
        from source: VoiceTranslationLanguage,
        to target: VoiceTranslationLanguage,
        startTime: CFAbsoluteTime
    ) async throws -> TranslationResult {
        print("🔄 [NLLB] Starting translation...")

        // Ensure NLLB is loaded
        if !useSplitModels && nllbModel == nil {
            print("🔄 [NLLB] Model not loaded, loading now...")
            try await loadBundledNLLB()
        }

        // Verify we have at least one model type loaded
        guard useSplitModels || nllbModel != nil else {
            print("❌ [NLLB] No models loaded after attempt")
            throw CoreMLTranslationError.modelNotFound("NLLB")
        }

        guard let tokenizer = nllbTokenizer else {
            print("❌ [NLLB] Tokenizer is nil")
            throw CoreMLTranslationError.tokenizerNotFound
        }

        // Get NLLB language codes
        guard let sourceCode = Self.nllbLanguageCodes[source],
              let targetCode = Self.nllbLanguageCodes[target] else {
            print("❌ [NLLB] Language not supported: \(source) -> \(target)")
            throw CoreMLTranslationError.modelNotFound("Language not supported: \(source) -> \(target)")
        }

        print("🔄 [NLLB] Encoding: \(sourceCode) -> \(targetCode)")
        print("   Using split models: \(useSplitModels)")

        // Encode input with source language prefix
        let inputTokens = tokenizer.encode(text, sourceLanguage: sourceCode, targetLanguage: targetCode)
        print("🔄 [NLLB] Input tokens: \(inputTokens.count)")

        // Run inference using appropriate model
        let outputTokens: [Int]
        if useSplitModels, let encoder = nllbEncoder, let decoder = nllbDecoder {
            print("🔄 [NLLB] Using SPLIT encoder/decoder...")
            outputTokens = try await performSplitNLLBInference(
                tokens: inputTokens,
                encoder: encoder,
                decoder: decoder,
                targetLanguageCode: targetCode
            )
        } else if let model = nllbModel {
            print("⚠️ [NLLB] Using LEGACY combined model (may have issues)...")
            outputTokens = try await performNLLBInference(
                tokens: inputTokens,
                model: model,
                targetLanguageCode: targetCode
            )
        } else {
            throw CoreMLTranslationError.modelNotLoaded
        }

        print("🔄 [NLLB] Output tokens: \(outputTokens.count)")

        // Decode output
        let translatedText = tokenizer.decode(outputTokens)

        let processingTime = CFAbsoluteTimeGetCurrent() - startTime
        updateStats(processingTime: processingTime)

        print("✅ [NLLB] Translation complete in \(String(format: "%.0fms", processingTime * 1000))")
        print("   Input: '\(text.prefix(30))...'")
        print("   Output: '\(translatedText.prefix(30))...'")

        return TranslationResult(
            sourceText: text,
            targetText: translatedText,
            sourceLanguage: source,
            targetLanguage: target,
            confidence: useSplitModels ? 0.95 : 0.75,  // Split models are more reliable
            processingTime: processingTime,
            modelUsed: useSplitModels ? "NLLB-600M-Split" : "NLLB-600M"
        )
    }

    /// Perform NLLB model inference with autoregressive decoding
    /// NLLB is an encoder-decoder model that requires token-by-token generation
    private func performNLLBInference(
        tokens: [Int],
        model: MLModel,
        targetLanguageCode: String
    ) async throws -> [Int] {
        // ANE model requires FIXED sequence length (64)
        let seqLen = aneSeqLength
        var paddedTokens = tokens

        // Truncate if too long (keep EOS at end)
        if paddedTokens.count > seqLen {
            paddedTokens = Array(paddedTokens.prefix(seqLen - 1)) + [2] // 2 = EOS
        }

        // Pad if too short (pad token = 1)
        let originalLen = paddedTokens.count
        while paddedTokens.count < seqLen {
            paddedTokens.append(1) // 1 = PAD token
        }

        print("🔄 [NLLB] Encoder tokens: \(originalLen) → padded to \(seqLen)")

        // Create FIXED encoder input tensor (reused for all decoder steps)
        let inputShape = [1, seqLen] as [NSNumber]
        guard let inputArray = try? MLMultiArray(shape: inputShape, dataType: .int32) else {
            throw CoreMLTranslationError.inputCreationFailed
        }
        for (i, token) in paddedTokens.enumerated() {
            inputArray[i] = NSNumber(value: token)
        }

        // Create attention mask (1 for real tokens, 0 for padding)
        guard let attentionMask = try? MLMultiArray(shape: inputShape, dataType: .int32) else {
            throw CoreMLTranslationError.inputCreationFailed
        }
        for i in 0..<seqLen {
            attentionMask[i] = NSNumber(value: i < originalLen ? 1 : 0)
        }

        // === AUTOREGRESSIVE DECODING ===
        // Start with target language token, generate tokens one by one
        let decoderStartToken = nllbTokenizer?.getLanguageToken(targetLanguageCode) ?? 2
        var generatedTokens: [Int] = [decoderStartToken]
        let maxOutputTokens = seqLen - 1  // Leave room for EOS

        print("🔄 [NLLB] Starting autoregressive decoding (target: \(targetLanguageCode), start token: \(decoderStartToken))")

        for step in 0..<maxOutputTokens {
            // Create decoder input with generated tokens so far
            guard let decoderInput = try? MLMultiArray(shape: [1, seqLen] as [NSNumber], dataType: .int32) else {
                throw CoreMLTranslationError.inputCreationFailed
            }

            // Fill with generated tokens
            for (i, token) in generatedTokens.enumerated() where i < seqLen {
                decoderInput[i] = NSNumber(value: token)
            }
            // Pad remaining positions
            for i in generatedTokens.count..<seqLen {
                decoderInput[i] = NSNumber(value: 1) // PAD
            }

            // Run inference
            let inputFeatures = NLLBModelInput(
                inputIds: inputArray,
                attentionMask: attentionMask,
                decoderInputIds: decoderInput
            )

            guard let output = try? await model.prediction(from: inputFeatures) else {
                throw CoreMLTranslationError.inferenceFailed
            }

            guard let logitsFeature = output.featureValue(for: "logits"),
                  let logits = logitsFeature.multiArrayValue else {
                throw CoreMLTranslationError.outputParsingFailed
            }

            // Get next token from the LAST generated position
            // Position = len(generatedTokens) - 1 predicts the NEXT token
            let predictionPos = generatedTokens.count - 1
            let nextToken = argmaxAtPosition(logits: logits, position: predictionPos)

            // Stop at EOS token (2 for NLLB)
            if nextToken == 2 {
                print("🔄 [NLLB] EOS reached at step \(step)")
                break
            }

            // Stop at PAD token (shouldn't happen but just in case)
            if nextToken == 1 {
                print("🔄 [NLLB] PAD token reached at step \(step)")
                break
            }

            generatedTokens.append(nextToken)

            // Progress logging every 10 tokens
            if step % 10 == 0 {
                print("🔄 [NLLB] Step \(step): generated \(generatedTokens.count) tokens")
            }
        }

        print("✅ [NLLB] Decoding complete: \(generatedTokens.count) tokens generated")

        // Return tokens without the start language token
        return Array(generatedTokens.dropFirst())
    }

    /// Get argmax token at a specific position in logits
    private func argmaxAtPosition(logits: MLMultiArray, position: Int) -> Int {
        let vocabSize = logits.shape[2].intValue
        var maxIdx = 0
        var maxVal: Float = -Float.infinity

        for j in 0..<vocabSize {
            let val = logits[[0, position, j] as [NSNumber]].floatValue
            if val > maxVal {
                maxVal = val
                maxIdx = j
            }
        }

        return maxIdx
    }

    // MARK: - Split Encoder/Decoder Inference

    /// Perform NLLB inference with SPLIT encoder/decoder models
    /// This is the correct approach for encoder-decoder autoregressive generation:
    /// 1. Run encoder ONCE to get encoder_hidden_states (cached)
    /// 2. Run decoder ITERATIVELY, passing cached encoder states each time
    ///
    /// IMPORTANT: The decoder expects a 4D attention mask (1, 1, 1, seq_len) with float16 values:
    /// - 0.0 for tokens to attend to
    /// - -inf for tokens to ignore (padding)
    private func performSplitNLLBInference(
        tokens: [Int],
        encoder: MLModel,
        decoder: MLModel,
        targetLanguageCode: String
    ) async throws -> [Int] {
        let seqLen = aneSeqLength
        var paddedTokens = tokens

        // Truncate if too long
        if paddedTokens.count > seqLen {
            paddedTokens = Array(paddedTokens.prefix(seqLen - 1)) + [2] // 2 = EOS
        }

        // Track original length for attention mask
        let originalLen = paddedTokens.count

        // Pad if too short
        while paddedTokens.count < seqLen {
            paddedTokens.append(1) // 1 = PAD
        }

        print("🔄 [NLLB-Split] Encoder input: \(originalLen) → padded to \(seqLen)")

        // === STEP 1: Run Encoder ONCE ===
        let inputShape = [1, seqLen] as [NSNumber]

        // Create encoder input_ids
        guard let inputIds = try? MLMultiArray(shape: inputShape, dataType: .int32) else {
            throw CoreMLTranslationError.inputCreationFailed
        }
        for (i, token) in paddedTokens.enumerated() {
            inputIds[i] = NSNumber(value: token)
        }

        // Create 2D attention mask for encoder (1 for real tokens, 0 for padding)
        guard let encoderAttentionMask = try? MLMultiArray(shape: inputShape, dataType: .int32) else {
            throw CoreMLTranslationError.inputCreationFailed
        }
        for i in 0..<seqLen {
            encoderAttentionMask[i] = NSNumber(value: i < originalLen ? 1 : 0)
        }

        // Run encoder
        print("🔄 [NLLB-Split] Running encoder...")
        let encoderInput = NLLBEncoderInput(inputIds: inputIds, attentionMask: encoderAttentionMask)
        guard let encoderOutput = try? await encoder.prediction(from: encoderInput) else {
            throw CoreMLTranslationError.inferenceFailed
        }

        guard let encoderHiddenFeature = encoderOutput.featureValue(for: "encoder_hidden_states"),
              let encoderHiddenStates = encoderHiddenFeature.multiArrayValue else {
            throw CoreMLTranslationError.outputParsingFailed
        }

        print("   Encoder output shape: \(encoderHiddenStates.shape)")

        // === Create 4D attention mask for decoder ===
        // Shape: (1, 1, 1, seq_len) with float16 values
        // Values: 0.0 for attend, -inf for ignore (padding)
        let decoderMaskShape = [1, 1, 1, seqLen] as [NSNumber]
        guard let decoderAttentionMask = try? MLMultiArray(shape: decoderMaskShape, dataType: .float16) else {
            throw CoreMLTranslationError.inputCreationFailed
        }
        for i in 0..<seqLen {
            // 0.0 = attend to token, -inf = ignore token (padding)
            let maskValue: Float16 = i < originalLen ? 0.0 : -.infinity
            decoderAttentionMask[i] = NSNumber(value: Float(maskValue))
        }

        print("   Decoder attention mask shape: \(decoderAttentionMask.shape)")

        // === STEP 2: Run Decoder ITERATIVELY ===
        let decoderStartToken = nllbTokenizer?.getLanguageToken(targetLanguageCode) ?? 2
        var generatedTokens: [Int] = [decoderStartToken]
        let maxOutputTokens = seqLen - 1

        print("🔄 [NLLB-Split] Starting decoder loop (start token: \(decoderStartToken))")

        for step in 0..<maxOutputTokens {
            // Create decoder input_ids with tokens generated so far
            guard let decoderInputIds = try? MLMultiArray(shape: inputShape, dataType: .int32) else {
                throw CoreMLTranslationError.inputCreationFailed
            }

            // Fill with generated tokens
            for (i, token) in generatedTokens.enumerated() where i < seqLen {
                decoderInputIds[i] = NSNumber(value: token)
            }
            // Pad remaining positions
            for i in generatedTokens.count..<seqLen {
                decoderInputIds[i] = NSNumber(value: 1) // PAD
            }

            // Run decoder with cached encoder hidden states and 4D attention mask
            let decoderInput = NLLBDecoderInput(
                decoderInputIds: decoderInputIds,
                encoderHiddenStates: encoderHiddenStates,
                encoderAttentionMask: decoderAttentionMask
            )

            guard let decoderOutput = try? await decoder.prediction(from: decoderInput) else {
                throw CoreMLTranslationError.inferenceFailed
            }

            guard let logitsFeature = decoderOutput.featureValue(for: "logits"),
                  let logits = logitsFeature.multiArrayValue else {
                throw CoreMLTranslationError.outputParsingFailed
            }

            // Get next token - predict at the LAST generated position
            let predictionPos = generatedTokens.count - 1
            let nextToken = argmaxAtPosition(logits: logits, position: predictionPos)

            // Stop at EOS (2) or PAD (1)
            if nextToken == 2 {
                print("🔄 [NLLB-Split] EOS at step \(step)")
                break
            }
            if nextToken == 1 {
                print("🔄 [NLLB-Split] PAD at step \(step)")
                break
            }

            generatedTokens.append(nextToken)

            // Progress logging
            if step % 10 == 0 {
                print("   Step \(step): \(generatedTokens.count) tokens")
            }
        }

        print("✅ [NLLB-Split] Generated \(generatedTokens.count) tokens")

        // Return without the start language token
        return Array(generatedTokens.dropFirst())
    }

    /// Translate without tokenizer (simplified approach)
    private func translateWithoutTokenizer(
        text: String,
        model: MLModel,
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage
    ) async throws -> String {
        // For models without bundled tokenizer, use NLTokenizer
        let nlTokenizer = NLTokenizer(unit: .word)
        nlTokenizer.string = text

        var words: [String] = []
        nlTokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
            words.append(String(text[range]))
            return true
        }

        // Simple word-by-word approach (less accurate but functional)
        // In production, you'd want proper sentence-piece or BPE tokenization
        let inputArray = try createInputArray(from: words, maxLength: 512)

        guard let prediction = try? await model.prediction(from: inputArray) else {
            throw CoreMLTranslationError.inferenceFailed
        }

        // Extract output tokens and decode
        if let outputFeature = prediction.featureValue(for: "output_ids"),
           let outputArray = outputFeature.multiArrayValue {
            let tokens = extractTokens(from: outputArray)
            return decodeSimple(tokens: tokens)
        }

        throw CoreMLTranslationError.inferenceFailed
    }

    /// Perform model inference
    private func performInference(
        tokens: [Int],
        model: MLModel,
        maxLength: Int
    ) async throws -> [Int] {
        // Create input tensor
        let inputShape = [1, tokens.count] as [NSNumber]
        guard let inputArray = try? MLMultiArray(shape: inputShape, dataType: .int32) else {
            throw CoreMLTranslationError.inputCreationFailed
        }

        // Fill input array
        for (i, token) in tokens.enumerated() {
            inputArray[i] = NSNumber(value: token)
        }

        // Create input feature provider
        let inputFeatures = TranslationModelInput(inputIds: inputArray)

        // Run inference (prediction is async in modern CoreML)
        guard let output = try? await model.prediction(from: inputFeatures) else {
            throw CoreMLTranslationError.inferenceFailed
        }

        // Extract output tokens
        guard let outputFeature = output.featureValue(for: "output_ids"),
              let outputArray = outputFeature.multiArrayValue else {
            throw CoreMLTranslationError.outputParsingFailed
        }

        return extractTokens(from: outputArray)
    }

    private func extractTokens(from array: MLMultiArray) -> [Int] {
        var tokens: [Int] = []
        let length = array.shape[1].intValue

        for i in 0..<length {
            let token = array[[0, i] as [NSNumber]].intValue
            if token == 0 || token == 1 { break } // EOS or PAD
            tokens.append(token)
        }

        return tokens
    }

    private func createInputArray(from words: [String], maxLength: Int) throws -> MLFeatureProvider {
        // Simple word-to-index mapping (placeholder - real implementation needs vocab)
        let shape = [1, min(words.count, maxLength)] as [NSNumber]
        let inputArray = try MLMultiArray(shape: shape, dataType: .int32)

        for (i, _) in words.prefix(maxLength).enumerated() {
            // Placeholder: in real implementation, use vocabulary lookup
            inputArray[i] = NSNumber(value: i + 100) // Offset to avoid special tokens
        }

        return TranslationModelInput(inputIds: inputArray)
    }

    private func decodeSimple(tokens: [Int]) -> String {
        // Placeholder: return token IDs as string (real implementation decodes)
        return tokens.map { String($0) }.joined(separator: " ")
    }

    // MARK: - Model Download

    /// Download a translation model
    func downloadModel(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage,
        modelType: ModelType = .helsinkiOpusMT,
        onProgress: @escaping (Double) -> Void
    ) async throws {
        let modelKey = makeModelKey(source: source, target: target)

        // Prevent duplicate downloads
        if downloadTasks[modelKey] != nil {
            return
        }

        // Get model info from server
        let modelInfo = try await fetchModelInfo(source: source, target: target, type: modelType)

        // Download model file
        guard let modelURL = URL(string: modelInfo.downloadURL) else {
            throw CoreMLTranslationError.invalidModelURL
        }

        let destinationURL = modelsDirectory.appendingPathComponent("\(modelKey).mlmodelc")

        let task = Task {
            let (tempURL, _) = try await URLSession.shared.download(from: modelURL) { bytesWritten, totalBytes in
                let progress = Double(bytesWritten) / Double(totalBytes)
                Task { @MainActor in
                    onProgress(progress)
                }
            }

            // Move to final location
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.moveItem(at: tempURL, to: destinationURL)

            // Download tokenizer if available
            if let tokenizerURL = URL(string: modelInfo.tokenizerURL) {
                let tokenizerDest = modelsDirectory.appendingPathComponent("\(modelKey).tokenizer.json")
                let (tokenizerTemp, _) = try await URLSession.shared.download(from: tokenizerURL)
                if FileManager.default.fileExists(atPath: tokenizerDest.path) {
                    try FileManager.default.removeItem(at: tokenizerDest)
                }
                try FileManager.default.moveItem(at: tokenizerTemp, to: tokenizerDest)
            }
        }

        downloadTasks[modelKey] = task
        try await task.value
        downloadTasks.removeValue(forKey: modelKey)
    }

    /// Fetch model info from server
    private func fetchModelInfo(
        source: VoiceTranslationLanguage,
        target: VoiceTranslationLanguage,
        type: ModelType
    ) async throws -> ModelInfo {
        let modelKey = makeModelKey(source: source, target: target)

        // In production, fetch from server
        // For now, return a template
        return ModelInfo(
            id: modelKey,
            type: type.rawValue,
            sourceLanguage: source.rawValue,
            targetLanguage: target.rawValue,
            version: "1.0.0",
            sizeBytes: 80_000_000, // ~80MB
            vocabSize: 32000,
            maxLength: 512,
            downloadURL: "\(type.baseURL)/\(modelKey).mlmodelc.zip",
            tokenizerURL: "\(type.baseURL)/\(modelKey).tokenizer.json",
            checksum: ""
        )
    }

    /// Delete a downloaded model
    func deleteModel(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) throws {
        let modelKey = makeModelKey(source: source, target: target)

        // Unload from memory
        unloadModel(source: source, target: target)

        // Delete files
        let modelPath = modelsDirectory.appendingPathComponent("\(modelKey).mlmodelc")
        let tokenizerPath = modelsDirectory.appendingPathComponent("\(modelKey).tokenizer.json")

        if FileManager.default.fileExists(atPath: modelPath.path) {
            try FileManager.default.removeItem(at: modelPath)
        }
        if FileManager.default.fileExists(atPath: tokenizerPath.path) {
            try FileManager.default.removeItem(at: tokenizerPath)
        }
    }

    // MARK: - Utilities

    private func makeModelKey(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage) -> String {
        "\(source.rawValue)-\(target.rawValue)"
    }

    private func updateStats(processingTime: TimeInterval) {
        translationCount += 1
        totalProcessingTime += processingTime
    }

    /// Get available downloaded models
    func getDownloadedModels() -> [(source: VoiceTranslationLanguage, target: VoiceTranslationLanguage)] {
        var models: [(VoiceTranslationLanguage, VoiceTranslationLanguage)] = []

        guard let files = try? FileManager.default.contentsOfDirectory(at: modelsDirectory, includingPropertiesForKeys: nil) else {
            return models
        }

        for file in files where file.pathExtension == "mlmodelc" {
            let name = file.deletingPathExtension().lastPathComponent
            let parts = name.split(separator: "-")
            guard parts.count == 2,
                  let source = VoiceTranslationLanguage(rawValue: String(parts[0])),
                  let target = VoiceTranslationLanguage(rawValue: String(parts[1])) else {
                continue
            }
            models.append((source, target))
        }

        return models
    }

    /// Get statistics
    func getStatistics() -> (count: Int, averageTime: TimeInterval) {
        let avgTime = translationCount > 0 ? totalProcessingTime / Double(translationCount) : 0
        return (translationCount, avgTime)
    }

    /// Get total storage used by models
    func getStorageUsed() -> Int64 {
        var total: Int64 = 0

        guard let files = try? FileManager.default.contentsOfDirectory(at: modelsDirectory, includingPropertiesForKeys: [.fileSizeKey]) else {
            return total
        }

        for file in files {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
               let size = attrs[.size] as? Int64 {
                total += size
            }
        }

        return total
    }
}

// MARK: - Translation Tokenizer

/// Simple tokenizer for translation models
struct TranslationTokenizer {
    private let vocab: [String: Int]
    private let reverseVocab: [Int: String]
    let maxLength: Int

    // Special tokens
    private let padToken = 0
    private let eosToken = 1
    private let bosToken = 2
    private let unkToken = 3

    init(url: URL) throws {
        let data = try Data(contentsOf: url)
        let json = try JSONDecoder().decode(TokenizerConfig.self, from: data)

        self.vocab = json.vocab
        self.reverseVocab = Dictionary(uniqueKeysWithValues: json.vocab.map { ($1, $0) })
        self.maxLength = json.maxLength ?? 512
    }

    /// Encode text to token IDs
    func encode(_ text: String) -> [Int] {
        var tokens = [bosToken]

        // Simple word-level tokenization (real implementation uses SentencePiece/BPE)
        let words = text.lowercased().split(separator: " ")
        for word in words {
            let wordStr = String(word)
            if let tokenId = vocab[wordStr] {
                tokens.append(tokenId)
            } else {
                // Unknown token - try subword fallback
                tokens.append(unkToken)
            }
        }

        tokens.append(eosToken)

        // Pad or truncate to maxLength
        if tokens.count > maxLength {
            return Array(tokens.prefix(maxLength))
        } else {
            return tokens + Array(repeating: padToken, count: maxLength - tokens.count)
        }
    }

    /// Decode token IDs to text
    func decode(_ tokens: [Int]) -> String {
        var words: [String] = []

        for token in tokens {
            guard token != padToken && token != eosToken && token != bosToken else {
                continue
            }
            if let word = reverseVocab[token] {
                words.append(word)
            }
        }

        return words.joined(separator: " ")
    }
}

/// Tokenizer configuration from JSON
private struct TokenizerConfig: Codable {
    let vocab: [String: Int]
    let maxLength: Int?
}

// MARK: - Model Input

/// Feature provider for translation model input
private class TranslationModelInput: MLFeatureProvider {
    let inputIds: MLMultiArray

    var featureNames: Set<String> {
        ["input_ids"]
    }

    init(inputIds: MLMultiArray) {
        self.inputIds = inputIds
    }

    func featureValue(for featureName: String) -> MLFeatureValue? {
        if featureName == "input_ids" {
            return MLFeatureValue(multiArray: inputIds)
        }
        return nil
    }
}

/// Feature provider for NLLB model input (encoder-decoder architecture)
private class NLLBModelInput: MLFeatureProvider {
    let inputIds: MLMultiArray
    let attentionMask: MLMultiArray
    let decoderInputIds: MLMultiArray

    var featureNames: Set<String> {
        ["input_ids", "attention_mask", "decoder_input_ids"]
    }

    init(inputIds: MLMultiArray, attentionMask: MLMultiArray, decoderInputIds: MLMultiArray) {
        self.inputIds = inputIds
        self.attentionMask = attentionMask
        self.decoderInputIds = decoderInputIds
    }

    func featureValue(for featureName: String) -> MLFeatureValue? {
        switch featureName {
        case "input_ids":
            return MLFeatureValue(multiArray: inputIds)
        case "attention_mask":
            return MLFeatureValue(multiArray: attentionMask)
        case "decoder_input_ids":
            return MLFeatureValue(multiArray: decoderInputIds)
        default:
            return nil
        }
    }
}

/// Feature provider for NLLB ENCODER input (split model)
private class NLLBEncoderInput: MLFeatureProvider {
    let inputIds: MLMultiArray
    let attentionMask: MLMultiArray

    var featureNames: Set<String> {
        ["input_ids", "attention_mask"]
    }

    init(inputIds: MLMultiArray, attentionMask: MLMultiArray) {
        self.inputIds = inputIds
        self.attentionMask = attentionMask
    }

    func featureValue(for featureName: String) -> MLFeatureValue? {
        switch featureName {
        case "input_ids":
            return MLFeatureValue(multiArray: inputIds)
        case "attention_mask":
            return MLFeatureValue(multiArray: attentionMask)
        default:
            return nil
        }
    }
}

/// Feature provider for NLLB DECODER input (split model)
private class NLLBDecoderInput: MLFeatureProvider {
    let decoderInputIds: MLMultiArray
    let encoderHiddenStates: MLMultiArray
    let encoderAttentionMask: MLMultiArray

    var featureNames: Set<String> {
        ["decoder_input_ids", "encoder_hidden_states", "encoder_attention_mask"]
    }

    init(decoderInputIds: MLMultiArray, encoderHiddenStates: MLMultiArray, encoderAttentionMask: MLMultiArray) {
        self.decoderInputIds = decoderInputIds
        self.encoderHiddenStates = encoderHiddenStates
        self.encoderAttentionMask = encoderAttentionMask
    }

    func featureValue(for featureName: String) -> MLFeatureValue? {
        switch featureName {
        case "decoder_input_ids":
            return MLFeatureValue(multiArray: decoderInputIds)
        case "encoder_hidden_states":
            return MLFeatureValue(multiArray: encoderHiddenStates)
        case "encoder_attention_mask":
            return MLFeatureValue(multiArray: encoderAttentionMask)
        default:
            return nil
        }
    }
}

// MARK: - NLLB Tokenizer

/// SentencePiece-based tokenizer for NLLB models
/// Uses the tokenizer files from Hugging Face NLLB
struct NLLBTokenizer {
    private let vocab: [String: Int]
    private let reverseVocab: [Int: String]
    private var languageTokens: [String: Int]
    let maxLength: Int = 64  // Match ANE model seq_len

    // Special token IDs for NLLB
    private let padTokenId = 1
    private let eosTokenId = 2
    private let unkTokenId = 3

    init(directory: URL) throws {
        // Load tokenizer.json
        let tokenizerURL = directory.appendingPathComponent("tokenizer.json")

        var addedTokensMap: [String: Int] = [:]  // Language tokens from added_tokens

        if FileManager.default.fileExists(atPath: tokenizerURL.path) {
            let data = try Data(contentsOf: tokenizerURL)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

            // Extract vocab from tokenizer.json
            if let model = json?["model"] as? [String: Any],
               let vocabDict = model["vocab"] as? [String: Int] {
                self.vocab = vocabDict
            } else {
                self.vocab = [:]
            }

            // Extract language tokens from added_tokens (NLLB stores them here!)
            if let addedTokens = json?["added_tokens"] as? [[String: Any]] {
                for token in addedTokens {
                    if let content = token["content"] as? String,
                       let id = token["id"] as? Int {
                        // Language codes are like "fra_Latn", "eng_Latn"
                        if content.contains("_") && content.count <= 10 {
                            addedTokensMap[content] = id
                        }
                    }
                }
            }
        } else {
            self.vocab = [:]
        }

        self.reverseVocab = Dictionary(uniqueKeysWithValues: vocab.map { ($1, $0) })

        // Use hardcoded language token IDs (from NLLB tokenizer analysis)
        // These are the correct IDs from added_tokens section
        self.languageTokens = [
            "eng_Latn": 256047,
            "fra_Latn": 256057,
            "spa_Latn": 256161,
            "deu_Latn": 256042,
            "por_Latn": 256141,
            "ita_Latn": 256077,
            "nld_Latn": 256127,
            "rus_Cyrl": 256147,
            "zho_Hans": 256200,
            "jpn_Jpan": 256079,
            "kor_Hang": 256098,
            "arb_Arab": 256011
        ]

        // Merge with any found in added_tokens (in case of different tokenizer version)
        for (code, id) in addedTokensMap {
            if languageTokens[code] == nil {
                languageTokens[code] = id
            }
        }

        print("NLLB Tokenizer loaded: \(vocab.count) tokens, \(languageTokens.count) language tokens")
        print("  Language tokens: \(languageTokens)")
    }

    /// SentencePiece word boundary marker
    private let spaceMarker = "▁"  // Unicode 2581

    /// Encode text for NLLB translation
    /// Format: [source_lang_token] text tokens [eos]
    func encode(_ text: String, sourceLanguage: String, targetLanguage: String) -> [Int] {
        var tokens: [Int] = []

        // Add source language token at the start
        if let srcLangToken = languageTokens[sourceLanguage] {
            tokens.append(srcLangToken)
            print("  [Tokenizer] Source lang token: \(srcLangToken)")
        }

        // SentencePiece tokenization:
        // - Words are prefixed with "▁" to mark word boundaries
        // - Subwords within a word don't have the prefix
        let words = text.components(separatedBy: CharacterSet.whitespacesAndNewlines)
            .filter { !$0.isEmpty }

        var unkCount = 0
        for word in words {
            let wordTokens = tokenizeWord(word)
            tokens.append(contentsOf: wordTokens)
            unkCount += wordTokens.filter { $0 == unkTokenId }.count
        }

        // Add EOS token
        tokens.append(eosTokenId)

        print("  [Tokenizer] Encoded \(words.count) words → \(tokens.count) tokens (UNK: \(unkCount))")

        // Truncate if too long
        if tokens.count > maxLength {
            print("  [Tokenizer] Truncating from \(tokens.count) to \(maxLength)")
            return Array(tokens.prefix(maxLength - 1)) + [eosTokenId]
        }

        return tokens
    }

    /// Tokenize a single word using SentencePiece-style BPE
    private func tokenizeWord(_ word: String) -> [Int] {
        var result: [Int] = []
        var remaining = word

        // First piece of a word gets the "▁" prefix
        var isFirstPiece = true

        while !remaining.isEmpty {
            var found = false
            let maxLen = remaining.count

            // Try progressively shorter substrings
            for length in stride(from: maxLen, through: 1, by: -1) {
                let substring = String(remaining.prefix(length))

                // First piece needs "▁" prefix, subsequent pieces don't
                let tokenToFind = isFirstPiece ? (spaceMarker + substring) : substring

                if let tokenId = vocab[tokenToFind] {
                    result.append(tokenId)
                    remaining = String(remaining.dropFirst(length))
                    found = true
                    isFirstPiece = false
                    break
                }

                // Also try lowercase version
                let lowerToken = isFirstPiece ? (spaceMarker + substring.lowercased()) : substring.lowercased()
                if let tokenId = vocab[lowerToken] {
                    result.append(tokenId)
                    remaining = String(remaining.dropFirst(length))
                    found = true
                    isFirstPiece = false
                    break
                }
            }

            // If nothing found, try single character without prefix
            if !found {
                let char = String(remaining.prefix(1))

                // Try various forms of single character
                if let tokenId = vocab[char] {
                    result.append(tokenId)
                } else if let tokenId = vocab[char.lowercased()] {
                    result.append(tokenId)
                } else if isFirstPiece, let tokenId = vocab[spaceMarker + char] {
                    result.append(tokenId)
                } else if isFirstPiece, let tokenId = vocab[spaceMarker + char.lowercased()] {
                    result.append(tokenId)
                } else {
                    // Last resort: UNK token
                    result.append(unkTokenId)
                }

                remaining = String(remaining.dropFirst())
                isFirstPiece = false
            }
        }

        return result.isEmpty ? [unkTokenId] : result
    }

    /// Decode token IDs to text
    func decode(_ tokens: [Int]) -> String {
        var pieces: [String] = []

        print("  [Tokenizer] Decoding \(tokens.count) tokens")

        for (idx, token) in tokens.enumerated() {
            // Skip special tokens
            if token == padTokenId || token == eosTokenId {
                continue
            }

            // Skip language tokens
            if languageTokens.values.contains(token) {
                continue
            }

            if let piece = reverseVocab[token] {
                // Handle SentencePiece "▁" prefix (represents space)
                if piece.hasPrefix(spaceMarker) {
                    if !pieces.isEmpty {
                        pieces.append(" ")
                    }
                    pieces.append(String(piece.dropFirst()))
                } else {
                    pieces.append(piece)
                }

                // Debug first few tokens
                if idx < 5 {
                    print("    Token[\(idx)]: \(token) → '\(piece)'")
                }
            } else {
                print("    Token[\(idx)]: \(token) → [NOT IN VOCAB]")
            }
        }

        let result = pieces.joined()
        print("  [Tokenizer] Decoded: '\(result.prefix(50))...'")
        return result
    }

    /// Get token ID for a language code
    func getLanguageToken(_ languageCode: String) -> Int {
        return languageTokens[languageCode] ?? unkTokenId
    }
}

// MARK: - Errors

enum CoreMLTranslationError: Error, LocalizedError {
    case modelNotFound(String)
    case modelNotLoaded
    case inputCreationFailed
    case inferenceFailed
    case outputParsingFailed
    case tokenizerNotFound
    case invalidModelURL
    case downloadFailed(String)

    var errorDescription: String? {
        switch self {
        case .modelNotFound(let key):
            return "Translation model not found: \(key)"
        case .modelNotLoaded:
            return "Translation model not loaded"
        case .inputCreationFailed:
            return "Failed to create model input"
        case .inferenceFailed:
            return "Model inference failed"
        case .outputParsingFailed:
            return "Failed to parse model output"
        case .tokenizerNotFound:
            return "Tokenizer not found"
        case .invalidModelURL:
            return "Invalid model download URL"
        case .downloadFailed(let message):
            return "Model download failed: \(message)"
        }
    }
}

// MARK: - URLSession Download Extension

extension URLSession {
    /// Download with progress reporting
    func download(
        from url: URL,
        progressHandler: @escaping (Int64, Int64) -> Void
    ) async throws -> (URL, URLResponse) {
        var observation: NSKeyValueObservation?

        return try await withCheckedThrowingContinuation { continuation in
            let task = self.downloadTask(with: url) { url, response, error in
                observation?.invalidate()

                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let url = url, let response = response else {
                    continuation.resume(throwing: URLError(.badServerResponse))
                    return
                }

                continuation.resume(returning: (url, response))
            }

            observation = task.progress.observe(\.fractionCompleted) { progress, _ in
                progressHandler(
                    Int64(progress.completedUnitCount),
                    Int64(progress.totalUnitCount)
                )
            }

            task.resume()
        }
    }
}
