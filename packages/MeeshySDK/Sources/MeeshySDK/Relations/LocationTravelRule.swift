import Foundation

/// « DE PASSAGE À <VILLE> » (#19560, chantier #18857). Ma ville déclarée (`MeeshyUser.declaredCity`) et la ville où
/// l'appareil me sait DÉJÀ : quand elles diffèrent, la carte où j'apparais le dit par une pilule. La règle se dérive
/// sur l'appareil seulement — ni la ville courante ni la pilule ne partent au serveur — et ne demande rien : sans
/// permission de localisation déjà accordée, ou sans l'une des deux villes, elle se tait.
public enum LocationTravelRule {

    /// La ville à nommer dans la pilule, ou `nil` pour ne rien poser. Deux villes sont la même si, rognées et lues sans
    /// casse ni accents, elles sont égales — ou si la ville courante est le premier membre de la ville déclarée
    /// (« Lisbonne, Portugal » et « Lisbonne »).
    public static func awayCity(declaredCity: String?, currentCity: String?, isAuthorized: Bool) -> String? {
        guard isAuthorized,
              let declared = ProfileCity.normalized(declaredCity),
              let current = ProfileCity.normalized(currentCity) else { return nil }
        let here = folded(current)
        let home = folded(declared)
        let homeHead = declared.split(separator: ",").first.map { folded(String($0)) } ?? home
        return here == home || here == homeHead ? nil : current
    }

    private static func folded(_ city: String) -> String {
        city.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
    }
}
