import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K16 — le cadre d'un mode plein écran, lu comme des LOIS : la loi 13 (ce qui est dessiné), la largeur
/// d'une capsule, la loi d'ajustement de l'en-tête et le partage de la place, la hauteur et le bas de la
/// plaque, le mouvement, la tenue de la capsule pleine, le contraste calculé depuis les recettes ; puis des
/// gardes de source (un seul verre par pièce, aucun geste propre, rien de dur). Les mesures viennent du
/// fichier de vecteurs que lisent aussi Android et le web.
@Suite("MeeshyModeChrome")
struct MeeshyModeChromeTests {

    // MARK: - Recette

    @Test("les mesures de la recette sont celles des vecteurs")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        typealias R = MeeshyModeChromeRecipe
        #expect(R.capsuleHeight == CGFloat(try Self.number(recipe["capsuleHeight"])))
        #expect(R.capsuleMargin == CGFloat(try Self.number(recipe["capsuleMargin"])))
        #expect(R.glyphGap == CGFloat(try Self.number(recipe["glyphGap"])))
        #expect(R.glyphSize == CGFloat(try Self.number(recipe["glyphSize"])))
        #expect(R.checkSize == CGFloat(try Self.number(recipe["checkSize"])))
        #expect(R.itemGap == CGFloat(try Self.number(recipe["itemGap"])))
        #expect(R.headerInset == CGFloat(try Self.number(recipe["headerInset"])))
        #expect(R.wideHeaderInset == CGFloat(try Self.number(recipe["wideHeaderInset"])))
        #expect(R.minimumLabelScale == CGFloat(try Self.number(recipe["minimumLabelScale"])))
        #expect(R.plateEdge == CGFloat(try Self.number(recipe["plateEdge"])))
        #expect(R.plateRadius == CGFloat(try Self.number(recipe["plateRadius"])))
        #expect(R.plateHorizontalPadding == CGFloat(try Self.number(recipe["plateHorizontalPadding"])))
        #expect(R.plateVerticalPadding == CGFloat(try Self.number(recipe["plateVerticalPadding"])))
        #expect(R.plateGap == CGFloat(try Self.number(recipe["plateGap"])))
        #expect(R.plateBottomGap == CGFloat(try Self.number(recipe["plateBottomGap"])))
        #expect(R.plateMinimumBottom == CGFloat(try Self.number(recipe["plateMinimumBottom"])))
        #expect(R.plateCeilingShare == CGFloat(try Self.number(recipe["plateCeilingShare"])))
        #expect(R.plateFloor == CGFloat(try Self.number(recipe["plateFloor"])))
        #expect(R.widePlateWidth == CGFloat(try Self.number(recipe["widePlateWidth"])))
        #expect(R.travel == CGFloat(try Self.number(recipe["travel"])))
        #expect(R.enterDuration == (try Self.number(recipe["enterMs"])) / 1000)
        #expect(R.exitDuration == (try Self.number(recipe["exitMs"])) / 1000)
        #expect(R.fadeDuration == (try Self.number(recipe["fadeMs"])) / 1000)
        #expect(R.contentFadeDuration == (try Self.number(recipe["contentFadeMs"])) / 1000)
        #expect(MeeshyGlassButtonRecipe.restFillOpacity == (try Self.number(recipe["restFillOpacity"])))
        #expect(MeeshyGlassButtonRecipe.pressedActiveFillOpacity == (try Self.number(recipe["pressedFillOpacity"])))
    }

    @Test("les retraits : 14 sur téléphone, 24 sur grand écran")
    func headerInset_byWidth() {
        #expect(MeeshyModeChromeRecipe.headerInset(isWide: false) == MeeshySpacing.mdPlus)
        #expect(MeeshyModeChromeRecipe.headerInset(isWide: true) == MeeshySpacing.xxl)
    }

    // MARK: - Loi 13

    @Test("loi 13 : ni validation, ni centre, ni accessoire, ni plaque hors de leurs conditions ; rangé, rien et aucun toucher")
    func rule_followsTheVectors() throws {
        for row in try Self.rows("rule") {
            let presence = try #require(MeeshyModeChromePresence(rawValue: row["presence"] as? String ?? ""))
            let rule = MeeshyModeChromeRule.resolve(
                hasConfirm: row["hasConfirm"] as? Bool ?? false, hasCenter: row["hasCenter"] as? Bool ?? false,
                hasAccessory: row["hasAccessory"] as? Bool ?? false, hasPlate: row["hasPlate"] as? Bool ?? false,
                presence: presence
            )
            #expect(rule.showsHeader == row["showsHeader"] as? Bool, "\(row)")
            #expect(rule.showsExit == row["showsExit"] as? Bool, "\(row)")
            #expect(rule.showsConfirm == row["showsConfirm"] as? Bool, "\(row)")
            #expect(rule.showsCenter == row["showsCenter"] as? Bool, "\(row)")
            #expect(rule.showsAccessory == row["showsAccessory"] as? Bool, "\(row)")
            #expect(rule.showsPlate == row["showsPlate"] as? Bool, "\(row)")
            #expect(rule.acceptsTouches == row["acceptsTouches"] as? Bool, "\(row)")
        }
    }

    @Test("rangé : rien de visible ni de touchable, quoi que l'hôte ait fourni")
    func rule_stowedShowsNothing() {
        let rule = MeeshyModeChromeRule.resolve(
            hasConfirm: true, hasCenter: true, hasAccessory: true, hasPlate: true, presence: .stowed
        )
        #expect(!rule.showsHeader && !rule.showsExit && !rule.showsConfirm && !rule.showsCenter)
        #expect(!rule.showsAccessory && !rule.showsPlate && !rule.acceptsTouches)
    }

    // MARK: - Capsule

    @Test("la largeur d'une capsule : marges, glyphe, titre à l'échelle, jamais sous 44")
    func capsuleWidth_followsTheVectors() throws {
        for row in try Self.rows("capsuleWidth") {
            let display = try #require(MeeshyModeCapsuleDisplay(rawValue: row["display"] as? String ?? ""))
            let width = MeeshyModeChromeRecipe.capsuleWidth(
                textWidth: CGFloat(try Self.number(row["textWidth"])), hasGlyph: row["hasGlyph"] as? Bool ?? false,
                display: display, labelScale: CGFloat(try Self.number(row["labelScale"]))
            )
            #expect(Self.near(width, try Self.number(row["width"])), "\(row)")
        }
    }

    @Test("sans glyphe, un affichage qui le demande retombe sur le titre")
    func effectiveDisplay_withoutGlyph() {
        #expect(MeeshyModeChromeRecipe.effectiveDisplay(.glyph, hasGlyph: false) == .title)
        #expect(MeeshyModeChromeRecipe.effectiveDisplay(.glyphAndTitle, hasGlyph: false) == .title)
        #expect(MeeshyModeChromeRecipe.effectiveDisplay(.glyph, hasGlyph: true) == .glyph)
    }

    @Test("la capsule pleine prend le fond, l'encre et l'ombre de l'actif de K02 ; le verre ne peint rien")
    func style_followsTheVectors() throws {
        for row in try Self.rows("style") {
            let kind = try #require(MeeshyModeCapsuleKind(rawValue: row["kind"] as? String ?? ""))
            let style = MeeshyModeCapsuleStyle.resolve(
                kind: kind, isPressed: row["pressed"] as? Bool ?? false,
                isEnabled: row["enabled"] as? Bool ?? true, isBusy: row["busy"] as? Bool ?? false
            )
            #expect(style.fillOpacity == (try Self.number(row["fillOpacity"])), "\(row)")
            #expect((style.shadow != nil) == row["shadow"] as? Bool, "\(row)")
            #expect(style.opacity == (try Self.number(row["opacity"])), "\(row)")
            #expect(style.respondsToTouch == row["responds"] as? Bool, "\(row)")
            #expect(style.inkIsSolid == (kind == .solid), "\(row)")
        }
    }

    // MARK: - Action

    @MainActor
    @Test("l'action part UNE fois, avec UN impact léger ; rien si désactivée ou occupée")
    func action_firesOnceThroughTheSingleSite() {
        var fired = 0
        var impacts = 0
        let play: @MainActor (MeeshyGlassButtonHaptic) -> Void = { _ in impacts += 1 }
        let action = MeeshyModeAction(title: "Valider") { fired += 1 }
        MeeshyGlassButtonTrigger.perform(isEnabled: action.isActionable, haptic: action.haptic, play: play, action: action.action)
        #expect(fired == 1 && impacts == 1)
        for blocked in [MeeshyModeAction(title: "Valider", isEnabled: false) { fired += 1 },
                        MeeshyModeAction(title: "Valider", isBusy: true) { fired += 1 }] {
            MeeshyGlassButtonTrigger.perform(isEnabled: blocked.isActionable, haptic: blocked.haptic, play: play, action: blocked.action)
        }
        #expect(fired == 1 && impacts == 1)
    }

    @MainActor
    @Test("Échap, l'échappement et ⌘ + Entrée prennent le chemin du toucher : perform part une fois, rien si occupée")
    func action_performIsThePathOfTouch() {
        var fired = 0
        let action = MeeshyModeAction(title: "Quitter", haptic: .none) { fired += 1 }
        let busy = MeeshyModeAction(title: "Terminé", isBusy: true, haptic: .none) { fired += 1 }
        let disabled = MeeshyModeAction(title: "Valider", isEnabled: false, haptic: .none) { fired += 1 }
        let ran = action.perform()
        let afterFirst = fired
        let ranBusy = busy.perform()
        let ranDisabled = disabled.perform()
        #expect(ran && afterFirst == 1)
        #expect(!ranBusy && !ranDisabled)
        #expect(fired == 1)
    }

    @MainActor
    @Test("sans impact, l'hôte joue le sien")
    func action_noneHapticPlaysNothing() {
        var impacts = 0
        MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .none, play: { _ in impacts += 1 }, action: {})
        #expect(impacts == 0)
    }

    // MARK: - Ajustement de l'en-tête

    @Test("la largeur requise : côtés joints par l'écart, centre posé au milieu du cadre")
    func requiredWidth_followsTheVectors() throws {
        for row in try Self.rows("requiredWidth") {
            let width = MeeshyModeHeaderFit.requiredWidth(
                exit: CGFloat(try Self.number(row["exit"])), center: Self.optional(row["center"]),
                accessory: Self.optional(row["accessory"]), confirm: Self.optional(row["confirm"])
            )
            #expect(Self.near(width, try Self.number(row["width"])), "\(row)")
        }
    }

    @Test("chaque vecteur de largeurs rend la réduction attendue, dans l'ordre : centre, validation, libellés")
    func fit_followsTheVectors() throws {
        for row in try Self.rows("fit") {
            let result = MeeshyModeHeaderFit.resolve(
                available: CGFloat(try Self.number(row["available"])),
                exit: try Self.item(row["exit"]), center: try Self.optionalItem(row["center"]),
                accessory: Self.optional(row["accessory"]), confirm: try Self.optionalItem(row["confirm"])
            )
            #expect(result.step.rawValue == row["step"] as? String, "\(row)")
            #expect(Self.near(result.width, try Self.number(row["width"])), "\(row)")
            #expect(result.fits == row["fits"] as? Bool, "\(row)")
        }
    }

    @Test("l'ordre des pas : le centre d'abord, la validation ensuite, les libellés en dernier")
    func fit_stepsAreOrdered() {
        #expect(MeeshyModeHeaderFit.Step.allCases == [.full, .centerGlyph, .confirmGlyph, .compact])
        #expect(!MeeshyModeHeaderFit.Step.full.reducesCenter && !MeeshyModeHeaderFit.Step.full.reducesConfirm)
        #expect(MeeshyModeHeaderFit.Step.centerGlyph.reducesCenter && !MeeshyModeHeaderFit.Step.centerGlyph.reducesConfirm)
        #expect(MeeshyModeHeaderFit.Step.confirmGlyph.reducesConfirm)
        #expect(MeeshyModeHeaderFit.Step.compact.labelScale == 0.8)
        #expect(MeeshyModeHeaderFit.Step.confirmGlyph.labelScale == 1)
    }

    @Test("le partage de la place : le centre cède d'abord, puis la validation, Quitter en dernier")
    func allocate_followsTheVectors() throws {
        for row in try Self.rows("allocate") {
            let expected = try #require(row["allocation"] as? [String: Any])
            let result = MeeshyModeHeaderFit.allocate(
                available: CGFloat(try Self.number(row["available"])), exit: CGFloat(try Self.number(row["exit"])),
                center: Self.optional(row["center"]), accessory: Self.optional(row["accessory"]),
                confirm: Self.optional(row["confirm"])
            )
            #expect(Self.near(result.exit, try Self.number(expected["exit"])), "\(row)")
            #expect(Self.nearOptional(result.center, Self.optionalDouble(expected["center"])), "\(row)")
            #expect(Self.nearOptional(result.accessory, Self.optionalDouble(expected["accessory"])), "\(row)")
            #expect(Self.nearOptional(result.confirm, Self.optionalDouble(expected["confirm"])), "\(row)")
        }
    }

    // MARK: - Plaque

    @Test("le plafond : 42 % de la fenêtre, jamais sous 160, jamais d'entrée non finie")
    func plate_maxHeight() throws {
        for row in try Self.plateRows("maxHeight") {
            #expect(Self.near(MeeshyModePlateMetrics.maxHeight(windowHeight: try Self.window(row["windowHeight"])), try Self.number(row["maxHeight"])), "\(row)")
        }
    }

    @Test("la plaque épouse son contenu (au moins 1), plafonnée")
    func plate_height() throws {
        for row in try Self.plateRows("height") {
            let height = MeeshyModePlateMetrics.height(
                content: CGFloat(try Self.number(row["content"])), windowHeight: try Self.window(row["windowHeight"])
            )
            #expect(Self.near(height, try Self.number(row["height"])), "\(row)")
        }
        #expect(MeeshyModePlateMetrics.height(content: .nan, windowHeight: 844) == 1)
    }

    @Test("elle défile dès que son contenu dépasse le plafond")
    func plate_scrolls() throws {
        for row in try Self.plateRows("scrolls") {
            let scrolls = MeeshyModePlateMetrics.scrolls(
                content: CGFloat(try Self.number(row["content"])), windowHeight: try Self.window(row["windowHeight"])
            )
            #expect(scrolls == row["scrolls"] as? Bool, "\(row)")
        }
    }

    @Test("le bas : la zone sûre plus 12, jamais sous 28")
    func plate_bottomMargin() throws {
        for row in try Self.plateRows("bottom") {
            #expect(MeeshyModePlateMetrics.bottomMargin(safeBottom: CGFloat(try Self.number(row["safeBottom"]))) == CGFloat(try Self.number(row["bottom"])), "\(row)")
        }
    }

    @Test("la largeur : la place moins deux bords de 12, bornée par l'hôte")
    func plate_width() throws {
        for row in try Self.plateRows("width") {
            let width = MeeshyModePlateMetrics.width(
                available: CGFloat(try Self.number(row["available"])), maxWidth: Self.optional(row["maxWidth"])
            )
            #expect(Self.near(width, try Self.number(row["width"])), "\(row)")
        }
        #expect(MeeshyModePlateMetrics.width(available: .infinity, maxWidth: nil) == 0)
    }

    // MARK: - Mouvement

    @Test("le mouvement : translation de 12 et 250 ms à l'entrée, 200 ms à la sortie ; mouvement réduit, fondu de 150 ms")
    func motion_followsTheVectors() throws {
        for row in try Self.rows("motion") {
            let motion = MeeshyModeChromeRecipe.motion(reduceMotion: row["reduceMotion"] as? Bool ?? false)
            #expect(motion.travel == CGFloat(try Self.number(row["travel"])), "\(row)")
            #expect(motion.enterDuration == (try Self.number(row["enterMs"])) / 1000, "\(row)")
            #expect(motion.exitDuration == (try Self.number(row["exitMs"])) / 1000, "\(row)")
            #expect(motion.isFadeOnly == row["fadeOnly"] as? Bool, "\(row)")
            #expect(motion.duration(toward: .shown) == motion.enterDuration)
            #expect(motion.duration(toward: .stowed) == motion.exitDuration)
        }
    }

    // MARK: - Contraste

    @Test("l'encre indigo950 sur la capsule pleine : 15,99:1 ; le libellé blanc sur le verre dense : 6,12:1 et 5,07:1")
    func contrast_followsTheRecipes() throws {
        let recipe = MeeshyGlassButtonRecipe.resolve(kind: .active, size: .s44, tone: .deep, material: .drawn)
        let solid = try #require(recipe.solidContrast(isDark: false))
        #expect(solid >= 15.9)
        #expect(Self.glassContrast(tone: .deep) >= 6.1)
        #expect(Self.glassContrast(tone: .onLight) >= 5.0)
        let vectors = try Self.object("contrast")
        #expect(Self.near(CGFloat(solid), try Self.number(vectors["solidInkOnFill"]), tolerance: 0.01))
        #expect(Self.glassContrast(tone: .deep) >= (try Self.number(vectors["glassDeepDense"])))
        #expect(Self.glassContrast(tone: .onLight) >= (try Self.number(vectors["glassOnLightDense"])))
    }

    // MARK: - Non-re-rendu

    @MainActor
    @Test("l'en-tête est comparable : à valeurs égales il n'est pas réévalué")
    func header_isEquatable() {
        let exit = MeeshyModeAction(title: "Quitter") {}
        let base = Self.header(exit: exit, confirm: MeeshyModeAction(title: "Valider") {})
        let twin = Self.header(exit: exit, confirm: MeeshyModeAction(title: "Valider") {})
        let bare = Self.header(exit: exit, confirm: nil)
        let busy = Self.header(exit: exit, confirm: MeeshyModeAction(title: "Valider", isBusy: true) {})
        let isTwin = base == twin
        let differsFromBare = base != bare
        let differsFromBusy = base != busy
        #expect(isTwin)
        #expect(differsFromBare)
        #expect(differsFromBusy)
    }

    @MainActor
    @Test("la capsule est comparable sur ses valeurs, fermeture exclue")
    func capsule_isEquatable() {
        let base = MeeshyModeCapsule(title: "Photos", systemImage: "arrow.down.to.line") {}
        let twin = MeeshyModeCapsule(title: "Photos", systemImage: "arrow.down.to.line") {}
        let plain = MeeshyModeCapsule(title: "Photos") {}
        let busy = MeeshyModeCapsule(title: "Photos", isBusy: true) {}
        let solid = MeeshyModeCapsule(title: "Photos", kind: .solid) {}
        let isTwin = base == twin
        let busyDiffers = plain != busy
        let solidDiffers = plain != solid
        #expect(isTwin)
        #expect(busyDiffers)
        #expect(solidDiffers)
    }

    @MainActor
    @Test("sans plaque, ni verre ni bande : le cadre le sait avant de dessiner")
    func empty_slotsAreRecognised() {
        let bareCenter = MeeshyModeHeader<EmptyView, EmptyView>.hasCenter
        let bareAccessory = MeeshyModeHeader<EmptyView, EmptyView>.hasAccessory
        let noSlot = MeeshyModeHeader<MeeshyModeNoSlot, MeeshyModeNoSlot>.hasCenter
        let filledCenter = MeeshyModeHeader<Text, Text>.hasCenter
        let filledAccessory = MeeshyModeHeader<Text, Text>.hasAccessory
        #expect(!bareCenter && !bareAccessory && !noSlot)
        #expect(filledCenter && filledAccessory)
    }

    // MARK: - Source

    @Test("un seul verre par pièce, demandé à K01 : les capsules de verre et la plaque ; le cadre n'en pose aucun")
    func source_oneGlassPerPiece() throws {
        let capsule = try Self.code("MeeshyModeCapsule.swift")
        let plate = try Self.code("MeeshyModePlate.swift")
        let header = try Self.code("MeeshyModeHeader.swift")
        let chrome = try Self.code("MeeshyModeChrome.swift")
        #expect(capsule.components(separatedBy: ".meeshyGlass(").count == 2)
        #expect(plate.components(separatedBy: ".meeshyGlass(").count == 2)
        #expect(header.components(separatedBy: ".meeshyGlass(").count == 1)
        #expect(chrome.components(separatedBy: ".meeshyGlass(").count == 1)
        #expect(header.contains("MeeshyGlassGroup("))
        #expect(capsule.contains("density: .dense"))
        #expect(plate.contains("density: .dense"))
    }

    @Test("la loi d'ajustement : quatre candidats dans l'ordre des pas, par ViewThatFits")
    func source_fitIsTheLaw() throws {
        let code = try Self.code("MeeshyModeHeader.swift")
        #expect(code.contains("ViewThatFits(in: .horizontal)"))
        let positions = try ["row(.full)", "row(.centerGlyph)", "row(.confirmGlyph)", "row(.compact)"].map {
            try #require(code.range(of: $0)).lowerBound
        }
        #expect(positions == positions.sorted())
        #expect(code.contains("MeeshyModeHeaderLayout("))
    }

    @Test("le cadre laisse passer tout toucher hors de ses capsules et de sa plaque")
    func source_framePassesTouchesThrough() throws {
        let code = try Self.code("MeeshyModeChrome.swift")
        for word in ["contentShape", "Color.clear", ".background(", ".gesture(", "onTapGesture", "allowsHitTesting(true"] {
            #expect(!code.contains(word), "MeeshyModeChrome.swift contient \(word)")
        }
        #expect(code.contains("Spacer(minLength: 0)"))
        #expect(code.contains(".ignoresSafeArea(.keyboard, edges: .bottom)"))
    }

    @Test("rangé, la pièce est retirée de l'arbre : seules la translation et l'opacité s'animent")
    func source_presenceAnimatesOnlyOffsetAndOpacity() throws {
        let code = try Self.code("MeeshyModePresence.swift")
        #expect(code.contains("if !presence.isStowed"))
        #expect(code.contains(".offset(y:"))
        #expect(code.contains(".opacity"))
        for word in [".blur(", ".shadow(", "scaleEffect", "GeometryReader"] {
            #expect(!code.contains(word), "MeeshyModePresence.swift contient \(word)")
        }
    }

    @Test("accessibilité : nom du mode et de la plaque, annonce d'entrée, Échap et ⌘ + Entrée par un seul chemin, valeur « en cours »")
    func source_accessibility() throws {
        let header = try Self.code("MeeshyModeHeader.swift")
        #expect(header.contains(".accessibilityElement(children: .contain)"))
        #expect(header.contains(".accessibilityLabel(label)"))
        #expect(header.contains("UIAccessibility.post(notification: .screenChanged, argument: label)"))
        #expect(header.contains(".dismissOnEscape { exit.perform() }"))
        #expect(header.contains(".keyboardShortcut(.return, modifiers: .command)"))
        #expect(header.contains("assert(!label.isEmpty"))
        let plate = try Self.code("MeeshyModePlate.swift")
        #expect(plate.contains(".accessibilityLabel(label)"))
        #expect(plate.contains(".scrollDismissesKeyboard(.never)"))
        let capsule = try Self.code("MeeshyModeCapsule.swift")
        #expect(capsule.contains(".accessibilityLabel(values.title)"))
        #expect(capsule.contains("MeeshyProgressRingWords.spokenValue"))
        #expect(capsule.contains("assert(!title.isEmpty"))
        let readingOrder = try Self.code("MeeshyModeHeader.swift")
        let exitAt = try #require(readingOrder.range(of: ".meeshyModeRole(.exit)"))
        let centerAt = try #require(readingOrder.range(of: ".meeshyModeRole(.center)"))
        let accessoryAt = try #require(readingOrder.range(of: ".meeshyModeRole(.accessory)"))
        let confirmAt = try #require(readingOrder.range(of: ".meeshyModeRole(.confirm)"))
        #expect(exitAt.lowerBound < centerAt.lowerBound)
        #expect(centerAt.lowerBound < accessoryAt.lowerBound)
        #expect(accessoryAt.lowerBound < confirmAt.lowerBound)
    }

    @Test("aucun verre écrit à la main, aucune couleur ni rayon en dur, aucune légende, aucun type du composer ni des appels")
    func source_hasNoOwnGlassNoLiteralNoDomain() throws {
        let files = ["MeeshyModeChrome.swift", "MeeshyModeHeader.swift", "MeeshyModeHeaderLayout.swift",
                     "MeeshyModePlate.swift", "MeeshyModeCapsule.swift", "MeeshyModePresence.swift",
                     "MeeshyModeChromeRecipe.swift", "MeeshyModeChromeRule.swift",
                     "Catalog/MeeshyKitCatalog+K16.swift"]
        let forbidden = [
            "caption", "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray",
            "Color.red", ".secondary", "#FF", "0x", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass",
            "UIBlurEffect", "Material", "cornerRadius: 3", "cornerRadius: 2",
            "Composer", "Story", "Call", "HapticFeedback", ".shared",
        ]
        for file in files {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("le catalogue porte les onze états de la fiche")
    func catalog_states() throws {
        let entry = try #require(MeeshyKitCatalog.listedEntry(matching: "K16"))
        #expect(entry.states.map(\.id) == [
            "texte", "plaque", "coche", "trois", "accessoire", "plaque-longue", "sans-plaque",
            "occupe", "desactive", "clair", "large",
        ])
        #expect(entry.states.filter(\.isTouchable).map(\.id) == ["texte", "plaque", "coche", "trois", "large"])
    }

    // MARK: - Aides

    @MainActor
    private static func header(exit: MeeshyModeAction, confirm: MeeshyModeAction?) -> MeeshyModeHeader<MeeshyModeNoSlot, MeeshyModeNoSlot> {
        MeeshyModeHeader(
            label: "Dessin", exit: exit, confirm: confirm, center: { MeeshyModeNoSlot() }, accessory: { MeeshyModeNoSlot() }
        )
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K16-MeeshyModeChrome.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func plateRows(_ key: String) throws -> [[String: Any]] {
        try #require(try object("plate")[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }

    private static func number(_ value: Any?) throws -> Double {
        try #require((value as? NSNumber)?.doubleValue, "nombre attendu : \(String(describing: value))")
    }

    private static func optionalDouble(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }

    private static func optional(_ value: Any?) -> CGFloat? {
        optionalDouble(value).map { CGFloat($0) }
    }

    private static func window(_ value: Any?) throws -> CGFloat {
        if let text = value as? String, text == "nan" { return .nan }
        return CGFloat(try number(value))
    }

    private static func item(_ value: Any?) throws -> MeeshyModeHeaderFit.Item {
        let row = try #require(value as? [String: Any])
        let display = try #require(MeeshyModeCapsuleDisplay(rawValue: row["display"] as? String ?? ""))
        return MeeshyModeHeaderFit.Item(
            textWidth: CGFloat(try number(row["textWidth"])), hasGlyph: row["hasGlyph"] as? Bool ?? false, display: display
        )
    }

    private static func optionalItem(_ value: Any?) throws -> MeeshyModeHeaderFit.Item? {
        value is NSNull || value == nil ? nil : try item(value)
    }

    private static func near(_ value: CGFloat, _ expected: Double, tolerance: Double = 0.0001) -> Bool {
        abs(Double(value) - expected) <= tolerance
    }

    private static func nearOptional(_ value: CGFloat?, _ expected: Double?) -> Bool {
        switch (value, expected) {
        case (nil, nil): return true
        case let (value?, expected?): return near(value, expected)
        default: return false
        }
    }

    /// Le contraste de l'encre blanche sur le verre `dense` du ton, au pire fond qu'il accepte, calculé
    /// depuis la recette de K01 (composition en sRGB encodé).
    private static func glassContrast(tone: MeeshyGlassTone) -> Double {
        let recipe = MeeshyGlassRecipe.resolve(
            tone: tone, density: .dense, isTinted: false, isInteractive: false, isPressed: false,
            material: .drawn, reduceMotion: false, isNested: false, isHovered: false
        )
        let backdrop = tone == .plain ? MeeshyGlassTone.plainCeiling : 1
        let encoded = backdrop <= 0.0031308 ? backdrop * 12.92 : 1.055 * pow(backdrop, 1 / 2.4) - 0.055
        let inkLevel: Double = recipe.fill == .light ? 1 : 0
        let covered = encoded * (1 - recipe.fillOpacity) + inkLevel * recipe.fillOpacity
        let luminance = CanvasChromeScheme.luminance(red: covered, green: covered, blue: covered)
        return CanvasChromeScheme.contrastRatio(1, luminance)
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
