import XCTest
@testable import Meeshy

/// **Une vue CONSTRUITE et JETÉE ne rougit nulle part.**
///
/// Mesuré le 2026-08-31 sur `MeeshyComposerHost.sceneMentionStrip` : la
/// propriété rend `AnyView?`, son corps montait `ComposerMentionStrip` dans un
/// `if let`, et il manquait le `return`. Une expression nue n'est pas la valeur
/// d'un accesseur à corps MULTIPLE — le `return nil` du bas gagnait toujours.
/// La bande de suggestions `@` du texte de scène, livrée la veille par
/// `bb3f3deafb` avec ses témoins, **n'a jamais pu paraître sur aucun chemin**.
///
/// Ce qui rend ce défaut coûteux, c'est qu'il est SILENCIEUX de trois façons :
/// - le build est vert (c'est un avertissement, noyé parmi des centaines) ;
/// - les tests de la feature passent (ils éprouvent le contrôleur, la requête,
///   les suggestions — tout ce qui alimente la bande, jamais son montage) ;
/// - l'écran a l'air correct, puisqu'une bande absente ressemble à une bande
///   qui n'a rien à dire (loi 8 : le prisme n'affiche que le nécessaire).
///
/// > **La question qu'un témoin de feature ne pose jamais est « la vue que je
/// > viens de nourrir est-elle MONTÉE ? »** — c'est la loi 8 de `BOUCLE.md`
/// > (« un effet déclaré doit être monté ») portée du canvas aux accesseurs de
/// > vue optionnelle.
///
/// La garde est SYNTAXIQUE et c'est voulu : elle n'a pas besoin de savoir ce
/// que la vue fait, seulement qu'on ne la laisse pas tomber.
final class OptionalViewReturnGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func swiftFiles(under root: URL) -> [URL] {
        guard let walker = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Les accesseurs `var … : AnyView? {` du fichier, rendus ligne à ligne.
    ///
    /// Le découpage compte les accolades depuis l'ouverture de l'accesseur —
    /// une recherche par expression régulière sur tout le fichier attraperait
    /// des `AnyView(` d'accesseurs voisins, et une garde qui accuse un site
    /// innocent se fait désactiver plutôt que corriger.
    private func optionalViewAccessorBodies(in source: String) -> [(name: String, lines: [String])] {
        let lignes = AppSourceGuard.strippedLines(source)
        var trouvees: [(String, [String])] = []
        var index = 0
        while index < lignes.count {
            let ligne = lignes[index]
            guard ligne.contains(": AnyView?"),
                  ligne.contains("var "),
                  ligne.hasSuffix("{") else { index += 1; continue }
            let nom = ligne
                .components(separatedBy: "var ").last?
                .components(separatedBy: ":").first?
                .trimmingCharacters(in: .whitespaces) ?? "?"
            var profondeur = 0
            var corps: [String] = []
            var curseur = index
            repeat {
                let courante = lignes[curseur]
                profondeur += courante.filter { $0 == "{" }.count
                profondeur -= courante.filter { $0 == "}" }.count
                if curseur > index { corps.append(courante) }
                curseur += 1
            } while curseur < lignes.count && profondeur > 0
            trouvees.append((nom, corps))
            index = curseur
        }
        return trouvees
    }

    func test_aucuneVueOptionnelle_nEstConstruiteSansEtreRendue() throws {
        var fautifs: [String] = []
        for fichier in swiftFiles(under: appRoot) {
            guard let brut = try? String(contentsOf: fichier, encoding: .utf8),
                  brut.contains(": AnyView?") else { continue }
            for accesseur in optionalViewAccessorBodies(in: brut) {
                for ligne in accesseur.lines {
                    let nue = ligne.trimmingCharacters(in: .whitespaces)
                    guard nue.hasPrefix("AnyView(") else { continue }
                    fautifs.append("\(fichier.lastPathComponent) — \(accesseur.name) : \(nue)")
                }
            }
        }
        XCTAssertTrue(
            fautifs.isEmpty,
            "Ces accesseurs `AnyView?` MONTENT une vue puis la JETTENT : dans un "
            + "accesseur à corps multiple, une expression nue n'est pas la valeur "
            + "rendue, et le `return nil` du bas gagne. Écrire `return AnyView(…)` :\n"
            + fautifs.sorted().joined(separator: "\n"))
    }

    /// **Le fusible.** Une garde qui ne trouverait plus AUCUN accesseur
    /// `AnyView?` — parce que le motif a changé de forme, parce que la racine
    /// est fausse, parce que le découpage de blocs échoue — passerait le témoin
    /// ci-dessus en ne regardant rien. Celui-ci mesure sa POPULATION.
    func test_laGardeRegardeBienDesAccesseurs() throws {
        var accesseurs = 0
        var avecRetour = 0
        for fichier in swiftFiles(under: appRoot) {
            guard let brut = try? String(contentsOf: fichier, encoding: .utf8),
                  brut.contains(": AnyView?") else { continue }
            for accesseur in optionalViewAccessorBodies(in: brut) {
                accesseurs += 1
                if accesseur.lines.contains(where: {
                    $0.trimmingCharacters(in: .whitespaces).hasPrefix("return AnyView(")
                }) { avecRetour += 1 }
            }
        }
        XCTAssertGreaterThanOrEqual(accesseurs, 1,
                                    "aucun accesseur `AnyView?` trouvé — la garde ne garde rien")
        XCTAssertGreaterThanOrEqual(
            avecRetour, 1,
            "aucun `return AnyView(` reconnu : le découpage de blocs ne rend pas "
            + "les corps, donc le témoin principal ne pourrait jamais rougir")
    }
}
