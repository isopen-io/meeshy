//
//  AutoTranscriptionService.swift
//  Meeshy
//
//  v2 - Service de transcription automatique des messages audio/vidéo
//  Transcrit automatiquement les messages lorsque le champ transcription est vide
//  et que l'utilisateur a activé cette option dans les paramètres
//
//  iOS 16+
//

import Foundation
import Speech
import AVFoundation
import Combine

// MARK: - Auto Transcription Service

/// Service pour la transcription automatique des messages audio/vidéo
/// Active uniquement si l'utilisateur l'a configuré dans les paramètres
@MainActor
final class AutoTranscriptionService: ObservableObject {

    // MARK: - Singleton

    static let shared = AutoTranscriptionService()

    // MARK: - Published Properties

    @Published private(set) var isProcessing = false
    @Published private(set) var processingMessageId: String?
    @Published private(set) var lastError: AutoTranscriptionError?

    /// Cache des transcriptions en mémoire (messageId -> transcription)
    @Published private(set) var transcriptionCache: [String: MessageTranscription] = [:]

    // MARK: - Properties

    private let settingsManager: SettingsManager
    private var processingQueue: [String] = []
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private init() {
        self.settingsManager = SettingsManager.shared
    }

    // MARK: - Public Methods

    /// Vérifie si la transcription automatique est activée
    var isAutoTranscribeEnabled: Bool {
        settingsManager.autoTranscribe
    }

    /// Vérifie si un message doit être transcrit automatiquement
    func shouldAutoTranscribe(message: Message) -> Bool {
        // Vérifier si l'option est activée
        guard isAutoTranscribeEnabled else {
            return false
        }

        // Vérifier si c'est un message audio ou vidéo
        guard message.effectiveMessageType == .audio || message.effectiveMessageType == .video else {
            return false
        }

        // Vérifier si le message n'a pas déjà de transcription
        guard !message.hasTranscription else {
            return false
        }

        // Vérifier si on n'a pas déjà une transcription en cache
        guard transcriptionCache[message.id] == nil else {
            return false
        }

        return true
    }

    /// Transcrit automatiquement un message audio/vidéo si nécessaire
    /// - Parameters:
    ///   - message: Le message à transcrire
    ///   - audioURL: URL du fichier audio/vidéo
    /// - Returns: La transcription générée ou nil si non applicable
    func transcribeIfNeeded(message: Message, audioURL: URL) async throws -> MessageTranscription? {
        // Vérifier si on doit transcrire
        guard shouldAutoTranscribe(message: message) else {
            return transcriptionCache[message.id]
        }

        // Vérifier qu'on ne traite pas déjà ce message
        guard processingMessageId != message.id else {
            return nil
        }

        return try await transcribe(messageId: message.id, audioURL: audioURL)
    }

    /// Transcrit un fichier audio/vidéo
    /// - Parameters:
    ///   - messageId: ID du message
    ///   - audioURL: URL du fichier audio/vidéo
    /// - Returns: La transcription générée
    func transcribe(messageId: String, audioURL: URL) async throws -> MessageTranscription {
        // Marquer comme en cours de traitement
        isProcessing = true
        processingMessageId = messageId
        lastError = nil

        defer {
            isProcessing = false
            processingMessageId = nil
        }

        // Vérifier l'autorisation
        let authStatus = await requestSpeechAuthorization()
        guard authStatus == .authorized else {
            let error = AutoTranscriptionError.notAuthorized
            lastError = error
            throw error
        }

        // Obtenir le recognizer pour la langue préférée
        let languageCode = settingsManager.transcriptionAutoDetectLanguage
            ? nil
            : settingsManager.transcriptionPreferredLanguage

        let locale = languageCode.map { Locale(identifier: $0) } ?? Locale.current

        guard let recognizer = SFSpeechRecognizer(locale: locale) else {
            let error = AutoTranscriptionError.recognizerNotAvailable
            lastError = error
            throw error
        }

        guard recognizer.isAvailable else {
            let error = AutoTranscriptionError.recognizerNotAvailable
            lastError = error
            throw error
        }

        // Configurer la requête
        let request = SFSpeechURLRecognitionRequest(url: audioURL)
        request.shouldReportPartialResults = false

        // Utiliser la reconnaissance sur l'appareil si demandé
        if settingsManager.transcriptionOnDeviceOnly {
            if recognizer.supportsOnDeviceRecognition {
                request.requiresOnDeviceRecognition = true
            } else {
                // Si on-device est requis mais non disponible, on continue quand même
                print("[AutoTranscription] On-device recognition not supported, using server")
            }
        }

        // Ajouter la ponctuation automatique (iOS 16+)
        request.addsPunctuation = true

        // Effectuer la transcription
        let result = try await performTranscription(recognizer: recognizer, request: request)

        // Créer l'objet transcription
        let transcription = MessageTranscription(
            messageId: messageId,
            text: result.text,
            languageCode: result.languageCode ?? locale.identifier,
            confidence: result.confidence,
            source: .client,
            timestamp: Date()
        )

        // Mettre en cache
        transcriptionCache[messageId] = transcription

        // Sauvegarder dans le cache persistant
        await saveToCache(transcription: transcription, for: audioURL)

        return transcription
    }

    /// Récupère une transcription depuis le cache
    func getCachedTranscription(for messageId: String) -> MessageTranscription? {
        return transcriptionCache[messageId]
    }

    /// Récupère une transcription depuis le cache ou le fichier
    func getTranscription(for messageId: String, audioURL: URL?) async -> MessageTranscription? {
        // Vérifier le cache mémoire
        if let cached = transcriptionCache[messageId] {
            return cached
        }

        // Vérifier le cache disque si on a l'URL
        if let url = audioURL,
           let cached = await loadFromCache(for: url) {
            // Mettre en cache mémoire
            let transcription = MessageTranscription(
                messageId: messageId,
                text: cached.text,
                languageCode: cached.languageCode,
                confidence: Float(cached.confidence ?? 0),
                source: .client,
                timestamp: cached.timestamp
            )
            transcriptionCache[messageId] = transcription
            return transcription
        }

        return nil
    }

    /// Efface le cache des transcriptions
    func clearCache() {
        transcriptionCache.removeAll()
        Task {
            await TranscriptionCache.shared.clearAll()
        }
    }

    // MARK: - Private Methods

    private func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    private func performTranscription(
        recognizer: SFSpeechRecognizer,
        request: SFSpeechURLRecognitionRequest
    ) async throws -> (text: String, languageCode: String?, confidence: Float) {
        try await withCheckedThrowingContinuation { continuation in
            var hasResumed = false

            recognizer.recognitionTask(with: request) { result, error in
                guard !hasResumed else { return }

                if let error = error {
                    hasResumed = true
                    let nsError = error as NSError
                    let errorMessage = error.localizedDescription.lowercased()

                    // Vérifier si c'est une erreur Siri/Dictation désactivé
                    if nsError.code == 1101 ||
                       errorMessage.contains("siri") ||
                       errorMessage.contains("dictation") ||
                       errorMessage.contains("localspeechrecognition") {
                        continuation.resume(throwing: AutoTranscriptionError.siriDisabled)
                    } else {
                        continuation.resume(throwing: AutoTranscriptionError.transcriptionFailed(error.localizedDescription))
                    }
                    return
                }

                if let result = result, result.isFinal {
                    hasResumed = true
                    let text = result.bestTranscription.formattedString
                    let confidence = self.calculateConfidence(from: result)
                    let languageCode = result.bestTranscription.segments.first.flatMap { segment in
                        // Essayer d'obtenir la langue détectée
                        return nil as String? // iOS ne fournit pas cette info directement
                    }
                    continuation.resume(returning: (text, languageCode, confidence))
                }
            }
        }
    }

    private func calculateConfidence(from result: SFSpeechRecognitionResult) -> Float {
        let segments = result.bestTranscription.segments
        guard !segments.isEmpty else { return 0 }
        let totalConfidence = segments.reduce(0.0) { $0 + $1.confidence }
        return totalConfidence / Float(segments.count)
    }

    private func saveToCache(transcription: MessageTranscription, for url: URL) async {
        let cached = TranscriptionCache.CachedTranscription(
            text: transcription.text,
            languageCode: transcription.languageCode,
            timestamp: transcription.timestamp,
            duration: 0
        )
        await TranscriptionCache.shared.set(cached, for: url)
    }

    private func loadFromCache(for url: URL) async -> (text: String, languageCode: String, confidence: Double?, timestamp: Date)? {
        guard let cached = await TranscriptionCache.shared.get(for: url) else {
            return nil
        }
        return (cached.text, cached.languageCode, nil, cached.timestamp)
    }
}

// MARK: - Message Transcription

/// Représente une transcription de message
struct MessageTranscription: Codable, Identifiable {
    var id: String { messageId }

    let messageId: String
    let text: String
    let languageCode: String
    let confidence: Float
    let source: TranscriptionSource
    let timestamp: Date

    var isHighConfidence: Bool {
        confidence >= 0.8
    }

    var isMediumConfidence: Bool {
        confidence >= 0.5 && confidence < 0.8
    }

    var isLowConfidence: Bool {
        confidence < 0.5
    }

    var confidenceLabel: String {
        if confidence >= 0.8 {
            return "Haute"
        } else if confidence >= 0.5 {
            return "Moyenne"
        } else {
            return "Faible"
        }
    }

    var formattedConfidence: String {
        String(format: "%.0f%%", confidence * 100)
    }
}

// MARK: - Auto Transcription Error

enum AutoTranscriptionError: LocalizedError {
    case notAuthorized
    case recognizerNotAvailable
    case siriDisabled
    case transcriptionFailed(String)
    case notEnabled

    var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "L'autorisation de reconnaissance vocale est requise. Allez dans Réglages > Meeshy pour l'activer."
        case .recognizerNotAvailable:
            return "La reconnaissance vocale n'est pas disponible pour cette langue."
        case .siriDisabled:
            return "Siri et Dictée sont désactivés. Activez Siri dans Réglages > Siri & Recherche pour utiliser la transcription automatique."
        case .transcriptionFailed(let message):
            return "Échec de la transcription: \(message)"
        case .notEnabled:
            return "La transcription automatique n'est pas activée dans les paramètres."
        }
    }

    var requiresSettings: Bool {
        switch self {
        case .notAuthorized, .recognizerNotAvailable, .siriDisabled:
            return true
        case .transcriptionFailed, .notEnabled:
            return false
        }
    }
}

// MARK: - Auto Transcription View Model

/// ViewModel pour gérer la transcription automatique dans une vue
@MainActor
final class AutoTranscriptionViewModel: ObservableObject {

    @Published var transcription: MessageTranscription?
    @Published var isLoading = false
    @Published var error: String?
    @Published var showError = false

    private let service = AutoTranscriptionService.shared
    private let message: Message
    private var audioURL: URL?

    init(message: Message) {
        self.message = message
    }

    /// Configure l'URL audio et tente la transcription automatique
    func setAudioURL(_ url: URL) {
        self.audioURL = url

        // Charger depuis le cache ou transcrire
        Task {
            await loadOrTranscribe()
        }
    }

    /// Charge la transcription existante ou en génère une nouvelle
    func loadOrTranscribe() async {
        // Vérifier le cache d'abord
        if let cached = await service.getTranscription(for: message.id, audioURL: audioURL) {
            transcription = cached
            return
        }

        // Transcrire si activé et nécessaire
        guard service.shouldAutoTranscribe(message: message),
              let url = audioURL else {
            return
        }

        await transcribe(url: url)
    }

    /// Force une nouvelle transcription
    func transcribe(url: URL) async {
        isLoading = true
        error = nil

        do {
            transcription = try await service.transcribe(messageId: message.id, audioURL: url)
        } catch let transcriptionError as AutoTranscriptionError {
            error = transcriptionError.errorDescription
            showError = true
        } catch {
            self.error = error.localizedDescription
            showError = true
        }

        isLoading = false
    }

    /// Demande une transcription manuelle
    func requestTranscription() async {
        guard let url = audioURL else {
            error = "URL audio non disponible"
            showError = true
            return
        }

        await transcribe(url: url)
    }
}
