import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les gestes du cycle de vie que `ConversationBodyLifecycle` rend à l'hôte :
/// l'hôte garde ce qu'ils font (reprise du brouillon, activation du
/// ViewModel, sortie d'une vue unique), le modificateur ne garde que QUAND.
struct ConversationLifecycleActions {
    let startup: () async -> Void
    let didAppear: () -> Void
    let didDisappear: () -> Void
    let willResignActive: () -> Void
    let didEnterBackground: () -> Void
    let accessRevoked: () -> Void
}

/// **Le cycle de vie de l'écran, en `ViewModifier` NOMINAL** (LOT-10) — le
/// maillon qui s'appelait `bodyWithLifecycle`. Aucune valeur de vue n'est
/// stockée : des valeurs, un `Binding` et une struct de closures. `scenePhase`
/// se lit ICI, dans le modificateur, pas chez l'hôte.
struct ConversationBodyLifecycle: ViewModifier {
    let allowsEdgeSwipe: Bool
    let accessRevoked: Bool
    @Binding var keyboardTransition: KeyboardTransition?
    let actions: ConversationLifecycleActions

    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .background(InteractivePopEnabler(allowsEdgeSwipe: allowsEdgeSwipe))
            .task { await actions.startup() }
            .onAppear { actions.didAppear() }
            .adaptiveOnChange(of: scenePhase) { _, phase in
                if phase == .background { actions.didEnterBackground() }
            }
            .adaptiveOnChange(of: accessRevoked) { _, revoked in
                guard revoked else { return }
                actions.accessRevoked()
            }
            .observingKeyboardTransition($keyboardTransition)
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                actions.willResignActive()
            }
            .onDisappear { actions.didDisappear() }
    }
}

/// Ce que le routeur demande à une conversation DÉJÀ à l'écran, en VALEURS : un
/// `onChange` qui lirait ces champs sur une référence non observée ne se
/// déclencherait jamais — c'est l'hôte, qui observe, qui les remet.
struct ConversationRouterSignals: Equatable {
    let pendingOpenSearch: Bool
    let pendingHighlightMessageId: String?
    let replyContextVersion: Int
}

/// Tap de notification pour la conversation DÉJÀ à l'écran : `path` reçoit le
/// même id, la vue n'est pas recréée et `.task` ne rejoue pas — le surlignage,
/// la recherche et le contexte de réponse se consomment à chaud.
struct ConversationRouterWatch: ViewModifier {
    let signals: ConversationRouterSignals
    let openSearch: () async -> Void
    let consumeHighlight: () async -> Void
    let applyReplyContext: () -> Void

    func body(content: Content) -> some View {
        content
            .adaptiveOnChange(of: signals.pendingOpenSearch) { _, wanted in
                if wanted { Task { await openSearch() } }
            }
            .adaptiveOnChange(of: signals.pendingHighlightMessageId) { _, newValue in
                guard let newValue, !newValue.isEmpty else { return }
                Task { await consumeHighlight() }
            }
            .adaptiveOnChange(of: signals.replyContextVersion) { _, _ in applyReplyContext() }
    }
}

/// Tout ce qui, une fois changé, doit réécrire le brouillon : la citation, la
/// langue, les effets, le flou et l'éphémère. Un SEUL déclencheur remplace les
/// cinq sans en perdre un.
struct ConversationDraftKeys: Equatable {
    let replyMessageId: String?
    let language: String
    let effectsRaw: UInt32
    let blur: Bool
    let ephemeral: Int?
}

/// La persistance du brouillon et les deux replis du panneau emoji : il se
/// referme quand le fil quitte le bas, et quand le clavier prend le focus.
struct ConversationDraftPersistenceWatch: ViewModifier {
    let keys: ConversationDraftKeys
    let isNearBottom: Bool
    let isTyping: Bool
    let persist: () -> Void
    let closeEmojiPanel: () -> Void

    func body(content: Content) -> some View {
        content
            .adaptiveOnChange(of: keys) { _, _ in persist() }
            .adaptiveOnChange(of: isNearBottom) { _, _ in closeEmojiPanel() }
            .adaptiveOnChange(of: isTyping) { _, focused in
                if focused { closeEmojiPanel() }
            }
    }
}
