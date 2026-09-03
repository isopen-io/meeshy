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

    /// **La famille est déclarée CINQ fois, et le mot doit être le même partout.**
    ///
    /// Ce témoin a été écrit trois fois, et les deux premières versions étaient
    /// fausses de la même façon — elles comparaient une PAIRE :
    ///
    /// 1. la première lisait `Kind.allCases` et des `rawValue` : elle n'a pas vu
    ///    le cas d'UNION (`case location(StoryLocationObject)`), qui n'a pas de
    ///    `rawValue` ;
    /// 2. la seconde a ajouté l'union : elle n'a pas vu
    ///    `StoryCanvasUIView.CanvasItemKind`, qui n'était dans aucune des deux
    ///    déclarations comparées.
    ///
    /// > **Une garde par PAIRE ne garde pas une famille de cinq.** Elle rend un
    /// > verdict vrai sur ce qu'elle regarde, et muet sur tout le reste — ce qui
    /// > se lit comme un verdict sur l'ensemble. J'ai fermé #4960 deux fois sur
    /// > cette confusion.
    ///
    /// Celle-ci BALAIE : toute déclaration dont le jeu de cas EST celui des
    /// familles d'objets de scène doit employer `place`. Elle n'a pas besoin de
    /// connaître le nom des types — c'est la FORME de la déclaration qui la
    /// désigne, donc une sixième naîtrait sous sa surveillance.
    func test_aucuneDeclarationDeFamilles_neDitLocation() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources")

        let fichiers = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" } ?? []
        XCTAssertGreaterThan(fichiers.count, 100,
                             "le balayage ne voit presque aucune source — chemin faux, "
                             + "et un balayage aveugle est toujours vert")

        // Les mots qui, ENSEMBLE, désignent une déclaration de familles d'objets
        // de scène. Trois suffisent : aucun autre énuméré du dépôt ne les réunit.
        let signature: Set<String> = ["text", "media", "sticker"]
        var fautifs: [String] = []

        for fichier in fichiers {
            guard let contenu = try? String(contentsOf: fichier, encoding: .utf8) else { continue }
            for ligne in contenu.split(separator: "\n") where ligne.contains("case ") {
                let mots = Set(ligne
                    .replacingOccurrences(of: "case", with: " ")
                    .split(whereSeparator: { !$0.isLetter })
                    .map(String.init))
                guard signature.isSubset(of: mots), mots.contains("location") else { continue }
                fautifs.append("\(fichier.lastPathComponent) → \(ligne.trimmingCharacters(in: .whitespaces))")
            }
        }

        XCTAssertTrue(fautifs.isEmpty,
                      "Ces déclarations nomment une famille d'objets de scène « location » "
                      + "alors que le contrat du fil dit « place » :\n  "
                      + fautifs.joined(separator: "\n  "))
    }

    /// **Le balayage VOIT vraiment quelque chose.** Sans ce contre-exemple, un
    /// motif qui ne matche plus rien rendrait un vert éternel — la façon dont
    /// une garde négative meurt en silence.
    func test_leBalayage_reconnaitUneDeclarationDeFamilles() {
        let ligne = "        case text, media, sticker, location, audio"
        let mots = Set(ligne
            .replacingOccurrences(of: "case", with: " ")
            .split(whereSeparator: { !$0.isLetter })
            .map(String.init))
        XCTAssertTrue(Set(["text", "media", "sticker"]).isSubset(of: mots))
        XCTAssertTrue(mots.contains("location"),
                      "le motif doit reconnaître la forme EXACTE que le lot vient de corriger")
    }
}
