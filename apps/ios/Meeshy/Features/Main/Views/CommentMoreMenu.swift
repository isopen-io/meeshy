import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le menu « … » d'un commentaire** — un seul, pour les commentaires de post
/// (`CommentRowView`) et de story (`StoryCommentRowView`) (#8709). Il était
/// écrit en ligne dans la ligne d'un post ; la story n'en avait aucun.
///
/// Ce qu'il offre, c'est `CommentMenuPolicy` qui le dit : Copier (le texte
/// servi), Modifier (l'auteur), Signaler (les autres), Supprimer (l'auteur,
/// quand l'hôte le sait). « Imager » vit dans la rangée d'actions de la ligne
/// (#16541). Les mêmes entrées sont des actions personnalisées VoiceOver du
/// bouton.
struct CommentMoreMenu: View {
    let comment: FeedComment
    /// Le texte que la ligne affiche — ce que « Copier » emporte.
    let servedText: String
    let showOriginal: Bool
    let accentColor: String
    var onEdit: (() -> Void)? = nil
    var onDelete: (() -> Void)? = nil
    /// #11151 — retire le commentaire d'un autre ; reçoit le motif de la feuille.
    var onRemove: ((String) -> Void)? = nil
    var glyphSize: CGFloat = 14
    var glyphColor: Color = .secondary

    @State private var reportPresented = false

    private var viewer: MessageCardSubject.Viewer { ImagerCardRequest.currentViewer }

    private var actions: [CommentMenuAction] {
        CommentMenuPolicy.actions(
            for: comment,
            viewerId: viewer.id,
            servedText: servedText,
            editable: onEdit != nil,
            deletable: onDelete != nil,
            removable: onRemove != nil
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
        case .delete, .remove:
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
        case .edit:
            HapticFeedback.light()
            onEdit?()
        case .report:
            HapticFeedback.light()
            reportPresented = true
        case .delete:
            HapticFeedback.medium()
            onDelete?()
        case .remove:
            HapticFeedback.medium()
            guard let onRemove else { return }
            ContentRemovalPresenter.present(.comment, onConfirm: onRemove)
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
        case .edit: return String(localized: "comment.action.edit", defaultValue: "Modifier", bundle: .main)
        case .report: return String(localized: "comment.action.report", defaultValue: "Signaler", bundle: .main)
        case .delete: return String(localized: "comment.action.delete", defaultValue: "Supprimer", bundle: .main)
        case .remove: return String(localized: "moderation.removal.action", defaultValue: "Retirer", bundle: .main)
        }
    }

    static func symbol(of action: CommentMenuAction) -> String {
        switch action {
        case .copy: return "doc.on.doc"
        case .edit: return "pencil"
        case .report: return "flag"
        case .delete: return "trash"
        case .remove: return ContentRemovalKind.symbol
        }
    }
}
