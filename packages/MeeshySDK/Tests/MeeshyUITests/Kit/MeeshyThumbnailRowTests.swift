import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K20 — la rangée de vignettes, lue comme des VALEURS : la loi d'ajustement, la
/// place visée et l'écart des voisines, ce que chaque geste décide, la recette, le
/// contraste, les cellules qui changent ; puis le modèle d'interaction, joué avec
/// de faux rappels. Les mesures viennent du fichier de vecteurs que lisent aussi
/// Android et le web.
@Suite("MeeshyThumbnailRow")
struct MeeshyThumbnailRowTests {

    // MARK: - L'ajustement

    @Test("la hauteur descend de 48 à 32 pour tenir, puis la rangée défile : chaque vecteur")
    func fit_followsTheVectors() throws {
        for row in try Self.rows("fit") {
            let fit = MeeshyThumbnailRowFit.resolve(
                slots: try #require(row["slots"] as? Int),
                available: (row["available"] as? Double).map { CGFloat($0) } ?? (row["available"] as? Int).map { CGFloat($0) },
                tileHeight: try Self.cg(row["tileHeight"]),
                minTileHeight: try Self.cg(row["minTileHeight"]),
                aspectRatio: try Self.cg(row["aspect"]),
                spacing: try Self.cg(row["spacing"])
            )
            #expect(Self.near(fit.height, row["height"]), "\(row)")
            #expect(Self.near(fit.width, row["width"]), "\(row)")
            #expect(fit.scrolls == row["scrolls"] as? Bool, "\(row)")
        }
    }

    @Test("le pas est la largeur d'une vignette plus l'écart, la largeur du contenu n'a pas d'écart de fin")
    func fit_pitchAndContentWidth() throws {
        for row in try Self.rows("pitch") {
            let pitch = MeeshyThumbnailRowFit.pitch(tileWidth: try Self.cg(row["tileWidth"]), spacing: try Self.cg(row["spacing"]))
            #expect(Self.near(pitch, row["pitch"]), "\(row)")
        }
        for row in try Self.rows("contentWidth") {
            let width = MeeshyThumbnailRowFit.contentWidth(
                slots: try #require(row["slots"] as? Int), tileWidth: try Self.cg(row["tileWidth"]), spacing: try Self.cg(row["spacing"])
            )
            #expect(Self.near(width, row["width"]), "\(row)")
        }
    }

    @Test("le pas ne descend jamais sous 24 : 18 de large et 6 d'écart au plus serré")
    func fit_pitchNeverBelow24() {
        let tightest = MeeshyThumbnailRowFit.resolve(slots: 10, available: 100)
        #expect(tightest.scrolls)
        #expect(tightest.pitch() >= 24)
    }

    // MARK: - Le glisser

    @Test("la place visée : un pas par vignette, bornée, miroitée en RTL")
    func target_followsTheVectors() throws {
        for row in try Self.rows("target") {
            let target = MeeshyThumbnailRowRule.targetIndex(
                from: try #require(row["source"] as? Int),
                translation: try Self.cg(row["translation"]),
                pitch: try Self.cg(row["pitch"]),
                count: try #require(row["count"] as? Int),
                isRightToLeft: try #require(row["rtl"] as? Bool)
            )
            #expect(target == row["target"] as? Int, "\(row)")
        }
    }

    @Test("le rang final : rien quand la vignette revient à sa place")
    func destination_followsTheVectors() throws {
        for row in try Self.rows("destination") {
            let rank = MeeshyThumbnailRowRule.destination(source: try #require(row["source"] as? Int), target: try #require(row["target"] as? Int))
            #expect(rank == row["rank"] as? Int, "\(row)")
        }
    }

    @Test("les voisines s'écartent d'un pas vers la place laissée, la place visée comprise")
    func shift_followsTheVectors() throws {
        for row in try Self.rows("shift") {
            let shift = MeeshyThumbnailRowRule.shift(
                of: try #require(row["index"] as? Int),
                source: try #require(row["source"] as? Int),
                target: try #require(row["target"] as? Int),
                pitch: try Self.cg(row["pitch"]),
                isRightToLeft: try #require(row["rtl"] as? Bool)
            )
            #expect(Self.near(shift, row["shift"]), "\(row)")
        }
    }

    @Test("la rangée défilante avance seule près d'un bord, et nulle part ailleurs")
    func edgeScroll_followsTheVectors() throws {
        for row in try Self.rows("edgeScroll") {
            let direction = MeeshyThumbnailRowRule.edgeScroll(
                location: try Self.cg(row["location"]), viewport: try Self.cg(row["viewport"]), zone: try Self.cg(row["zone"])
            )
            #expect(direction == row["direction"] as? Int, "\(row)")
        }
    }

    // MARK: - Les gestes

    @Test("un toucher : aller, rien, dupliquer ou désarmer, selon l'état")
    func tap_followsTheVectors() throws {
        for row in try Self.rows("tap") {
            let effect = MeeshyThumbnailRowRule.tap(
                try #require(row["tapped"] as? String),
                current: row["current"] as? String,
                armed: row["armed"] as? String,
                isDouble: try #require(row["double"] as? Bool),
                isEnabled: try #require(row["enabled"] as? Bool),
                canSelect: try #require(row["canSelect"] as? Bool),
                canDuplicate: try #require(row["canDuplicate"] as? Bool)
            )
            #expect(Self.describe(effect) == row["effect"] as? String, "\(row)")
        }
    }

    @Test("un appui long arme, sauf s'il n'y a rien à faire ou si la rangée est désactivée")
    func longPress_followsTheVectors() throws {
        for row in try Self.rows("longPress") {
            let effect = MeeshyThumbnailRowRule.longPress(
                try #require(row["pressed"] as? String), armed: row["armed"] as? String,
                isEnabled: try #require(row["enabled"] as? Bool), canArm: try #require(row["canArm"] as? Bool)
            )
            #expect(Self.describe(effect) == row["effect"] as? String, "\(row)")
        }
        for row in try Self.rows("canArm") {
            let canArm = MeeshyThumbnailRowRule.canArm(
                count: try #require(row["count"] as? Int), canMove: try #require(row["canMove"] as? Bool),
                canRemove: try #require(row["canRemove"] as? Bool)
            )
            #expect(canArm == row["canArm"] as? Bool, "\(row)")
        }
    }

    @Test("les actions nommées, selon les rappels, sans déplacer au-delà d'un bout")
    func actions_followTheVectors() throws {
        for row in try Self.rows("actions") {
            let kinds = MeeshyThumbnailRowRule.actions(
                index: try #require(row["index"] as? Int), count: try #require(row["count"] as? Int),
                canDuplicate: try #require(row["canDuplicate"] as? Bool), canMove: try #require(row["canMove"] as? Bool),
                canRemove: try #require(row["canRemove"] as? Bool)
            )
            #expect(kinds.map(\.rawValue) == row["kinds"] as? [String], "\(row)")
        }
    }

    @Test("le second toucher : même vignette, sous 300 ms, une seule fois")
    func tapTracker_followsTheVectors() throws {
        for scenario in try Self.rows("tapTracker") {
            var tracker = MeeshyThumbnailRowTapTracker<String>()
            let steps = try #require(scenario["steps"] as? [[String: Any]])
            for step in steps {
                let double = tracker.isDouble(try #require(step["id"] as? String), at: try #require(step["at"] as? Double))
                #expect(double == step["isDouble"] as? Bool, "\(scenario["name"] ?? "") : \(step)")
            }
        }
    }

    @Test("le cran : light à l'aller et à la duplication, medium à l'armement, rigid par place ; none se tait")
    func haptics_followTheVectors() throws {
        for row in try Self.rows("haptics") {
            let style = MeeshyThumbnailRowRule.hapticStyle(
                for: try #require(MeeshyThumbnailRowHapticEvent(rawValue: try #require(row["event"] as? String))),
                haptic: try #require(MeeshyThumbnailHaptic(rawValue: try #require(row["haptic"] as? String)))
            )
            #expect(style?.rawValue == row["style"] as? String, "\(row)")
        }
    }

    @Test("sans vignette ni « + », la rangée n'a rien à poser ; le « + » ferme la rangée")
    func items_followTheCounts() {
        #expect(MeeshyThumbnailRowRule.items(count: 0, hasAdd: false).isEmpty)
        #expect(MeeshyThumbnailRowRule.items(count: 2, hasAdd: false) == [.thumbnail(0), .thumbnail(1)])
        #expect(MeeshyThumbnailRowRule.items(count: 2, hasAdd: true) == [.thumbnail(0), .thumbnail(1), .add])
        #expect(MeeshyThumbnailRowRule.items(count: 0, hasAdd: true) == [.add])
    }

    // MARK: - La recette

    @Test("les mesures de la planche suivent les vecteurs")
    func recipe_metricsFollowTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(Self.ms(MeeshyThumbnailRowRecipe.tapWindow) == recipe["tapWindowMs"] as? Double)
        #expect(Self.ms(MeeshyThumbnailRowRecipe.holdDuration) == recipe["holdMs"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.holdSlop) == recipe["holdSlop"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.ringWidth) == recipe["ringWidth"] as? Double)
        #expect(Self.ms(MeeshyThumbnailRowRecipe.ringFadeDuration) == recipe["ringFadeMs"] as? Double)
        #expect(Self.ms(MeeshyThumbnailRowRecipe.neighbourDuration) == recipe["neighbourMs"] as? Double)
        #expect(Self.ms(MeeshyThumbnailRowRecipe.revealDuration) == recipe["revealMs"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.liftScale) == recipe["liftScale"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.liftTiltDegrees == recipe["liftTiltDegrees"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.plusVeilRestOpacity == recipe["plusVeil"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.plusVeilOnLightOpacity == recipe["plusVeilOnLight"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.plusStroke) == recipe["plusStroke"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.plusStrokeOpacity == recipe["plusStrokeOpacity"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.plusGlyph) == recipe["plusGlyph"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.placeholderStroke) == recipe["placeholderStroke"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.placeholderOpacity == recipe["placeholderOpacity"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.crossDisc) == recipe["crossDisc"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.crossStroke) == recipe["crossStroke"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.crossGlyph) == recipe["crossGlyph"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.crossOverhangX) == recipe["crossOverhangX"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.crossOverhangY) == recipe["crossOverhangY"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.statusRing) == recipe["statusRing"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.waitingVeil == recipe["waitingVeil"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.waitingGlyph) == recipe["waitingGlyph"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.disabledOpacity == recipe["disabledOpacity"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.pressedOpacity == recipe["pressedOpacity"] as? Double)
        #expect(MeeshyThumbnailRowRecipe.onLightOutlineOpacity == recipe["onLightOutline"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.spacing) == recipe["spacing"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.radius) == recipe["radius"] as? Double)
        let rest = try #require(recipe["restShadow"] as? [String: Any])
        #expect(MeeshyThumbnailRowRecipe.restShadow.opacity == rest["opacity"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.restShadow.radius) == rest["radius"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.restShadow.y) == rest["y"] as? Double)
        let lift = try #require(recipe["liftShadow"] as? [String: Any])
        #expect(MeeshyThumbnailRowRecipe.liftShadow.opacity == lift["opacity"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.liftShadow.radius) == lift["radius"] as? Double)
        #expect(Double(MeeshyThumbnailRowRecipe.liftShadow.y) == lift["y"] as? Double)
    }

    @Test("le cercle sur la courante et sur la soulevée seulement ; jamais sur une prête au repos")
    func recipe_ringOnTheCurrentAndTheLifted() {
        #expect(Self.recipe(isCurrent: true).ringOpacity == 1)
        #expect(Self.recipe(isLifted: true).ringOpacity == 1)
        #expect(Self.recipe().ringOpacity == 0)
    }

    @Test("repos ≠ pressé ; désactivée 40 % et inerte ; l'appui n'a aucune échelle")
    func recipe_pressDisabledAndNoScale() {
        let rest = Self.recipe()
        let pressed = Self.recipe(isPressed: true)
        #expect(rest.opacity == 1)
        #expect(pressed.opacity == 0.85)
        #expect(pressed.scale == 1)
        let disabled = Self.recipe(isPressed: true, isEnabled: false)
        #expect(disabled.opacity == 0.4)
        #expect(!disabled.isActionEnabled)
    }

    @Test("soulevée : × 1,15, −6° et l'ombre haute ; sous « réduire les animations », ni échelle ni inclinaison, cercle et ombre restent")
    func recipe_liftAndReduceMotion() {
        let lifted = Self.recipe(isLifted: true)
        #expect(lifted.scale == 1.15)
        #expect(lifted.tiltDegrees == -6)
        #expect(lifted.shadow == MeeshyThumbnailRowRecipe.liftShadow)
        let reduced = Self.recipe(isLifted: true, reduceMotion: true)
        #expect(reduced.scale == 1)
        #expect(reduced.tiltDegrees == 0)
        #expect(reduced.ringOpacity == 1)
        #expect(reduced.shadow == MeeshyThumbnailRowRecipe.liftShadow)
        #expect(Self.recipe().shadow == MeeshyThumbnailRowRecipe.restShadow)
    }

    @Test("scène claire : un filet sombre autour de chaque vignette et le voile du « + » à 62 %")
    func recipe_onLightToneAddsTheOutlineAndDeepensTheVeil() {
        let light = MeeshyThumbnailRowRecipe.resolve(tone: .onLight, isCurrent: false, isLifted: false)
        let deep = MeeshyThumbnailRowRecipe.resolve(tone: .deep, isCurrent: false, isLifted: false)
        #expect(light.outlineOpacity == 0.8)
        #expect(deep.outlineOpacity == 0)
        #expect(light.plusVeilOpacity == 0.62)
        #expect(deep.plusVeilOpacity == 0.35)
    }

    @Test("le cercle et le filet du « + » tiennent 3:1 dans les trois tons, lus depuis la recette")
    func recipe_contrastHoldsInTheThreeTones() throws {
        let contrast = try Self.object("contrast")
        let minimum = try #require(contrast["min"] as? Double)
        let backdrops = try #require(contrast["backdrops"] as? [String: Double])
        for (name, tone) in [("plain", MeeshyGlassTone.plain), ("deep", .deep), ("onLight", .onLight)] {
            let luminance = try #require(backdrops[name])
            let recipe = MeeshyThumbnailRowRecipe.resolve(tone: tone, isCurrent: true, isLifted: false)
            #expect(recipe.ringContrast(backdropLuminance: luminance, isDark: true) >= minimum, "cercle \(name)")
            #expect(recipe.plusContrast(backdropLuminance: luminance, isDark: true) >= minimum, "filet du plus \(name)")
        }
        let onLight = MeeshyThumbnailRowRecipe.resolve(tone: .onLight, isCurrent: true, isLifted: false)
        #expect(onLight.ringContrast(backdropLuminance: 1, isDark: false) >= minimum, "cercle sur un blanc franc")
    }

    @Test("la croix : le glyphe blanc sur le rouge d'erreur du jeton")
    func recipe_crossContrast() throws {
        let contrast = try Self.object("contrast")
        let minimum = try #require(contrast["crossGlyphMin"] as? Double)
        #expect(Self.recipe().crossContrast(isDark: false) >= minimum)
    }

    @Test("le ton du thème prend l'encre du thème, les autres celle du média")
    func recipe_themeToneUsesTheThemeInk() {
        let theme = MeeshyThumbnailRowRecipe.resolve(tone: .theme, isCurrent: true, isLifted: false)
        #expect(theme.inkColor(isDark: false) == MeeshyColors.textPrimary(isDark: false))
        #expect(theme.inkColor(isDark: true) == MeeshyColors.textPrimary(isDark: true))
        #expect(Self.recipe().inkColor(isDark: false) == MeeshyColors.onMedia)
    }

    // MARK: - Statuts

    @Test("l'anneau d'envoi fait 22, réduit à la largeur de la vignette moins 4")
    func status_ringDiameter() {
        #expect(MeeshyThumbnailStatusOverlay.ringDiameter(for: CGSize(width: 27, height: 48)) == 22)
        #expect(MeeshyThumbnailStatusOverlay.ringDiameter(for: CGSize(width: 18, height: 32)) == 14)
        #expect(MeeshyThumbnailStatusOverlay.ringDiameter(for: CGSize(width: 24, height: 42)) == 20)
    }

    // MARK: - Nom, rôle, valeur

    @Test("les actions nommées prennent leur nom de l'hôte : mots de la rangée et nom de la croix")
    func accessibility_namesComeFromTheHost() {
        let words = Self.words
        #expect(MeeshyThumbnailRowAccessibility.name(of: .duplicate, words: words, removeLabel: nil) == "Dupliquer")
        #expect(MeeshyThumbnailRowAccessibility.name(of: .moveEarlier, words: words, removeLabel: nil) == "Avant")
        #expect(MeeshyThumbnailRowAccessibility.name(of: .moveLater, words: words, removeLabel: nil) == "Après")
        #expect(MeeshyThumbnailRowAccessibility.name(of: .remove, words: words, removeLabel: "Supprimer la scène 2") == "Supprimer la scène 2")
    }

    @Test("une vignette sans nom est refusée ; la valeur et le statut viennent de l'hôte")
    func thumbnail_name() {
        #expect(MeeshyThumbnail(id: "a", accessibilityLabel: "Scène 1 sur 4").hasAccessibleName)
        #expect(!MeeshyThumbnail(id: "a", accessibilityLabel: "").hasAccessibleName)
        let sending = MeeshyThumbnail(id: "a", accessibilityLabel: "Scène", accessibilityValue: "Envoi 60 %", status: .sending(0.6))
        #expect(sending.accessibilityValue == "Envoi 60 %")
        #expect(sending.status == .sending(0.6))
    }

    @Test("la cible fait 44 de haut, et le pas de large")
    func target_isFortyFourHighAndThePitchWide() {
        #expect(MeeshyThumbnailRowRecipe.targetHeight >= 44)
        #expect(MeeshyThumbnailRowRecipe.crossTarget >= 44)
        let fit = MeeshyThumbnailRowFit.resolve(slots: 5, available: 390)
        let spec = Self.specs(count: 4, size: fit.size)[0]
        #expect(spec.pitch == fit.pitch())
        #expect(spec.pitch == 33)
    }

    // MARK: - Performance : ce qui se redessine

    @Test("changer la courante redessine deux cellules au plus")
    func specs_changingTheCurrentRedrawsTwoAtMost() {
        let before = Self.specs(count: 6, current: "s2")
        let after = Self.specs(count: 6, current: "s5")
        #expect(Self.changed(before, after) == 2)
    }

    @Test("une progression n'en redessine qu'une")
    func specs_aProgressRedrawsOne() {
        let before = Self.specs(count: 6, statuses: ["s3": .sending(0.4)])
        let after = Self.specs(count: 6, statuses: ["s3": .sending(0.6)])
        #expect(Self.changed(before, after) == 1)
    }

    @Test("un aperçu neuf (contentVersion) ne redessine que sa vignette")
    func specs_aNewPreviewRedrawsItsOwnThumbnail() {
        let before = Self.specs(count: 4)
        let after = Self.specs(count: 4, versions: ["s2": 1])
        #expect(Self.changed(before, after) == 1)
    }

    @Test("un glisser qui garde sa place ne redessine que la soulevée ; une place franchie, elle et sa voisine")
    func specs_aDragRedrawsOnlyWhatMoves() {
        let early = Self.specs(count: 5, drag: MeeshyThumbnailDrag(id: "s2", translation: 4))
        let later = Self.specs(count: 5, drag: MeeshyThumbnailDrag(id: "s2", translation: 10))
        #expect(Self.changed(early, later) == 1)
        let crossed = Self.specs(count: 5, drag: MeeshyThumbnailDrag(id: "s2", translation: 40))
        #expect(Self.changed(later, crossed) == 2)
    }

    @Test("pendant un glisser, la soulevée suit le doigt, les voisines s'écartent d'un pas et le pointillé marque la place")
    func specs_theLiftedFollowsAndNeighboursStepAside() {
        let cells = Self.specs(count: 5, drag: MeeshyThumbnailDrag(id: "s2", translation: 70))
        #expect(cells[1].isLifted)
        #expect(cells[1].translation == 70)
        #expect(cells[1].placeholderOffset == 66)
        #expect(cells[2].shift == -33)
        #expect(cells[3].shift == -33)
        #expect(cells[0].shift == 0)
        #expect(cells[4].shift == 0)
        #expect(!cells[0].isLifted)
        #expect(cells[0].translation == 0)
    }

    @Test("la croix n'existe que sur la vignette armée, supprimable, qu'on ne glisse pas")
    func specs_theCrossOnlyOnTheArmedRemovable() {
        let resting = Self.specs(count: 3)
        #expect(resting.allSatisfy { !$0.showsCross })
        let armed = Self.specs(count: 3, armed: "s2")
        #expect(armed.map(\.showsCross) == [false, true, false])
        let unnamed = Self.specs(count: 3, armed: "s2", removeLabel: nil)
        #expect(unnamed.allSatisfy { !$0.showsCross })
        let lifted = Self.specs(count: 3, armed: "s2", drag: MeeshyThumbnailDrag(id: "s2", translation: 5))
        #expect(lifted.allSatisfy { !$0.showsCross })
    }

    // MARK: - Le modèle d'interaction

    @MainActor
    @Test("toucher une autre vignette : UN onSelect immédiat et UN light")
    func model_tapSelectsOnce() {
        let log = Log()
        let model = Self.model(log)
        model.tap("b", now: 0)
        #expect(log.selected == ["b"])
        #expect(log.haptics == [.light])
    }

    @MainActor
    @Test("la courante ne répond pas : ni rappel ni haptique ; désactivée non plus ; none laisse l'hôte jouer le sien")
    func model_currentDisabledAndNoneAreSilent() {
        let log = Log()
        let model = Self.model(log)
        model.tap("a", now: 0)
        #expect(log.selected.isEmpty)
        #expect(log.haptics.isEmpty)
        model.isEnabled = false
        model.tap("b", now: 5)
        #expect(log.selected.isEmpty)
        model.isEnabled = true
        model.haptic = .none
        model.tap("c", now: 10)
        #expect(log.selected == ["c"])
        #expect(log.haptics.isEmpty)
    }

    @MainActor
    @Test("second toucher en moins de 300 ms : UN onDuplicate, et le premier toucher est parti sans attendre")
    func model_doubleTapDuplicates() {
        let log = Log()
        let model = Self.model(log)
        model.tap("b", now: 0)
        model.tap("b", now: 0.2)
        #expect(log.selected == ["b"])
        #expect(log.duplicated == ["b"])
        #expect(log.haptics == [.light, .light])
        model.tap("b", now: 0.25)
        #expect(log.duplicated == ["b"])
    }

    @MainActor
    @Test("au-delà de 300 ms, sur une autre vignette ou sans rappel : aucune duplication")
    func model_noDuplicateOutsideTheWindow() {
        let log = Log()
        let model = Self.model(log)
        model.tap("b", now: 0)
        model.tap("b", now: 0.5)
        model.tap("c", now: 0.6)
        #expect(log.duplicated.isEmpty)
        let bareLog = Log()
        let bare = Self.model(bareLog, withDuplicate: false)
        bare.tap("b", now: 0)
        bare.tap("b", now: 0.1)
        #expect(bareLog.duplicated.isEmpty)
    }

    @MainActor
    @Test("appui long : armée, UN medium, la courante inchangée, aucun onSelect")
    func model_longPressArms() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("c")
        #expect(model.armed == "c")
        #expect(log.haptics == [.medium])
        #expect(log.selected.isEmpty)
        #expect(model.current == "a")
        model.holdBegan("c")
        #expect(log.haptics == [.medium])
    }

    @MainActor
    @Test("le toucher qui suit un appui long n'est pas un toucher : la vignette reste armée")
    func model_theReleaseAfterAHoldIsNotATap() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("c")
        model.tap("c", now: 1)
        model.holdEnded(now: 1)
        model.tap("c", now: 1.1)
        #expect(model.armed == "c")
        #expect(log.selected.isEmpty)
    }

    @MainActor
    @Test("armée : tout autre toucher désarme sans naviguer")
    func model_anyTapDisarmsWithoutNavigating() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("c")
        model.holdEnded(now: 1)
        model.tap("b", now: 2)
        #expect(model.armed == nil)
        #expect(log.selected.isEmpty)
    }

    @MainActor
    @Test("la croix appelle onRemove et désarme ; « + » ajoute et désarme")
    func model_removeAndAddDisarm() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("c")
        model.remove("c")
        #expect(log.removed == ["c"])
        #expect(model.armed == nil)
        model.holdBegan("b")
        model.add()
        #expect(log.added == 1)
        #expect(model.armed == nil)
    }

    @MainActor
    @Test("sans onRemove, pas de suppression ; sans onMove ni onRemove, l'appui long n'arme rien")
    func model_absentCallbacksRemoveTheirGestures() {
        let log = Log()
        let bare = Self.model(log, callbacks: .init(onSelect: { log.selected.append($0) }))
        bare.holdBegan("c")
        #expect(bare.armed == nil)
        bare.remove("c")
        #expect(log.removed.isEmpty)
    }

    @MainActor
    @Test("glisser : UN onMove au rang final, un cran par place franchie, désarmée au dépôt")
    func model_dragMovesOnceAtTheFinalRank() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("b")
        model.dragChanged("b", translation: 33, finger: 40)
        model.dragChanged("b", translation: 66, finger: 70)
        #expect(model.drag?.translation == 66)
        #expect(log.haptics == [.medium, .rigid, .rigid])
        model.dragEnded("b")
        #expect(log.moves.count == 1)
        #expect(log.moves.first?.0 == "b")
        #expect(log.moves.first?.1 == 3)
        #expect(model.drag == nil)
        #expect(model.armed == nil)
    }

    @MainActor
    @Test("glisser sans changer de place : aucun onMove, la vignette reste armée ; un geste annulé revient")
    func model_dragBackToTheSameSlotMovesNothing() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("b")
        model.dragChanged("b", translation: 10, finger: 20)
        model.dragEnded("b")
        #expect(log.moves.isEmpty)
        #expect(model.armed == "b")
        #expect(model.drag == nil)
    }

    @MainActor
    @Test("RTL : un glissé vers la gauche avance dans la rangée")
    func model_rtlInvertsTheDrag() {
        let log = Log()
        let model = Self.model(log)
        model.isRightToLeft = true
        model.holdBegan("b")
        model.dragChanged("b", translation: -33, finger: 0)
        model.dragEnded("b")
        #expect(log.moves.first?.1 == 2)
    }

    @MainActor
    @Test("le glisser ne part que sur la vignette armée, et seulement s'il y a un onMove")
    func model_dragNeedsArmingAndOnMove() {
        let log = Log()
        let model = Self.model(log)
        model.dragChanged("b", translation: 33, finger: 0)
        #expect(model.drag == nil)
        let still = Self.model(log, callbacks: .init(onRemove: { log.removed.append($0) }))
        still.holdBegan("b")
        still.dragChanged("b", translation: 33, finger: 0)
        #expect(still.armed == "b")
        #expect(still.drag == nil)
    }

    @MainActor
    @Test("les actions du lecteur d'écran déplacent d'un rang, dupliquent et suppriment")
    func model_accessibilityActionsPerform() {
        let log = Log()
        let model = Self.model(log)
        model.perform(.moveEarlier, on: "c")
        model.perform(.moveLater, on: "c")
        model.perform(.duplicate, on: "c")
        model.perform(.remove, on: "c")
        #expect(log.moves.map { $0.1 } == [1, 3])
        #expect(log.duplicated == ["c"])
        #expect(log.removed == ["c"])
    }

    @MainActor
    @Test("une vignette qui disparaît n'est ni armée ni soulevée ; quitter l'écran ne retient rien")
    func model_vanishedAndCancelledRetainNothing() {
        let log = Log()
        let model = Self.model(log)
        model.holdBegan("b")
        model.idsChanged(["a", "c", "d"])
        #expect(model.armed == nil)
        model.holdBegan("c")
        model.cancel()
        #expect(model.armed == nil)
        #expect(model.drag == nil)
    }

    @MainActor
    @Test("près d'un bord, la rangée défilante amène la vignette deux places au-delà de la place visée")
    func model_edgeScrollTarget() {
        let log = Log()
        let model = Self.model(log, ids: (1...10).map { "s\($0)" })
        model.viewport = 200
        model.contentMinX = 0
        model.holdBegan("s5")
        model.dragChanged("s5", translation: 0, finger: 190)
        #expect(model.edgeScrollTarget() == "s7")
        model.dragChanged("s5", translation: 0, finger: 5)
        #expect(model.edgeScrollTarget() == "s3")
        model.dragChanged("s5", translation: 0, finger: 100)
        #expect(model.edgeScrollTarget() == nil)
    }

    // MARK: - Gardes de source

    @Test("aucun verre, aucun type du composer, aucune chaîne, aucune couleur en dur dans les fichiers de K20")
    func source_guards() throws {
        for file in Self.sourceFiles {
            let code = try Self.code(file)
            let forbidden = [
                "Color(hex:", "Color(red:", "Color.white", "Color.black", ".white)", ".black)",
                "meeshyGlass", "adaptiveGlass", "adaptiveLiquidGlass", ".glassEffect", "UIBlurEffect", ".ultraThinMaterial",
                ".blur(", "UIImpactFeedbackGenerator", "sensoryFeedback",
                "Composer", "StorySlide", "CallMode", "CacheCoordinator", ".shared",
                "String(localized", "NSLocalizedString", "Text(\"",
            ]
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("le cran se joue au site unique, et l'appui est lu dans le style du bouton")
    func source_hapticsAndPress() throws {
        let model = try Self.code("MeeshyThumbnailRowModel.swift")
        #expect(model.contains("HapticFeedback.light()"))
        #expect(model.contains("HapticFeedback.medium()"))
        #expect(model.contains("HapticFeedback.rigid()"))
        let cell = try Self.code("MeeshyThumbnailCell.swift")
        #expect(cell.contains("configuration.isPressed"))
        let row = try Self.code("MeeshyThumbnailRow.swift")
        #expect(row.contains(".equatable()"))
    }

    // MARK: - Aides

    private static let sourceFiles = [
        "MeeshyThumbnailRow.swift", "MeeshyThumbnailRowModel.swift", "MeeshyThumbnailRowRule.swift",
        "MeeshyThumbnailRowFit.swift", "MeeshyThumbnailRowRecipe.swift", "MeeshyThumbnailRowModels.swift",
        "MeeshyThumbnailCell.swift", "MeeshyThumbnailAccessories.swift",
    ]

    private static let words = MeeshyThumbnailRowWords(add: "Ajouter", duplicate: "Dupliquer", moveEarlier: "Avant", moveLater: "Après")

    private static func describe(_ effect: MeeshyThumbnailRowEffect<String>?) -> String {
        switch effect {
        case .select(let id)?: return "select:\(id)"
        case .duplicate(let id)?: return "duplicate:\(id)"
        case .arm(let id)?: return "arm:\(id)"
        case .disarm?: return "disarm"
        case nil: return "none"
        }
    }

    private static func recipe(
        isCurrent: Bool = false, isLifted: Bool = false, isPressed: Bool = false,
        isEnabled: Bool = true, reduceMotion: Bool = false
    ) -> MeeshyThumbnailRowRecipe {
        MeeshyThumbnailRowRecipe.resolve(
            tone: .deep, isCurrent: isCurrent, isLifted: isLifted, isPressed: isPressed,
            isEnabled: isEnabled, reduceMotion: reduceMotion
        )
    }

    private static func thumbnails(
        count: Int, statuses: [String: MeeshyThumbnailStatus] = [:], versions: [String: Int] = [:], removeLabel: String? = "Supprimer"
    ) -> [MeeshyThumbnail<String>] {
        (1...count).map { index in
            let id = "s\(index)"
            return MeeshyThumbnail(
                id: id, accessibilityLabel: "Scène \(index)", status: statuses[id] ?? .ready,
                removeLabel: removeLabel, contentVersion: versions[id] ?? 0
            )
        }
    }

    private static func specs(
        count: Int,
        current: String? = "s1",
        armed: String? = nil,
        drag: MeeshyThumbnailDrag<String>? = nil,
        statuses: [String: MeeshyThumbnailStatus] = [:],
        versions: [String: Int] = [:],
        removeLabel: String? = "Supprimer",
        size: CGSize = CGSize(width: 27, height: 48)
    ) -> [MeeshyThumbnailCellSpec<String>] {
        MeeshyThumbnailRowSpecs.cells(
            MeeshyThumbnailRowSpecs.Inputs(
                items: thumbnails(count: count, statuses: statuses, versions: versions, removeLabel: removeLabel),
                current: current, armed: armed, drag: drag, size: size, spacing: 6, tone: .deep, isEnabled: true,
                isRightToLeft: false,
                capabilities: MeeshyThumbnailCapabilities(canSelect: true, canDuplicate: true, canMove: true, canRemove: true),
                pressedPreview: nil
            )
        )
    }

    private static func changed(_ before: [MeeshyThumbnailCellSpec<String>], _ after: [MeeshyThumbnailCellSpec<String>]) -> Int {
        zip(before, after).filter { $0 != $1 }.count
    }

    @MainActor
    final class Log {
        nonisolated deinit {}

        var selected: [String] = []
        var duplicated: [String] = []
        var removed: [String] = []
        var moves: [(String, Int)] = []
        var added = 0
        var haptics: [MeeshyThumbnailRowHapticStyle] = []
    }

    @MainActor
    private static func model(
        _ log: Log,
        ids: [String] = ["a", "b", "c", "d"],
        withDuplicate: Bool = true,
        callbacks: MeeshyThumbnailRowCallbacks<String>? = nil
    ) -> MeeshyThumbnailRowModel<String> {
        let model = MeeshyThumbnailRowModel<String>()
        model.ids = ids
        model.current = ids.first
        model.pitch = 33
        model.callbacks = callbacks ?? MeeshyThumbnailRowCallbacks(
            onSelect: { log.selected.append($0) },
            onAdd: { log.added += 1 },
            onDuplicate: withDuplicate ? { log.duplicated.append($0) } : nil,
            onMove: { log.moves.append(($0, $1)) },
            onRemove: { log.removed.append($0) }
        )
        model.play = { log.haptics.append($0) }
        return model
    }

    private static func ms(_ seconds: Double) -> Double {
        (seconds * 1000).rounded()
    }

    private static func near(_ value: CGFloat, _ expected: Any?) -> Bool {
        guard let number = expected as? Double ?? (expected as? Int).map(Double.init) else { return false }
        return abs(Double(value) - number) < 1e-9
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K20-MeeshyThumbnailRow.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func cg(_ value: Any?) throws -> CGFloat {
        if let integer = value as? Int { return CGFloat(integer) }
        return CGFloat(try #require(value as? Double))
    }

    private static func code(_ file: String) throws -> String {
        let url = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit/\(file)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
