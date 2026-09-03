import CoreGraphics
import MeeshyUI

/// **La géométrie des deux rails, et la largeur qu'ils laissent à la scène**
/// (#4061, planche rév. 27 § P4).
///
/// ## Pourquoi une règle, et pas un `.padding`
///
/// Le nombre à poser n'est pas un goût de marge, c'est une CONSÉQUENCE : un rail
/// doit mesurer au moins 44 pt (cible tactile), il lui faut une gouttière pour
/// ne pas toucher la scène et une marge pour ne pas toucher le bord — et la
/// scène prend ce qui reste. Écrit `.padding(.horizontal, 14)`, ce raisonnement
/// disparaît, et la première personne qui trouve la scène « un peu étroite » le
/// rogne sans savoir ce qu'elle casse.
///
/// ## Pourquoi la scène RÉTRÉCIT au lieu d'être recouverte
///
/// C'est la **loi 6** qui tranche, pas l'esthétique : « le lecteur EST
/// l'aperçu ». Un rail posé PAR-DESSUS la scène occupe exactement la place où un
/// `MeeshyObject` peut vivre — l'aperçu mentirait sur le rendu final, et un
/// aperçu qui ment ne vaut pas l'espace qu'il économise.
///
/// L'encastrement n'est d'ailleurs pas un réglage mais la condition d'existence
/// des rails : la scène ne laissait que 14 pt de chaque côté, très en dessous
/// des 44 pt d'une cible.
///
/// ## Ce que ça rend, et ce que ça ne touche pas
///
/// Sur un iPhone 16 Pro (402 pt de large) : la scène passe de 374 à **278 pt**,
/// donc de 665 à **494 pt** de haut — **≈ 170 pt libérés en bas**. Ces points ne
/// viennent pas d'un rognage, ils tombent de la géométrie.
///
/// **Le 9:16 ne bouge pas** (loi 3) : c'est la largeur qui cède, et
/// `CanvasGeometry.aspectFitSize` reste la source unique du dimensionnement — ce
/// type ne fait que réduire l'aire qu'on lui donne. Et **rien ne se déplace dans
/// le document** : les `anchor` d'un `MeeshyObject` sont normalisés (0…1), et
/// l'espace design garde 1080 de large quelle que soit la largeur rendue.
nonisolated enum ComposerRailGeometry {

    /// Plancher HIG d'une cible tactile. **Un plancher, jamais un réglage** :
    /// le rétrécir pour gagner de la scène rend les portes inatteignables aux
    /// doigts qu'elles servent (dimension 5).
    static let railWidth: CGFloat = 44

    /// Entre le bord de l'écran et le rail — assez pour que le rail ne colle
    /// pas au bord courbe, pas assez pour qu'il flotte.
    static let outerMargin: CGFloat = 10

    /// Entre le rail et la scène. Sans elle, un FAB semblerait POSÉ sur la
    /// scène — l'ambiguïté même que l'encastrement existe pour lever.
    static let gutter: CGFloat = 8

    /// L'encastrement d'AVANT les rails, conservé tel quel là où aucun rail
    /// n'est monté : ce lot ne déplace pas une scène qui n'a pas de rails.
    static let legacyInset: CGFloat = 14

    /// Ce qu'UN rail réserve au total, bord compris.
    static var lane: CGFloat { outerMargin + railWidth + gutter }

    /// L'encastrement horizontal de la scène, par côté.
    static func sceneInset(railsShown: Bool) -> CGFloat {
        railsShown ? lane : legacyInset
    }

    /// La largeur qui reste à la scène.
    ///
    /// **Jamais négative** : une largeur plus petite que les deux couloirs
    /// rendrait, passée à `aspectFitSize`, une taille absurde plutôt qu'une
    /// erreur — donc un canvas silencieusement faux au lieu d'un écran vide qui
    /// se signale.
    static func sceneWidth(usableWidth: CGFloat, railsShown: Bool) -> CGFloat {
        max(0, usableWidth - 2 * sceneInset(railsShown: railsShown))
    }

    /// **Ce qui sépare le bas de la FRAME du bas du DESSIN** (#4119).
    ///
    /// La carte est figée à son ratio et se CENTRE dans la hauteur qu'on lui
    /// donne (`EmbeddedSceneCanvas` : `frame(maxHeight: .infinity)` puis
    /// `aspectFitSize`). Les deux rails, posés en `.overlay(alignment:
    /// .bottom…)`, s'ancraient donc au bas de la frame — soit **sous** la
    /// composition, d'un écart qui vaut la moitié de la hauteur perdue et qui
    /// GRANDIT avec le ratio : nul en 9:16 plein, maximal en paysage.
    ///
    /// > Un rail qui suit la frame et non la composition n'est pas « un peu
    /// > plus bas » : il cesse de dire à quoi il s'applique. En paysage, les
    /// > portes se retrouvent en face de rien.
    ///
    /// **Le ratio est DÉJÀ connu de la vue** — la correction ne passe donc par
    /// aucune hauteur codée en dur, ce que le critère de fin de #4119 interdit
    /// explicitement.
    ///
    /// - Parameter overlay: la taille de la vue sur laquelle l'overlay se pose.
    ///   C'est celle de la vue PADDÉE : elle inclut les deux couloirs, que la
    ///   carte n'a pas. D'où le second paramètre — sans lui, le `fit` serait
    ///   calculé sur une largeur que la carte n'occupe jamais, et l'inset
    ///   rendrait une valeur juste par accident en portrait seulement.
    /// - Parameter horizontalInset: l'encastrement par côté (`sceneInset`).
    static func sceneBottomInset(overlay: CGSize,
                                 ratio: CGFloat,
                                 horizontalInset: CGFloat) -> CGFloat {
        let carte = CGSize(width: max(0, overlay.width - 2 * horizontalInset),
                           height: overlay.height)
        let dessin = CanvasGeometry.aspectFitSize(in: carte, ratio: ratio)
        return max(0, (overlay.height - dessin.height) / 2)
    }

    /// **De combien le pied des références doit REMONTER** (#5036).
    ///
    /// > Directive porteur 2026-09-03 : « les hashtag et mention doivent être
    /// > **directement en bas de la scene**, aligné comme le son de fond ».
    ///
    /// Le pied flottait à 77 pt sous le bord bas du dessin (mesuré au
    /// simulateur, iPhone 16 Pro, 9:16). **Ce n'était ni une marge ni un
    /// espacement de pile** : le canvas est `maxHeight: .infinity` et la carte,
    /// ajustée à son ratio, s'y CENTRE — les 77 points sont la moitié basse du
    /// letterbox, et rien ne les occupe. Un pied posé au bas de la FRAME cesse
    /// donc de dire à quoi il se rapporte, exactement comme le rail de #4119 et
    /// la trace du son de #5017.
    ///
    /// **La gouttière est SOUSTRAITE, jamais ajoutée après coup** : le pied doit
    /// respirer sous la carte comme la trace du son respire au-dessus (6 pt), et
    /// remonter de la totalité du letterbox le collerait au dessin.
    ///
    /// **Le plancher à zéro n'est pas une précaution, c'est le cas iPad.** Dès
    /// que la carte est contrainte par la HAUTEUR — écran large, format non
    /// 9:16 — le letterbox vaut zéro : il n'y a rien à remonter, et une remontée
    /// négative ferait chevaucher le pied avec la rangée qui le suit. La même
    /// borne rend l'appel sûr quand la gouttière dépasse le letterbox disponible.
    static func referencesLift(cardBottomInset: CGFloat, gutter: CGFloat) -> CGFloat {
        max(0, cardBottomInset - gutter)
    }

    /// Ce que la REMONTÉE laisse entre le dessin et le pied — six points, le
    /// même nombre que celui dont la trace du son se sépare du bord haut
    /// (`ComposerSceneSoundHeader`, `.padding(.bottom, 6)`) : le porteur
    /// demande explicitement l'alignement sur elle.
    ///
    /// **Ce n'est PAS l'écart final, et le confondre le doublerait.** Le pied
    /// est un frère de la pile, dont l'espacement vaut 8 pt ; la trace du son
    /// est un OVERLAY, qui n'en paie aucun. L'écart mesuré au simulateur
    /// (iPhone 16 Pro, 9:16, un hashtag posé) est donc :
    ///
    ///     bas du dessin 690  →  pied 704  =  14 pt   (6 ici + 8 de pile)
    ///
    /// contre **77 pt** avant ce lot. Qui voudrait porter l'écart final à une
    /// autre valeur doit retirer les 8 points de la pile du nombre visé, pas
    /// les ajouter ici.
    static let referencesGutter: CGFloat = 6

    /// **Ce qui sépare le bord GAUCHE de la frame du bord gauche du DESSIN**
    /// (#5011) — le jumeau horizontal de `sceneBottomInset`, et pour la même
    /// raison.
    ///
    /// > Directive porteur 2026-09-03 : « avec les **bordures gauches alignées
    /// > à celle de la scene** ».
    ///
    /// La tentation est de padder de `sceneInset` : c'est l'encastrement du
    /// COULOIR, donc le bord de la frame — et la carte, ajustée à son ratio, se
    /// CENTRE dedans. Mesuré sur un iPhone en 9:16 : couloir à 44 pt, carte à
    /// 65 pt. Vingt et un points d'écart, et l'écart n'est pas constant — il
    /// vaut zéro quand la carte est contrainte par la largeur, et grandit dès
    /// qu'elle est contrainte par la hauteur.
    ///
    /// > Aligner sur le couloir donnerait donc un résultat juste **par
    /// > accident**, dans un seul format et à une seule hauteur. C'est très
    /// > exactement le défaut que #4119 a nommé pour le bas, retrouvé sur
    /// > l'autre axe.
    ///
    /// - Parameter overlay: la taille de la vue PADDÉE — celle qui inclut les
    ///   deux couloirs, comme pour `sceneBottomInset`.
    static func sceneLeadingInset(overlay: CGSize,
                                  ratio: CGFloat,
                                  horizontalInset: CGFloat) -> CGFloat {
        let carte = CGSize(width: max(0, overlay.width - 2 * horizontalInset),
                           height: overlay.height)
        let dessin = CanvasGeometry.aspectFitSize(in: carte, ratio: ratio)
        return horizontalInset + max(0, (carte.width - dessin.width) / 2)
    }

    // MARK: - Ce qu'une rangée REQUIERT, et ce qui déborde

    /// L'écart entre deux entrées d'un rail. Lu par la vue ET par la règle : un
    /// littéral recopié dans l'une des deux rendrait la mesure fausse sans que
    /// rien ne rougisse.
    static let entrySpacing: CGFloat = 10

    /// **La largeur qu'une rangée d'entrées REQUIERT**, cible tactile comprise.
    ///
    /// `n × 44 + (n−1) × 10`. Pour les neuf entrées de l'outil texte (huit
    /// contrôleurs depuis l'EFFET, #4870, plus le `(x)`) : **476 pt** — et déjà
    /// 422 pt pour les huit d'avant — quand un iPhone de 393 pt en offre 373
    /// une fois les marges retirées. Le débordement est ARITHMÉTIQUE,
    /// pas conditionnel — il ne dépend ni du contenu, ni de la locale, ni de la
    /// taille de texte.
    static func rowWidth(entries: Int, spacing: CGFloat = entrySpacing) -> CGFloat {
        guard entries > 0 else { return 0 }
        return CGFloat(entries) * railWidth + CGFloat(entries - 1) * spacing
    }

    /// Ce qui dépasse d'une largeur disponible ; `0` ⇒ la rangée tient.
    ///
    /// **Le débordement est SYMÉTRIQUE, et c'est ce qui le rend reconnaissable
    /// à l'œil** : une `HStack` trop large n'est pas clippée par SwiftUI — elle
    /// dessine par-dessus les deux bords, moitié-moitié. Un contrôle coupé d'un
    /// seul côté est mal aligné ; coupé également des deux, il est trop large.
    static func rowOverflow(entries: Int, available: CGFloat) -> CGFloat {
        max(0, rowWidth(entries: entries) - available)
    }

    /// La largeur réellement offerte à une rangée sur un écran donné, marges
    /// extérieures retirées.
    static func availableRowWidth(screenWidth: CGFloat) -> CGFloat {
        max(0, screenWidth - 2 * outerMargin)
    }

    /// Le plus étroit iPhone que l'app supporte — iPhone SE, plancher iOS 16.
    /// Une rangée se mesure LÀ, jamais sur l'appareil de développement : le
    /// débordement du 2026-08-31 a été vu sur 393 pt, il commençait à 375.
    static let narrowestSupportedScreenWidth: CGFloat = 375
}
