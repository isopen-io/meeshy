import Foundation

// MARK: - CommentDraftStore

/// Persiste le brouillon de commentaire en cours par post, pour qu'un commentaire
/// commencé (puis abandonné en quittant le post) soit repris tel quel au retour.
///
/// Produit UX app-side (clé Meeshy `post.id`) — pas un atome SDK. Stockage léger
/// dans `UserDefaults` (texte court, non sensible). Le brouillon est effacé dès
/// l'envoi (le composer remet le texte à vide → `save("")` supprime la clé).
///
/// Les écritures par frappe sont débouncées (400 ms, modèle du composer
/// conversation) : le composer appelle `save` à CHAQUE caractère, et une
/// écriture `UserDefaults` par frappe est du travail synchrone inutile sur le
/// main thread. `load` lit d'abord le texte en vol pour garder la sémantique
/// read-your-writes ; l'effacement (texte vide, `clear`) reste immédiat pour
/// qu'aucun brouillon fantôme ne ressuscite après envoi.
@MainActor
final class CommentDraftStore {
    static let shared = CommentDraftStore()

    private let defaults: UserDefaults
    private let prefix = "meeshy.commentDraft.v1."
    private let debounceNanos: UInt64
    /// Une écriture en vol par post — `internal` pour que les tests attendent
    /// `.value` de façon déterministe au lieu de dormir.
    var pendingSaves: [String: Task<Void, Never>] = [:]
    /// Texte pas encore écrit dans `defaults` — lu en priorité par `load`.
    private var pendingTexts: [String: String] = [:]

    init(defaults: UserDefaults = .standard, debounceMilliseconds: UInt64 = 400) {
        self.defaults = defaults
        self.debounceNanos = debounceMilliseconds * 1_000_000
    }

    private func key(for postId: String) -> String { prefix + postId }

    /// Sauvegarde le brouillon. Un texte vide (ou blanc) efface la clé — pas de
    /// brouillon « fantôme » qui ferait apparaître un composer pré-rempli vide.
    func save(postId: String, text: String) {
        guard !postId.isEmpty else { return }
        pendingSaves.removeValue(forKey: postId)?.cancel()
        pendingTexts.removeValue(forKey: postId)

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            defaults.removeObject(forKey: key(for: postId))
            return
        }

        pendingTexts[postId] = text
        let storageKey = key(for: postId)
        let delay = debounceNanos
        pendingSaves[postId] = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled, let self else { return }
            self.defaults.set(text, forKey: storageKey)
            self.pendingTexts.removeValue(forKey: postId)
            self.pendingSaves.removeValue(forKey: postId)
        }
    }

    /// Retourne le brouillon non vide pour ce post, ou `nil`.
    func load(postId: String) -> String? {
        guard !postId.isEmpty else { return nil }
        if let pending = pendingTexts[postId] { return pending }
        guard let text = defaults.string(forKey: key(for: postId)),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }

    func clear(postId: String) {
        guard !postId.isEmpty else { return }
        pendingSaves.removeValue(forKey: postId)?.cancel()
        pendingTexts.removeValue(forKey: postId)
        defaults.removeObject(forKey: key(for: postId))
    }
}
