import Foundation

// MARK: - CommentDraftStore

/// Persiste le brouillon de commentaire en cours par post, pour qu'un commentaire
/// commencé (puis abandonné en quittant le post) soit repris tel quel au retour.
///
/// Produit UX app-side (clé Meeshy `post.id`) — pas un atome SDK. Stockage léger
/// dans `UserDefaults` (texte court, non sensible). Le brouillon est effacé dès
/// l'envoi (le composer remet le texte à vide → `save("")` supprime la clé).
@MainActor
final class CommentDraftStore {
    static let shared = CommentDraftStore()

    private let defaults: UserDefaults
    private let prefix = "meeshy.commentDraft.v1."

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private func key(for postId: String) -> String { prefix + postId }

    /// Sauvegarde le brouillon. Un texte vide (ou blanc) efface la clé — pas de
    /// brouillon « fantôme » qui ferait apparaître un composer pré-rempli vide.
    func save(postId: String, text: String) {
        guard !postId.isEmpty else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            defaults.removeObject(forKey: key(for: postId))
        } else {
            defaults.set(text, forKey: key(for: postId))
        }
    }

    /// Retourne le brouillon non vide pour ce post, ou `nil`.
    func load(postId: String) -> String? {
        guard !postId.isEmpty else { return nil }
        guard let text = defaults.string(forKey: key(for: postId)),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }

    func clear(postId: String) {
        guard !postId.isEmpty else { return }
        defaults.removeObject(forKey: key(for: postId))
    }
}
