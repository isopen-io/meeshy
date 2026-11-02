import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'audience et les hashtags — deux feuilles, un seul niveau du modèle**
/// (#4636, directive porteur 2026-08-31).
///
/// Les deux appartiennent à la PUBLICATION, comme les mentions. C'est pourquoi
/// la feuille d'audience les montre ensemble : ce sont les trois choses qui
/// partent avec le contenu et que la scène ne montre pas.
extension MeeshyComposerHost {

    /// **Les hashtags de la publication, DÉRIVÉS de son texte.**
    ///
    /// Une seule dérivation dans tout le meuble : la feuille d'audience et le
    /// sélecteur lisent la MÊME, sans quoi deux motifs voisins finiraient par
    /// diverger sur un cas limite (`page#section`, `a#b`) et l'écran montrerait
    /// une balise que l'envoi n'emporte pas.
    var composerHashtags: [String] {
        ComposerHashtags.tags(in: documentText)
    }

    /// **La vue `2l`.** Elle ne présente rien elle-même : le sélecteur de
    /// personnes passe par une intention, exactement comme l'importateur de
    /// fichiers — une feuille montée sur une feuille est l'état que
    /// `ComposerPortal` existe pour rendre irreprésentable.
    var composerAudienceSheet: some View {
        ComposerAudienceSheet(
            offered: offeredAudiences,
            selection: Binding(
                get: { composerVisibility },
                // **Le choix écrit la MÉMOIRE dans le même geste** (loi 10) —
                // `chooseAudience` est le site unique qui le fait, et le court-
                // circuiter ici ferait repartir l'audience à zéro à la
                // prochaine ouverture, sans qu'aucun écran ne le dise.
                set: { chooseAudience($0) }
            ),
            selectedUserIds: composerVisibilityUserIds,
            references: composerReferences,
            hashtags: composerHashtags,
            onChooseUsers: { mode in
                pendingAudiencePicker = mode
                presentedPortal = nil
            },
            onRemoveHashtag: { tag in
                documentText = ComposerHashtags.removing(tag, from: documentText)
            },
            onClose: { presentedPortal = nil }
        )
    }

    /// Le sélecteur de hashtags. Son résultat s'écrit dans le TEXTE — la feuille
    /// n'a aucune liste à tenir, et c'est ce qui garde la dérivation ci-dessus
    /// comme source unique.
    var composerHashtagSheet: some View {
        ComposerHashtagSheet(
            current: composerHashtags,
            trending: trendingHashtags,
            onToggle: { tag in
                // Une bascule, pas un ajout : la même puce retire ce qu'elle a
                // posé, et le doigt n'a qu'un geste à apprendre.
                documentText = composerHashtags.contains(where: { $0.lowercased() == tag.lowercased() })
                    ? ComposerHashtags.removing(tag, from: documentText)
                    : ComposerHashtags.inserting(tag, into: documentText)
            }
        )
        .task { await loadTrendingHashtags() }
    }

    /// **Le meuble ne nomme aucun service — pas même pour LIRE.**
    ///
    /// Le fournisseur des tendances vit chez la feuille qui les montre
    /// (`ComposerHashtagSheet.loadTrending`). Le meuble ne fait que RETENIR
    /// la réponse entre deux ouvertures : `test_host_opensNoSecondPublicationPath`
    /// interdit à l'unité du meuble de connaître `PostService`, et lui laisser
    /// une lecture « inoffensive » aurait ouvert la porte que la garde ferme.
    ///
    /// L'échec est SILENCIEUX : une liste vide est l'état nominal (hors-ligne,
    /// aucune tendance), et le champ de saisie tient la capacité entière.
    func loadTrendingHashtags() async {
        guard trendingHashtags.isEmpty else { return }
        trendingHashtags = await ComposerHashtagSheet.loadTrending()
    }
}
