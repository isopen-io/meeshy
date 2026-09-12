import XCTest

/// **UN LECTEUR EN BOUCLE NE MAINTIENT PAS L'ÉCRAN ALLUMÉ** (#6221, volet énergie).
///
/// ## Ce que ce témoin interdit, et qui était livré
///
/// `AVPlayer.preventsDisplaySleepDuringVideoPlayback` vaut **`true` par
/// défaut**. Six lecteurs de ce dépôt jouent en BOUCLE ; deux seulement le
/// remettaient à `false`. Les quatre autres empêchaient l'écran de s'éteindre
/// tant qu'ils étaient montés — dont `_LoopingRenderer`
/// (`MeeshyVideoPlayer+Renderers.swift`), instancié pour **chaque** vignette
/// vidéo de chaque bulle, carte de feed, commentaire et rangée Focal.
///
/// Une vignette muette qui boucle indéfiniment n'est pas un contenu qu'on
/// regarde : c'est un décor. Le défaut ne se voit sur aucun profil — l'app est
/// simplement ouverte, et le téléphone ne dort jamais.
///
/// ## Pourquoi la règle porte sur la BOUCLE, pas sur le mute
///
/// Le mute décrit une préférence d'écoute, qui change en cours de lecture et
/// n'a rien à dire de l'attention. **La boucle, elle, est structurelle** : rien
/// de ce qu'on regarde jusqu'au bout ne se rejoue à l'infini. `AVPlayerLooper`
/// est donc le signe le plus sûr d'un lecteur décoratif, et c'est lui qu'on
/// interroge.
///
/// ## Pourquoi un témoin de SOURCE
///
/// Le comportement gardé est une propriété d'`AVPlayer` sous UIKit, sans
/// surface observable en test unitaire. Ce dispositif est celui que
/// `CallManagerAudioSessionTests` emploie déjà pour `isIdleTimerDisabled` — la
/// même famille de réglage système, gardée de la même façon.
final class LoopingPlayersDoNotHoldTheScreenAwakeTests: XCTestCase {

    /// Les fichiers qui construisent un `AVPlayerLooper` et qui peuvent, en
    /// conscience, garder l'écran allumé. Une liste d'exceptions SANS MOTIF
    /// redevient un tapis — chaque entrée porte le sien.
    private static let exemptes: [String: String] = [
        "StoryVideoPlayerView.swift":
            "la story en AVANT-PLAN, que l'utilisateur REGARDE. La boucle n'y " +
            "est pas décorative : elle comble une diapositive plus courte que " +
            "sa durée d'affichage. Couper la veille ici éteindrait l'écran au " +
            "milieu d'une story qu'on regarde sans y toucher.",
    ]

    private static let racines = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"]

    private func depot() throws -> URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }

    private func fichiersBouclants() throws -> [(nom: String, source: String)] {
        let racine = try depot()
        var trouves: [(String, String)] = []
        for sous in Self.racines {
            let base = racine.appendingPathComponent(sous)
            guard let it = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { continue }
            for cas in it {
                guard let f = cas as? URL, f.pathExtension == "swift" else { continue }
                guard let s = try? String(contentsOf: f, encoding: .utf8), s.contains("AVPlayerLooper(") else { continue }
                trouves.append((f.lastPathComponent, s))
            }
        }
        return trouves
    }

    /// LE TÉMOIN DE NON-VACUITÉ, d'abord : un balayage qui ne trouve plus aucun
    /// lecteur bouclant passerait au vert sans rien garder.
    func test_theSweepFindsLoopingPlayers() throws {
        XCTAssertGreaterThanOrEqual(try fichiersBouclantsCount(), 5,
            "le balayage ne trouve presque plus de lecteur en boucle — chemin de recherche cassé ?")
    }

    private func fichiersBouclantsCount() throws -> Int { try fichiersBouclants().count }

    func test_everyLoopingPlayerReleasesTheScreen() throws {
        var fautifs: [String] = []
        for (nom, source) in try fichiersBouclants() {
            if Self.exemptes[nom] != nil { continue }
            if !source.contains("preventsDisplaySleepDuringVideoPlayback = false") {
                fautifs.append(nom)
            }
        }
        XCTAssertTrue(
            fautifs.isEmpty,
            """
            Lecteurs en BOUCLE qui maintiennent l'écran allumé : \(fautifs.joined(separator: ", ")).
            `preventsDisplaySleepDuringVideoPlayback` vaut `true` par défaut — un \
            lecteur décoratif doit le remettre à `false`, sinon le téléphone ne \
            dort jamais tant que la vue est montée. Si ce lecteur est bien un \
            contenu REGARDÉ, inscrivez-le dans `exemptes` avec son motif.
            """
        )
    }

    /// Chaque exemption doit porter un motif — sinon la liste redevient un tapis.
    func test_everyExemptionCarriesItsReason() {
        for (nom, motif) in Self.exemptes {
            XCTAssertGreaterThan(motif.count, 40, "l'exemption de \(nom) n'explique rien")
        }
    }
}
