import XCTest
@testable import MeeshySDK

/// **Une famille d'objets porte UN nom, sur toutes les couches** (#4960).
///
/// ## Ce que ce fichier garde, et pourquoi il vaut plus que le renommage
///
/// Le défaut réparé était isolé — `MeeshySceneObject.Kind` disait `location`
/// quand le fil, son miroir Swift, la timeline et l'inspecteur disaient `place`.
/// Un renommage le corrige une fois ; **cette garde empêche le suivant**, celui
/// qu'aucun de nous ne peut prévoir.
///
/// Elle est nécessaire parce que la divergence était INVISIBLE : la conversion
/// se faisait en silence dans `CanvasV3Migration`, qui traduit `case .place:` en
/// `locationObject(...)` sans qu'une ligne dise que c'est un renommage. Rien ne
/// rougissait ; il fallait lire les cinq énumérés côte à côte pour le voir.
final class SceneObjectFamilyVocabularyTests: XCTestCase {

    /// **Les kinds du fil qui ne sont PAS des objets de scène**, avec leur
    /// raison — sans cette table, la garde serait rouge à sa naissance.
    ///
    /// - `drawing` : se décode en `slide.effects.drawingStrokes`, un calque de
    ///   traits, pas un objet sélectionnable.
    /// - `mention` : `CanvasV3Migration` le documente — « kind CONNU que la
    ///   scène ne peint pas : une mention est une métadonnée, pas un objet ».
    private static let wireKindsThatAreNotSceneObjects: Set<String> = ["drawing", "mention"]

    /// Les kinds du fil, énumérés à la main FAUTE DE MIEUX : `ObjectKind` porte
    /// un cas à valeur associée (`reserved(String)`), donc il ne peut pas être
    /// `CaseIterable`.
    ///
    /// Cette liste se périmera à l'ajout d'un kind — **et c'est le but**. Elle
    /// rougira, et quelqu'un devra dire si le nouveau kind est un objet de scène
    /// ou non. C'est exactement la question qu'on oublie de se poser.
    private static let wireKinds: [ObjectKind] = [.text, .media, .sticker, .audio, .place, .drawing, .mention]

    // MARK: - Aller : ce que la scène nomme, le fil le connaît

    /// **Le témoin qui aurait attrapé `location`.**
    ///
    /// Un mot que le contrat ignore se décode en `.reserved` — c'est la façon
    /// dont `ObjectKind` dit « je ne connais pas ce kind ». Aucune famille
    /// d'objets de scène ne doit être dans ce cas.
    func test_chaqueFamilleDeScene_estUnKindConnuDuFil() {
        for famille in MeeshySceneObject.Kind.allCases {
            let duFil = ObjectKind(wireValue: famille.rawValue)
            if case .reserved(let brut) = duFil {
                XCTFail("La famille « \(famille.rawValue) » n'existe pas au contrat du fil "
                        + "(décodée en .reserved(\"\(brut)\")). Le fil a raison par construction : "
                        + "c'est la famille qu'il faut renommer, pas ACTIVE_KINDS.")
            }
            XCTAssertEqual(duFil.wireValue, famille.rawValue,
                           "aller-retour non idempotent pour « \(famille.rawValue) »")
        }
    }

    // MARK: - Retour : ce que le fil nomme, la scène le loge ou le DÉCLARE absent

    /// Tout kind du fil est soit une famille d'objets de scène, soit
    /// explicitement déclaré comme n'en étant pas un.
    ///
    /// Sans ce sens, un kind ajouté au contrat pourrait rester sans logement
    /// pendant des mois : le décodeur le rangerait en `.reserved`, la scène
    /// serait peinte AMPUTÉE, et aucune ligne ne rougirait — c'est très
    /// exactement le défaut que `CanvasV3Migration` décrit pour `.reserved`.
    func test_chaqueKindDuFil_estUneFamille_ouDeclareNePasLEtre() {
        let familles = Set(MeeshySceneObject.Kind.allCases.map(\.rawValue))
        for kind in Self.wireKinds {
            let mot = kind.wireValue
            if Self.wireKindsThatAreNotSceneObjects.contains(mot) { continue }
            XCTAssertTrue(familles.contains(mot),
                          "Le kind « \(mot) » existe au contrat du fil mais n'est logé par "
                          + "aucune famille de `MeeshySceneObject.Kind`. Soit il en mérite une, "
                          + "soit il rejoint `wireKindsThatAreNotSceneObjects` AVEC sa raison.")
        }
    }

    /// **Les exemptions sont vraies.** Une table d'exemptions qui nommerait un
    /// kind inexistant se tairait pour toujours — elle sauterait un contrôle en
    /// croyant en dispenser un autre.
    func test_lesExemptions_nommentDesKindsQuiExistent() {
        let mots = Set(Self.wireKinds.map(\.wireValue))
        for exempte in Self.wireKindsThatAreNotSceneObjects {
            XCTAssertTrue(mots.contains(exempte),
                          "« \(exempte) » est exempté mais n'est plus un kind du fil : "
                          + "retirer l'exemption plutôt que de la laisser mentir.")
        }
    }

    /// Le cas particulier qui a motivé tout le lot, épinglé nommément : la
    /// famille du LIEU dit `place`, pas `location`.
    func test_laFamilleDuLieu_sAppellePlace() {
        XCTAssertEqual(MeeshySceneObject.Kind.place.rawValue, "place")
        XCTAssertFalse(MeeshySceneObject.Kind.allCases.map(\.rawValue).contains("location"),
                       "quatre couches disent « place » ; la cinquième ne doit plus dire autre chose")
    }
}
