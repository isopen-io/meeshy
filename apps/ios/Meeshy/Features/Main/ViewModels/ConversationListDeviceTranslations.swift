import Foundation
import MeeshySDK

/// **La ligne d'une conversation chiffrée sert la traduction faite sur
/// l'appareil, comme le fil** (#13002, Prisme, famille « aperçu de liste »).
///
/// Le serveur ne lit pas ce message : il ne le traduit pas. Le fil le traduit
/// sur l'appareil (`DeviceTranslationCoordinator`) ; la ligne, qui tient le
/// même clair (`ConversationListEndToEndTextStore`), le traduit avec le même
/// moteur vers la langue que le MÊME résolveur élit : `DeviceTranslationTarget`
/// sur le Prisme du lecteur (`ReaderPrism`), la langue d'origine concourant à
/// son rang. Aucune seconde boucle. La traduction reste en mémoire : jamais
/// écrite, jamais envoyée.
@MainActor
final class ConversationListDeviceTranslations {
    nonisolated deinit {}

    /// Le moteur que la liste sert : l'hôte qui le porte (`DeviceTranslationEngineHost`)
    /// est monté par la vue de la liste.
    let engine: any DeviceTranslationEngineProviding
    private let readerLanguages: @MainActor () -> [String]
    private let willChange: @MainActor () -> Void
    private var translated: [String: [String: String]] = [:]
    private var attempted: Set<String> = []
    private var pass: Task<Void, Never>?

    init(
        engine: any DeviceTranslationEngineProviding = DeviceTranslationEngineFactory.makeDefault(),
        readerLanguages: @escaping @MainActor () -> [String] = { ReaderPrism.resolve(for: AuthManager.shared.currentUser) },
        willChange: @escaping @MainActor () -> Void
    ) {
        self.engine = engine
        self.readerLanguages = readerLanguages
        self.willChange = willChange
    }

    /// Une session qui change ne laisse rien du compte précédent.
    func forget() {
        pass?.cancel()
        translated = [:]
        attempted = []
    }

    /// Le clair, avec ce que l'appareil en a traduit.
    func dressing(_ text: ConversationPreviewDeviceText) -> ConversationPreviewDeviceText {
        guard let known = translated[text.messageId], !known.isEmpty else { return text }
        return text.translated(known)
    }

    /// Traduit, une fois par message et par langue, les clairs dont la langue
    /// d'origine n'est pas celle que le Prisme sert en premier.
    func translate(_ texts: [ConversationPreviewDeviceText]) {
        let readers = readerLanguages()
        let pending = texts.filter { !attempted.contains(Self.key($0, readers)) }
        guard !pending.isEmpty else { return }
        pending.forEach { attempted.insert(Self.key($0, readers)) }
        let previous = pass
        pass = Task { [weak self] in
            await previous?.value
            await self?.run(pending, readers: readers)
        }
    }

    private func run(_ texts: [ConversationPreviewDeviceText], readers: [String]) async {
        for text in texts {
            guard let pair = await target(of: text, readers: readers) else { continue }
            let results = await engine.translate([DeviceTranslationRequest(id: text.messageId, text: text.text)], pair: pair)
            guard let result = results.first(where: { $0.id == text.messageId }),
                  !result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            willChange()
            translated[text.messageId, default: [:]][pair.target] = result.text
        }
    }

    /// La paire que le fil élirait pour ce message : la descente du Prisme,
    /// arrêtée au premier rang que le moteur sait faire.
    private func target(of text: ConversationPreviewDeviceText, readers: [String]) async -> DeviceTranslationPair? {
        guard let source = text.language, !source.isEmpty,
              let descent = DeviceTranslationTarget.candidates(
                preferredLanguages: readers, originalLanguage: source, translatedLanguages: []
              ) else { return nil }
        // Seules les paires déjà installées : la liste n'ouvre jamais la feuille
        // système de téléchargement d'une langue, le fil s'en charge.
        var supported: Set<String> = []
        for target in descent.targets
        where await engine.availability(of: DeviceTranslationPair(source: descent.source, target: target)) == .ready {
            supported.insert(target)
        }
        return DeviceTranslationTarget.resolve(
            preferredLanguages: readers, originalLanguage: source, translatedLanguages: [],
            canTranslate: { _, target in supported.contains(target) }
        )
    }

    private static func key(_ text: ConversationPreviewDeviceText, _ readers: [String]) -> String {
        "\(text.messageId)|\(readers.joined(separator: ","))"
    }
}
