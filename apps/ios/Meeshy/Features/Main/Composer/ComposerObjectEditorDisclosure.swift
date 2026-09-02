import MeeshyUI

/// **Les sections de l'éditeur d'objet — dix depuis l'EFFET (#4870) — et
/// laquelle est OUVERTE** (#4842).
///
/// ## Le défaut
///
/// L'écran plein écran d'édition d'un objet texte dépliait ses neuf sections
/// d'un coup — style, couleur, alignement, fond, cadre, bordure, langue, la
/// fenêtre de temps et le plan 2D. Il fallait faire défiler pour atteindre les
/// quatre dernières, et rien n'annonçait qu'elles existaient.
///
/// > « ne pas tout montrer d'un coup (la vue plein ecran actuelle est trop
/// > chargé) » — directive porteur, 2026-09-01 23h04.
///
/// C'est la **loi 8** : le prisme n'affiche que ce dont on a besoin, au moment
/// où on en a besoin.
///
/// ## Ce que cette règle N'annule pas
///
/// L'empilement n'était pas une négligence : il répondait à un vrai défaut.
/// `MeeshyToolOptionsPanel` ne rend quelque chose que si un outil est déplié
/// **dans le ViewModel**, donc la zone basse d'une édition de texte restait
/// VIDE tant qu'aucune bulle du rail n'avait été tapée. « Toutes les options »
/// n'existait nulle part.
///
/// La distinction tient en un mot : ce dépliage-ci est **LOCAL**. Il n'a pas
/// d'état vide possible — une section est ouverte au premier rendu, et tous
/// les en-têtes restent visibles quoi qu'il arrive. Rien n'est retiré ; seule la
/// révélation change.
///
/// ## Pourquoi une règle pure pour trois lignes
///
/// Parce que la promesse à tenir — « jamais deux sections ouvertes ensemble » —
/// se mesure sur toutes les paires (90 pour dix sections), et qu'un témoin de
/// vue n'en éprouverait qu'un
/// chemin. Écrite dans un `body`, la même logique serait hors de portée.
nonisolated enum ComposerObjectEditorSection: Hashable, Sendable {
    /// Les outils du SDK — sept alors, huit depuis l'EFFET (#4870), et le
    /// huitième est entré ici sans qu'une ligne change : le cas porte
    /// `TextEditTool` plutôt que de recopier ses cas, pour la même raison qui
    /// fait lire `TextEditTool.all` à l'écran plutôt qu'une liste écrite à la
    /// main.
    case tool(TextEditTool)
    /// D'où à où l'objet vit dans la slide.
    case timing
    /// Le plan 2D — où il se pose, se pince et se tourne.
    case plan
}

nonisolated enum ComposerObjectEditorDisclosure {

    /// **Jamais tout replié au premier rendu.** Un écran qui naîtrait
    /// entièrement fermé échangerait un défaut contre son symétrique : dix
    /// sections d'un coup deviendraient dix titres muets, et l'auteur devrait
    /// deviner par où commencer. Le style est le premier geste sur un texte.
    static let initiallyOpened: ComposerObjectEditorSection = .tool(.style)

    /// Ce qui est ouvert APRÈS un tap sur `tapped`.
    ///
    /// `nil` ⇒ plus rien n'est déplié, et c'est un état voulu : sur cet écran
    /// l'objet se déplace, se pince et se tourne. Pouvoir tout replier rend la
    /// hauteur à la scène — c'est le geste de celui qui positionne, pas un
    /// état dégradé.
    static func opened(after tapped: ComposerObjectEditorSection,
                       from opened: ComposerObjectEditorSection?) -> ComposerObjectEditorSection? {
        opened == tapped ? nil : tapped
    }

    static func isOpen(_ section: ComposerObjectEditorSection,
                       opened: ComposerObjectEditorSection?) -> Bool {
        opened == section
    }
}
