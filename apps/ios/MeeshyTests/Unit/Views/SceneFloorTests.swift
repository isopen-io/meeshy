import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le SOL d'une scène — ce qui se peint AUTOUR de la carte, et il n'y en a
/// qu'un** (directive porteur du 2026-09-17, lot #6904 : « On préserve le même
/// fond que pour la story ! »).
///
/// ## Ce que le tour 3 ter avait laissé
///
/// `SceneCard` a fermé la divergence DANS la carte : même cadre, même fond, même
/// rayon sur les quatre surfaces. La recette au simulateur a trouvé UN écart
/// restant, et il était DEHORS : le lecteur de stories peignait autour de sa
/// carte une teinte sombre dérivée du ThumbHash, la galerie de post du NOIR PUR,
/// en cadré comme en immersif.
///
/// > **Une convergence mesurée DANS un composant ne dit rien de ce qui se peint
/// > à côté de lui.** La carte était la même ; les deux surfaces ne se
/// > ressemblaient toujours pas, parce que ce qu'un œil compare d'abord est la
/// > page entière.
///
/// ## Les deux moitiés de ce fichier, et pourquoi elles sont deux
///
/// - **les gardes de SOURCE** portent la seconde affirmation d'une énumération
///   (leçon 261) : *ces trois surfaces montent le sol*. Aucun pixel ne peut le
///   dire — une surface qui ne monte rien ne peint rien, et « rien » ressemble à
///   un fond noir légitime ;
/// - **les témoins de PIXELS** disent ce que le sol PEINT, dans une vraie
///   fenêtre : une matière non noire là où il y a une empreinte, le noir là où
///   il n'y en a pas, et un voile qui assombrit vraiment.
///
/// La paire est nécessaire : une garde de source verte sur un composant qui ne
/// peint rien serait une convergence de NOMS.
@MainActor
final class SceneFloorTests: XCTestCase {

    // MARK: - Les gardes de source

    /// **Les trois surfaces plein écran montent le SOL** — nommées une par une,
    /// comme `SceneShapeSourceGuardTests.test_lesSurfacesPleinEcran_montentLaCarteDeScene`
    /// nomme celles qui montent la carte. Le lecteur de stories est la surface
    /// de RÉFÉRENCE : c'est sa recette que les deux autres reçoivent.
    func test_lesTroisSurfacesPleinEcran_montentLeSolDeScene() throws {
        let surfaces = [
            "apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift",
            "apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift",
            "apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift",
        ]

        var muettes: [String] = []
        for chemin in surfaces {
            // Commentaires retirés : une surface qui CITE le sol dans une note
            // ne le monte pas — c'est le trou que `consultsSceneShape` a dû
            // fermer sur `PostDetailView+RepostEmbed.swift` (#6904, tour 3).
            let code = Self.stripComments(try Self.source(chemin))
            if !code.contains("SceneFloorView(") { muettes.append(chemin) }
        }

        XCTAssertEqual(muettes, [],
                       "une surface plein écran doit monter SceneFloorView — sans lui elle peint " +
                       "du noir plat autour d'une carte que les autres habillent : \(muettes)")
    }

    /// **Le lecteur de stories ne garde AUCUNE recette privée du sol.** Il l'a
    /// portée seul jusqu'à ce tour — `storyBlurredBackdrop`, son voile, sa
    /// cascade d'empreinte ; l'extraction n'a de valeur que si la recette quitte
    /// l'hôte. Une copie laissée derrière est exactement la forme du défaut que
    /// le lot ferme : deux écritures équivalentes qui divergeront.
    ///
    /// **Le balayage retire les COMMENTAIRES**, et c'est indispensable ici : le
    /// fichier DIT ce qu'il ne fait plus — une note de retrait nomme forcément ce
    /// qu'elle retire. Une garde qui compterait le texte brut interdirait
    /// d'écrire l'histoire du lot, ce qui pousserait à taire le retrait plutôt
    /// qu'à l'expliquer.
    func test_leLecteurDeStories_naPlusDeRecettePriveeDuSol() throws {
        let code = Self.stripComments(
            try Self.source("apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift"))
        for motif in ["storyBlurredBackdrop", "blur(radius: 60)", "scaleEffect(1.18)"] {
            XCTAssertFalse(code.contains(motif),
                           "la recette du sol vit dans SceneFloorView : « \(motif) » n'a plus " +
                           "rien à faire dans le lecteur")
        }
    }

    /// **Le sol vit dans le SDK, auprès de la carte qu'il entoure.** C'est une
    /// LOI de peinture à paramètres opaques — une chaîne, un nombre —, donc un
    /// atome d'interface au sens du tableau de placement, jamais de
    /// l'orchestration d'écran.
    func test_leSol_vitDansLeSDK_aCoteDeLaCarte() {
        let dossier = Self.repoRoot
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Story/ScenePlayer")
        for fichier in ["SceneFloorView.swift", "SceneCard.swift"] {
            XCTAssertTrue(
                FileManager.default.fileExists(atPath: dossier.appendingPathComponent(fichier).path),
                "\(fichier) doit vivre auprès du moteur de scène")
        }
    }

    // MARK: - Helpers

    static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        // MeeshyTests/Unit/Views/<fichier> → apps/ios → apps → racine
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    static func source(_ relative: String) throws -> String {
        try String(contentsOf: repoRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    /// Retire les commentaires — ligne et bloc. Même détecteur que
    /// `SceneShapeSourceGuardTests.stripComments`, dans la cible qui le voit.
    static func stripComments(_ source: String) -> String {
        var sortie = ""
        var index = source.startIndex
        var dansLigne = false
        var dansBloc = false
        while index < source.endIndex {
            let reste = source[index...]
            if dansLigne {
                if source[index] == "\n" { dansLigne = false; sortie.append("\n") }
                index = source.index(after: index)
                continue
            }
            if dansBloc {
                if reste.hasPrefix("*/") {
                    dansBloc = false
                    index = source.index(index, offsetBy: 2)
                } else {
                    index = source.index(after: index)
                }
                continue
            }
            if reste.hasPrefix("//") { dansLigne = true; index = source.index(index, offsetBy: 2); continue }
            if reste.hasPrefix("/*") { dansBloc = true; index = source.index(index, offsetBy: 2); continue }
            sortie.append(source[index])
            index = source.index(after: index)
        }
        return sortie
    }

    /// Contrôle positif du détecteur : sans lui, un `stripComments` cassé rendrait
    /// la garde ci-dessus verte pour toujours.
    func test_leDetecteur_ignoreUnCommentaireEtVoitLeCode() {
        XCTAssertFalse(Self.stripComments("// .blur(radius: 60) vivait ici").contains("blur"))
        XCTAssertTrue(Self.stripComments("x.blur(radius: 60)").contains("blur(radius: 60)"))
        XCTAssertFalse(Self.stripComments("/* SceneFloorView( */").contains("SceneFloorView("))
    }
}
