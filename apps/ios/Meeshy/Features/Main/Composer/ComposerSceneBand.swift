import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les contextes qui exigent une BANDE horizontale** (#4064, planche rév. 27
/// § P4 — « les deux rails, et le bas qui respire »).
///
/// ## Ce que cette énumération décide
///
/// Le chrome de la scène a quitté le bas pour devenir deux rails verticaux. Le
/// bas ne porte donc plus que le socle — **par défaut**. Ce type est la liste
/// FERMÉE des contextes qui font revenir une bande, et le critère
/// d'appartenance tient en une phrase :
///
/// > une bande se justifie quand le contrôle a besoin d'un **axe horizontal**
/// > (le temps) ou d'une **comparaison latérale** (des aperçus qu'on met côte à
/// > côte). Tout le reste est un rail.
///
/// C'est ce critère, pas un goût de mise en page, qui explique les trois cas :
///
/// | cas | pourquoi une bande, et pas un rail |
/// |---|---|
/// | `palette` | on choisit une couleur en la COMPARANT aux voisines |
/// | `timeline` | le temps EST un axe horizontal — un rail vertical ne peut pas le dire |
/// | `textStyles` | les 18 styles se lisent en aperçus « Aa » alignés |
///
/// ## Ce qui EXISTE aujourd'hui, dit sans détour
///
/// Seule `palette` a un contenu et un hôte. `timeline` et `textStyles` sont
/// déclarées parce qu'elles appartiennent au critère — pas parce qu'elles sont
/// livrées : la règle `opened(_:served:)` ne rend JAMAIS une bande absente du
/// jeu servi, et c'est ce qui les tient hors de l'écran tant que rien ne les
/// remplit. Une bande vide occuperait précisément les ≈ 170 pt que
/// l'encastrement vient de libérer (loi 4 : un contrôle sans effet est ABSENT).
nonisolated enum ComposerSceneBand: String, CaseIterable, Equatable, Sendable {
    case palette
    case timeline
    case textStyles

    /// **La bande réellement OUVERTE — `nil` ⇒ le bas ne porte que le socle.**
    ///
    /// Deux conditions, et la seconde est celle qui compte : une bande demandée
    /// mais NON SERVIE est absente. Sans elle, le jour où un contexte est
    /// demandé avant d'avoir son contenu, l'écran gagnerait une bande vide —
    /// le seul résultat que cette issue existe pour interdire.
    static func opened(_ requested: ComposerSceneBand?,
                       served: Set<ComposerSceneBand>) -> ComposerSceneBand? {
        guard let requested, served.contains(requested) else { return nil }
        return requested
    }
}

/// **La bande contextuelle de la scène.** Montée SOUS le canvas et AU-DESSUS de
/// la description, ce qui donne au bas de l'écran un dégradé de niveaux du
/// modèle : l'objet (les rails), la scène (cette bande), la slide (la
/// description), la publication (le socle).
///
/// **Elle vit DANS la surface, et c'est la garantie structurelle de #4064** :
/// le socle est un frère de la surface au meuble, donc une bande qui paraît ici
/// rétrécit le canvas — elle ne peut pas déplacer le socle. La loi 5 n'a pas
/// besoin d'être promise par une animation, elle tombe de l'assemblage.
///
/// **Aucune animation, délibérément** — même raison que la zone d'inspecteur du
/// document : `StoryCanvasUIView` reconstruit ses layers à chaque
/// `layoutSubviews`, et animer la hauteur ferait varier la frame du canvas sur
/// chaque image du ressort.
struct ComposerSceneBandView: View {

    let band: ComposerSceneBand
    let colors: [String]
    var onPickColor: ((String) -> Void)?

    var body: some View {
        switch band {
        case .palette:
            palette
        case .timeline, .textStyles:
            // Aucun contenu : ces deux contextes appartiennent au critère mais
            // n'ont pas d'hôte ici (la timeline vit dans l'atelier ; les 18
            // styles exigent un objet `text` sélectionné, qu'aucune porte de
            // cette surface ne pose encore). `ComposerSceneBand.opened` ne les
            // sert donc jamais, et sa garde le prouve — c'est là que l'absence
            // est tenue, pas ici.
            EmptyView()
        }
    }

    /// La palette de la SCÈNE. Les pastilles viennent de la palette PARTAGÉE du
    /// SDK (`StoryBackgroundPalette.colors`) — jamais recopiées : deux listes de
    /// couleurs auraient divergé au premier ajout.
    ///
    /// Le libellé VoiceOver est celui de la bande du document
    /// (`ComposerDocumentCopy.background`), et pas une clé neuve : c'est le même
    /// contrôle, servi à deux endroits. Une clé jumelle aurait dédoublé sept
    /// traductions pour la même phrase.
    ///
    /// **Et « le même contrôle » a fini par être le même CODE.** Ce
    /// doc-comment déclarait le partage au niveau de la CLÉ pendant que la vue,
    /// elle, était recopiée à l'identique dans `ComposerDocumentSurface` — avec
    /// sa pastille de 28 pt, sa marge posée sur le parent, et son libellé
    /// répété sur chaque bouton. Un commentaire ne fait pas d'une copie une
    /// source unique (leçon 248i). `BackgroundColorPalette` l'est.
    private var palette: some View {
        BackgroundColorPalette(colors: colors) { hex in
            onPickColor?(hex)
        }
    }
}
