import XCTest
@testable import MeeshySDK

/// **`aspectRatio = 1.0` disait deux choses à la fois** (#5100).
///
/// Le champ est un `Double` non optionnel, posé à `1.0` à la composition puis
/// renseigné une fois l'asset mesuré. **`1.0` signifiait donc à la fois « je ne
/// sais pas encore » et « ce média est carré »**, et aucun consommateur ne
/// pouvait savoir laquelle des deux valeurs il tenait.
///
/// Le dépôt contournait déjà le problème, et le contournement contenait l'aveu :
/// l'hydratation à la lecture testait `abs(aspectRatio - 1.0) < 0.05`, c'est-à-dire
/// la SENTINELLE, pas une propriété du média. Une photo réellement carrée était
/// donc réécrite comme si son ratio était inconnu — le résultat coïncidait par
/// chance (w/h ≈ 1), mais la règle ne pouvait structurellement pas distinguer
/// les deux cas.
///
/// Ce lot rend l'état « pas encore mesuré » **représentable** : `aspectRatio`
/// devient la projection d'une mesure optionnelle, avec le repli historique.
/// Aucun appelant ne change ; ce qui change est ce que le domaine sait DIRE.
final class MeasuredAspectRatioTests: XCTestCase {

    private func objet(aspectRatio: Double?) -> StoryMediaObject {
        StoryMediaObject(id: "m", postMediaId: "p", kind: .image, aspectRatio: aspectRatio)
    }

    /// Un média posé sans mesure DIT qu'il n'est pas mesuré — et sert quand même
    /// le repli, pour que rien en aval ne casse.
    func test_sansMesure_leDomaineLeDit() {
        let o = objet(aspectRatio: nil)
        XCTAssertNil(o.measuredAspectRatio, "le domaine doit pouvoir dire « je ne sais pas »")
        XCTAssertEqual(o.aspectRatio, 1.0, "et servir le repli historique, pour ne rien casser en aval")
    }

    /// **Le cas qui était irreprésentable** : un média RÉELLEMENT carré.
    func test_unCarreReel_seDistingueDeLInconnu() {
        let carre = objet(aspectRatio: 1.0)
        XCTAssertEqual(carre.measuredAspectRatio, 1.0)
        XCTAssertNotNil(carre.measuredAspectRatio,
                        "un carré MESURÉ n'est pas un ratio inconnu — c'est tout le lot")
    }

    /// La mesure qui arrive plus tard remplit les deux lectures.
    func test_laMesureArrivee_remplitLesDeux() {
        var o = objet(aspectRatio: nil)
        o.aspectRatio = 16.0 / 9.0
        XCTAssertEqual(o.measuredAspectRatio ?? 0, 16.0 / 9.0, accuracy: 0.0001)
        XCTAssertEqual(o.aspectRatio, 16.0 / 9.0, accuracy: 0.0001)
    }

    /// **Au décodage, la PRÉSENCE de la clé fait la mesure.**
    ///
    /// C'est le point qui rend le reste possible : une charge qui porte
    /// `aspectRatio` a été écrite par quelqu'un qui savait, même quand la valeur
    /// vaut 1. Une charge qui ne la porte pas est un legacy dont on ignore tout.
    func test_auDecodage_laPresenceDeLaCleFaitLaMesure() throws {
        let avec = #"{"id":"m","postMediaId":"p","mediaType":"image","aspectRatio":1.0}"#
        let sans = #"{"id":"m","postMediaId":"p","mediaType":"image"}"#
        let d = JSONDecoder()

        let mesure = try d.decode(StoryMediaObject.self, from: Data(avec.utf8))
        XCTAssertEqual(mesure.measuredAspectRatio, 1.0,
                       "`aspectRatio: 1.0` PRÉSENT dans la charge est un carré, pas une sentinelle")

        let inconnu = try d.decode(StoryMediaObject.self, from: Data(sans.utf8))
        XCTAssertNil(inconnu.measuredAspectRatio,
                     "une charge sans la clé ne dit rien du ratio")
        XCTAssertEqual(inconnu.aspectRatio, 1.0, "et sert le repli, comme avant")
    }

    /// **Le fil ne change pas.** Un champ de mémoire qui modifierait la charge
    /// casserait les trois clients ; ce lot ne touche qu'à ce que le domaine SAIT,
    /// jamais à ce qu'il ÉCRIT.
    func test_leFil_neChangePas() throws {
        let o = objet(aspectRatio: 16.0 / 9.0)
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(o)) as? [String: Any]
        XCTAssertEqual(json?["aspectRatio"] as? Double ?? 0, 16.0 / 9.0, accuracy: 0.0001)
        XCTAssertNil(json?["measuredAspectRatio"],
                     "la mesure est un fait de MÉMOIRE — l'écrire au fil ajouterait un champ que "
                     + "personne ne lit et que les trois décodeurs devraient apprendre")
    }

    /// Un média non mesuré encode quand même son repli : le fil reste identique
    /// à ce qu'il était avant ce lot, y compris pour un objet fraîchement posé.
    func test_unNonMesure_encodeSonRepli() throws {
        let json = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(objet(aspectRatio: nil))) as? [String: Any]
        XCTAssertEqual(json?["aspectRatio"] as? Double, 1.0)
    }
}
