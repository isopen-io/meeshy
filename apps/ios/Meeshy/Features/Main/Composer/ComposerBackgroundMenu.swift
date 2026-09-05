import Foundation

/// **Ce qu'un appui long sur un FOND image ou vidéo propose** (#5041).
///
/// Directive porteur du 2026-09-04 :
///
/// > « Lorsqu'on a une image, vidéo de fond le longpress sur le fond doit
/// > mettre le menu permettant de **supprimer, ramener en front ou encore
/// > d'éditer** l'image. »
///
/// Trois entrées, et l'ordre est celui de la fréquence d'usage, pas celui de la
/// phrase : on ouvre l'éditeur bien plus souvent qu'on ne supprime, et la
/// destruction se met en dernier — là où le pouce ne la trouve pas par
/// accident. `.destructive` la sépare visuellement du reste.
///
/// ## Pourquoi un MENU et pas l'éditeur directement
///
/// Le routage du canvas (`StoryCanvasBackgroundLongPress`) pourrait ouvrir
/// l'éditeur d'un trait, et c'est ce qu'une première écriture faisait. Mais
/// **« ramener en avant » n'a d'équivalent nulle part ailleurs** : c'est la
/// seule action qui fait SORTIR un média du plan de fond, et un fond n'est
/// sélectionnable par aucun autre geste — le tap le sélectionne sans
/// l'inspecter, le double-tap va droit à l'éditeur. Sans ce menu, la
/// rétrogradation d'un fond n'a aucun chemin.
///
/// ## Pourquoi la loi est ICI et non dans la vue
///
/// Une entrée écrite dans un `confirmationDialog` n'est interrogeable que par
/// une garde de source, et une garde de source sur trois `Button` littéraux
/// passe au vert dès qu'on réécrit la liste autrement. Ce type se compte.
nonisolated enum ComposerBackgroundMenuAction: String, CaseIterable, Equatable, Sendable {

    /// Ouvre l'éditeur unifié image/vidéo — la vue `2d` de la planche.
    case edit

    /// Le média quitte le plan de FOND et devient un objet de premier plan.
    /// C'est `StoryComposerViewModel.toggleBackground(id:)`, qui existe et fait
    /// exactement cela ; `bringForward(id:)` ne conviendrait PAS — il déplace
    /// un z-index parmi les objets de premier plan, et un fond se rend depuis
    /// `backgroundLayer` quel que soit son z. Le contrôle aurait été INERTE.
    case bringForward

    /// Le fond est retiré ; la scène retrouve sa couleur.
    case delete

    /// Le glyphe SF Symbols. Il annonce l'effet, jamais l'état.
    var symbol: String {
        switch self {
        case .edit:         return "slider.horizontal.below.rectangle"
        case .bringForward: return "square.3.layers.3d.top.filled"
        case .delete:       return "trash"
        }
    }

    /// **Une seule entrée détruit**, et elle doit le dire avant qu'on la
    /// touche. `confirmationDialog` peint le rôle en rouge et le range à part.
    var isDestructive: Bool { self == .delete }

    /// L'ordre SERVI. Il n'est pas `allCases` : `CaseIterable` rend l'ordre de
    /// DÉCLARATION, qui est celui du raisonnement ci-dessus, et rien ne
    /// garantirait qu'un cas ajouté au milieu n'atterrisse pas entre l'édition
    /// et la suppression. Une liste explicite se relit ; un ordre implicite se
    /// découvre à l'écran.
    static let served: [ComposerBackgroundMenuAction] = [.edit, .bringForward, .delete]
}

/// Le vocabulaire du menu, séparé de la vue pour la raison habituelle du
/// dépôt : une chaîne composée dans un corps de vue est hors de portée d'un
/// témoin.
@MainActor
enum ComposerBackgroundMenuCopy {

    static func title() -> String {
        String(localized: "composer.scene.background.menu.title",
               defaultValue: "Fond de la scène", bundle: .main)
    }

    static func label(for action: ComposerBackgroundMenuAction) -> String {
        switch action {
        case .edit:
            return String(localized: "composer.scene.background.menu.edit",
                          defaultValue: "Modifier", bundle: .main)
        case .bringForward:
            return String(localized: "composer.scene.background.menu.bringForward",
                          defaultValue: "Ramener en avant", bundle: .main)
        case .delete:
            return String(localized: "composer.scene.background.menu.delete",
                          defaultValue: "Supprimer", bundle: .main)
        }
    }
}
