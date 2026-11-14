import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K09 — l'anneau de progression, lu comme des VALEURS : la recette (trait,
/// rayon, chiffre, centre, balayage), la valeur dite, le contraste, puis les
/// gardes de source (aucun geste, aucun verre, aucune couleur en dur, rien qui
/// recalcule la mise en page). Les mesures viennent du fichier de vecteurs que
/// lisent aussi Android et le web.
@Suite("MeeshyProgressRing")
struct MeeshyProgressRingTests {

    // MARK: - Géométrie

    @Test("trait et rayon pour 14, 22, 32, 40, 44, 76 et 102")
    func recipe_stroke_followsTheVectors() throws {
        for row in try Self.rows("trait") {
            let diameter = try #require(row["diametre"] as? Double)
            let recipe = Self.recipe(progress: 0.5, diameter: diameter)
            #expect(recipe.stroke == row["trait"] as? Double, "\(row)")
            #expect(recipe.radius == row["rayon"] as? Double, "\(row)")
            #expect(recipe.innerDiameter == diameter - 2 * recipe.stroke, "\(row)")
        }
    }

    @Test("pourcentage, chiffre, signe et taille : bornés, au plus proche, issus de la même valeur que l'arc")
    func recipe_percent_followsTheVectors() throws {
        for row in try Self.rows("pourcentage") {
            let recipe = Self.recipe(progress: row["progres"] as? Double,
                                     diameter: try #require(row["diametre"] as? Double))
            #expect(recipe.percent == row["pourcentage"] as? Int, "\(row)")
            #expect(recipe.digits == row["chiffre"] as? Int, "\(row)")
            #expect(recipe.showsSign == row["signe"] as? Bool, "\(row)")
            #expect(recipe.digitSize == Self.digitSize(row["chiffreTaille"]), "\(row)")
            if let fraction = recipe.fraction {
                #expect(recipe.percent == Int((fraction * 100).rounded()), "\(row)")
                #expect(recipe.arcFraction == max(fraction, MeeshyProgressRingRecipe.arcFloor), "\(row)")
            }
        }
    }

    @Test("non-nombre ou infini : 0, sans exception ; diamètre borné de 10 à 120", arguments: [Double.nan, .infinity, -.infinity])
    func recipe_nonFinite_isZero(value: Double) {
        let recipe = Self.recipe(progress: value)
        #expect(recipe.fraction == 0)
        #expect(recipe.percent == 0)
        #expect(Self.recipe(progress: 0.5, diameter: 500).diameter == 120)
        #expect(Self.recipe(progress: 0.5, diameter: 2).diameter == 10)
        #expect(Self.recipe(progress: 0.5, diameter: .nan).diameter == 10)
    }

    @Test("un point à midi dès 0 %")
    func recipe_zero_drawsADotAtNoon() throws {
        let row = try #require(try Self.rows("arc").first)
        #expect(Self.recipe(progress: 0).arcFraction == row["arcPlancher"] as? Double)
        #expect(MeeshyProgressRingRecipe.arcFloor == row["arcPlancher"] as? Double)
    }

    // MARK: - États

    @Test("progression absente : indéterminé, ni chiffre ni valeur numérique, balayage de 18 % posé")
    func recipe_indeterminate_hasNoDigitsAndSweeps() throws {
        let sweep = try Self.object("balayage")
        let recipe = Self.recipe(progress: nil)
        #expect(recipe.isIndeterminate)
        #expect(recipe.fraction == nil)
        #expect(recipe.percent == nil)
        #expect(recipe.digits == nil)
        #expect(recipe.sweeps)
        #expect(recipe.spins)
        #expect(recipe.arcFraction == MeeshyProgressRingRecipe.sweepFraction)
        #expect(MeeshyProgressRingRecipe.sweepFraction == sweep["fraction"] as? Double)
        #expect(MeeshyProgressRingRecipe.sweepDuration == sweep["dureeSecondes"] as? Double)
        #expect(MeeshyProgressRingRecipe.transitionDuration == sweep["transitionSecondes"] as? Double)
    }

    @Test("sweeps : le balayage se pose sur l'arc figé, jamais sans demande sur un arc qui avance")
    func recipe_sweeps_onlyWhenAsked() {
        let frozen = Self.recipe(progress: 0.9, sweeps: true)
        #expect(frozen.sweeps)
        #expect(!frozen.isIndeterminate)
        #expect(frozen.digits == 90)
        #expect(!Self.recipe(progress: 0.5).sweeps)
    }

    @MainActor
    @Test("center rempli : le chiffre disparaît, la valeur dite reste")
    func recipe_center_hidesDigitsButKeepsValue() throws {
        let row = try #require(try Self.rows("centre").first)
        let recipe = Self.recipe(progress: row["progres"] as? Double, hasCenter: true)
        #expect(recipe.digits == row["chiffre"] as? Int)
        #expect(recipe.percent == 50)
        let said = MeeshyProgressRingWords.spokenValue(percent: recipe.percent, valueText: nil,
                                                       locale: Locale(identifier: "fr"))
        #expect(Self.normalized(said) == row["valeurDite"] as? String)
    }

    @Test("showsPercent faux : aucun chiffre")
    func recipe_showsPercentOff_hidesDigits() {
        #expect(Self.recipe(progress: 0.5, showsPercent: false).digits == nil)
        #expect(Self.recipe(progress: 0.5, showsPercent: false).percent == 50)
    }

    @Test("le chiffre affiché : nombre seul de 22 à 39, pourcentage localisé dès 40")
    func digitsText_followsTheVectors() throws {
        for row in try Self.rows("chiffreAffiche") {
            let text = MeeshyProgressRingRecipe.digitsText(
                try #require(row["chiffre"] as? Int), showsSign: try #require(row["signe"] as? Bool),
                locale: Locale(identifier: try #require(row["langue"] as? String))
            )
            #expect(Self.normalized(text) == row["texte"] as? String, "\(row)")
        }
    }

    // MARK: - Mouvement

    @Test("sous « réduire les animations » : aucune transition, aucune rotation ; sinon 200 ms linéaire")
    func recipe_reduceMotion_freezesEverything() {
        let reduced = Self.recipe(progress: nil, reduceMotion: true)
        #expect(reduced.animation == nil)
        #expect(!reduced.spins)
        #expect(reduced.sweeps)
        #expect(Self.recipe(progress: 0.9, sweeps: true, reduceMotion: true).spins == false)
        #expect(MeeshyProgressRingRecipe.arcAnimation(animates: false) == nil)
        #expect(Self.recipe(progress: 0.5).animation == .linear(duration: MeeshyProgressRingRecipe.transitionDuration))
    }

    // MARK: - Encre et contraste

    @Test("l'encre suit le ton : celle du média, celle du thème sous le ton theme")
    func ink_followsTheTone() throws {
        for row in try Self.rows("encre") {
            let tone = try #require(MeeshyGlassTone(rawValue: try kitRequired(row["ton"] as? String)))
            let ink = Self.recipe(progress: 0.5, tone: tone).ink
            #expect("\(ink)" == row["encre"] as? String, "\(row)")
        }
    }

    @Test("piste à 30 %, 60 % sous « Augmenter le contraste »")
    func trackOpacity_followsTheVectors() throws {
        let opacity = try Self.object("opacites")
        #expect(Self.recipe(progress: 0.5).trackOpacity == opacity["piste"] as? Double)
        #expect(Self.recipe(progress: 0.5, increasedContrast: true).trackOpacity == opacity["pisteContrasteAccru"] as? Double)
    }

    @Test("l'encre du média tient 3:1 contre le fond de marque et contre le disque d'ombre, calculé depuis la recette")
    func contrast_ink_holdsAgainstItsBackdrops() throws {
        let contrast = try Self.object("contraste")
        let arcMin = try #require(contrast["arcMin"] as? Double)
        let scrimMin = try #require(contrast["disqueOmbreMin"] as? Double)
        let ink = Self.recipe(progress: 0.5, tone: .deep).inkColor(isDark: true)
        #expect(MeeshyProgressRingRecipe.arcMinContrast == arcMin)
        let brand = MeeshyProgressRingRecipe.worstContrast(of: ink, on: [MeeshyColors.indigo500, MeeshyColors.indigo700])
        #expect(brand >= arcMin, "obtenu \(brand)")
        #expect(MeeshyProgressRingRecipe.scrimContrast(of: ink) >= scrimMin)
    }

    @Test("l'encre du thème tient 3:1 contre la page, en clair et en sombre", arguments: [false, true])
    func contrast_themeInk_holdsAgainstThePage(isDark: Bool) {
        let ink = Self.recipe(progress: 0.5, tone: .theme).inkColor(isDark: isDark)
        let page = MeeshyColors.backgroundPrimary(isDark: isDark)
        #expect(MeeshyProgressRingRecipe.worstContrast(of: ink, on: [page]) >= MeeshyProgressRingRecipe.arcMinContrast)
    }

    // MARK: - Valeur dite

    @MainActor
    @Test("valeur dite : valueText l'emporte, sinon le pourcentage de la langue, sinon « En cours »")
    func spokenValue_followsTheVectors() throws {
        #expect(MeeshyProgressRingWords.spokenValue(percent: 62, valueText: "3 sur 4") == "3 sur 4")
        #expect(MeeshyProgressRingWords.spokenValue(percent: nil, valueText: "Préparation…") == "Préparation…")
        for row in try Self.rows("valeursDites") where row["chiffresDuLecteur"] == nil {
            let code = try #require(row["langue"] as? String)
            let said = MeeshyProgressRingWords.spokenValue(
                percent: row["pourcentage"] as? Int, valueText: nil,
                bundle: try Self.lproj(code), locale: Locale(identifier: code)
            )
            #expect(Self.normalized(said) == row["texte"] as? String, "\(row)")
        }
    }

    @MainActor
    @Test("RTL : la valeur dite s'écrit dans les chiffres du lecteur arabe, sans placeholder")
    func spokenValue_arabic_usesTheReadersDigits() throws {
        let locale = Locale(identifier: "ar_SA")
        let said = MeeshyProgressRingWords.spokenValue(percent: 62, valueText: nil, bundle: try Self.lproj("ar"),
                                                       locale: locale)
        #expect(said.contains(IntegerFormatStyle<Int>(locale: locale).format(62)), "obtenu « \(said) »")
        #expect(!said.contains("%@") && !said.contains("%lld"))
    }

    // MARK: - Performance : égalité par valeurs

    @MainActor
    @Test("l'arc, le balayage et le chiffre se comparent par valeurs : seul un changement de valeur les redessine")
    func leaves_compareValues() {
        let ink = MeeshyColors.onMedia
        func arc(_ fraction: Double, animates: Bool = true) -> MeeshyProgressRingArc {
            MeeshyProgressRingArc(fraction: fraction, radius: 20, stroke: 4, tint: .ink, ink: ink, animates: animates)
        }
        #expect(arc(0.5) == arc(0.5))
        #expect(arc(0.5) != arc(0.51))
        #expect(arc(0.5) != arc(0.5, animates: false))
        let sweep = MeeshyProgressRingSweep(radius: 20, stroke: 4, tint: .ink, ink: ink, spins: true)
        #expect(sweep == MeeshyProgressRingSweep(radius: 20, stroke: 4, tint: .ink, ink: ink, spins: true))
        #expect(sweep != MeeshyProgressRingSweep(radius: 20, stroke: 4, tint: .ink, ink: ink, spins: false))
        #expect(MeeshyProgressRingDigits(text: "62 %", size: 12, ink: ink) == MeeshyProgressRingDigits(text: "62 %", size: 12, ink: ink))
    }

    // MARK: - Source

    @Test("un seul élément : rôle d'indicateur, nom seul dans le nom, valeur à part, décoratif hors de l'arbre, aucune zone vivante")
    func source_accessibility() throws {
        let code = try Self.code("MeeshyProgressRing.swift")
        #expect(code.contains("ProgressView(value: progress, total: 1)"))
        #expect(code.contains(".accessibilityLabel(label)"))
        #expect(code.contains(".accessibilityValue(spoken)"))
        #expect(code.contains(".accessibilityAddTraits(.updatesFrequently)"))
        #expect(code.contains("content.accessibilityHidden(true)"))
        for word in ["accessibilityLabel(\"", "UIAccessibility.post", "AccessibilityNotification", ".announcement"] {
            #expect(!code.contains(word), "MeeshyProgressRing.swift contient \(word)")
        }
    }

    @Test("aucun geste, aucun focus : l'anneau laisse passer le toucher")
    func source_takesNoTouch() throws {
        let code = try Self.code("MeeshyProgressRing.swift")
        #expect(code.contains(".allowsHitTesting(false)"))
        for word in ["Button(", "onTapGesture", ".gesture(", ".focusable(", "HapticFeedback", "sensoryFeedback"] {
            #expect(!code.contains(word), "MeeshyProgressRing.swift contient \(word)")
        }
    }

    @Test("RTL : l'arc part de midi dans le sens horaire, sans se refléter")
    func source_doesNotMirror() throws {
        let code = try Self.code("MeeshyProgressRing.swift")
        #expect(code.contains(".rotationEffect(.degrees(-90))"))
        #expect(!code.contains("flipsForRightToLeftLayoutDirection"))
        #expect(!code.contains("layoutDirection"))
    }

    @Test("seuls la longueur de l'arc et l'angle du balayage s'animent ; ni minuteur, ni TimelineView, ni mise en page")
    func source_animatesOnlyTheArcAndTheSweep() throws {
        let code = try Self.code("MeeshyProgressRing.swift")
        #expect(code.components(separatedBy: ".animation(").count == 3)
        #expect(code.contains(".animation(MeeshyProgressRingRecipe.arcAnimation(animates: animates), value: fraction)"))
        #expect(code.contains(".animation(spins ? MeeshyProgressRingRecipe.spinAnimation : nil, value: phase)"))
        for word in ["TimelineView", "Timer", "GeometryReader", "withAnimation", "scaleEffect", ".shadow(", ".blur("] {
            #expect(!code.contains(word), "MeeshyProgressRing.swift contient \(word)")
        }
    }

    @Test("aucun verre, aucune légende, aucune couleur en dur, aucun indicateur du système dans les fichiers de K09")
    func source_hasNoGlassNoLiteralColor() throws {
        let files = ["MeeshyProgressRing.swift", "MeeshyProgressRingRecipe.swift", "Catalog/MeeshyKitCatalog+K09.swift"]
        let forbidden = [
            "caption", "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray",
            "Color.red", ".secondary", "#FF", "0x", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass",
            ".meeshyGlass(", "UIBlurEffect", "Material", "CircularProgressViewStyle", ".progressViewStyle(",
            "cornerRadius: 4",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    // MARK: - Aides

    private static func recipe(progress: Double?,
                               diameter: Double = 44,
                               sweeps: Bool = false,
                               showsPercent: Bool = true,
                               hasCenter: Bool = false,
                               tone: MeeshyGlassTone? = nil,
                               reduceMotion: Bool = false,
                               increasedContrast: Bool = false) -> MeeshyProgressRingRecipe {
        MeeshyProgressRingRecipe.resolve(progress: progress, diameter: diameter, sweeps: sweeps,
                                         showsPercent: showsPercent, hasCenter: hasCenter, tone: tone,
                                         reduceMotion: reduceMotion, increasedContrast: increasedContrast)
    }

    private static func digitSize(_ name: Any?) -> CGFloat? {
        switch name as? String {
        case "small": return MeeshyFont.smallSize
        case "micro": return MeeshyFont.microSize
        default: return nil
        }
    }

    /// Les espaces insécables (U+00A0, U+202F) ramenées à une espace.
    private static func normalized(_ text: String) -> String {
        text.replacingOccurrences(of: "\u{202F}", with: " ").replacingOccurrences(of: "\u{00A0}", with: " ")
    }

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

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    /// La table d'une langue : `bundle` choisit la table, `locale` ses règles.
    @MainActor
    private static func lproj(_ code: String) throws -> Bundle {
        let language = Locale(identifier: code).language.languageCode?.identifier ?? code
        let path = try #require(Bundle.module.path(forResource: language, ofType: "lproj"), "\(language).lproj absent")
        return try #require(Bundle(path: path))
    }

    /// Le code d'un fichier du kit, commentaires de ligne retirés.
    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
