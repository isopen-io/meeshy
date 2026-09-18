import XCTest
import Combine
@testable import Meeshy

/// **Une remise à zéro média qui republie un état inchangé est un bug de
/// fluidité** (#7005, suite de #6977).
///
/// `@Published` publie sur `willSet` — valeur changée ou non. Un `stop()`, un
/// `reset()`, un `cleanup()` ou un `teardown()` qui ré-assigne ses propriétés
/// sans les comparer émet donc un `objectWillChange` par propriété, à chaque
/// appel, même quand rien ne change.
///
/// Ce n'est pas une élégance. Mesuré au simulateur le 2026-09-18 sur le défaut
/// jumeau (#6977) : `PlaybackCoordinator.willStartPlaying` appelle `stop()` sur
/// TOUS les lecteurs enregistrés depuis le `makeUIView` de chaque canvas de
/// scène — 81 canvas × 3 publications pendant un seul défilement, « Publishing
/// changes from within view updates », et le fil resté VIERGE jusqu'à cinq
/// secondes après l'arrêt du geste.
///
/// ## Pourquoi un INVENTAIRE, et pas un balayage
///
/// « Tout `ObservableObject` du dépôt » attraperait des dizaines de modèles de
/// vue dont la remise à zéro n'est jamais atteinte depuis une mise à jour de
/// vue — la garde rougirait pour du bruit et finirait désactivée. L'inventaire
/// nomme les LECTEURS média, ceux dont la remise à zéro est appelée depuis un
/// cycle de vie de vue, et il se maintient tout seul sur un point : les
/// propriétés surveillées sont LUES dans le fichier (`@Published … var`), pas
/// recopiées ici. Ajouter un `@Published` à un de ces lecteurs le met sous
/// garde sans qu'on y pense.
///
/// Le cinquième lecteur, lui, s'ajoute à la main — et c'est le prix assumé
/// d'une garde d'inventaire.
final class MediaResetIdempotenceGuardTests: XCTestCase {

    /// `(chemin depuis la racine du dépôt, nom de la remise à zéro)`.
    /// Les deux premiers sont les corrigés de #6977, les trois suivants ceux de
    /// #7005 — la garde existe pour que le sixième naisse gardé.
    private static let inventaire: [(chemin: String, fonction: String)] = [
        ("packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift", "resetState"),
        ("packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift", "cleanup"),
        ("packages/MeeshySDK/Sources/MeeshyUI/Media/AudioTrimPreviewPlayer.swift", "stop"),
        ("packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVideoPlayerView.swift", "teardown"),
        ("apps/ios/Meeshy/Features/Main/Components/OverlayAudioPlayer.swift", "stop")
    ]

    private var racine: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .deletingLastPathComponent()   // apps/
            .deletingLastPathComponent()   // racine du dépôt
    }

    // MARK: - La garde d'inventaire

    func test_touteRemiseAZeroMedia_estGardee() throws {
        var fautes: [String] = []
        for entree in Self.inventaire {
            let url = racine.appendingPathComponent(entree.chemin)
            let source = try String(contentsOf: url, encoding: .utf8)
            let publiees = Self.proprietesPubliees(dans: source)
            XCTAssertFalse(publiees.isEmpty,
                           "\(entree.chemin) n'a plus aucun `@Published` — l'inventaire a dérivé.")
            guard let corps = Self.corps(deLaFonction: entree.fonction, dans: source) else {
                XCTFail("`\(entree.fonction)()` introuvable dans \(entree.chemin) — "
                        + "la remise à zéro a été renommée ou déplacée : suivre l'hôte.")
                continue
            }
            for ligne in corps.components(separatedBy: .newlines) {
                let nue = ligne.trimmingCharacters(in: .whitespaces)
                guard !nue.hasPrefix("//") else { continue }
                for propriete in publiees where Self.affecte(nue, propriete: propriete) {
                    if !nue.hasPrefix("if ") {
                        fautes.append("\(entree.chemin) · \(entree.fonction)() → \(nue)")
                    }
                }
            }
        }
        XCTAssertTrue(fautes.isEmpty,
            "`@Published` publie sur `willSet`, valeur changée ou non : une remise à zéro "
            + "atteinte depuis un cycle de vie de vue doit comparer avant d'assigner "
            + "(`if x != valeur { x = valeur }`), sinon elle republie un état inchangé et "
            + "SwiftUI abandonne ses rendus (#6977, #7005) :\n"
            + fautes.joined(separator: "\n"))
    }

    /// Sans elle, la garde passerait au vert en ne lisant rien — le mode de
    /// panne d'une garde de source dont un chemin a bougé.
    func test_laGardeLitBienSesCinqLecteurs() throws {
        XCTAssertGreaterThanOrEqual(Self.inventaire.count, 5)
        for entree in Self.inventaire {
            let url = racine.appendingPathComponent(entree.chemin)
            let source = try? String(contentsOf: url, encoding: .utf8)
            XCTAssertNotNil(source, "introuvable sur disque : \(entree.chemin)")
            XCTAssertNotNil(Self.corps(deLaFonction: entree.fonction, dans: source ?? ""),
                            "corps introuvable : \(entree.chemin) · \(entree.fonction)()")
        }
    }

    // MARK: - Le comportement, là où il est atteignable

    /// **`OverlayAudioPlayer.stop()` sur un lecteur jamais démarré n'émet
    /// rien.** Ce lecteur était `private` au fond de `MessageOverlayMenu.swift`
    /// — donc hors de portée de tout témoin. Son extraction (#7005) est ce qui
    /// rend cette mesure possible ; la garde de source ci-dessus couvre les
    /// quatre autres, qui vivent dans le SDK (témoins SwiftPM :
    /// `MediaResetIdempotenceTests`).
    @MainActor
    func test_stop_surUnLecteurJamaisDemarre_nePublieRien() {
        let player = OverlayAudioPlayer()
        var emissions = 0
        let abonnement = player.objectWillChange.sink { _ in emissions += 1 }
        defer { abonnement.cancel() }

        player.stop()

        XCTAssertEqual(emissions, 0)
        XCTAssertFalse(player.isPlaying)
        XCTAssertFalse(player.isLoading)
        XCTAssertEqual(player.progress, 0)
        XCTAssertEqual(player.currentTime, 0)
        XCTAssertEqual(player.duration, 0)
    }

    @MainActor
    func test_unSecondStop_nePublieRienNonPlus() {
        let player = OverlayAudioPlayer()
        player.stop()
        var emissions = 0
        let abonnement = player.objectWillChange.sink { _ in emissions += 1 }
        defer { abonnement.cancel() }

        player.stop()

        XCTAssertEqual(emissions, 0)
    }

    // MARK: - Lecture de source

    /// Les noms des `@Published` sont LUS dans le fichier : ajouter une
    /// propriété publiée à un lecteur inventorié la met sous garde sans qu'on
    /// pense à l'inscrire ici.
    private static func proprietesPubliees(dans source: String) -> [String] {
        source.components(separatedBy: .newlines).compactMap { declaration -> String? in
            guard declaration.contains("@Published"),
                  let apres = declaration.range(of: " var ") else { return nil }
            let nom = declaration[apres.upperBound...]
                .prefix { $0.isLetter || $0.isNumber || $0 == "_" }
            return nom.isEmpty ? nil : String(nom)
        }
    }

    /// Corps d'une fonction sans argument, par comptage d'accolades depuis sa
    /// première `{`.
    private static func corps(deLaFonction nom: String, dans source: String) -> String? {
        guard let entete = source.range(of: "func \(nom)() {") else { return nil }
        var profondeur = 0
        var index = source.index(before: entete.upperBound)
        let debut = source.index(after: index)
        while index < source.endIndex {
            if source[index] == "{" { profondeur += 1 }
            if source[index] == "}" {
                profondeur -= 1
                if profondeur == 0 { return String(source[debut..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    /// `x = …` mais ni `x == …`, ni `self.x` dans une autre portée, ni un nom
    /// dont `x` n'est qu'un suffixe (`isPlayingNow`).
    private static func affecte(_ ligne: String, propriete: String) -> Bool {
        var recherche = ligne.startIndex
        while let trouve = ligne.range(of: propriete, range: recherche..<ligne.endIndex) {
            recherche = trouve.upperBound
            if trouve.lowerBound > ligne.startIndex {
                let avant = ligne[ligne.index(before: trouve.lowerBound)]
                if avant.isLetter || avant.isNumber || avant == "_" || avant == "." { continue }
            }
            var suite = trouve.upperBound
            while suite < ligne.endIndex, ligne[suite] == " " { suite = ligne.index(after: suite) }
            guard suite < ligne.endIndex, ligne[suite] == "=" else { continue }
            let apres = ligne.index(after: suite)
            if apres < ligne.endIndex, ligne[apres] == "=" { continue }
            return true
        }
        return false
    }
}
