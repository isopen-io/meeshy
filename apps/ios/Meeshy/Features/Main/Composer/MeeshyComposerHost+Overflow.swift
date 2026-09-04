import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le menu `⋯` du composer — ce qu'il OFFRE et ce que chaque entrée FAIT**
/// (#4996).
///
/// ## Pourquoi ce fichier existe
///
/// Il est sorti de `MeeshyComposerHost+Intake.swift` le 2026-09-03, quand
/// l'ajout des deux entrées d'export a franchi le plafond de 1 200 lignes. Le
/// découpage suit la RESPONSABILITÉ, pas une tranche : l'ingestion fait ENTRER
/// de la matière, ce menu décide de ce qu'on fait de celle qui est déjà là —
/// l'emporter, en retirer une part, tout jeter.
///
/// > **Extraire d'abord, ajouter ensuite.** C'est la règle du budget, et le
/// > cliquet a fait son travail : il a refusé la croissance, et le refus a
/// > rendu visible une frontière qui existait déjà dans les faits.
///
/// Le nom suit le motif `MeeshyComposerHost+*` — c'est ce qui garde le fichier
/// DANS l'unité que `AppSourceGuard.composerHostSource()` lit, et donc toutes
/// les gardes qui nomment ces membres vivantes.
extension MeeshyComposerHost {

    /// Les entrées du `⋯`, lues à UN endroit. La règle est PURE
    /// (`ComposerOverflowPolicy`) et se lit ici ; le `body` ne fait que
    /// consommer, et ne peut donc pas en écrire une seconde version.
    var documentOverflowEntries: [ComposerOverflowEntry] {
        ComposerOverflowPolicy.entries(
            hasBackground: documentBackground != nil,
            hasMedia: !documentLocalMedia.isEmpty,
            hasText: !documentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            hasLocation: documentLocation != nil,
            // #4996 — les deux entrées d'export ne s'offrent que s'il y a une
            // SCÈNE à baker. `sceneIsPresent` est le prédicat unique de cette
            // question (#4513) ; en écrire un second ici les ferait diverger
            // le jour où la story vide compte comme scène — ce qu'elle fait
            // déjà.
            hasScene: sceneIsPresent,
            backgroundPickerIsReachable: backgroundPaletteIsReachable
        )
    }

    /// **La palette a-t-elle DÉJÀ un chemin à l'écran ?** (#4064)
    ///
    /// Sur la surface DOCUMENT, oui : l'icône de fond de la rangée d'outils la
    /// déplie. Sur la surface de SCÈNE, non — cette rangée n'y existe plus (le
    /// chrome est passé aux deux rails) et le rail *leading* ne porte que des
    /// portes qui font entrer un `MeeshySceneObject` ; une COULEUR n'en est pas un.
    /// Le `⋯` est alors le seul chemin restant, et la règle le lui accorde.
    ///
    /// La question se pose au MEUBLE parce que c'est lui qui monte les vues ;
    /// `ComposerOverflowPolicy`, elle, ne reçoit qu'un FAIT — pas un nom de
    /// surface, qu'elle n'aurait aucun moyen d'éprouver.
    /// **Elle lit la vue MONTÉE, elle ne la recalcule pas** (#4513). Elle
    /// refaisait l'appel à `mounted(surface:hasScene:)` avec ses propres
    /// arguments — une seconde écriture de la même question, qui a divergé dès
    /// que la règle a pris une troisième entrée : elle aurait continué de
    /// répondre « scène » pour une scène simplement INCRUSTÉE, où la rangée
    /// d'outils du document offre pourtant bien la palette.
    ///
    /// > Une valeur lue à un seul endroit ne peut pas être lue de travers
    /// > ailleurs.
    /// **#4919 — la surface de SCÈNE a désormais son propre chemin**, la porte
    /// `background` du rail gauche. La réponse est donc `true` PARTOUT : la
    /// rangée d'outils sur le document, la porte sur la scène.
    ///
    /// Laisser `false` ici donnerait DEUX contrôles pour un même réglage sur le
    /// même écran — très exactement le doublon que le paramètre de
    /// `ComposerOverflowPolicy` existe pour éviter, et que son doc-comment
    /// nomme. La règle, elle, ne change pas : elle garde ses deux réponses, et
    /// ses témoins les épinglent. Ce qui change est le FAIT qu'on lui rapporte.
    var backgroundPaletteIsReachable: Bool { true }

    /// **Le `⋯` de la barre haute (#4047).** Il ne peint QUE les entrées que la
    /// règle sert — une entrée absente, jamais grisée.
    ///
    /// Le verre est le même que celui du `✕` et du chip de format, et pour la
    /// même raison qu'eux le premier plan reste `textPrimary(isDark: true)` :
    /// `glassControlForeground()` rendrait `indigo950` en thème clair, sur un
    /// plateau qui est sombre en permanence.
    var overflowMenu: some View {
        Menu {
            ForEach(Array(documentOverflowEntries.enumerated()), id: \.offset) { entry in
                let item = entry.element
                Button(role: item == .clearAll ? .destructive : nil) {
                    perform(item)
                } label: {
                    Label(ComposerOverflowCopy.label(item),
                          systemImage: ComposerOverflowCopy.icon(item))
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
        }
        .accessibilityLabel(Text(ComposerOverflowCopy.menu))
    }

    /// **Ce que chaque entrée FAIT.** Séparé de ce qui les OFFRE : la règle dit
    /// lesquelles servir, cette fonction ce qu'elles emportent — et les deux se
    /// lisent sans monter une vue.
    func perform(_ entry: ComposerOverflowEntry) {
        switch entry {
        case .pickBackground:
            // Bascule : le même geste ouvre et referme la bande. « Ouvrir »
            // sans « refermer » rendrait les ≈ 170 pt à sens unique.
            requestedSceneBand = requestedSceneBand == .palette ? nil : .palette

        case .removeBackground:
            // L'INTENTION de l'auteur est `documentBackground` : c'est elle qui
            // fait naître la scène (`documentHasScene`). Le canvas, lui, garde
            // toujours une couleur — `background` n'est pas optionnel dans
            // `StoryEffects`, et y poser du vide donnerait un canvas NOIR.
            documentBackground = nil
            viewModel.clearBackground()

        // **Les deux exports passent par le MÊME appel** (#4996) : le bake est
        // identique, seule la destination change. Deux chemins auraient donné
        // deux orchestrations à faire converger — et c'est le nettoyage du
        // fichier temporaire qui aurait divergé en premier.
        //
        // `exportableCurrentSlide()` est le site du SDK qui compose la slide
        // exportable : timeline committée, URLs de vidéo résolues, fond image
        // du composer injecté. La recopier ici perdrait les trois.
        case .saveToPhotos:
            sceneExport.export(.photoLibrary, slide: viewModel.exportableCurrentSlide())
        case .share:
            sceneExport.export(.share, slide: viewModel.exportableCurrentSlide())

        case .clearAll:
            // **`viewModel.reset()` d'ABORD, l'état du meuble ensuite.** Le
            // reset vide `carriedContentSources`, le cache d'idempotence
            // d'`applyContentMedia` ; sans lui, re-choisir la MÊME photo après
            // un effacement serait silencieusement sauté et n'atteindrait
            // jamais la scène.
            viewModel.reset()
            documentText = ""
            documentLocalMedia = []
            documentBackground = nil
            documentLocation = nil
            documentDiscoverability.reset()
            documentTranscriptions = [:]
            // Le contexte d'édition désigne une URL de `documentLocalMedia`
            // qu'on vient de vider : le laisser posé ferait remplacer une
            // entrée qui n'existe plus.
            editedForegroundSound = nil
            // La carte média→slide est un INDEX du meuble : la laisser pleine
            // ferait retirer, au prochain sync, des slides qui n'existent plus.
            slideIdByMediaURL = [:]
            // Sa jumelle sert AUSSI de garde d'idempotence (#4724) : la laisser
            // pleine ferait sauter la re-pose de la même photo après un « Tout
            // effacer » — exactement le défaut que `viewModel.reset()` ferme
            // trois lignes plus haut pour `carriedContentSources`.
            mediaRoleByURL = [:]
            selectedSceneItemKind = nil
            // **Les personnes NOMMÉES partaient avec le reste** (#5013). Elles
            // ne figuraient dans aucune des onze lignes ci-dessus : « Tout
            // effacer » vidait le texte, les médias, le fond et le lieu, et
            // laissait la publication mentionner des gens que plus rien à
            // l'écran ne montrait. Elles seraient reparties avec la
            // publication suivante, notification comprise.
            composerReferences = []
            // **Les légendes, même classe et même silence.** Elles sont clées
            // par l'URL LOCALE du média ; survivant à l'effacement, elles se
            // ré-attachent à un fichier RE-CHOISI plus tard. C'est exactement
            // ce que `mediaRoleByURL` documente deux lignes plus haut — « le
            // rôle s'oublie avec le média, sinon un fichier re-choisi serait
            // sauté en silence ».
            documentMediaCaptions = [:]
            // **Et l'index des durées sources**, clé par identifiant d'objet :
            // `viewModel.reset()` vient d'invalider ces identifiants, donc le
            // laisser plein garde des mesures qui ne désignent plus rien.
            trimSourceDurations = [:]
        }
    }
}
