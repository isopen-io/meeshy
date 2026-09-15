import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'édition d'un commentaire depuis le détail d'un post, hors du god object.**
///
/// `PostDetailView.swift` est hors budget (directive : 1000–1200 lignes) et la
/// règle est explicite — *ajouter à un fichier déjà hors budget est interdit,
/// on extrait d'abord*. L'entrée en édition, sa sortie et son envoi vivent ici,
/// sous les MÊMES noms que la jumelle du fil (`FeedCommentsSheet+CommentEdit.swift`) :
/// deux portes d'un même composer se relisent côte à côte.
extension PostDetailView {

    /// Charge le commentaire dans le composer avec TOUT ce que l'édition
    /// permet : texte + effets visuels (lueur/pulse/…) + flou — mêmes
    /// capacités que la création (le média existant est conservé tel quel).
    /// La pastille s'ouvre sur la LANGUE du commentaire : c'est elle que
    /// l'envoi déclare, et le défaut « fr » la réécrirait sinon (#6600).
    func beginEditComment(_ target: FeedComment) {
        viewModel.clearReply()
        viewModel.editingComment = target
        composerLanguage = DefaultComposerLanguage.resolve(editing: target.originalLanguage, current: composerLanguage)
        composerText = target.content
        let flags = MessageEffectFlags(rawValue: UInt32(clamping: target.effectFlags))
        commentBlurEnabled = flags.contains(.blurred)
        commentEffects = MessageEffects(flags: flags.subtracting(.blurred))
        HapticFeedback.light()
    }

    func cancelEditComment() {
        viewModel.editingComment = nil
        composerText = ""
        commentEffects = .none
        commentBlurEnabled = false
    }

    /// Remplacement optimiste en place, rollback si le serveur refuse — porté
    /// par `PostDetailViewModel.updateComment`. La langue est lue AVANT de vider
    /// le champ : un champ vidé ramène la pastille au défaut.
    func submitCommentEdit(_ editing: FeedComment, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !editing.media.isEmpty else { return }
        let language = composerLanguage
        let flags = commentEffects.flags.rawValue
            | (commentBlurEnabled ? MessageEffectFlags.blurred.rawValue : 0)
        viewModel.editingComment = nil
        composerText = ""
        commentEffects = .none
        commentBlurEnabled = false
        commentAttachments.removeAll()
        Task { await viewModel.updateComment(editing, content: trimmed, effectFlags: Int(flags), originalLanguage: language) }
    }
}
