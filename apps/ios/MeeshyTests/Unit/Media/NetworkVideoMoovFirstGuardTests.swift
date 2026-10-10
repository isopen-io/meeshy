import XCTest

/// **Toute vidéo écrite pour partir se lit dès ses premiers octets** (#9871).
///
/// `AVAssetWriter` et `AVAssetExportSession` écrivent par défaut l'atome
/// `moov` (l'index du fichier) à la FIN. Tant que le transcodage serveur est
/// coupé, le fichier envoyé est le fichier servi : le lecteur du destinataire
/// doit alors tout télécharger, ou demander la queue, avant la première image.
/// `shouldOptimizeForNetworkUse = true` le pose en tête.
///
/// L'option n'était posée qu'à trois sites (le passthrough de
/// `MediaCompressor`, `StoryExporter`, `MeeshyVideoWatermarkBaker`) ; le
/// transcodage de `MediaCompressor`, la fusion des prises de `CameraModel` et
/// l'export du look du composer écrivaient `moov` en queue. Le défaut était
/// dans la DISPERSION : la garde balaie donc les arbres de sources et compte,
/// fichier par fichier, les écrivains et les options posées. Un nouvel
/// écrivain doit poser l'option ou se déclarer ci-dessous, avec sa raison.
final class NetworkVideoMoovFirstGuardTests: XCTestCase {

    private struct Exemption {
        let unflaggedSites: Int
        let reason: String
    }

    private let exemptions: [String: Exemption] = [
        "CameraModel+Fixture.swift": Exemption(
            unflaggedSites: 1, reason: "prise de démonstration DEBUG, jamais envoyée"),
        "StoryExporter+SyntheticTrack.swift": Exemption(
            unflaggedSites: 1, reason: "substrat intermédiaire, relu par StoryExporter qui pose l'option"),
        "CallScreenRecordingService.swift": Exemption(
            unflaggedSites: 1, reason: "fichier brut ReplayKit, remixé par CallScreenMixdown qui pose l'option"),
        "StoryExportIntro.swift": Exemption(
            unflaggedSites: 1, reason: "makeClip : clip intermédiaire, recomposé par l'export final"),
        "StoryExportOutro.swift": Exemption(
            unflaggedSites: 1, reason: "makeClip : clip intermédiaire, recomposé par l'export final"),
        "AudioSegmentExporter.swift": Exemption(
            unflaggedSites: 1, reason: "audio M4A, hors du périmètre vidéo"),
        "MeeshyAudioSignature.swift": Exemption(
            unflaggedSites: 1, reason: "audio M4A, hors du périmètre vidéo"),
        "AudioEditEngine.swift": Exemption(
            unflaggedSites: 1, reason: "audio M4A, hors du périmètre vidéo"),
    ]

    private func repositoryRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

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

    private func codeLines(of contenu: String) -> [String] {
        contenu.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") }
    }

    private func census() -> [String: (sites: Int, flags: Int)] {
        sourceFiles().reduce(into: [:]) { bilan, fichier in
            guard let contenu = try? String(contentsOf: fichier, encoding: .utf8),
                  contenu.contains("AVAssetWriter(") || contenu.contains("AVAssetExportSession(") else { return }
            let lignes = codeLines(of: contenu)
            let sites = lignes.filter { $0.contains("AVAssetWriter(") || $0.contains("AVAssetExportSession(") }.count
            let flags = lignes.filter { $0.contains("shouldOptimizeForNetworkUse = true") }.count
            guard sites > 0 else { return }
            bilan[fichier.lastPathComponent] = (sites, flags)
        }
    }

    func test_toutEcrivainVideo_poseMoovEnTete() {
        let bilan = census()
        XCTAssertGreaterThanOrEqual(bilan.count, 10,
            "La garde ne trouve plus les écrivains qu'elle surveille — un chemin d'arbre a bougé.")
        let horsRegle = bilan
            .filter { nom, compte in compte.sites - compte.flags > (exemptions[nom]?.unflaggedSites ?? 0) }
            .map { nom, compte in "\(nom) : \(compte.sites) écrivain(s), \(compte.flags) option(s) posée(s)" }
            .sorted()
        XCTAssertTrue(horsRegle.isEmpty,
            "Un fichier vidéo destiné au réseau doit poser `shouldOptimizeForNetworkUse = true` "
            + "(moov en tête), ou se déclarer intermédiaire dans `exemptions` avec sa raison :\n"
            + horsRegle.joined(separator: "\n"))
    }

    func test_lesSitesNommesParLIssue_posentLOption() {
        let bilan = census()
        for nom in ["MediaCompressor.swift", "CameraModel.swift", "ComposerLookVideoExporter.swift"] {
            guard let compte = bilan[nom] else {
                XCTFail("\(nom) n'écrit plus de vidéo : la garde doit être relue.")
                continue
            }
            XCTAssertEqual(compte.flags, compte.sites,
                "\(nom) : chaque écrivain doit poser shouldOptimizeForNetworkUse = true.")
        }
    }

    func test_uneExemptionNeSurvitPasASonEcrivain() {
        let bilan = census()
        let perimees = exemptions
            .filter { nom, exemption in
                guard let compte = bilan[nom] else { return true }
                return compte.sites - compte.flags < exemption.unflaggedSites
            }
            .map(\.key)
            .sorted()
        XCTAssertTrue(perimees.isEmpty,
            "Exemptions qui ne couvrent plus aucun écrivain sans option — à retirer : "
            + perimees.joined(separator: ", "))
    }
}
