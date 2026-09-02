import XCTest
@testable import Meeshy

/// Garde d'analyse de source : l'interface doit rester lisible dans une langue
/// qui se lit de droite à gauche.
///
/// L'app propose l'arabe parmi ses langues d'interface. SwiftUI retourne
/// automatiquement les piles, les alignements `.leading`/`.trailing` et les
/// marges directionnelles — mais **pas** les symboles nommés par un côté
/// physique. `chevron.right` pointe vers la droite dans toutes les langues :
/// dans une interface arabe, le chevron de divulgation d'une ligne pointe donc
/// à l'opposé de l'écran vers lequel il mène, et la flèche de retour indique
/// l'avant. `chevron.forward` / `chevron.backward` se retournent tout seuls.
///
/// La régression est silencieuse : rien ne casse, rien n'échoue, l'interface
/// devient juste incompréhensible pour un lecteur arabophone. D'où cette garde.
///
/// ## Ce qui reste légitimement nommé par un côté
///
/// Trois familles de symboles décrivent une géométrie ou un temps, pas une
/// direction de lecture, et ne doivent PAS se retourner :
/// - les timelines média (déplacer un segment, couper au début/à la fin) — le
///   temps coule dans le même sens quelle que soit la langue, comme dans les
///   éditeurs d'Apple ;
/// - les opérations géométriques (miroir horizontal) ;
/// - les symboles bidirectionnels (`arrow.left.and.right` pour une durée) et
///   l'icône « code » `chevron.left.forwardslash.chevron.right`.
///
/// **L'exemption vaut pour les CHEVRONS autant que pour les flèches**
/// (2026-09-02). Elle ne s'appliquait qu'au test des flèches, parce que seules
/// des flèches habitaient alors les timelines. `MeeshyAudioTrimmer` (SDK) pose
/// depuis un `chevron.left` / `chevron.right` sur une poignée sortie du champ :
/// la flèche dit DE QUEL CÔTÉ de la bande visible la borne est partie, et une
/// bande de temps coule de gauche à droite quelle que soit la langue — un
/// `chevron.backward` s'y retournerait en arabe et désignerait le mauvais bord.
/// C'est exactement la géométrie que `directionalByDesign` reconnaît aux
/// `arrow.*` ; le symbole change, pas la raison. La liste est partagée, pas
/// dédoublée : deux listes pour une même exemption divergeraient au premier
/// fichier ajouté.
final class RightToLeftLayoutGuardTests: XCTestCase {

    /// Fichiers dont les flèches ET les chevrons décrivent une timeline ou une
    /// géométrie — jamais une direction de lecture.
    private static let directionalByDesign: Set<String> = [
        "VideoEditorToolPanels.swift",
        "ClipTimingBar.swift",
        "MeeshyImageEditorView.swift",
        // Poignées du trimmer audio : la pointe désigne le bord de la bande
        // par lequel la borne est sortie (2026-09-02).
        "MeeshyAudioTrimmer.swift",
    ]

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    private func swiftSources() -> [URL] {
        let root = repoRoot()
        let roots = [
            root.appendingPathComponent("apps/ios/Meeshy"),
            root.appendingPathComponent("packages/MeeshySDK/Sources"),
        ]
        var found: [URL] = []
        for dir in roots {
            guard let walker = FileManager.default.enumerator(
                at: dir, includingPropertiesForKeys: nil
            ) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                found.append(url)
            }
        }
        return found
    }

    /// Retire les commentaires avant d'inspecter : ce fichier-ci, et les
    /// commentaires qui documentent la règle, citent forcément le motif banni.
    /// Délégué au stripper PARTAGÉ — l'ancienne coupe au premier `//` ignorait
    /// les littéraux : une URL `https://…` tronquait la ligne inspectée.
    private func strippingComments(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
    }

    // MARK: - Chevrons

    func test_aucunChevronNomméParUnCôtéPhysique() {
        var offenders: [String] = []
        for url in swiftSources() where !Self.directionalByDesign.contains(url.lastPathComponent) {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let code = strippingComments(raw)
            // La chaîne complète entre guillemets : l'icône « code »
            // `chevron.left.forwardslash.chevron.right` n'est pas visée, son
            // guillemet fermant ne suit pas `left`.
            for banned in ["\"chevron.left\"", "\"chevron.right\""] where code.contains(banned) {
                offenders.append("\(url.lastPathComponent) → \(banned)")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Ces symboles pointent vers un côté physique et ne se retournent pas \
            en arabe. Utiliser "chevron.forward" / "chevron.backward", ou inscrire \
            le fichier dans `directionalByDesign` si le chevron décrit une \
            timeline ou une géométrie :
            \(offenders.joined(separator: "\n"))
            """
        )
    }

    /// **Une exemption qu'aucun témoin ne nomme se lit comme un oubli.** Le
    /// trimmer est entré dans `directionalByDesign` pour UN motif précis — ses
    /// poignées hors champ. Le jour où ce motif disparaît (poignées toujours
    /// dans le champ, ou symbole remplacé), l'exemption doit partir avec lui :
    /// sinon un `chevron.right` de NAVIGATION ajouté plus tard dans ce fichier
    /// passerait la garde en silence.
    func test_lExemptionDuTrimmer_couvreUnChevronQuiExisteEncore() throws {
        let trimmer = try XCTUnwrap(
            swiftSources().first { $0.lastPathComponent == "MeeshyAudioTrimmer.swift" },
            "`MeeshyAudioTrimmer.swift` a disparu du balayage : retirer son exemption de `directionalByDesign`"
        )
        let code = strippingComments(try String(contentsOf: trimmer, encoding: .utf8))
        XCTAssertTrue(
            code.contains("\"chevron.left\"") && code.contains("\"chevron.right\""),
            "Le trimmer ne porte plus ses chevrons de poignée : l'exemption n'a plus d'objet, la retirer"
        )
    }

    // MARK: - Flèches

    func test_aucuneFlècheDeNavigationNomméeParUnCôtéPhysique() {
        var offenders: [String] = []
        for url in swiftSources() where !Self.directionalByDesign.contains(url.lastPathComponent) {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let code = strippingComments(raw)
            for banned in ["\"arrow.left\"", "\"arrow.right\"",
                           "\"arrow.right.circle\"", "\"arrow.right.circle.fill\"",
                           "\"arrow.left.circle\"", "\"arrow.left.circle.fill\"",
                           "\"arrow.right.square.fill\"", "\"arrow.left.square.fill\""]
            where code.contains(banned) {
                offenders.append("\(url.lastPathComponent) → \(banned)")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Flèches de navigation nommées par un côté physique. Utiliser la \
            variante `forward` / `backward`, ou inscrire le fichier dans \
            `directionalByDesign` si la flèche décrit une timeline ou une \
            géométrie :
            \(offenders.joined(separator: "\n"))
            """
        )
    }

    // MARK: - La garde se garde elle-même

    /// Si le dépouillement des commentaires cassait, les deux tests ci-dessus
    /// passeraient au vert pour la mauvaise raison : ils n'inspecteraient plus
    /// rien. On vérifie donc qu'ils voient bel et bien du code.
    func test_leBalayageVoitVraimentLesSources() {
        let sources = swiftSources()
        XCTAssertGreaterThan(sources.count, 400, "Le balayage ne trouve presque aucun fichier Swift")

        let withForward = sources.filter {
            guard let raw = try? String(contentsOf: $0, encoding: .utf8) else { return false }
            return strippingComments(raw).contains("\"chevron.forward\"")
        }
        XCTAssertGreaterThan(
            withForward.count, 20,
            "Aucun chevron sémantique détecté — le dépouillement des commentaires mange le code"
        )
    }

    func test_leDépouillementDesCommentairesNeMangePasLeCode() {
        let sample = """
        // "chevron.right" dans un commentaire de ligne
        let a = "chevron.forward"
        /* "chevron.left" dans un bloc */
        let b = "chevron.backward"
        /*
           "chevron.right" sur
           plusieurs lignes
        */
        let c = 1
        """
        let stripped = strippingComments(sample)
        XCTAssertFalse(stripped.contains("chevron.right"), "Un commentaire a survécu")
        XCTAssertFalse(stripped.contains("chevron.left"), "Un bloc de commentaire a survécu")
        XCTAssertTrue(stripped.contains("\"chevron.forward\""), "Le code a été mangé")
        XCTAssertTrue(stripped.contains("\"chevron.backward\""), "Le code après un bloc a été mangé")
        XCTAssertTrue(stripped.contains("let c = 1"), "Le code après un bloc multiligne a été mangé")
    }
}
