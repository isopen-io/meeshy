import SwiftUI
import MeeshyUI

/// **Les écrans du « rien à montrer », côte à côte.**
///
/// Ils vivent ensemble parce que c'est leur DIFFÉRENCE qui porte la règle :
/// même silhouette, mais une disparition n'appelle pas la même action qu'un
/// échec — et un échec serveur ne se raconte pas comme un échec réseau (#6508).
///
/// Le choix entre eux n'est pas ici : il est dans `PostDetailAbsenceReason`,
/// pur et testé. Les mots, l'icône et l'offre de réessai viennent de
/// `ContentFetchFailure+Copy`, partagé avec la cible story et le lecteur de
/// réels. Ces vues ne décident de rien, elles rendent.
///
/// Extrait de `PostDetailView.swift` — le budget de fichier interdit d'ajouter
/// à un fichier déjà hors budget, donc on extrait AVANT d'ajouter (#4903).
extension PostDetailView {

    /// L'état rendu quand il n'y a ni post ni chargement en cours.
    @ViewBuilder
    var absenceState: some View {
        switch PostDetailAbsenceReason.resolve(hasPost: false, isLoading: false, failure: viewModel.loadFailure) {
        case .networkFailed:
            loadFailedState(.network)
        case .serverFailed:
            loadFailedState(.server)
        case .present, .stillLoading, .unavailable:
            unavailableState
        }
    }

    /// **Un échec de chargement n'est pas une disparition.**
    ///
    /// Même silhouette que `unavailableState` — l'utilisateur reconnaît l'écran
    /// — mais l'icône, la phrase et surtout l'ACTION changent : ici la seule
    /// chose qui puisse aider est de refaire la requête. Le bouton « Retour »
    /// reste en second, jamais en premier : partir est le repli, pas le geste
    /// attendu.
    func loadFailedState(_ cause: ContentFetchFailure) -> some View {
        VStack(spacing: 12) {
            Image(systemName: cause.symbolName)
                // `MeeshyFont.relative` et non `.system(size:)` : une icône
                // d'état vide n'a pas de cadre fixe, donc rien ne justifie
                // qu'elle ignore Dynamic Type.
                .font(MeeshyFont.relative(40))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(cause.title)
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(cause.message)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                HapticFeedback.light()
                Task { await viewModel.loadPost(postId) }
            } label: {
                Text(String(localized: "feed.post.detail.loadFailed.retry",
                            defaultValue: "Réessayer", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .buttonStyle(.borderedProminent)
            Button {
                HapticFeedback.light()
                router.pop()
            } label: {
                Text(String(localized: "feed.post.detail.unavailable.back",
                            defaultValue: "Retour", bundle: .main))
                    .font(MeeshyFont.relative(15))
            }
            .buttonStyle(.plain)
            .foregroundColor(theme.textSecondary)
        }
        .padding(.horizontal, 32)
        .accessibilityElement(children: .contain)
    }

    /// Contenu introuvable ou interdit : expiré, retiré, ou jamais accessible à
    /// cette personne. On ne distingue pas — l'utilisateur n'a rien de
    /// différent à faire, et prétendre savoir lequel serait inventer.
    var unavailableState: some View {
        VStack(spacing: 12) {
            Image(systemName: ContentFetchFailure.notFound.symbolName)
                .font(MeeshyFont.relative(40))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(ContentFetchFailure.notFound.title)
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(ContentFetchFailure.notFound.message)
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                // Même geste que la flèche de l'en-tête (`postDetailHeader`) —
                // et le seul disponible ici : l'en-tête ne se rend qu'avec un
                // post, donc cette branche n'en a aucun.
                HapticFeedback.light()
                router.pop()
            } label: {
                Text(String(localized: "feed.post.detail.unavailable.back",
                            defaultValue: "Retour", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .buttonStyle(.bordered)
            .padding(.top, 4)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
