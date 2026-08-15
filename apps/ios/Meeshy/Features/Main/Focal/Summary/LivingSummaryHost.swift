import SwiftUI
import MeeshySDK

/// Hôte dédié pour le mode `.summary` (contrat §WS-9 : « le mode 'summary'
/// de la coquille F-086 route vers cette UI… le mode résumé a peut-être
/// besoin d'un hôte dédié »). Construit le `LivingSummaryViewModel` UNE
/// SEULE FOIS via `@StateObject` — la construction elle-même (traversée des
/// messages, segmentation, classement) ne doit PAS se refaire à chaque
/// re-render de `ConversationView`, seulement à chaque MONTAGE de cet hôte
/// (entrée en mode `.summary`).
///
/// Cette indirection existe pour garder `ConversationView.swift` au diff
/// MINIMAL (contrainte d'exécution — le fichier n'est ouvert QUE pour le
/// câblage `.summary`) : le site d'appel n'a que des données PRIMITIVES à
/// passer, aucun `@State`/`@StateObject` supplémentaire n'y est introduit.
struct LivingSummaryHost: View {
    let isDark: Bool
    var onReplyToPerson: (FaceRampEntry) -> Void
    var onOpenEpisode: (ConversationEpisode) -> Void
    var onResumeThread: () -> Void

    @StateObject private var viewModel: LivingSummaryViewModel

    init(
        messages: [MeeshyMessage],
        viewerId: String,
        viewerUsername: String?,
        windowCoversUnread: Bool,
        analysisProvider: ConversationAnalysisProviding?,
        conversationId: String,
        isDark: Bool,
        onReplyToPerson: @escaping (FaceRampEntry) -> Void,
        onOpenEpisode: @escaping (ConversationEpisode) -> Void,
        onResumeThread: @escaping () -> Void
    ) {
        self.isDark = isDark
        self.onReplyToPerson = onReplyToPerson
        self.onOpenEpisode = onOpenEpisode
        self.onResumeThread = onResumeThread
        _viewModel = StateObject(wrappedValue: LivingSummaryAssembly.makeViewModel(
            LivingSummaryAssembly.Input(
                messages: messages,
                viewerId: viewerId,
                viewerUsername: viewerUsername,
                windowCoversUnread: windowCoversUnread,
                analysisProvider: analysisProvider,
                conversationId: conversationId,
                calendar: .current,
                locale: .current,
                now: Date()
            )
        ))
    }

    var body: some View {
        LivingSummaryView(
            viewModel: viewModel,
            isDark: isDark,
            onReplyToPerson: onReplyToPerson,
            onOpenEpisode: onOpenEpisode,
            onResumeThread: onResumeThread
        )
    }
}
