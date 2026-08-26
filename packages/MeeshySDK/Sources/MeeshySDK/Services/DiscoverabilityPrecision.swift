import Foundation

/// Grain de découvrabilité géographique DEMANDÉ au serveur pour une
/// publication — le second opt-in de la spec du 2026-08-02, indépendant du
/// badge de position affiché (`CreatePostRequest.location`, inchangé).
///
/// Ce type ne quantifie RIEN, et c'est sa raison d'être. Le client envoie la
/// coordonnée telle qu'il l'a reçue et se contente de NOMMER le grain
/// souhaité ; l'arrondi de grille est calculé par le serveur seul
/// (`quantizeCoordinate`, gateway). Un second arrondi écrit ici ferait deux
/// juges d'une même règle, qui divergeraient au premier ajustement d'un
/// palier — et c'est le juge CLIENT qui aurait tort, puisque c'est la valeur
/// du serveur qui est persistée.
///
/// Les valeurs brutes sont celles de l'énumération Zod du gateway
/// (`CreatePostSchema.discoverabilityPrecision`) : une divergence de casse se
/// solderait par un 400 VALIDATION_ERROR.
///
/// ABSENT vaut « non découvrable » : le gateway laisse alors `geoPoint` et
/// `geoPrecision` nuls. D'où l'interdit qui gouverne tout ce fichier — aucune
/// valeur par défaut non nulle, à aucun niveau. Poser un défaut rendrait
/// trouvable un contenu que personne n'a choisi de rendre trouvable.
public enum DiscoverabilityPrecision: String, Codable, CaseIterable, Sendable {
    /// Aucun arrondi de grille côté serveur.
    case exact = "EXACT"
    /// Grille 0,01° — rayon approximatif 1 km.
    case neighborhood = "NEIGHBORHOOD"
    /// Grille 0,1° — rayon approximatif 10 km.
    case city = "CITY"
    /// Grille 1° — rayon approximatif 100 km.
    case region = "REGION"

    /// Décimales conservées par la grille du serveur. `nil` = aucun arrondi.
    ///
    /// Exprimé en DÉCIMALES et non en pas de grille pour que la comparaison
    /// avec `LocationPrecision.decimalPlaces` reste entière : `pow(10, -2)`
    /// ne rend pas exactement `0.01`, et deux paliers identiques finiraient
    /// par se départager sur un artefact de virgule flottante.
    public var gridDecimals: Int? {
        switch self {
        case .exact:        return nil
        case .neighborhood: return 2
        case .city:         return 1
        case .region:       return 0
        }
    }

    /// Le pas de grille du serveur, en degrés — pour le DESSIN seul. `nil`
    /// pour `.exact`, qui n'a pas de cellule.
    ///
    /// Miroir de `NearbyDensityCellSize.degrees`, et posé pour la même raison
    /// et avec la même précaution : la réponse ne porte que des points, donc
    /// représenter honnêtement « quelque part dans cette cellule » exige d'en
    /// connaître le bord. Cette valeur ne quantifie AUCUNE coordonnée
    /// sortante — écrite en littéral et non en `pow(10, -n)`, qui ne rend pas
    /// exactement 0,01.
    public var gridDegrees: Double? {
        switch self {
        case .exact:        return nil
        case .neighborhood: return 0.01
        case .city:         return 0.1
        case .region:       return 1
        }
    }

    /// Le rayon à dessiner autour d'un pin pour dire « quelque part dans cette
    /// zone », en mètres. `nil` pour `.exact` : il n'y a rien à cerner.
    ///
    /// Demi-cellule, converti par la longueur d'un degré de LATITUDE (~111,32
    /// km), constante partout — contrairement au degré de longitude, qui se
    /// resserre vers les pôles. L'approximation est celle que la spec assume
    /// déjà pour ses libellés (~1 km / ~10 km / ~100 km) ; elle ne sert qu'à
    /// tracer un cercle, jamais à situer quoi que ce soit.
    public var haloRadiusMeters: Double? {
        guard let degrees = gridDegrees else { return nil }
        return degrees / 2 * 111_320
    }

    /// Les paliers qu'il est HONNÊTE de revendiquer quand la position part
    /// déjà dégradée à `sharing`, du plus fin au plus grossier.
    ///
    /// Le picker de lieu applique `LocationPrecision.coarsen` AVANT de
    /// remettre le `SharedPlace` au composer (`LocationPickerModel
    /// .sharedPlace(at:)`) : sous un partage « Ville », la coordonnée qui part
    /// est déjà arrondie à environ 11 km. Revendiquer « Exacte » écrirait
    /// alors `geoPrecision = "EXACT"` sur un point qui ne l'est pas. Ce n'est
    /// pas une fuite — la valeur va dans le sens protecteur — mais un mensonge
    /// de contrat, qui fausse la carte de densité de tout le monde.
    ///
    /// La restriction porte sur le LIBELLÉ revendiqué, jamais sur un chiffre :
    /// rien ici ne touche une coordonnée.
    ///
    /// Le résultat n'est jamais vide : `region` (0 décimale) est plus
    /// grossier que tout palier de partage existant.
    public static func allowedTiers(under sharing: LocationPrecision) -> [DiscoverabilityPrecision] {
        guard let shared = sharing.decimalPlaces else { return allCases }
        return allCases.filter { tier in
            guard let claimed = tier.gridDecimals else { return false }
            return claimed <= shared
        }
    }

    /// Le palier réellement offrable quand celui-ci est plus fin que ce que la
    /// coordonnée envoyée permet de revendiquer — sinon lui-même.
    ///
    /// Sert la PRÉ-SÉLECTION du dernier palier mémorisé : un choix retenu
    /// alors que le partage était « Exacte » ne peut pas ressortir tel quel
    /// après que l'utilisateur a resserré son partage à « Ville ».
    ///
    /// L'appelant DOIT dire à l'écran qu'il a resserré : la spec exige que
    /// rien ne soit appliqué silencieusement, et un clamp muet viole cette
    /// phrase exactement autant qu'un arrondi muet.
    public func clamped(under sharing: LocationPrecision) -> DiscoverabilityPrecision {
        let allowed = Self.allowedTiers(under: sharing)
        guard !allowed.contains(self) else { return self }
        return allowed.first ?? .region
    }
}
