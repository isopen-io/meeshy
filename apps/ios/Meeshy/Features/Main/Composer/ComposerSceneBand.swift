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

/// **Ce que la ZONE BASSE porte — un seul des trois, jamais deux** (#4579).
///
/// ## Le défaut que cette règle ferme
///
/// La surface écrivait `if let toolOptions { toolOptions } else if let band { … }`
/// pendant que le meuble passait `toolOptions: AnyView(MeeshyToolOptionsPanel(…))`
/// **inconditionnellement** — le panneau se vide lui-même quand aucun outil
/// n'est déplié, ce qui est une bonne décision de VUE et une mauvaise source de
/// VÉRITÉ. `toolOptions == nil` était donc toujours faux, et
/// `ComposerSceneBandView` n'a **jamais** été montée dans la scène incrustée.
///
/// Trois surfaces en sont mortes d'un coup, sans qu'aucune ne rougisse :
///
/// | ce qui ne pouvait pas paraître | vue |
/// |---|---|
/// | la palette de fond + les effets d'ouverture | `1b` |
/// | la bande de rognage | `2d` |
/// | **tout jeton d'objet dont la destination est une bande** | `1c` |
///
/// La troisième est la plus coûteuse : les jetons livrés au lot précédent
/// portent une `destination: ComposerSceneBand?` et ouvraient donc une bande
/// que rien ne pouvait monter. **Un contrôle livré, testé, et inerte.**
///
/// ## Ce qui rend la leçon dure
///
/// Le commentaire qui DIAGNOSTIQUE ce défaut était déjà écrit, deux lignes plus
/// bas, sur la rangée de jetons :
///
/// > « Le témoin d'"outil ouvert" est le MODE DU RAIL, jamais la présence du
/// > panneau d'options : l'hôte passe ce dernier inconditionnellement (il se
/// > vide lui-même), donc `toolOptions == nil` était toujours faux. »
///
/// **J'ai décrit le mécanisme et corrigé la seule occurrence que je regardais.**
/// Un diagnostic écrit au-dessus d'une ligne qui a encore le défaut ne le
/// signale pas — il prouve qu'on le savait.
///
/// ## Pourquoi une RÈGLE et pas un second booléen
///
/// Un `if toolIsOpen` recopié à la main dans la vue serait redevenu, au premier
/// ajout, une seconde loi divergeant de `ComposerObjectChips.isServed`. Les deux
/// lisent désormais la MÊME question — « un outil est-il ouvert ? » — et cette
/// question a une seule réponse, `railMode`.
nonisolated enum ComposerLowZone: Equatable {

    /// Un outil est déplié : ses options prennent le bas.
    case toolOptions
    /// Aucun outil : la bande demandée ET servie.
    case band(ComposerSceneBand)
    /// Ni l'un ni l'autre — le bas ne porte que le socle.
    case nothing

    /// `toolIsOpen` vient de `railMode`, la seule source qui SAIT qu'un outil
    /// est ouvert — jamais de la présence d'une vue, qui peut être montée vide.
    static func resolve(toolIsOpen: Bool, band: ComposerSceneBand?) -> ComposerLowZone {
        if toolIsOpen { return .toolOptions }
        guard let band else { return .nothing }
        return .band(band)
    }
}

/// **La ZONE CANONIQUE — ce que le bas de la scène peint hors outil, et ce qui
/// s'efface quand un outil s'ouvre** (#5010, directive porteur 2026-09-03).
///
/// > « lorsqu'on affiche les options d'un outil il faut cacher les éléments
/// > permanents de la zone canonique pour afficher ces outils ! »
///
/// ## Ce que la règle du dessus ne pouvait pas dire
///
/// `ComposerLowZone.resolve` arbitre entre les options d'un outil et la bande
/// contextuelle : deux occupants d'une MÊME place. Elle ne dit rien des
/// éléments qui vivent SOUS cette place et qui, eux, restaient peints — la
/// rangée de portes et le pied des références. L'auteur ouvrait un outil et
/// ses réglages se partageaient le bas avec deux rangées qui ne le
/// concernaient plus.
///
/// L'inventaire mesuré au moment d'écrire cette règle :
///
/// | élément | gouverné avant #5010 ? |
/// |---|---|
/// | options d'outil / bande | oui (`ComposerLowZone.resolve`) |
/// | jetons d'objet | oui (`ComposerObjectChips.isServed`) |
/// | rangée de portes (#4072) | oui — **par construction**, voir ci-dessous |
/// | pied des références (#5002) | **non** — le seul trou réel |
///
/// ## La rangée de portes N'EST PAS dans cet inventaire, et c'est mesuré
///
/// Le corps de l'issue la comptait parmi les éléments non gouvernés, sur la foi
/// de son doc-comment qui la déclare « permanente » (#4072). La mesure dit
/// l'inverse : `lowToolRow` ÉCHANGE son contenu selon `railMode` — outil
/// ouvert, elle peint les contrôleurs de cet outil ; sinon, les portes. Les
/// portes disparaissent donc déjà, et ce qui reste à leur place EST l'interface
/// de l'outil.
///
/// > **L'y inscrire aurait caché les contrôleurs de l'outil qu'on venait
/// > d'ouvrir** — un « correctif » qui casse, appliqué à du code correct, sur
/// > la foi d'un doc-comment plutôt que d'une lecture. Le mot « permanente »
/// > décrit la PLACE, pas son contenu ; c'est cette ambiguïté qui a trompé
/// > l'inventaire, et le doc-comment de #4072 la lève dans le même lot.
///
/// Ce type ne gouverne donc que ce qui est peint EN PLUS de la place que
/// l'outil réclame — et il n'y en a que deux.
///
/// ## Pourquoi un type, et pas `!toolIsOpen` recopié trois fois
///
/// Parce que la troisième copie diverge. C'est la leçon que ce fichier porte
/// déjà : trois surfaces sont mortes d'un coup pour avoir lu la présence d'une
/// VUE au lieu de la question qu'elles posaient.
///
/// Et parce qu'une fonction qui rendrait `!toolIsOpen` en ignorant son premier
/// paramètre ne déciderait RIEN. Ce que celle-ci décide est l'APPARTENANCE :
/// tout ce que le bas peint n'est pas de la zone canonique. L'en-tête du son de
/// fond (#5001) vit AU-DESSUS de la carte et garde sa propre porte
/// (`ComposerSceneSoundTrace.served`) — l'inscrire ici l'aurait fait céder une
/// place que les options d'outil ne réclament pas.
nonisolated enum ComposerCanonicalZone {

    /// Ce que le bas de la scène peint quand aucun outil n'est ouvert.
    ///
    /// **Le `switch` de `yieldsToTool` est exhaustif** : un quatrième élément
    /// ne compilera pas tant qu'il n'aura pas dit s'il cède la place. C'est la
    /// question qu'on oublie en ajoutant une rangée — et les deux « non » du
    /// tableau ci-dessus sont ce que coûte de l'oublier.
    enum Element: String, CaseIterable, Sendable {
        /// Le pied des hashtags et mentions référencées (#5002) — le seul
        /// élément que personne ne gouvernait.
        case references
        /// Les jetons de l'objet sélectionné (#4073, vue `1c`). Il cédait
        /// déjà ; ce qui change est qu'il cède au MÊME endroit que son voisin.
        case objectChips
    }

    /// **Cet élément cède-t-il la place aux options d'un outil ?**
    ///
    /// Les trois cèdent aujourd'hui. La fonction existe quand même, et ce n'est
    /// pas une précaution : elle est le SITE où un futur élément dira qu'il ne
    /// cède pas, avec sa raison — au lieu de l'écrire dans un `body`, où
    /// personne ne pourra l'éprouver.
    static func yieldsToTool(_ element: Element) -> Bool {
        switch element {
        // Il LIT ce que la publication emporte — une lecture permanente, donc
        // exactement le genre d'élément que la directive vise.
        case .references: return true
        // Il réglait déjà l'objet sélectionné et cédait déjà : la règle ne
        // change pas son sort, elle lui donne le même site que son voisin.
        case .objectChips: return true
        }
    }

    /// La question que les sites de montage posent. Ils n'écrivent plus
    /// `!toolIsOpen` : ils demandent si LEUR élément est servi.
    static func isServed(_ element: Element, toolIsOpen: Bool) -> Bool {
        !(toolIsOpen && yieldsToTool(element))
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

    /// **L'effet d'OUVERTURE de la scène** (#4403). Le panneau « Fond » de
    /// l'atelier porte deux choses — les couleurs et cette rangée — et la
    /// bande n'en portait qu'une : l'effet était inatteignable depuis le
    /// plateau.
    ///
    /// Le manque ne se voyait pas en composant, et c'est ce qui l'a laissé
    /// passer : un effet d'ouverture ne se joue qu'à la LECTURE. Une absence
    /// dont le symptôme n'apparaît pas sur l'écran qui la contient est la plus
    /// difficile à remarquer.
    var openingEffect: StoryTransitionEffect?
    var onPickOpening: ((StoryTransitionEffect?) -> Void)?

    /// **Le contenu de la bande `timeline`, composé par l'HÔTE** (#4082).
    ///
    /// Même motif que `toolOptions` et `railSystemEntry` du meuble : ce qui
    /// exige de connaître l'objet sélectionné, ses URL chargées et le ViewModel
    /// est composé là où ces trois choses vivent, et voyage jusqu'ici en vue
    /// opaque. La bande reste ignorante de ce qu'elle porte — c'est ce qui lui
    /// permet de rester une règle de PLACE.
    ///
    /// `nil` ⇒ la bande n'a rien à montrer, et `ComposerSceneCapabilities.bands(canTrimSelection:)`
    /// ne l'aura alors jamais servie : les deux disent la même chose depuis les
    /// deux bouts, et c'est voulu — la seconde est ce qui l'empêche d'être
    /// demandée, la première ce qui l'empêche de paraître vide si elle l'était.
    var timelineContent: AnyView?

    /// **Le contenu de la bande `textStyles`, composé par l'HÔTE** (#4083).
    ///
    /// Même motif que `timelineContent` : le spécimen a besoin du VRAI texte de
    /// l'objet sélectionné et du rappel qui écrit le style — deux choses que
    /// seul le meuble connaît. La bande reste une règle de PLACE.
    ///
    /// `nil` ⇒ rien à montrer, et `ComposerSceneCapabilities.bands(…)` ne
    /// l'aura alors jamais servie.
    var textStylesContent: AnyView?

    var body: some View {
        switch band {
        case .palette:
            palette
        case .timeline:
            // La bande de ROGNAGE depuis #4082. Elle n'a de contenu que quand
            // l'hôte lui en compose un — pour un objet sans source à rogner,
            // `bands(canTrimSelection:)` ne la sert pas et on n'arrive jamais
            // ici. Le `EmptyView` de repli n'est donc pas une bande vide
            // tolérée : c'est la trace de la loi 4, tenue des deux côtés.
            if let timelineContent { timelineContent } else { EmptyView() }
        case .textStyles:
            // **Le spécimen des 18 styles** (#4083). Il a un hôte depuis le
            // 2026-08-31 : le meuble compose `TextStyleSpecimenBand` avec le
            // texte réel de l'objet sélectionné.
            //
            // > Ce cas rendait `EmptyView()` et le commentaire l'assumait —
            // > « les 18 styles exigent un objet `text` sélectionné, qu'aucune
            // > porte de cette surface ne pose encore ». La porte existait
            // > depuis #4401 ; c'est la BANDE qui n'était pas servie, et le
            // > jeton « STYLE » de l'inspecteur pointait donc sur du vide.
            //
            // Le repli reste, pour la même raison que celui de `timeline` : la
            // loi 4 tenue des DEUX côtés — la capacité empêche la bande d'être
            // demandée, ce repli l'empêche de paraître vide si elle l'était.
            if let textStylesContent { textStylesContent } else { EmptyView() }
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
        VStack(alignment: .leading, spacing: 8) {
            BackgroundColorPalette(colors: colors) { hex in
                onPickColor?(hex)
            }
            // **La rangée d'ouverture n'est montée que si l'hôte la sert**
            // (loi 4). Sans le rappel, choisir un effet ne mènerait nulle
            // part : mieux vaut ne pas la peindre que peindre un choix inerte.
            //
            // Elle est SOUS les couleurs, comme dans le panneau de l'atelier —
            // le fond d'abord, ce qu'il fait en apparaissant ensuite. L'ordre
            // suit la décision, pas la mise en page.
            if let onPickOpening {
                // `onDarkSurface: true` — le plateau est sombre EN PERMANENCE,
                // quel que soit le thème de l'appareil. Sans ce drapeau, les
                // puces non sélectionnées peignaient de l'indigo950 sur du
                // sombre : présentes à l'accessibilité, invisibles à l'œil
                // (mesuré au simulateur, 2026-08-30).
                OpeningEffectChips(selection: openingEffect,
                                   onDarkSurface: true,
                                   onSelect: onPickOpening)
                    .padding(.horizontal, 2)
            }
        }
    }
}
