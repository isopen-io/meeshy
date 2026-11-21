import Foundation
import Testing
@testable import MeeshySDK

/// « DE PASSAGE À <VILLE> » (#19560, chantier #18857) — planches Carte-Personne, Carte-Proches, Carte-Partage,
/// Carte-Sang et iPad-Split. La pilule ne se dérive que sur l'appareil, de ma ville déclarée et de la ville de ma
/// position déjà connue : rien n'est demandé, rien ne part.
struct LocationTravelRuleTests {

    @Test("loin de ma ville déclarée, la pilule nomme la ville où je suis")
    func away_namesTheCurrentCity() {
        let city = LocationTravelRule.awayCity(declaredCity: "Dakar", currentCity: "Lisbonne", isAuthorized: true)
        #expect(city == "Lisbonne")
    }

    @Test("dans ma ville déclarée, aucune pilule — casse, accents et espaces ignorés")
    func sameCity_noPill() {
        #expect(LocationTravelRule.awayCity(declaredCity: "Dakar", currentCity: "Dakar", isAuthorized: true) == nil)
        #expect(LocationTravelRule.awayCity(declaredCity: " montréal ", currentCity: "Montreal", isAuthorized: true) == nil)
        #expect(LocationTravelRule.awayCity(declaredCity: "Lisbonne, Portugal", currentCity: "Lisbonne",
                                            isAuthorized: true) == nil)
    }

    @Test("une ville courante inconnue ne pose aucune pilule")
    func unknownCurrentCity_noPill() {
        #expect(LocationTravelRule.awayCity(declaredCity: "Dakar", currentCity: nil, isAuthorized: true) == nil)
        #expect(LocationTravelRule.awayCity(declaredCity: "Dakar", currentCity: "  ", isAuthorized: true) == nil)
    }

    @Test("sans permission de localisation, aucune pilule, même si une ville traîne")
    func noPermission_noPill() {
        #expect(LocationTravelRule.awayCity(declaredCity: "Dakar", currentCity: "Lisbonne", isAuthorized: false) == nil)
    }

    @Test("sans ville déclarée, on n'est de passage nulle part")
    func noDeclaredCity_noPill() {
        #expect(LocationTravelRule.awayCity(declaredCity: nil, currentCity: "Lisbonne", isAuthorized: true) == nil)
        #expect(LocationTravelRule.awayCity(declaredCity: "", currentCity: "Lisbonne", isAuthorized: true) == nil)
    }

    @Test("la ville servie à la pilule est rognée")
    func servedCity_isTrimmed() {
        let city = LocationTravelRule.awayCity(declaredCity: "Dakar", currentCity: "  Lisbonne ", isAuthorized: true)
        #expect(city == "Lisbonne")
    }
}
