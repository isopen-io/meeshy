import Foundation
import MeeshySDK

// MARK: - Éditer le FOND sans quitter la scène (#8847)

/// **L'édition du fond en cours** — quel fond, et quel outil a ses contrôles
/// ouverts sous la scène. `openSection == nil` ⇒ seul le rail droit montre les
/// outils du fond ; rien n'est encore ouvert en bas.
nonisolated struct ComposerBackgroundEdit: Equatable, Sendable {
    let objectId: String
    var openSection: ComposerObjectEditorSection?
}

/// **Éditer le fond passe par les outils de droite, leurs contrôles
/// s'affichent sous la scène et masquent tout le reste** (#8847, directive
/// porteur 2026-09-30).
///
/// > « l'édition de la vidéo ou image de fond ne doit plus ouvrir l'ancien
/// > éditeur mais juste les outils de droite qui n'ouvrent pas non plus l'ancien
/// > éditeur mais affichent les contrôleurs en bas de la scène en masquant ce
/// > qui y serait […] Quand on a les outils de droite ouverts on n'a pas besoin
/// > d'afficher l'audience ou la publication étant dans un outil ! C'est quand
/// > on revient à la gestion de la scène qu'on affiche ces éléments ! »
///
/// Toutes les portes d'édition d'un objet passent par un SITE unique
/// (`openObjectEditor`) : c'est là que la redirection se pose, une fois, et
/// elle couvre le menu du fond, la vignette de slide, « Modifier », les
/// sections du rail, le rognage et les jetons — sans qu'aucune ne soit
/// recopiée.
nonisolated enum ComposerBackgroundTools {

    /// **Ce que le fond sert EN LIGNE** — les outils de l'éditeur d'objet qui
    /// ont un effet sur un fond : le filtre (image), le rognage (vidéo), muet
    /// et pivoter, la description.
    ///
    /// **Ni fenêtre de temps ni plan 2D** : un fond dure la slide entière, et
    /// leur réglage dans l'éditeur n'écrit que sur un texte — deux contrôles
    /// sans effet ici, que la loi 4 bannit.
    static func sections(isVideo: Bool, hasTrimmableSource: Bool) -> [ComposerObjectEditorSection] {
        ComposerObjectEditorRail.entries(for: .media,
                                         hasTrimmableSource: hasTrimmableSource,
                                         offersFilter: !isVideo)
            .filter(servedInline.contains)
    }

    static let servedInline: Set<ComposerObjectEditorSection> = [
        .media(.filter), .media(.trim), .media(.actions), .media(.altText),
    ]

    /// **Une demande d'édition du FOND, sur la scène, devient l'édition en
    /// ligne** — jamais l'ancien éditeur plein écran. La section demandée
    /// s'ouvre si le fond la sert ; sinon, seul le rail paraît. Hors fond, ou
    /// hors de la scène (le document garde son inspecteur), `nil` : l'éditeur
    /// d'objet reste la destination.
    static func redirect(objectId: String,
                         isBackground: Bool,
                         onSceneSurface: Bool,
                         requested: ComposerObjectEditorSection?,
                         served: [ComposerObjectEditorSection]) -> ComposerBackgroundEdit? {
        guard isBackground, onSceneSurface else { return nil }
        return ComposerBackgroundEdit(objectId: objectId,
                                      openSection: requested.flatMap { served.contains($0) ? $0 : nil })
    }

    /// Toucher un outil ouvre ses contrôles ; toucher l'outil ouvert les range
    /// — le rail des outils du fond reste, lui, jusqu'au `(x)`.
    static func tapped(_ section: ComposerObjectEditorSection,
                       in edit: ComposerBackgroundEdit) -> ComposerBackgroundEdit {
        ComposerBackgroundEdit(objectId: edit.objectId,
                               openSection: edit.openSection == section ? nil : section)
    }

    /// **L'édition ne survit pas à son fond.** Un fond supprimé, remplacé ou
    /// défait par l'historique — ou une autre surface montée — rend la scène :
    /// l'écran ne reste jamais en mode outil sur un objet qui n'est plus là.
    static func resolved(_ edit: ComposerBackgroundEdit?,
                         backgroundId: String?,
                         onSceneSurface: Bool) -> ComposerBackgroundEdit? {
        guard let edit, onSceneSurface, edit.objectId == backgroundId else { return nil }
        return edit
    }
}

nonisolated enum ComposerBackgroundToolsCopy {
    static var entered: String {
        String(localized: "composer.background.tools.entered",
               defaultValue: "Outils du fond", bundle: .main)
    }

    static var left: String {
        String(localized: "composer.background.tools.left",
               defaultValue: "Retour à la scène", bundle: .main)
    }
}
