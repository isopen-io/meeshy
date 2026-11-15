import CoreGraphics

/// **Le double tap latéral d'un média à durée : −10 s à gauche, +10 s à droite**
/// (#6163, spec § 2.2).
///
/// Directive porteur du 2026-09-12 : *« le +10 et −10 peuvent être enlevés, ce
/// sera posé par double tap à gauche ou à droite de la scène où se trouve la
/// vidéo ! »* Les deux boutons ont quitté la barre de transport au #6162 ; ce
/// type est ce qui les remplace, et il rend à l'image les deux cibles de 44 pt
/// qu'ils lui prenaient.
///
/// ## Pourquoi la règle s'arrête aux TIERS, et pas à la scène entière
///
/// **Un double tap RETARDE le tap simple** : celui-ci doit attendre que le
/// double échoue, soit deux cent cinquante à trois cents millisecondes. #6142
/// vient de poser trois portes sur cette même surface — tap, appui long,
/// glissement — et le tap y est la plus fréquente. L'armer partout coûterait
/// cette latence sur tout l'écran pour un geste qui n'a de sens que sur les
/// bords.
///
/// D'où la forme du contrat : **au centre la règle rend `nil`**, ce qui n'est
/// pas un cas dégénéré mais la moitié de ce qu'elle promet — l'hôte n'arme
/// aucun double tap dans la zone centrale, et le tap y garde son effet
/// immédiat. Le porteur a d'ailleurs dit « à gauche ou à droite de la scène »,
/// pas « sur la scène » : la restriction est dans la directive.
///
/// ## Pourquoi elle rend `nil` sur un média SANS durée
///
/// Parce que c'est ce qui la rend inoffensive là où un autre double tap vit
/// déjà. La page IMAGE de la galerie porte un double tap de ZOOM depuis #4014 ;
/// une photo n'a aucune durée, donc la règle ne réclame aucune zone chez elle,
/// dans aucun des trois tiers. La collision ne se tranche pas par une
/// convention entre deux hôtes — elle ne peut pas se produire.
///
/// ## Placement
///
/// Dans `MeeshySDK` et non `MeeshyUI`, pour la raison que `MediaStageFraming`
/// et `StagePresentation` documentent déjà : `MeeshyUI` compile sous
/// `defaultIsolation: MainActor`, donc la conformance `Equatable` d'un type qui
/// y naît est isolée au `MainActor` et une suite non isolée ne peut plus
/// comparer ses valeurs. Aucun singleton n'est lu ici, aucune décision « quand
/// faire X » n'est prise : l'hôte fournit une position et une durée, la règle
/// rend un saut — l'orchestration reste app-side.
public nonisolated enum MediaStageSeek {

    /// Le pas, en secondes. Constante partagée et non un `10` recopié chez
    /// chaque hôte : les deux boutons qui viennent de partir le portaient déjà
    /// en double, et c'est ainsi qu'une valeur de produit se met à diverger.
    public static let step: Double = 10

    /// La part de la largeur que prend CHAQUE zone latérale.
    public static let lateralFraction: CGFloat = 1.0 / 3.0

    /// Où le doigt s'est posé, en tiers.
    public enum Zone: Equatable, Sendable {
        case backward
        case center
        case forward
    }

    /// Le saut, dit par ses DEUX bouts.
    ///
    /// `to` est la position bornée — la seule que l'hôte remette au player.
    /// `from` l'accompagne pour que `seconds` dise le saut RÉELLEMENT parcouru
    /// et non les dix demandés : à trois secondes du début, reculer ne recule
    /// que de trois, et un retour qui annoncerait dix mentirait.
    public struct Jump: Equatable, Sendable {
        public let zone: Zone
        public let from: Double
        public let to: Double

        public init(zone: Zone, from: Double, to: Double) {
            self.zone = zone
            self.from = from
            self.to = to
        }

        public var seconds: Double { to - from }
    }

    /// La largeur d'UNE zone latérale, pour l'hôte qui doit la poser à l'écran.
    ///
    /// Elle existe pour que la surface ARMÉE et la surface qui RÉPOND soient la
    /// même arithmétique. Un hôte qui dimensionnerait ses bandes au jugé
    /// couvrirait une largeur que `zone(x:width:)` ne reconnaîtrait pas, et le
    /// geste serait inerte sur cette frange — sans qu'aucun témoin ne rougisse,
    /// puisque les deux moitiés seraient justes séparément.
    public static func lateralWidth(for width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        return width * lateralFraction
    }

    /// **Les bornes appartiennent aux zones latérales.** Un doigt posé
    /// exactement sur la frontière a visé le bord, pas le milieu : sur un geste
    /// dont la zone morte centrale fait déjà un tiers de l'écran, le doute
    /// profite à la zone qui agit.
    public static func zone(x: CGFloat, width: CGFloat) -> Zone {
        guard width > 0 else { return .center }
        let lateral = lateralWidth(for: width)
        if x < lateral { return .backward }
        if x >= width - lateral { return .forward }
        return .center
    }

    /// Ce qu'un double tap décide, ou `nil` quand il n'a rien à décider ici.
    ///
    /// `nil` couvre DEUX situations que l'hôte doit traiter pareil — ne rien
    /// faire — mais qu'il ne doit pas confondre en amont : la zone centrale (où
    /// il n'arme aucun double tap, pour ne pas retarder le tap simple) et le
    /// média sans durée (où il n'y a pas de piste à parcourir).
    ///
    /// Un saut BORNÉ, lui, reste un saut : à la butée, `seconds` vaut zéro et le
    /// résultat n'est pas `nil`. Les deux réponses ne disent pas la même chose —
    /// « ce geste ne s'applique pas ici » contre « il s'applique, il n'a nulle
    /// part où aller » — et l'hôte doit pouvoir répondre à la seconde, ne
    /// serait-ce que par son retour haptique, là où l'utilisateur insiste.
    public static func resolve(x: CGFloat,
                               width: CGFloat,
                               position: Double,
                               duration: Double,
                               step: Double = MediaStageSeek.step) -> Jump? {
        guard duration > 0, duration.isFinite else { return nil }

        let zone = zone(x: x, width: width)
        guard zone != .center else { return nil }

        let from = clamp(position.isFinite ? position : 0, upTo: duration)
        let cible = zone == .backward ? from - step : from + step
        return Jump(zone: zone, from: from, to: clamp(cible, upTo: duration))
    }

    private static func clamp(_ seconds: Double, upTo duration: Double) -> Double {
        min(max(seconds, 0), duration)
    }
}
