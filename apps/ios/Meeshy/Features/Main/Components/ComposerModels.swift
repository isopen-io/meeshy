import SwiftUI
import MeeshyUI
import MeeshySDK
import AVFoundation
import Combine

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Models
// ============================================================================

enum ComposerAttachmentType: String, Equatable {
    case image, file, voice, location, video
}

struct ComposerAttachment: Identifiable, Equatable {
    let id: String
    let type: ComposerAttachmentType
    let name: String
    var url: URL?
    var size: Int?
    var duration: TimeInterval?
    var latitude: Double?
    var longitude: Double?
    var thumbnailColor: String = "808080"

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }

    // Convenience factories
    static func voice(duration: TimeInterval) -> ComposerAttachment {
        ComposerAttachment(
            id: "voice-\(Int(Date().timeIntervalSince1970 * 1000))",
            type: .voice,
            name: MediaKindLabel.voiceRecording(duration: duration),
            duration: duration,
            thumbnailColor: "FF6B6B"
        )
    }

    static func image(url: URL? = nil, name: String = MediaKindLabel.name(.photo), color: String = "9B59B6") -> ComposerAttachment {
        ComposerAttachment(
            id: "image-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0...9999))",
            type: .image,
            name: name,
            url: url,
            thumbnailColor: color
        )
    }

    static func file(url: URL? = nil, name: String = MediaKindLabel.name(.file), size: Int? = nil, color: String = "45B7D1") -> ComposerAttachment {
        ComposerAttachment(
            id: "file-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0...9999))",
            type: .file,
            name: name,
            url: url,
            size: size,
            thumbnailColor: color
        )
    }
}

struct LanguageOption: Identifiable {
    var id: String { code }
    let code: String
    let name: String
    let flag: String

    // Derived from the single translation base (LanguageData) — the composer
    // pill shows the curated quick-translation subset. No hardcoded list here.
    static let defaults: [LanguageOption] = LanguageData.quickTranslationLanguages.map {
        LanguageOption(code: $0.code, name: $0.nativeName, flag: $0.flag)
    }
}

// ============================================================================
// MARK: - Default Composer Language
// ============================================================================

/// Resolves the initial source language used when composing a new piece of content
/// (message, post, comment, story reply).
///
/// Priority chain:
///   1. Active keyboard layout (QWERTY -> "en", AZERTY -> "fr", ...) when its
///      `primaryLanguage` matches a supported `LanguageOption`.
///   2. `"fr"` fallback.
///
/// `Locale.current` (device UI language) is intentionally excluded — see the
/// Prisme Linguistique section in the root `CLAUDE.md`. The composer's
/// `TextAnalyzer` overrides this value once the user types enough characters
/// for reliable on-device detection.
enum DefaultComposerLanguage {
    /// The composer always starts in French. `TextAnalyzer` re-detects the
    /// language as the user types (up to 18 words), so a French start point
    /// is corrected in-flight when the user writes in another language.
    /// The keyboard layout intentionally does NOT drive this — see the
    /// Prisme Linguistique section in the root `CLAUDE.md`.
    static func resolve() -> String { "fr" }
}

/// Rendu compact du bouton langue du composer de post : le bouton replié ne
/// montre QUE le drapeau — le nom de la langue n'apparaît que dans la liste
/// du picker (directive 2026-07-30). Le nom reste porté par l'accessibilité
/// (`accessibilityValue`), VoiceOver ne lit pas un emoji de drapeau utilement.
/// `nonisolated` au niveau du type : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests non.
nonisolated enum ComposerLanguageFlag {
    /// Code hors référentiel → code brut en capitales, jamais un bouton vide.
    ///
    /// Cette règle a été REDÉCOUVERTE ici, mot pour mot, sans savoir que #4248
    /// l'avait déjà choisie pour la puce de langue : deux sites, même
    /// raisonnement, aucun ne connaissait l'autre.
    ///
    /// **Ce site NE rejoint PAS la source unique, et la raison est mesurée**
    /// (252i, #4260) : sur les 39 codes que les deux tables partagent, elles
    /// s'accordent sur 38 et divergent sur UN — `pt`, que `LanguageDisplay`
    /// rend 🇵🇹 et `LanguageData` 🇧🇷. Le banc voisin épingle `pt-BR` → 🇧🇷.
    /// Trancher « quel drapeau porte le portugais » est une décision PRODUIT,
    /// pas un détail de refactor : elle a son issue, et ce helper garde sa
    /// table jusqu'à ce qu'elle soit prise.
    static func label(for code: String) -> String {
        let base = MeeshyUser.normalizeLanguageCode(code) ?? code.lowercased()
        return LanguageData.info(for: base)?.flag ?? code.uppercased()
    }
}

// ============================================================================
// MARK: - Composer Language Resolver
// ============================================================================

/// Pure helper that decides which language code the composer should switch
/// to given the current state (current code, manual override, detected code,
/// detection confidence). Extracted from `UniversalComposerBar` so the
/// real-time language detection logic is unit-testable in isolation.
///
/// Resolution order :
/// 1. **Manual override** (`languageOverride` in `TextAnalyzer`) wins — the
///    user picked a language in the menu or picker sheet.
/// 2. **Detected language** propagates if confidence ≥ floor, or if `force`
///    is `true` (analyzer transitioned to locked, override changed, etc.).
/// 3. Below the confidence floor the helper returns `nil` — pill stays
///    where it was (no flicker on 2-3 char noise).
enum ComposerLanguageResolver {
    /// Confidence threshold below which the detected language is considered
    /// noise and **not** propagated to the composer's `currentLanguage`.
    ///
    /// Spec (May 2026) : 0.86. La détection ré-évalue à chaque frappe
    /// pendant les 10 premiers mots, et on n'adopte la langue détectée que
    /// si `NLLanguageRecognizer` la donne avec ≥ 86 % de confiance. En
    /// dessous, la langue reste sur le défaut « fr » — c'est-à-dire qu'un
    /// utilisateur qui tape « ok » ou « lol » envoie son message tagué
    /// français tant que le détecteur n'a pas un signal franc.
    static let confidenceFloor: Double = 0.86

    /// Returns the next language code to apply, or `nil` if `current`
    /// already wins (no change needed).
    static func resolve(
        current: String,
        override: String?,
        detected: String?,
        confidence: Double,
        force: Bool
    ) -> String? {
        if let override {
            return override == current ? nil : override
        }
        guard let detected else { return nil }
        if !force && confidence < confidenceFloor { return nil }
        return detected == current ? nil : detected
    }
}

// ============================================================================
// MARK: - Keyboard Observer
// ============================================================================

@MainActor
class KeyboardObserver: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var height: CGFloat = 0
    @Published var isVisible = false

    /// Last non-zero keyboard height — useful for sizing emoji panel
    var lastKnownHeight: CGFloat = 280

    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                guard let self = self,
                      let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                      let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
                else { return }

                // Use the keyboard-hosting window's height (not the full
                // display) so split-screen on iPad produces the correct
                // visible keyboard portion.
                let screenHeight = DeviceLayout.windowSize.height
                let newHeight = max(screenHeight - endFrame.origin.y, 0)

                if newHeight > 0 {
                    self.lastKnownHeight = newHeight
                }

                withAnimation(.easeInOut(duration: max(duration, 0.15))) {
                    self.height = newHeight
                    self.isVisible = newHeight > 0
                }
            }
            .store(in: &cancellables)
    }
}

// ============================================================================
// MARK: - Waveform Bar Animation
// ============================================================================

struct ComposerWaveformBar: View {
    let index: Int
    let isRecording: Bool
    let accentColor: String

    @State private var height: CGFloat = 4

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color(hex: accentColor).opacity(0.8), Color(hex: accentColor).opacity(0.4)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: height)
            .onAppear { animate() }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    height = 4
                }
            }
            .adaptiveOnChange(of: isRecording) { _, rec in
                if rec { animate() } else { height = 4 }
            }
    }

    private func animate() {
        guard isRecording else { return }
        let delay = Double(index) * 0.05
        withAnimation(
            .easeInOut(duration: Double.random(in: 0.3...0.6))
            .repeatForever(autoreverses: true)
            .delay(delay)
        ) {
            height = CGFloat.random(in: 6...24)
        }
    }
}
