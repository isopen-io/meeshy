import XCTest
@testable import MeeshyUI

/// **Deux chemins posent une vidéo sur une scène ; ils la mesurent PAR LE MÊME
/// site** (#5418).
///
/// ## Le défaut
///
/// Mesuré sur staging le 2026-09-06, canvas servi avec `X-Canvas-Caps: 3` :
/// une story publiée depuis le composer v3 avec une VIDÉO part
/// `aspectRatio: null`, là où la même story avec une IMAGE porte `1.498`. Le
/// lecteur perd sa source de dimensionnement primaire et reste sur
/// « Chargement… » ; la vignette de « Mes stories », calculée sans image
/// chargée, sort VIDE.
///
/// La cause tenait en deux arguments : `applyContentMedia` — le pont
/// document → canvas — appelait `insertForegroundVideo(thumbnail: nil,
/// aspectRatio: nil, …)`, quand la GRAINE mesurait les trois champs dans une
/// tâche dédiée.
///
/// > **Deux chemins qui appellent la même fonction ne font pas la même chose.**
/// > L'écart ne se voyait pas dans « qui appelle quoi » — le nom appelé était
/// > identique — il vivait dans ses ARGUMENTS, deux `nil` qu'aucune signature
/// > n'oblige à remplir. C'est la forme de la leçon 279 (un lot qui partage une
/// > valeur composée doit énumérer ce qui voyage AVEC elle) appliquée à un
/// > appel plutôt qu'à une charge.
///
/// ## Pourquoi une garde de SOURCE
///
/// La mesure est asynchrone et repose sur `AVAsset` : l'éprouver demanderait un
/// fichier vidéo réel dans le bundle de tests, et n'attesterait alors que le
/// décodeur d'Apple. Ce qui doit être gardé n'est pas la mesure — c'est que les
/// DEUX chemins la demandent, et qu'aucun troisième ne pose une vidéo sans elle.
final class ComposerVideoMeasureGuardTests: XCTestCase {

    private func source(_ fichier: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/\(fichier)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Tout site qui pose une vidéo la mesure.** Le balayage porte sur les
    /// appelants d'`insertForegroundVideo`, pas sur une liste de fichiers
    /// écrite à la main — un troisième chemin ne pourra pas naître muet.
    func test_chaqueSiteQuiPoseUneVideo_laMesure() throws {
        let fichiers = ["StoryComposerViewModel+ContentMedia.swift",
                        "StoryComposerViewModel+Seed.swift"]
        for fichier in fichiers {
            let code = try source(fichier)
            guard code.contains("insertForegroundVideo(") else { continue }
            XCTAssertTrue(
                code.contains("measureVideo("),
                "\(fichier) pose une vidéo sans la mesurer : elle partira sans ratio ni "
                + "vignette, et le lecteur n'aura pas de quoi la dimensionner (#5418)."
            )
        }
    }

    /// **La mesure n'est écrite qu'UNE fois.** La graine en portait l'unique
    /// exemplaire ; le fondre est ce qui empêche l'écart de revenir. Une
    /// seconde écriture de `naturalSize` + `preferredTransform` hors du site
    /// unique le rouvrirait en silence.
    func test_laMesureNestEcriteQuUneFois() throws {
        let fichiers = ["StoryComposerViewModel+ContentMedia.swift",
                        "StoryComposerViewModel+Seed.swift",
                        "StoryComposerViewModel+Capture.swift"]
        for fichier in fichiers {
            let code = try source(fichier)
            XCTAssertFalse(
                code.contains("preferredTransform"),
                "\(fichier) remesure une vidéo à la main — la règle vit dans "
                + "`StoryComposerViewModel+VideoMeasure.swift`, et deux écritures divergent."
            )
        }
    }

    /// **Le `preferredTransform` est appliqué**, et ce n'est pas décoratif : une
    /// vidéo filmée à la verticale porte ses dimensions natives en paysage, et
    /// le quart de tour dans la transformation. Le lire sans l'appliquer rend
    /// 16:9 pour une vidéo 9:16 — l'inverse exact de ce que l'auteur voit.
    func test_leSiteUnique_appliqueLaRotation() throws {
        let code = try source("StoryComposerViewModel+VideoMeasure.swift")
        XCTAssertTrue(code.contains("natural.applying(transform)"),
                      "sans la rotation, une vidéo verticale se déclare paysage")
    }

    /// **Une tâche par objet.** La graine posait UNE vidéo et une poignée unique
    /// suffisait ; le pont document → canvas en pose autant que l'auteur en
    /// ingère, et elles se voleraient `preloadTask`.
    func test_lesTachesDeMesure_sontSuiviesParObjet() throws {
        let code = try source("StoryComposerViewModel+VideoMeasure.swift")
        XCTAssertTrue(code.contains("videoMeasureTasks[objectId]"),
                      "une poignée unique ferait s'annuler entre elles deux vidéos ingérées ensemble")
    }
}
