import XCTest
@testable import Meeshy

/// **Un offset de défilement passe par le RELAIS, jamais par un `@State` de la
/// racine de l'écran** (#6226).
///
/// `ScrollOffsetRelay` a été écrit pour ce cas précis, sur la foi de traces
/// d'appareil et de terminaisons `0x8BADF00D` : un `@State CGFloat` écrit
/// depuis le callback de défilement ré-exécute le body COMPLET de la racine à
/// la cadence de l'affichage — liste entière reconstruite, closures par rangée
/// rebâties, diff `Equatable` rejoué, 60 à 120 fois par seconde. Le relais
/// transporte la même valeur sans que la racine s'y abonne : seul l'en-tête,
/// qui DESSINE l'offset, se re-rend.
///
/// **L'inventaire est DÉRIVÉ, jamais recopié.** Une liste d'écrans écrite à la
/// main exempterait en silence le prochain écran à en-tête repliable — c'est
/// la régression que la purge des caches a payée (#7146) : trois listes
/// manuelles, deux magasins oubliés. La garde balaie donc les sources et
/// retient elle-même les écrans qui publient un offset.
///
/// **Elle juge sur ce que le callback ÉCRIT, pas sur un nom de variable.** Un
/// premier jet lisait les déclarations `@State … CGFloat … offset` et
/// accusait `dragOffsetY` / `previewEmergeOffset` — des offsets de GESTE, sur
/// l'écran qui est précisément le modèle de la loi. Un critère qui reconnaît
/// par le nom ne distingue pas deux choses qui portent le même mot.
final class ScrollOffsetRelayAdoptionSourceGuardTests: XCTestCase {

    private func appSourcesRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func appSources() throws -> [(name: String, code: String)] {
        guard let walker = FileManager.default.enumerator(
            at: appSourcesRoot(),
            includingPropertiesForKeys: nil
        ) else { return [] }

        var sources: [(String, String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            sources.append((url.lastPathComponent, AppSourceGuard.stripComments(raw)))
        }
        return sources.sorted { $0.0 < $1.0 }
    }

    /// Les cibles écrites depuis un callback de défilement APPELÉ.
    ///
    /// `onScrollOffsetChange: (CGFloat) -> Void` est une DÉCLARATION de
    /// paramètre — les huit onglets du centre de contacts ne font que faire
    /// suivre le callback de leur hôte, ils ne produisent rien. Seul le site
    /// d'appel (`onScrollOffsetChange: {`) crée la cadence, et c'est lui seul
    /// que cette garde juge.
    private func scrollCallbackAssignments(in code: String) -> [String] {
        var targets: [String] = []
        var cursor = code.startIndex
        while let hit = code.range(of: "onScrollOffsetChange", range: cursor..<code.endIndex) {
            cursor = hit.upperBound
            let tail = code[hit.upperBound...].prefix(200)
            // Site d'APPEL seulement : `onScrollOffsetChange:` suivi d'une closure.
            guard let colon = tail.firstIndex(of: ":"),
                  let brace = tail.firstIndex(of: "{"),
                  colon < brace,
                  tail[tail.index(after: colon)..<brace].allSatisfy({ $0.isWhitespace })
            else { continue }

            let body = tail[brace...]
            guard let equals = body.firstIndex(of: "=") else { continue }
            let target = body[body.startIndex..<equals]
                .split(whereSeparator: { $0.isWhitespace || $0 == "{" || $0 == "}" })
                .last
                .map(String.init)
            if let target, !target.isEmpty, target != "in" {
                targets.append(target)
            }
        }
        return targets
    }

    func test_everyScrollCallbackWritesIntoARelay() throws {
        var judged = 0

        for source in try appSources() {
            for target in scrollCallbackAssignments(in: source.code) {
                judged += 1
                XCTAssertTrue(
                    target.hasSuffix(".offset"),
                    """
                    `\(source.name)` écrit son offset de défilement dans \
                    `\(target)` : chaque tick de défilement ré-exécute le body \
                    ENTIER de cette racine. La valeur passe par \
                    `ScrollOffsetRelay` — `@State private var scrollRelay = \
                    ScrollOffsetRelay()`, écrit depuis `onScrollOffsetChange`, \
                    lu par `ScrollOffsetReader` (#6226).
                    """
                )
            }
        }

        XCTAssertGreaterThan(
            judged, 0,
            "Aucun callback de défilement n'a été jugé : la garde ne mesure plus rien (balayage ou motif cassé ?)."
        )
    }

    /// **Le pendant : ce que la racine cesse d'observer, quelqu'un plus bas
    /// doit encore le lire.**
    ///
    /// Un écran qui DÉCLARE un relais doit le donner à lire — sinon l'en-tête
    /// cesse de se replier et le correctif a coûté une fonctionnalité. Les
    /// écrans qui REÇOIVENT le relais de leur hôte n'ont rien à monter : c'est
    /// l'hôte qui porte le lecteur.
    func test_everyScreenOwningARelayGivesItToARenderer() throws {
        var judged = 0

        for source in try appSources() where source.code.contains("= ScrollOffsetRelay()") {
            judged += 1
            XCTAssertTrue(
                source.code.contains("ScrollOffsetReader(relay:")
                    || source.code.contains("scrollRelay: scrollRelay")
                    || source.code.contains("scrollRelay: scrollOffsetRelay"),
                """
                `\(source.name)` détient un relais d'offset mais ne le donne à \
                lire à personne : la valeur voyage et n'atteint aucun pixel, \
                l'en-tête cesse de se replier. Monter `ScrollOffsetReader(relay:)` \
                autour de l'en-tête, ou passer le relais à son type nominal en \
                `@ObservedObject` (#6226).
                """
            )
        }

        XCTAssertGreaterThan(
            judged, 0,
            "Aucun détenteur de relais n'a été trouvé : la garde ne mesure plus rien."
        )
    }
}
