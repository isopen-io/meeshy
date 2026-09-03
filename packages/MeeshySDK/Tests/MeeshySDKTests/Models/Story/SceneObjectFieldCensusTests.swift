import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Le recensement des champs des cinq modèles d'objet** (#4986).
///
/// ## Pourquoi ce fichier existe
///
/// `docs/product/meeshy-composer-modele.md` affirmait « **123 champs des cinq
/// modèles d'objet », et son raisonnement en dépend : environ la moitié ne sont
/// exercés par aucun golden, et les huit pertes silencieuses de la v3 sont
/// toutes tombées de ce côté.
///
/// Recompté le 2026-09-03 par trois méthodes — `grep` sur `public var|let`,
/// bornage par la déclaration suivante, équilibrage d'accolades — il rendait
/// **131**, **112** et **119**.
///
/// L'écart ne venait pas des modèles. Il venait de ce que **« un champ » n'était
/// pas défini** : propriétés calculées ? `internal` ? déclarées en extension ?
/// Chaque méthode répondait autrement, et chacune rendait un nombre plausible.
///
/// > **Un nombre que personne ne sait recompter n'est pas une mesure, c'est une
/// > décoration** — et il décore d'autant mieux qu'il est précis.
///
/// ## La règle, et pourquoi c'est celle-là
///
/// **`Mirror`**, sur une instance. Ce n'est pas une convention que j'invente :
/// c'est la définition de Swift lui-même pour « propriété stockée ». Elle exclut
/// d'office les calculées, les statiques et les méthodes, sans qu'on ait à en
/// décider — et n'importe qui peut la rejouer en trois lignes, ce qu'aucune de
/// mes trois heuristiques ne permettait.
///
/// C'est aussi la règle que `CanvasV3ExhaustivityTests` emploie déjà pour la
/// même famille de modèles : une seconde convention en aurait fait deux.
final class SceneObjectFieldCensusTests: XCTestCase {

    /// Le recensement ÉCRIT, celui que le document cite.
    ///
    /// Il n'est pas là pour être stable : il est là pour **rougir** quand il
    /// cesse d'être vrai. Un champ ajouté à un modèle est un champ de plus à
    /// exercer au golden — c'est tout l'argument du § « ce que cette opacité
    /// coûte », et il ne vaut que si le compte suit.
    private static let recensementEcrit = 120

    private func champs<T>(_ instance: T) -> Int {
        Mirror(reflecting: instance).children.count
    }

    private func lesCinqModeles() -> [(String, Int)] {
        [
            ("StoryTextObject", champs(StoryTextObject(text: "x"))),
            ("StoryMediaObject", champs(StoryMediaObject(id: "m", aspectRatio: 1))),
            ("StorySticker", champs(StorySticker(id: "s", emoji: "🎈"))),
            ("StoryLocationObject", champs(StoryLocationObject(
                id: "l", place: SharedPlace(latitude: 0, longitude: 0, name: "n")))),
            ("StoryAudioPlayerObject", champs(StoryAudioPlayerObject(
                postMediaId: "", placement: "overlay", x: 0.5, y: 0.5,
                volume: 1, waveformSamples: []))),
        ]
    }

    /// **Le compte écrit est le compte réel.**
    ///
    /// Quand ce témoin rougit, la réparation n'est pas de changer le nombre en
    /// silence : c'est de se demander si le champ ajouté est EXERCÉ par le blob
    /// v1 partagé. S'il ne l'est pas, il vient d'agrandir les 47 % aveugles —
    /// et c'est exactement ce que le document existe pour rendre visible.
    func test_leRecensementEcrit_estLeCompteReel() {
        let detail = lesCinqModeles()
        let total = detail.reduce(0) { $0 + $1.1 }
        XCTAssertEqual(
            total, Self.recensementEcrit,
            "Le recensement a changé : \(total) champs stockés au lieu de "
            + "\(Self.recensementEcrit).\n"
            + detail.map { "  \($0.0) : \($0.1)" }.joined(separator: "\n")
            + "\n\nAvant de corriger le nombre, demander si le champ neuf est EXERCÉ "
            + "par le blob v1 partagé. S'il ne l'est pas, il agrandit les 47 % que "
            + "rien ne compare — voir docs/product/meeshy-composer-modele.md et #4986.")
    }

    /// **La règle VOIT vraiment quelque chose.** Un `Mirror` sur un type mal
    /// choisi rendrait 0, et un recensement de zéro serait vert pour toujours si
    /// le nombre écrit valait zéro. Ce témoin interdit ce silence.
    func test_chaqueModele_aDesChamps() {
        for (nom, compte) in lesCinqModeles() {
            XCTAssertGreaterThan(compte, 5, "\(nom) ne rend presque aucun champ — "
                                 + "`Mirror` regarde probablement le mauvais type")
        }
    }

    /// **Et le document cite la règle, pas seulement le nombre.**
    ///
    /// Sans cette ligne, le document pourrait garder un chiffre juste et perdre
    /// le moyen de le refaire — ce qui est l'état exact d'où ce lot est parti.
    func test_leDocument_citeLaRegle() throws {
        let url = URL(fileURLWithPath: #filePath)
            // Sept remontées : Story / Models / MeeshySDKTests / Tests /
            // MeeshySDK / packages / racine. Six menaient à `packages/docs`, et
            // le témoin échouait alors sur une erreur d'E/S plutôt que sur sa
            // règle — un chemin faux ne se distingue pas d'une règle violée
            // quand on ne lit que la couleur.
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("docs/product/meeshy-composer-modele.md")
        let doc = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(doc.contains("SceneObjectFieldCensusTests"),
                      "le document doit nommer la garde qui tient son chiffre")
        XCTAssertTrue(doc.contains("Mirror"),
                      "le document doit dire par quelle RÈGLE le chiffre s'obtient")
    }
}
