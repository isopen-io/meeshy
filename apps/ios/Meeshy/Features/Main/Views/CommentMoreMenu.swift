import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le menu « … » d'un commentaire** — un seul, pour les commentaires de post
/// (`CommentRowView`) et de story (`StoryCommentRowView`) (#8709). Il était
/// écrit en ligne dans la ligne d'un post ; la story n'en avait aucun.
///
/// Ce qu'il offre, c'est `CommentMenuPolicy` qui le dit : Copier (le texte
/// servi), Imager (l'arbre de réponses compris), Modifier (l'auteur), Signaler
/// (les autres), Supprimer (l'auteur, quand l'hôte le sait). Les mêmes
/// entrées sont des actions personnalisées VoiceOver du bouton.
struct CommentMoreMenu: View {
    let comment: FeedComment
    /// Le texte que la ligne affiche — ce que « Copier » emporte.
    let servedText: String
    let showOriginal: Bool
    let accentColor: String
    /// La racine d'une réponse : elle part en citation dans la carte.
    var root: FeedComment? = nil
    /// Les réponses chargées d'une racine — « Imager » peut en emporter une.
    var loadedReplies: [FeedComment] = []
    var onEdit: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    var glyphSize: CGFloat = 14
    var glyphColor: Color = .secondary

    @State private var reportPresented = false

    private var viewer: MessageCardSubject.Viewer {
        let user = AuthManager.shared.currentUser
        return MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName, username: user?.username)
    }

    private func imagineRequest(_ target: FeedComment, quoting quoted: FeedComment?) -> MessageCardExportRequest? {
        MessageCardExportMenu.request(
            comment: target,
            showOriginal: target.id == comment.id && showOriginal,
            accentColor: accentColor,
            viewer: viewer,
            handle: viewer.username,
            quoting: quoted,
            audioPrism: ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved
        )
    }

    private var ownRequest: MessageCardExportRequest? { imagineRequest(comment, quoting: root) }

    private var threadReplies: [FeedComment] {
        CommentMenuPolicy.imagineReplies(for: comment, loaded: loadedReplies)
    }

    private var actions: [CommentMenuAction] {
        CommentMenuPolicy.actions(
            for: comment,
            viewerId: viewer.id,
            servedText: servedText,
            canImagine: ownRequest != nil,
            editable: onEdit != nil,
            deletable: onDelete != nil
        )
    }

    var body: some View {
        let actions = self.actions
        if !actions.isEmpty {
            Menu {
                ForEach(actions, id: \.self) { action in
                    entry(action)
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(MeeshyFont.relative(glyphSize))
                    .foregroundColor(glyphColor)
            }
            .accessibilityLabel(String(localized: "a11y.comment.more_options", defaultValue: "Plus d'options", bundle: .main))
            .accessibilityActions {
                ForEach(actions, id: \.self) { action in
                    Button(Self.title(of: action)) { perform(action) }
                }
            }
            .meeshyTapTarget(44)
            .sheet(isPresented: $reportPresented) {
                ReportMessageSheet(
                    accentColor: accentColor,
                    title: String(localized: "report.comment.title", defaultValue: "Pourquoi signalez-vous ce commentaire ?", bundle: .main)
                ) { type, reason in
                    report(type: type, reason: reason)
                }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    @ViewBuilder
    private func entry(_ action: CommentMenuAction) -> some View {
        switch action {
        case .imagine where !threadReplies.isEmpty:
            Menu {
                Button(String(localized: "comment.imagine.alone", defaultValue: "Ce commentaire seul", bundle: .main)) {
                    perform(.imagine)
                }
                ForEach(threadReplies) { reply in
                    Button(String(format: String(localized: "comment.imagine.withReply", defaultValue: "Avec la réponse de %@", bundle: .main), reply.author)) {
                        guard let request = imagineRequest(reply, quoting: comment) else { return }
                        HapticFeedback.light()
                        MessageCardExportPresenter.present(request)
                    }
                }
            } label: {
                Label(Self.title(of: action), systemImage: Self.symbol(of: action))
            }
        case .delete:
            Button(role: .destructive) { perform(action) } label: {
                Label(Self.title(of: action), systemImage: Self.symbol(of: action))
            }
        default:
            Button { perform(action) } label: {
                Label(Self.title(of: action), systemImage: Self.symbol(of: action))
            }
        }
    }

    private func perform(_ action: CommentMenuAction) {
        switch action {
        case .copy:
            UIPasteboard.general.string = servedText
            HapticFeedback.success()
        case .imagine:
            guard let request = ownRequest else { return }
            HapticFeedback.light()
            MessageCardExportPresenter.present(request)
        case .edit:
            HapticFeedback.light()
            onEdit?()
        case .report:
            HapticFeedback.light()
            reportPresented = true
        case .delete:
            HapticFeedback.medium()
            onDelete?()
        }
    }

    private func report(type: String, reason: String?) {
        let commentId = comment.id
        Task { @MainActor in
            do {
                try await ReportService.shared.reportComment(commentId: commentId, reportType: type, reason: reason)
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(
                    String(localized: "comment.report.success", defaultValue: "Commentaire signalé", bundle: .main))
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(
                    String(localized: "comment.report.error", defaultValue: "Erreur lors du signalement", bundle: .main))
            }
            reportPresented = false
        }
    }

    static func title(of action: CommentMenuAction) -> String {
        switch action {
        case .copy: return String(localized: "comment.action.copy", defaultValue: "Copier le texte", bundle: .main)
        case .imagine: return MessageCardExportMenu.imageLabel
        case .edit: return String(localized: "comment.action.edit", defaultValue: "Modifier", bundle: .main)
        case .report: return String(localized: "comment.action.report", defaultValue: "Signaler", bundle: .main)
        case .delete: return String(localized: "comment.action.delete", defaultValue: "Supprimer", bundle: .main)
        }
    }

    static func symbol(of action: CommentMenuAction) -> String {
        switch action {
        case .copy: return "doc.on.doc"
        case .imagine: return MessageCardExportMenu.imageSymbol
        case .edit: return "pencil"
        case .report: return "flag"
        case .delete: return "trash"
        }
    }
}
