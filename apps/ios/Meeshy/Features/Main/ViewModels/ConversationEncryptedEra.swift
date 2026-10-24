import Foundation
import MeeshySDK

/// **Ce que l'ère chiffrée d'une conversation laisse servir au fil** (#11380).
///
/// Dans l'ère chiffrée (`EndToEndRegime.governs`), le serveur ne lit pas les
/// messages : toute traduction qu'il en sert — texte ou piste audio, par REST,
/// par socket ou depuis un cache qu'il a rempli — est une traduction qu'il a
/// FORGÉE. Seules celles que CET appareil a produites y sont servies
/// (`record`, appelé par `applyDeviceTranslation`, leur seul écrivain) ;
/// l'historique antérieur à l'activation garde les siennes.
///
/// Le filtre vit à la LECTURE, jamais à l'écriture : un régime qui arrive après
/// les traductions (ouverture à froid, ligne de cache sans date) les retire
/// d'un coup, sans qu'aucun écrivain n'ait eu à connaître le régime. Une
/// traduction de l'appareil n'est servie que tant que `messageTranslations` la
/// porte encore : l'éviction d'une édition ou d'une vue unique l'emporte, et
/// une traduction du fil qui l'écrase ne prend pas sa provenance.
///
/// Le régime lu est celui que la conversation sert, fusionné avec celui que
/// l'appareil retient (`EndToEndRegimeMemoryProviding`) : une conversation vue
/// chiffrée le reste, même avant l'hydratation de sa ligne ou quand le serveur
/// la sert sans régime.
@MainActor
final class ConversationEncryptedEra {
    private let memory: any EndToEndRegimeMemoryProviding
    private var deviceTranslations: [String: [MessageTranslation]] = [:]

    init(memory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory.shared) {
        self.memory = memory
    }

    // Isolé au MainActor : une deinit isolée tue xctest au démontage hors
    // d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    func regime(of viewModel: ConversationViewModel) -> EndToEndRegime {
        memory.resolve(
            conversationId: viewModel.conversationId,
            served: EndToEndRegime(conversation: viewModel.currentConversation)
        )
    }

    /// Le serveur peut-il traduire ce message ? Un message hors de la fenêtre
    /// se range dans l'ère chiffrée (fail-closed).
    func admitsWireTranslations(forMessage messageId: String, in viewModel: ConversationViewModel) -> Bool {
        let regime = regime(of: viewModel)
        guard regime.isEndToEnd else { return true }
        let createdAt = viewModel.messageIndex(for: messageId).map { viewModel.messages[$0].createdAt }
        return regime.admitsWireTranslations(forMessageCreatedAt: createdAt)
    }

    /// Les traductions de texte SERVIES pour ce message.
    func servedTranslations(for messageId: String, in viewModel: ConversationViewModel) -> [MessageTranslation] {
        let present = viewModel.messageTranslations[messageId] ?? []
        guard !admitsWireTranslations(forMessage: messageId, in: viewModel) else { return present }
        let device = deviceTranslations[messageId] ?? []
        return present.filter { device.contains($0) }
    }

    /// Une bascule manuelle ne sert qu'une traduction SERVIE ; « l'original »
    /// (`nil`) l'est toujours.
    func serves(_ override: MessageTranslation?, for messageId: String, in viewModel: ConversationViewModel) -> Bool {
        guard let override else { return true }
        return admitsWireTranslations(forMessage: messageId, in: viewModel)
            || servedTranslations(for: messageId, in: viewModel).contains(override)
    }

    /// Les pistes audio traduites SERVIES pour ce message. L'appareil n'en
    /// produit pas : dans l'ère chiffrée, il n'y en a aucune.
    func servedTranslatedAudios(for messageId: String, in viewModel: ConversationViewModel) -> [MessageTranslatedAudio] {
        guard admitsWireTranslations(forMessage: messageId, in: viewModel) else { return [] }
        return viewModel.messageTranslatedAudios[messageId] ?? []
    }

    /// Les pistes d'UN attachement — par attachement d'abord, repli par message.
    func servedTranslatedAudios(
        of attachment: MessageAttachment, messageId: String, in viewModel: ConversationViewModel
    ) -> [MessageTranslatedAudio] {
        guard admitsWireTranslations(forMessage: messageId, in: viewModel) else { return [] }
        return viewModel.messageTranslatedAudiosByAttachment[attachment.id]
            ?? (viewModel.messageTranslatedAudios[messageId] ?? []).filter { $0.attachmentId == attachment.id }
    }

    /// Les deux cartes de pistes traduites, telles qu'elles peuvent être servies.
    func servedAudioMaps(
        in viewModel: ConversationViewModel
    ) -> (byAttachment: [String: [MessageTranslatedAudio]], byMessage: [String: [MessageTranslatedAudio]]) {
        let regime = regime(of: viewModel)
        guard regime.isEndToEnd else {
            return (viewModel.messageTranslatedAudiosByAttachment, viewModel.messageTranslatedAudios)
        }
        let admitted = viewModel.messages.filter { regime.admitsWireTranslations(forMessageCreatedAt: $0.createdAt) }
        let messageIds = Set(admitted.map(\.id))
        let attachmentIds = Set(admitted.flatMap { $0.attachments.map(\.id) })
        return (
            viewModel.messageTranslatedAudiosByAttachment.filter { attachmentIds.contains($0.key) },
            viewModel.messageTranslatedAudios.filter { messageIds.contains($0.key) }
        )
    }

    /// Retient qu'une traduction vient de l'appareil.
    func record(_ translation: MessageTranslation) {
        var merged = deviceTranslations[translation.messageId] ?? []
        merged.removeAll { $0.targetLanguage == translation.targetLanguage }
        merged.append(translation)
        deviceTranslations[translation.messageId] = merged
    }

    /// La conversation chargée a changé : son régime est retenu, et s'il a
    /// changé, les résolutions et projections calculées sous l'ancien tombent.
    func conversationChanged(from previous: MeeshyConversation?, in viewModel: ConversationViewModel) {
        _ = regime(of: viewModel)
        guard EndToEndRegime(conversation: previous) != EndToEndRegime(conversation: viewModel.currentConversation) else { return }
        viewModel.translationResolutionCache.removeAll()
        viewModel.derived.invalidateTranslationDerived()
        viewModel.derived.invalidateAudioDerived()
    }
}
