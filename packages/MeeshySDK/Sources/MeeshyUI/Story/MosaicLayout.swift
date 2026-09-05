import CoreGraphics
import Foundation
import MeeshySDK

/// **Comment les VISUELS d'une publication se posent les uns à côté des
/// autres** (directive porteur 2026-09-06, #5322).
///
/// > « Le rendu est une mosaïque d'image avec +n sur la dernière des 4 images.
/// > On peut définir comment la mosaïque sera affichée : il faut proposer 4
/// > différentes manières — en vague, en mode hero, en mode défilement comme
/// > pour les réels, en mode sinusoïde une en haut, une en bas, une en haut,
/// > une en bas. »
///
/// > « Que ce soit mosaïque de média ou de scène **c'est la même chose**. »
///
/// ## Une seule loi, deux natures de tuile
///
/// Le nom ne dit pas « scène » et c'est délibéré : la règle ne sait pas ce
/// qu'elle dispose. Une tuile est un VISUEL — un média joint ou une scène du
/// canvas — et la géométrie est la même. Deux règles jumelles auraient divergé
/// sur ce qu'elles ont en commun : le plafond de quatre, le calcul du report,
/// la borne du plus petit appareil.
///
/// C'est aussi ce qui lève une contradiction du dépôt. La mosaïque des MÉDIAS
/// avait été retirée du fil (`FeedPostCard+Media.swift`) avec cette raison :
/// « elle ne pouvait porter AUCUNE légende par média, ce qui est la doctrine
/// même de `3f` ». La directive tranche autrement — voir `showsCaption`.
///
/// ## Ce que cette règle remplace
///
/// Le fil montrait **une seule scène** : `PostSceneCard` montait le player sur
/// `sceneIndex: .constant(0)`. Le contrat en autorise pourtant dix
/// (`canvas-v3.ts`, `scenes.min(1).max(10)`), et les neuf autres n'étaient
/// atteignables par aucun geste — ni mosaïque, ni compteur, ni pagination.
///
/// ## Pourquoi une règle PURE, et pas quatre vues
///
/// Quatre dispositions écrites en quatre `body` divergeraient sur ce qu'elles
/// ont en commun — le plafond de tuiles visibles, le calcul du report, la
/// borne du plus petit appareil. Ici la géométrie est une FONCTION : elle rend
/// des cadres normalisés, elle s'éprouve sans monter d'écran, et la vue n'a
/// plus qu'à les peindre.
///
/// Les cadres sont exprimés en **fractions** (0…1) de la boîte de la mosaïque,
/// jamais en points : la même géométrie sert un iPhone SE et un iPad sans
/// qu'aucun nombre ne soit recalculé, et un test peut la vérifier sans
/// connaître la largeur de l'écran.
///
/// > Une exception assumée : `.reel` DÉBORDE volontairement à droite (ses `x`
/// > dépassent 1). C'est ce qui fait qu'on devine la tuile suivante et qu'on a
/// > envie de pousser — la vue le monte dans un défilement horizontal. Un mode
/// > qui tiendrait dans la boîte ne serait plus un défilement.
public nonisolated enum MosaicLayout {

    /// **Quatre tuiles au plus, et le reste se COMPTE.**
    ///
    /// Au-delà, la mosaïque cesse d'être lisible d'un coup d'œil — ce qui est
    /// sa seule raison d'être. Le nombre vient de la directive (« +n sur la
    /// dernière des 4 images ») et il vaut pour les quatre modes : un plafond
    /// par mode donnerait quatre réponses à « combien en reste-t-il ? » pour
    /// une même publication.
    public static let maxVisible = 4

    /// Combien de tuiles se peignent.
    public static func visibleCount(sceneCount: Int) -> Int {
        max(0, min(sceneCount, maxVisible))
    }

    /// **Ce qui reste À VOIR — jamais le total.**
    ///
    /// L'erreur classique est de poser `+\(scenes.count)` : le badge compte
    /// alors aussi les tuiles qu'on a sous les yeux, et une publication de
    /// quatre scènes annonce « +4 » en n'en cachant aucune.
    public static func overflow(sceneCount: Int) -> Int {
        max(0, sceneCount - maxVisible)
    }

    /// Une tuile de la mosaïque, en fractions de la boîte.
    public struct Tile: Equatable, Sendable {
        /// L'index de la scène dans `CanvasV3.scenes`.
        public let sceneIndex: Int
        public let x: CGFloat
        public let y: CGFloat
        public let width: CGFloat
        public let height: CGFloat
        /// `> 0` sur la DERNIÈRE tuile seulement, et seulement s'il reste des
        /// scènes non montrées.
        public let overflow: Int

        public init(sceneIndex: Int, x: CGFloat, y: CGFloat,
                    width: CGFloat, height: CGFloat, overflow: Int = 0) {
            self.sceneIndex = sceneIndex
            self.x = x
            self.y = y
            self.width = width
            self.height = height
            self.overflow = overflow
        }
    }

    /// L'espace entre deux tuiles, en fraction de la largeur. Assez pour que
    /// deux scènes ne se confondent pas, assez peu pour qu'elles se lisent
    /// comme un seul objet.
    public static let gutter: CGFloat = 0.014

    /// **La géométrie d'un mode, pour un nombre de scènes donné.**
    ///
    /// Rend `[]` pour zéro scène, et une tuile pleine pour une seule — une
    /// mosaïque d'un élément n'est pas une mosaïque, et lui appliquer une
    /// vague la ferait flotter dans un cadre trop grand pour elle.
    public static func tiles(sceneCount: Int, mode: MosaicLayoutMode) -> [Tile] {
        let n = visibleCount(sceneCount: sceneCount)
        guard n > 0 else { return [] }
        let reste = overflow(sceneCount: sceneCount)
        guard n > 1 else {
            return [Tile(sceneIndex: 0, x: 0, y: 0, width: 1, height: 1, overflow: reste)]
        }
        let brutes: [Tile]
        switch mode {
        case .wave: brutes = wave(n)
        case .hero: brutes = hero(n)
        case .reel: brutes = reel(n)
        case .sine: brutes = sine(n)
        }
        // Le report se pose sur la DERNIÈRE tuile, quel que soit le mode : la
        // règle est une, la géométrie est quatre.
        return brutes.enumerated().map { i, t in
            i == brutes.count - 1
                ? Tile(sceneIndex: t.sceneIndex, x: t.x, y: t.y,
                       width: t.width, height: t.height, overflow: reste)
                : t
        }
    }

    /// **Le rapport hauteur / largeur de la boîte**, par mode.
    ///
    /// Il est DÉCLARÉ et non dérivé : une scène est verticale (9:16), et une
    /// rangée de quatre scènes verticales à leur ratio natif donnerait une
    /// bande de 1,78 fois la largeur — plus haute qu'un écran. Chaque mode
    /// choisit donc sa boîte, et les tuiles s'y inscrivent en `.fill`.
    public static func aspectRatio(mode: MosaicLayoutMode) -> CGFloat {
        switch mode {
        case .wave: return 0.78
        case .hero: return 0.82
        // Le défilement montre des tuiles quasi-portrait : sa boîte est la
        // plus haute des quatre, et c'est ce qui le fait ressembler aux réels.
        case .reel: return 1.05
        case .sine: return 0.92
        }
    }

    // MARK: - Les quatre géométries

    /// **Vague** — même largeur, hauteurs qui ondulent, tout centré
    /// verticalement. La ligne du haut monte et descend, celle du bas aussi :
    /// c'est ce qui la distingue de la sinusoïde, où les tuiles SAUTENT d'un
    /// bord à l'autre.
    private static func wave(_ n: Int) -> [Tile] {
        let largeur = (1 - gutter * CGFloat(n - 1)) / CGFloat(n)
        return (0..<n).map { i in
            // Une demi-période par tuile : haute, basse, haute, basse — mais
            // par la HAUTEUR, pas par la position.
            let creux = i % 2 == 1
            let hauteur: CGFloat = creux ? 0.74 : 1.0
            return Tile(sceneIndex: i,
                        x: CGFloat(i) * (largeur + gutter),
                        y: (1 - hauteur) / 2,
                        width: largeur,
                        height: hauteur)
        }
    }

    /// **Hero** — une tuile domine, les autres l'accompagnent en colonne.
    ///
    /// La grande occupe toujours la même fraction, quel que soit le nombre de
    /// satellites : c'est ce qui rend la disposition reconnaissable d'un post
    /// à l'autre. Ce sont les satellites qui se partagent la colonne.
    private static func hero(_ n: Int) -> [Tile] {
        let large: CGFloat = 0.62
        let colonne = 1 - large - gutter
        let satellites = n - 1
        let hauteur = (1 - gutter * CGFloat(satellites - 1)) / CGFloat(satellites)
        var tuiles = [Tile(sceneIndex: 0, x: 0, y: 0, width: large, height: 1)]
        for i in 0..<satellites {
            tuiles.append(Tile(sceneIndex: i + 1,
                               x: large + gutter,
                               y: CGFloat(i) * (hauteur + gutter),
                               width: colonne,
                               height: hauteur))
        }
        return tuiles
    }

    /// **Défilement** — comme les réels : des tuiles pleine hauteur qui
    /// débordent à droite.
    ///
    /// `pas < largeur + gutter` serait un chevauchement ; `pas` exactement
    /// égal collerait les tuiles. La tuile suivante dépasse volontairement la
    /// boîte — c'est l'amorce qui dit « il y en a d'autres », et elle fait le
    /// travail que le `+N` fait dans les trois autres modes.
    private static func reel(_ n: Int) -> [Tile] {
        let largeur: CGFloat = 0.60
        let pas = largeur + gutter * 2
        return (0..<n).map { i in
            Tile(sceneIndex: i, x: CGFloat(i) * pas, y: 0, width: largeur, height: 1)
        }
    }

    /// **Sinusoïde** — « une en haut, une en bas, une en haut, une en bas ».
    ///
    /// Les tuiles font une demi-hauteur et sautent d'un bord à l'autre. C'est
    /// la disposition la plus lisible pour un récit : l'œil zigzague dans
    /// l'ordre des scènes au lieu de balayer une rangée.
    private static func sine(_ n: Int) -> [Tile] {
        let largeur = (1 - gutter * CGFloat(n - 1)) / CGFloat(n)
        let hauteur: CGFloat = 0.62
        return (0..<n).map { i in
            Tile(sceneIndex: i,
                 x: CGFloat(i) * (largeur + gutter),
                 y: i % 2 == 0 ? 0 : 1 - hauteur,
                 width: largeur,
                 height: hauteur)
        }
    }

    // MARK: - La borne du plus petit appareil

    /// **La largeur du plus étroit des appareils servis** — iPhone SE / mini.
    public static let narrowestDeviceWidth: CGFloat = 375

    /// La plus petite tuile d'un mode tient-elle une vignette lisible ?
    ///
    /// Le seuil est celui d'une cible tactile confortable : sous 44 pt, une
    /// scène n'est plus une vignette mais un point, et le `+N` posé dessus
    /// deviendrait illisible. Éprouvé sur le pire cas — quatre scènes.
    public static func fitsNarrowestDevice(mode: MosaicLayoutMode) -> Bool {
        let boite = narrowestDeviceWidth - 32   // marges de carte
        let hauteurBoite = boite * aspectRatio(mode: mode)
        return tiles(sceneCount: maxVisible, mode: mode).allSatisfy { t in
            t.width * boite >= 44 && t.height * hauteurBoite >= 44
        }
    }

    // MARK: - La légende

    /// **Une mosaïque ne porte pas de légende ; un défilement et un visuel
    /// SEUL en portent une** (directive porteur 2026-09-06).
    ///
    /// > « En mode mosaïque il n'y a pas de légende, mais en mode défilement
    /// > ou scène unique on laisse la légende. »
    ///
    /// La raison est dans la géométrie, pas dans une préférence : une mosaïque
    /// montre PLUSIEURS visuels à la fois, et une légende y serait ambiguë —
    /// laquelle des quatre tuiles décrit-elle ? Le défilement, lui, ne montre
    /// qu'un visuel à la fois, comme un visuel seul : la légende a un sujet, et
    /// un seul.
    ///
    /// > C'est ce qui réhabilite la mosaïque des MÉDIAS, retirée du fil parce
    /// > qu'« elle ne pouvait porter aucune légende par média ». Elle n'a pas à
    /// > en porter. Ce qui manquait n'était pas la légende dans la mosaïque,
    /// > c'était **le choix** entre les deux présentations — et c'est
    /// > exactement ce que `layout` ajoute.
    ///
    /// Le compte prime sur le mode : un post d'un seul visuel montre sa
    /// légende quelle que soit la disposition déclarée, parce qu'il n'y a pas
    /// de mosaïque à un élément.
    public static func showsCaption(mode: MosaicLayoutMode, visualCount: Int) -> Bool {
        visualCount <= 1 || mode == .reel
    }

    /// **Ce mode dispose-t-il une MOSAÏQUE ?** — la négation exacte du
    /// défilement, offerte pour que les hôtes n'écrivent pas `mode != .reel`
    /// chacun de leur côté : le jour où un cinquième mode arrive, une seule
    /// ligne décide de quel côté il tombe.
    public static func isMosaic(mode: MosaicLayoutMode, visualCount: Int) -> Bool {
        !showsCaption(mode: mode, visualCount: visualCount)
    }
}
