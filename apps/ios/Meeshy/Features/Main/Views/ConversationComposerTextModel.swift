// MARK: - Extracted from ConversationView+Composer.swift (#4105)
import SwiftUI
import Combine

// MARK: - Composer text isolation
//
// Le texte du composer vivait en `@State` à la RACINE de ConversationView :
// chaque caractère tapé ré-évaluait l'arbre racine entier (~1500 lignes de
// body : header, bridge de liste, overlays, sheets) + re-exécutait
// `updateUIViewController` du bridge. En le déplaçant dans un ObservableObject
// tenu par la racine via `@State` (la racine ne LIT jamais `text` dans son
// body et ne s'abonne pas à `objectWillChange`), seul `ComposerTextHost`
// — l'unique `@ObservedObject` — se re-rend à la frappe.
//
// Le modèle porte aussi la persistance différée du brouillon : l'ancien
// `.adaptiveOnChange(of: messageText)` racine ne peut plus exister (la racine
// ne se ré-évalue plus à la frappe, donc `onChange` n'y fire plus).

/// Stockage du texte du composer, hors de l'arbre de dépendances de la racine.
///
/// Politique de persistance du brouillon (décision produit 2026-06-09) :
/// - **Fin de mot** (espace, retour ligne) ou **champ vidé** → persistance
///   IMMÉDIATE. Le brouillon est donc durable mot par mot.
/// - **Milieu de mot** → fenêtre de 400 ms (filet de sécurité pour une pause
///   de frappe) — jamais une écriture + re-tri de la liste par caractère.
/// - **Sortie de vue** (navigation, changement de conversation via `.id`,
///   perte de focus du clavier — appel entrant, sheet —, passage en
///   arrière-plan) → `flushPendingChange()` immédiat.
@MainActor
final class ConversationComposerTextModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var text: String = ""

    /// Installé par la vue (onAppear) : reçoit le texte à persister —
    /// branché sur `persistDraft` côté ConversationView.
    var onPersistNeeded: ((String) -> Void)?
    private var debounceTask: Task<Void, Never>?
    private var textObservation: AnyCancellable?

    init() {
        textObservation = $text
            .dropFirst()
            .sink { [weak self] newValue in
                guard let self else { return }
                if newValue.isEmpty || newValue.last?.isWhitespace == true {
                    self.persistNow(newValue)
                } else {
                    self.scheduleDebouncedPersist(newValue)
                }
            }
    }

    private func persistNow(_ value: String) {
        debounceTask?.cancel()
        debounceTask = nil
        onPersistNeeded?(value)
    }

    private func scheduleDebouncedPersist(_ value: String) {
        debounceTask?.cancel()
        debounceTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            self?.onPersistNeeded?(value)
        }
    }

    /// Annule la fenêtre de débounce en vol et émet immédiatement la valeur
    /// courante. Appelé au disappear, à la perte de focus du clavier et au
    /// passage en arrière-plan pour ne jamais perdre la fin de saisie.
    func flushPendingChange() {
        persistNow(text)
    }
}

/// Unique abonné au texte du composer : la frappe re-rend CE sous-arbre
/// seulement. Le contenu reçoit un `Binding<String>` frais à chaque
/// ré-évaluation (équivalent de l'ancien `$messageText`).
struct ComposerTextHost<Content: View>: View {
    @ObservedObject var model: ConversationComposerTextModel
    @ViewBuilder let content: (Binding<String>) -> Content

    var body: some View {
        content($model.text)
    }
}
