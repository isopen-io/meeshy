import Foundation
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

/// **Le rail d'outils de l'éditeur d'objet** (#4936).
///
/// > Directive porteur 2026-09-03 : « Plutôt que d'avoir une liste de fold, ce
/// > n'est pas mieux d'avoir une rangée de tool à gauche et à droite le undo
/// > redo au même endroit et préserver le bas pour afficher les options des
/// > tools à chaque fois ? Avec toujours en haut le texte touché ? »
///
/// ## L'anatomie du PLATEAU, ici aussi
///
/// C'est la dimension 6 dans sa forme la plus directe — même geste, même place.
/// La surface de scène a déjà cette géographie, et `apps/ios/CLAUDE.md` § 1 la
/// justifie : les rails vivent dans les COULOIRS, jamais sur le canvas.
///
/// | zone | sur la scène | ici |
/// |---|---|---|
/// | haut | la scène 9:16 | le sujet touché, toujours visible |
/// | gauche | les portes qui font ENTRER | les outils de l'objet |
/// | droite | contrôleurs + historique | undo / redo, au même endroit |
/// | bas | les options de l'outil ouvert | les options de l'outil ouvert |
///
/// ## Ce que le passage de la LISTE au RAIL change — une seule règle
///
/// Les deux modèles portent le même jeu d'entrées : `ComposerObjectEditorSection`
/// avait déjà une entrée par outil. Ce qui change est la BASCULE.
///
/// Le modèle DÉPLIANT d'hier rendait `nil` quand on
/// retape l'entrée ouverte, et son doc-comment dit pourquoi c'est juste CHEZ
/// LUI : « pouvoir tout replier rend la hauteur à la scène — c'est le geste de
/// celui qui positionne ». Dans un rail, la scène ne récupère rien : le rail
/// occupe le couloir, pas le bas. Un `nil` y viderait la zone basse, et un bas
/// vide est le défaut que cet écran existe pour fermer — « `MeeshyToolOptionsPanel`
/// ne rend quelque chose que si un outil est DÉPLIÉ […] "toutes les options"
/// n'existait nulle part ».
///
/// > **Une bascule juste dans une disposition peut être fausse dans une autre.**
/// > Ce n'est pas le geste qui change de valeur, c'est ce que la place LIBÉRÉE
/// > rend — ou ne rend pas.
nonisolated enum ComposerObjectEditorRail {

    /// Les entrées du rail, de haut en bas.
    ///
    /// **Dérivées, jamais recopiées** : `TextEditTool.all` porte l'ordre de la
    /// rangée du SDK, et le lire ici garantit qu'un neuvième outil entre sans
    /// qu'une ligne change — comme l'EFFET (#4870) est entré dans les sections.
    /// Une liste écrite à la main se périme à la prochaine capacité ; c'est le
    /// motif qui a fait tomber deux témoins au #4919.
    ///
    /// Le TEMPS et le PLAN ferment le rail parce qu'ils ne dessinent pas
    /// l'objet, ils le QUALIFIENT — d'où à où il vit, et où il se pose.
    static var entries: [ComposerObjectEditorSection] {
        TextEditTool.all.map { ComposerObjectEditorSection.tool($0) } + [.timing, .plan]
    }

    /// Ce que le bas montre à l'ouverture — le STYLE, premier geste sur un
    /// texte. Même raison que le modèle dépliant, dont cette valeur est la
    /// reprise : l'écran ne naît jamais muet.
    static let initiallySelected: ComposerObjectEditorSection = .tool(.style)

    /// **Il n'y a pas de fonction de bascule, et c'est le cœur du lot.**
    ///
    /// La liste dépliante en avait une (`opened(after:from:)`, qui rend `nil`
    /// quand on retape l'entrée ouverte). Un rail n'en a pas besoin : taper une
    /// entrée la sélectionne, point. Écrire `selected(after:from:)` aurait donné
    /// une fonction qui rend son argument — une règle qui ne décide rien.
    ///
    /// L'invariant « le bas n'est jamais vide » est donc porté par le **TYPE**,
    /// pas par une garde : l'état de sélection de la vue est un
    /// `ComposerObjectEditorSection` NON optionnel, ce qui rend le vide
    /// irreprésentable. Une garde peut être oubliée à un site d'appel ; un type
    /// qui ne sait pas exprimer l'état interdit ne peut pas l'être.
    ///
    /// > C'est la forme forte de la loi 4 : plutôt que de vérifier qu'un
    /// > contrôle a toujours un effet, on retire au modèle le moyen de dire
    /// > qu'il n'en a pas.

    static func isSelected(_ entry: ComposerObjectEditorSection,
                           selected: ComposerObjectEditorSection) -> Bool {
        entry == selected
    }

    /// **Le glyphe d'une entrée — un seul site, et provisoire par contrat.**
    ///
    /// #4919 a montré ce que coûte une iconographie décidée dans un corps de
    /// vue ; celle-ci vit donc ici, en une table, et l'issue #4936 dit
    /// explicitement que « l'iconographie des outils et l'ordre exact du rail
    /// relèvent de la planche ». Ce qui est livré est l'ANATOMIE ; ces neuf
    /// symboles sont ce qui se défend en attendant qu'elle tranche.
    ///
    /// **Ils ne redessinent PAS l'indicateur du SDK.**
    /// `StoryTextAttributeCycle.indicator(_:of:)` peint une bulle qui reflète la
    /// VALEUR courante (la lettre dans sa police, l'effet appliqué) — une
    /// seconde écriture de ce rendu aurait divergé au premier outil ajouté. Le
    /// rail dit ce que l'outil FAIT ; la bulle du SDK dit ce qu'il VAUT. Deux
    /// questions, deux surfaces.
    static func symbolName(_ entry: ComposerObjectEditorSection) -> String {
        switch entry {
        case .timing: return "clock"
        case .plan:   return "rectangle.grid.1x2"
        case .tool(let outil):
            switch outil {
            case .style:      return "textformat"
            case .color:      return "paintpalette"
            case .align:      return "text.alignleft"
            case .background: return "rectangle.fill"
            case .frame:      return "rectangle.dashed"
            case .border:     return "square.on.square.dashed"
            case .language:   return "globe"
            case .effect:     return "sparkles"
            }
        }
    }
}
