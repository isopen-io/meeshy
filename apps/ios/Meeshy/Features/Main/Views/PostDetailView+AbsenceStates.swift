import SwiftUI
import MeeshyUI

/// **Les deux écrans du « rien à montrer », côte à côte.**
///
/// Ils vivent ensemble parce que c'est leur DIFFÉRENCE qui porte la règle :
/// même silhouette, mais une disparition n'appelle pas la même action qu'un
/// échec réseau. Les séparer laisserait l'un dériver sans que l'autre rougisse
/// — et c'est exactement ce qui s'était produit, l'écran d'indisponibilité
/// servant les deux causes pendant que le ViewModel les distinguait déjà.
///
/// Le choix entre eux n'est pas ici : il est dans `PostDetailAbsenceReason`,
/// pur et testé. Ces vues ne décident de rien, elles rendent.
///
/// Extrait de `PostDetailView.swift` — le budget de fichier interdit d'ajouter
/// à un fichier déjà hors budget, donc on extrait AVANT d'ajouter (#4903).
extension PostDetailView {


    /// Contenu introuvable : expiré, retiré, ou jamais accessible à cette
    /// personne. On ne distingue pas — le serveur répond la même chose dans les
    /// trois cas, et prétendre le contraire serait inventer.
    /// **Un échec de chargement n'est pas une disparition.**
    ///
    /// Même silhouette que `unavailableState` — l'utilisateur reconnaît l'écran
    /// — mais l'icône, la phrase et surtout l'ACTION changent : ici la seule
    /// chose qui puisse aider est de refaire la requête. Le bouton « Retour »
    /// reste en second, jamais en premier : partir est le repli, pas le geste
    /// attendu.
    var loadFailedState: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                // `MeeshyFont.relative` et non `.system(size:)` : une icône
                // d'état vide n'a pas de cadre fixe, donc rien ne justifie
                // qu'elle ignore Dynamic Type. La taille figée venait de
                // l'ancien site, où elle bénéficiait d'une amnistie de dette —
                // **l'extraction la lui a fait perdre**, et c'est juste : le
                // code arrive dans un fichier NEUF, où la règle s'applique
                // pleine. Extraire fait franchir au code deux frontières
                // invisibles : les gardes qui nomment un fichier, et l'amnistie.
                .font(MeeshyFont.relative(40))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "feed.post.detail.loadFailed.title",
                        defaultValue: "Impossible de charger ce contenu", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(String(localized: "feed.post.detail.loadFailed.body",
                        defaultValue: "Vérifiez votre connexion, puis réessayez.", bundle: .main))
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



    var unavailableState: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.badge.xmark")
                .font(MeeshyFont.relative(40))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "feed.post.detail.unavailable.title",
                        defaultValue: "Ce contenu n'est plus disponible", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(String(localized: "feed.post.detail.unavailable.body",
                        defaultValue: "Il a peut-être expiré ou été retiré par son auteur.", bundle: .main))
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
