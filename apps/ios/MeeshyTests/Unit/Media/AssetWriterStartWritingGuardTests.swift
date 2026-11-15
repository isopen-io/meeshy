import XCTest

/// **Un export vidéo qui ne peut pas commencer doit le DIRE, pas planter**
/// (audit iOS du 2026-09-18, issue #7004).
///
/// `AVAssetWriter.startWriting()` rend un `Bool`. Quand il rend `false` — disque
/// plein, `outputURL` déjà occupé (`AVErrorFileAlreadyExists`), réglages
/// refusés par l'encodeur —, le writer reste en `.unknown` et l'appel suivant,
/// `startSession(atSourceTime:)`, lève un `NSInternalInconsistencyException` :
///
/// ```
/// *** Terminating app due to uncaught exception 'NSInternalInconsistencyException',
/// reason: '*** -[AVAssetWriter startSessionAtSourceTime:]
/// Cannot call method when status is 0'
/// ```
///
/// Une exception Objective-C ne se rattrape pas en Swift. La seule protection
/// est de ne jamais atteindre `startSession` après un `startWriting` refusé —
/// c'est-à-dire un `guard` DEVANT l'appel, pas un `do/catch` autour.
///
/// ## Pourquoi une garde de SOURCE
///
/// Le dépôt comptait QUATRE écrivains et **une seule** règle : `StoryExporter`
/// écrivait déjà `guard writer.startWriting() else { throw }` à ses deux sites,
/// pendant que `MediaCompressor`, `StoryExportIntro` et `StoryExportOutro`
/// jetaient le booléen. Trois sites hors d'une règle que le quatrième
/// appliquait : le défaut n'est pas dans un fichier oublié, il est dans la
/// DISPERSION. Une garde qui interroge un site ne l'aurait pas vu ; celle-ci
/// balaie les deux arbres de sources du dépôt et compte.
///
/// > Provoquer un `startWriting` refusé en test demanderait de remplir le
/// > disque ou de gagner une course sur un chemin temporaire nommé par UUID.
/// > La forme du code est ici la seule preuve atteignable — et c'est aussi la
/// > seule qui se défende toute seule contre le CINQUIÈME écrivain.
final class AssetWriterStartWritingGuardTests: XCTestCase {

    private func repositoryRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .deletingLastPathComponent()   // apps/
            .deletingLastPathComponent()   // racine du dépôt
    }

    /// Les deux arbres de SOURCES écrits à la main. Les répertoires de tests
    /// en sont exclus : un test a le droit d'appeler `startWriting()` sans
    /// garde pour fabriquer sa fixture — c'est du code de banc, pas du code
    /// qui part chez l'utilisateur.
    private func sourceFiles() -> [URL] {
        let racine = repositoryRoot()
        let arbres = [
            racine.appendingPathComponent("apps/ios/Meeshy"),
            racine.appendingPathComponent("apps/ios/MeeshyNotificationExtension"),
            racine.appendingPathComponent("apps/ios/MeeshyShareExtension"),
            racine.appendingPathComponent("packages/MeeshySDK/Sources")
        ]
        return arbres.flatMap { arbre -> [URL] in
            guard let marcheur = FileManager.default.enumerator(
                at: arbre, includingPropertiesForKeys: nil) else { return [] }
            return marcheur.compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" }
                .filter { !$0.lastPathComponent.hasSuffix("Tests.swift") }
        }
    }

    /// **Tout `startWriting()` du dépôt est sous `guard`.** Le message d'échec
    /// nomme le fichier ET la ligne : un cinquième écrivain doit pouvoir être
    /// corrigé sans relire les quatre autres.
    func test_toutStartWriting_estSousGuard() throws {
        var horsRegle: [String] = []
        var sites = 0
        for fichier in sourceFiles() {
            guard let contenu = try? String(contentsOf: fichier, encoding: .utf8),
                  contenu.contains("startWriting()") else { continue }
            for (index, ligne) in contenu.components(separatedBy: .newlines).enumerated() {
                let nue = ligne.trimmingCharacters(in: .whitespaces)
                guard nue.contains("startWriting()"), !nue.hasPrefix("//") else { continue }
                sites += 1
                if !nue.hasPrefix("guard ") {
                    horsRegle.append("\(fichier.lastPathComponent):\(index + 1) → \(nue)")
                }
            }
        }
        XCTAssertGreaterThanOrEqual(sites, 4,
            "La garde ne trouve plus les écrivains qu'elle surveille — un chemin d'arbre a bougé.")
        XCTAssertTrue(horsRegle.isEmpty,
            "startSession après un startWriting refusé lève une exception ObjC irrattrapable. "
            + "Écrire `guard writer.startWriting() else { throw … }` à ces sites :\n"
            + horsRegle.joined(separator: "\n"))
    }

    /// **Un writer n'écrit jamais par-dessus un fichier existant.**
    /// `AVAssetWriter` ne remplace pas : il refuse (`AVErrorFileAlreadyExists`),
    /// et c'est ce refus qui menait au `startSession` fatal. `StoryExporter`
    /// pré-efface depuis toujours ; `MediaCompressor` composait un chemin
    /// temporaire et partait écrire sans regarder.
    func test_mediaCompressor_preEffaceSaSortie() throws {
        let source = try String(
            contentsOf: repositoryRoot().appendingPathComponent(
                "apps/ios/Meeshy/Features/Main/Services/MediaCompressor.swift"),
            encoding: .utf8)
        guard let creation = source.range(of: "AVAssetWriter(outputURL: outputURL") else {
            return XCTFail("MediaCompressor ne crée plus son writer sur `outputURL`.")
        }
        let amont = String(source[source.startIndex..<creation.lowerBound])
        XCTAssertTrue(amont.contains("removeItem(at: outputURL)"),
            "Le chemin de sortie doit être libéré AVANT que le writer ne s'y accroche.")
    }
}
