import Testing
import Foundation
@testable import MeeshyUI

/// K09 en mode DÉCOMPTE (profil, planche Carte-Proches) : l'anneau de 34 dit le
/// temps qui reste d'un partage. L'arc se VIDE, un partage continu reste plein,
/// et la valeur dite est « reste 42 min ». Les mesures viennent des vecteurs
/// partagés (`decompte` de K09).
@Suite("MeeshyProgressRing — décompte")
struct MeeshyProgressRingCountdownTests {

    @Test("la part qui reste et les minutes arrondies au-dessus suivent les vecteurs")
    func countdown_followsTheVectors() throws {
        for row in try Self.rows() {
            let countdown = MeeshyProgressRingCountdown.resolve(remaining: row["reste"] as? Double,
                                                                total: row["total"] as? Double)
            #expect(countdown.fraction == row["fraction"] as? Double, "\(row)")
            #expect(countdown.remainingMinutes == row["minutes"] as? Int, "\(row)")
            #expect(countdown.isContinuous == (row["continu"] as? Bool ?? false), "\(row)")
            #expect(countdown.isOver == (row["echu"] as? Bool ?? false), "\(row)")
        }
    }

    @Test("l'arc se vide : moins de temps, moins d'arc")
    func countdown_arcEmpties() {
        let early = MeeshyProgressRingCountdown.resolve(remaining: 3000, total: 3600)
        let late = MeeshyProgressRingCountdown.resolve(remaining: 600, total: 3600)
        #expect(early.fraction > late.fraction)
    }

    @Test("le diamètre du décompte est 34, et l'anneau plein reste dessiné")
    func countdown_diameterAndFullRing() throws {
        let json = try Self.json()
        #expect(MeeshyProgressRingCountdown.diameter == json["decompteDiametre"] as? Double)
        let full = MeeshyProgressRingCountdown.resolve(remaining: nil, total: nil)
        let recipe = MeeshyProgressRingRecipe.resolve(progress: full.fraction,
                                                      diameter: MeeshyProgressRingCountdown.diameter,
                                                      sweeps: false, showsPercent: false, hasCenter: false,
                                                      tone: nil, reduceMotion: false, increasedContrast: false)
        #expect(recipe.arcFraction == 1)
        #expect(recipe.digits == nil)
        #expect(!recipe.isIndeterminate)
    }

    @Test("non-nombres et durées négatives : bornés, sans exception")
    func countdown_nonFinite_isBounded() {
        let nan = MeeshyProgressRingCountdown.resolve(remaining: .nan, total: 3600)
        #expect(nan.fraction == 0)
        #expect(nan.isOver)
        let noTotal = MeeshyProgressRingCountdown.resolve(remaining: 120, total: .nan)
        #expect(noTotal.fraction == 1)
        #expect(noTotal.remainingMinutes == 2)
    }

    @MainActor
    @Test("la valeur dite : « reste 42 min », « reste 7 h 05 », « en continu », « terminé »")
    func countdown_spokenValue_french() throws {
        let bundle = try Self.lproj("fr")
        let locale = Locale(identifier: "fr")
        let said = { (remaining: Double?) -> String in
            MeeshyProgressRingWords.countdownValue(
                MeeshyProgressRingCountdown.resolve(remaining: remaining, total: 8 * 3600),
                bundle: bundle, locale: locale
            )
        }
        #expect(said(42 * 60) == "reste 42 min")
        #expect(said(7 * 3600 + 5 * 60) == "reste 7 h 05")
        #expect(said(nil) == "en continu")
        #expect(said(0) == "terminé")
    }

    @MainActor
    @Test("la valeur dite existe dans les sept langues", arguments: ["ar", "de", "en", "es", "fr", "it", "pt-BR"])
    func countdown_spokenValue_everyLanguage(code: String) throws {
        let bundle = try Self.lproj(code)
        let locale = Locale(identifier: code)
        let minutes = MeeshyProgressRingWords.countdownValue(
            MeeshyProgressRingCountdown.resolve(remaining: 42 * 60, total: 3600), bundle: bundle, locale: locale
        )
        #expect(minutes.contains("42"))
        #expect(!minutes.contains("kit."))
        let continuous = MeeshyProgressRingWords.countdownValue(
            MeeshyProgressRingCountdown.resolve(remaining: nil, total: nil), bundle: bundle, locale: locale
        )
        #expect(!continuous.isEmpty)
        #expect(!continuous.contains("kit."))
    }

    @Test("le décompte n'ajoute ni verre, ni couleur en dur, ni minuteur : l'hôte relit l'heure")
    func source_countdownStaysAgnostic() throws {
        let url = Self.repositoryRoot
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/MeeshyProgressRingCountdown.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        for word in ["Color(", "Color.", ".meeshyGlass(", "Timer", "TimelineView", "Date()", "Button("] {
            #expect(!code.contains(word), "MeeshyProgressRingCountdown.swift contient \(word)")
        }
    }

    // MARK: - Vecteurs

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K09-MeeshyProgressRing.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows() throws -> [[String: Any]] {
        try #require(try json()["decompte"] as? [[String: Any]])
    }

    @MainActor
    private static func lproj(_ code: String) throws -> Bundle {
        let language = code == "pt-BR" ? "pt-BR" : (Locale(identifier: code).language.languageCode?.identifier ?? code)
        let path = try #require(Bundle.module.path(forResource: language, ofType: "lproj")
                                    ?? Bundle.module.path(forResource: language.lowercased(), ofType: "lproj"),
                                "\(language).lproj absent")
        return try #require(Bundle(path: path))
    }
}
