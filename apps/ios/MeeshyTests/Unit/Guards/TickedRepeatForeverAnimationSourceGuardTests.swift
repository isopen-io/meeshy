import XCTest
@testable import Meeshy

/// Une animation qui NE FINIT JAMAIS ne doit pas être RÉARMÉE par un tick.
///
/// `.animation(.someCurve.repeatForever(…), value: X)` déclare : « chaque fois
/// que `X` change, démarre une animation sans fin ». Quand `X` est un compteur
/// avancé par un `Timer` — c'est le cas de `SyncPill.dotPhase`, +1 toutes les
/// 0,5 s — l'animation précédente n'est jamais arrivée à son terme (elle n'en a
/// pas) : SwiftUI ne la remplace pas, il la COMBINE avec la nouvelle. Le jeu
/// d'animations concurrentes portées par l'attribut grandit donc de deux
/// entrées par seconde, indéfiniment, et chacune est réévaluée à CHAQUE frame
/// (jusqu'à 120 Hz sur un écran ProMotion).
///
/// Le coût ne se voit pas à l'ouverture de l'écran : il CROÎT avec le temps
/// passé dessus. C'est la signature exacte du défaut rapporté le 2026-08-27
/// (« quand une conversation reste ouverte longtemps l'appareil chauffe ») et
/// celle relevée au Time Profiler sur appareil (iPhone 16 Pro Max, iOS 26.6,
/// #3940) : 68 % du CPU de l'app sur le fil `com.apple.SwiftUI.AsyncRenderer`,
/// intégralement dans `DefaultCombiningAnimation.animate`, avec un
/// `_ArrayBuffer._consumeAndCreateNew(growForAppend:)` à chaque frame — la
/// liste combinée qui s'allonge.
///
/// La répétition d'un pouls piloté par un timer vient DÉJÀ du timer : la courbe
/// n'a qu'à porter UNE transition, bornée. `repeatForever` y est à la fois
/// inutile et nuisible.
///
/// Deux gardes, indissociables — la négative seule mourrait en silence si
/// quelqu'un supprimait purement et simplement l'animation (leçon
/// `reference_negative_source_guards_die_silently`) :
/// 1. le pouls de `SyncPill` est TOUJOURS animé (positive) ;
/// 2. aucune animation réarmée par une valeur avancée dans une closure de tick
///    n'est `repeatForever` (négative, à l'échelle de toute l'app).
final class TickedRepeatForeverAnimationSourceGuardTests: XCTestCase {

    // MARK: - Racine des sources de l'app

    private static var appSourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Guards
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static func swiftFiles() -> [URL] {
        guard let walker = FileManager.default.enumerator(
            at: appSourcesRoot,
            includingPropertiesForKeys: nil
        ) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    // MARK: - 1. Le pouls de SyncPill reste ANIMÉ

    private func syncPillLines() throws -> [String] {
        let url = Self.appSourcesRoot
            .appendingPathComponent("Features/Main/Components/SyncPill.swift")
        return AppSourceGuard.strippedLines(try String(contentsOf: url, encoding: .utf8))
    }

    func test_syncPillDotPulse_staysAnimated() throws {
        let animated = try syncPillLines().filter {
            $0.contains(".animation(") && $0.contains("value: dotPhase")
        }
        XCTAssertFalse(
            animated.isEmpty,
            """
            Le pouls de la pastille de SyncPill doit rester ANIMÉ : une transition \
            keyée sur `dotPhase`. Retirer l'animation pour satisfaire la garde \
            négative ci-dessous supprimerait un effet visuel voulu — ce que la \
            garde positive interdit.
            """
        )
    }

    func test_syncPillDotPulse_isNeverRepeatForever() throws {
        let offenders = try syncPillLines().filter {
            $0.contains("value: dotPhase") && $0.contains("repeatForever")
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            `dotPhase` est avancé toutes les 0,5 s par `dotTimer` : une courbe \
            `repeatForever` y démarre une animation sans fin par tick, que \
            SwiftUI COMBINE aux précédentes au lieu de les remplacer. Le coût \
            par frame croît sans borne tant que la pill est à l'écran (#3940). \
            Lignes fautives : \(offenders.map { $0.trimmingCharacters(in: .whitespaces) })
            """
        )
    }

    // MARK: - 2. Aucune animation sans fin réarmée par un tick, dans TOUTE l'app

    /// Identifiants mutés à l'intérieur d'une closure de tick (`.onReceive(`,
    /// `.sink {`, `Timer.scheduledTimer`) — fenêtre de 8 lignes après
    /// l'ouverture, ce qui couvre les corps courts de ces closures sans
    /// remonter la portée du fichier entier.
    private static func tickedIdentifiers(in lines: [String]) -> Set<String> {
        let tickOpeners = [".onReceive(", "Timer.scheduledTimer", "Timer.publish", ".sink {", ".sink("]
        var identifiers: Set<String> = []
        for (index, line) in lines.enumerated() {
            guard tickOpeners.contains(where: { line.contains($0) }) else { continue }
            for offset in 0...8 where index + offset < lines.count {
                let body = lines[index + offset]
                if let name = mutatedIdentifier(in: body) { identifiers.insert(name) }
            }
        }
        return identifiers
    }

    /// `X += 1` / `X = …` en tête d'instruction ⇒ `X`. Volontairement étroit :
    /// une garde de source doit rater plutôt que crier à tort.
    private static func mutatedIdentifier(in line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        for op in [" += ", " -= ", " = "] {
            guard let range = trimmed.range(of: op) else { continue }
            let head = String(trimmed[trimmed.startIndex..<range.lowerBound])
            guard !head.isEmpty,
                  head.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" }),
                  let first = head.first, first.isLetter || first == "_"
            else { continue }
            return head
        }
        return nil
    }

    func test_noNeverEndingAnimationIsRearmedByATickedValue() {
        var offenders: [String] = []

        for url in Self.swiftFiles() {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            guard raw.contains("repeatForever") else { continue }
            let lines = AppSourceGuard.strippedLines(raw)
            let ticked = Self.tickedIdentifiers(in: lines)
            guard !ticked.isEmpty else { continue }

            for line in lines where line.contains("repeatForever") {
                for name in ticked where line.contains("value: \(name)") {
                    offenders.append("\(url.lastPathComponent): \(line.trimmingCharacters(in: .whitespaces))")
                }
            }
        }

        XCTAssertTrue(
            offenders.isEmpty,
            """
            Une animation `repeatForever` réarmée par une valeur avancée dans une \
            closure de tick s'accumule : SwiftUI combine les animations \
            concurrentes d'un même attribut, et aucune ne se retire jamais. Le \
            CPU par frame croît alors avec le temps passé sur l'écran (#3940). \
            Piloter la répétition par le timer et borner la courbe. \
            Sites : \(offenders)
            """
        )
    }
}
