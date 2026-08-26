import Foundation

/// L'état du SECOND opt-in de position — « Rendre ce contenu trouvable à
/// proximité » (spec du 2026-08-02 §2) — pour UNE publication.
///
/// Le premier opt-in, « Afficher une position sur ce contenu », est le lieu
/// choisi lui-même (`CreatePostRequest.location`) : il ne passe pas par ici et
/// ne bouge pas. Les deux sont indépendants dans les deux sens — on peut
/// afficher un lieu sans être trouvable, et être trouvable sans afficher de
/// badge.
///
/// La vue ne décide de rien : elle rend cet état et lui renvoie les gestes.
/// Trois invariants y sont tenus, un par phrase de la spec.
///
/// **Off par défaut.** Aucun initialiseur ne rend un état découvrable, quelle
/// que soit la mémoire. `precisionToSend` vaut `nil` tant que l'interrupteur
/// n'a pas été ouvert, et le gateway laisse alors `geoPoint`/`geoPrecision`
/// nuls. Un palier mémorisé PRÉ-SÉLECTIONNE ; il n'active rien.
///
/// **Le grain revendiqué ne dépasse jamais la coordonnée envoyée.** Le picker
/// dégrade déjà le `SharedPlace` selon `LocationPrecision` avant de le remettre
/// au composer : sous un partage « Ville », revendiquer « Exacte » écrirait
/// `geoPrecision = "EXACT"` sur un point arrondi à ±11 km. La restriction porte
/// sur le LIBELLÉ, jamais sur un chiffre — rien ici n'arrondit une coordonnée,
/// le serveur reste le seul juge de la grille.
///
/// **Rien n'est appliqué silencieusement.** Quand la mémoire est plus fine que
/// ce que le partage autorise, `narrowedFrom` porte le palier abandonné pour
/// que l'écran le DISE. Un resserrement muet viole cette phrase exactement
/// autant qu'un arrondi muet.
public struct NearbyDiscoverabilityChoice: Equatable, Sendable {

    /// Palier pré-sélectionné en l'absence de toute mémoire : le plus
    /// GROSSIER. Un premier usage ne doit exposer que ce que l'utilisateur a
    /// explicitement demandé, et il n'a encore rien demandé de fin. Il voit la
    /// valeur et peut l'affiner — l'inverse (partir du plus fin) exposerait
    /// par défaut une précision que personne n'a choisie.
    public static let unmemorizedTier: DiscoverabilityPrecision = .region

    /// L'opt-in de CETTE publication. Toujours fermé à la construction.
    public private(set) var isDiscoverable: Bool

    /// Le palier pré-sélectionné puis choisi. Jamais plus fin que
    /// `offeredTiers`.
    public private(set) var tier: DiscoverabilityPrecision

    /// Les paliers qu'il est honnête d'offrir, du plus fin au plus grossier.
    /// Jamais vide : `region` est plus grossier que tout grain de partage.
    public let offeredTiers: [DiscoverabilityPrecision]

    /// Le palier MÉMORISÉ qui n'a pas pu être honoré, `nil` quand la mémoire
    /// passait telle quelle — ou qu'il n'y en avait aucune. L'écran doit le
    /// dire quand il est non nul.
    public let narrowedFrom: DiscoverabilityPrecision?

    /// **Vrai quand la coordonnée AFFICHÉE part au mètre près.**
    ///
    /// Ce grain-là n'est PAS celui que gouverne ce type. `precisionToSend` ne
    /// gouverne que `Post.geoPoint`, l'index de recherche ; le badge de lieu
    /// voyage à côté, dans `CreatePostRequest.location`, et le serveur le
    /// persiste dans `metadata.location` au grain de
    /// `LocationSharingPreferences.precision` — dont le défaut est « Exacte ».
    ///
    /// Sans ce drapeau, l'écran de consentement pouvait promettre « jamais
    /// plus précis que la zone choisie » pendant que la MÊME publication
    /// emportait l'adresse à la rue près dans son badge. Un lecteur qui
    /// choisit « Région » pour ne pas donner son adresse doit voir que
    /// l'adresse part quand même — par l'autre porte, celle qu'il a ouverte
    /// ailleurs et qu'il a peut-être oubliée.
    public let sharedCoordinateIsExact: Bool

    private init(
        isDiscoverable: Bool,
        tier: DiscoverabilityPrecision,
        offeredTiers: [DiscoverabilityPrecision],
        narrowedFrom: DiscoverabilityPrecision?,
        sharedCoordinateIsExact: Bool
    ) {
        self.isDiscoverable = isDiscoverable
        self.tier = tier
        self.offeredTiers = offeredTiers
        self.narrowedFrom = narrowedFrom
        self.sharedCoordinateIsExact = sharedCoordinateIsExact
    }

    /// - Parameters:
    ///   - memorized: le dernier palier réellement utilisé pour publier
    ///     (`LocationSharingPreferences.lastDiscoverabilityPrecision`). `nil`
    ///     au premier usage.
    ///   - sharing: le grain auquel la coordonnée part déjà, qui plafonne ce
    ///     qui peut être revendiqué.
    public init(memorized: DiscoverabilityPrecision?, sharing: LocationPrecision) {
        let offered = DiscoverabilityPrecision.allowedTiers(under: sharing)
        let wanted = memorized ?? Self.unmemorizedTier
        let honored = wanted.clamped(under: sharing)
        self.init(
            isDiscoverable: false,
            tier: honored,
            offeredTiers: offered,
            narrowedFrom: (memorized != nil && honored != wanted) ? wanted : nil,
            sharedCoordinateIsExact: sharing.decimalPlaces == nil
        )
    }

    /// L'état inerte : pas de lieu choisi, donc rien à offrir. Sert de valeur
    /// initiale au composer et de cible au nettoyage.
    public static let disabled = NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact)

    // MARK: - Ce que la publication emporte

    /// Le grain à envoyer au gateway, `nil` quand l'utilisateur n'a rien
    /// activé. `nil` OMET la clé, et son absence vaut « non découvrable ».
    public var precisionToSend: DiscoverabilityPrecision? {
        isDiscoverable ? tier : nil
    }

    /// Le palier à retenir pour la PROCHAINE publication, `nil` quand il n'y a
    /// rien à retenir. La spec parle du dernier choix « utilisé » : un palier
    /// affiché dans un sélecteur qu'on a refermé n'a été utilisé par personne,
    /// et l'écrire effacerait une mémoire plus ancienne, elle bien utilisée.
    public var tierToMemorize: DiscoverabilityPrecision? {
        isDiscoverable ? tier : nil
    }

    // MARK: - Ce que l'écran doit dire

    /// Le grain le plus fin offrable. `offeredTiers` n'est jamais vide.
    public var finestOfferedTier: DiscoverabilityPrecision {
        offeredTiers.first ?? Self.unmemorizedTier
    }

    /// Vrai quand le grain de partage retire des paliers du sélecteur. L'écran
    /// explique alors POURQUOI « Exacte » n'y figure pas — sans quoi
    /// l'utilisateur lit une liste amputée sans cause visible.
    public var isCappedBySharing: Bool {
        offeredTiers.count < DiscoverabilityPrecision.allCases.count
    }

    // MARK: - Gestes

    public mutating func setDiscoverable(_ on: Bool) {
        isDiscoverable = on
    }

    /// Retenir le choix de l'utilisateur, clampé. Le sélecteur n'offre que
    /// `offeredTiers`, donc le clamp est une défense en profondeur : il empêche
    /// qu'un palier écrit en dur à un futur site d'appel revendique plus fin
    /// que la coordonnée envoyée.
    public mutating func select(_ newTier: DiscoverabilityPrecision) {
        tier = offeredTiers.contains(newTier) ? newTier : finestOfferedTier
    }

    /// Referme l'opt-in — le consentement porte sur UNE publication. Appelé au
    /// nettoyage du composer : sans lui, l'interrupteur ouvert pour un lieu
    /// resterait ouvert pour le suivant, que personne n'a examiné.
    public mutating func reset() {
        isDiscoverable = false
    }
}
