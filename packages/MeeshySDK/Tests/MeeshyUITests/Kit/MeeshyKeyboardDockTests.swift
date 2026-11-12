import Testing
import Foundation
import SwiftUI
import UIKit
@testable import MeeshyUI

/// K17 — la barre collée au clavier et le panneau qui le remplace, lus comme des LOIS : la loi 13 (ce qui est
/// monté), `tapped` et `fieldTouched`, la hauteur retenue, la hauteur du panneau, la mesure du clavier et la
/// réserve publiée, l'ajustement de « OK » ; puis le lien au champ sur un champ factice, l'accessibilité, le
/// contraste calculé depuis les recettes, et des gardes de source (aucun verre écrit à la main, rien de dur,
/// aucun type du composer ni des appels). Les mesures viennent du fichier de vecteurs que lisent aussi
/// Android et le web.
@Suite("MeeshyKeyboardDock")
struct MeeshyKeyboardDockTests {

    // MARK: - Recette

    @Test("les mesures de la recette sont celles des vecteurs")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        typealias R = MeeshyKeyboardDockRecipe
        #expect(R.edge == CGFloat(try Self.number(recipe["edge"])))
        #expect(R.barPadding == CGFloat(try Self.number(recipe["barPadding"])))
        #expect(R.keyboardGap == CGFloat(try Self.number(recipe["keyboardGap"])))
        #expect(R.aboveGap == CGFloat(try Self.number(recipe["aboveGap"])))
        #expect(R.barHeight == CGFloat(try Self.number(recipe["barHeight"])))
        #expect(R.barRadius == CGFloat(try Self.number(recipe["barRadius"])))
        #expect(R.toolDiameter == CGFloat(try Self.number(recipe["toolDiameter"])))
        #expect(R.confirmHeight == CGFloat(try Self.number(recipe["confirmHeight"])))
        #expect(R.confirmMargin == CGFloat(try Self.number(recipe["confirmMargin"])))
        #expect(R.maxItems == Int(try Self.number(recipe["maxItems"])))
        #expect(R.maxBarWidth == CGFloat(try Self.number(recipe["maxBarWidth"])))
        #expect(R.fallbackKeyboardHeight == CGFloat(try Self.number(recipe["fallbackKeyboardHeight"])))
        #expect(R.fallbackShare == CGFloat(try Self.number(recipe["fallbackShare"])))
        #expect(R.minimumKeyboardHeight == CGFloat(try Self.number(recipe["minimumKeyboardHeight"])))
        #expect(R.sceneGap == CGFloat(try Self.number(recipe["sceneGap"])))
        #expect(R.bottomWithoutKeyboardMargin == CGFloat(try Self.number(recipe["bottomWithoutKeyboardMargin"])))
        #expect(R.bottomWithoutKeyboardFloor == CGFloat(try Self.number(recipe["bottomWithoutKeyboardFloor"])))
        #expect(R.panelHorizontalPadding == CGFloat(try Self.number(recipe["panelHorizontalPadding"])))
        #expect(R.panelVerticalPadding == CGFloat(try Self.number(recipe["panelVerticalPadding"])))
        #expect(R.panelGap == CGFloat(try Self.number(recipe["panelGap"])))
        #expect(R.panelBottomFloor == CGFloat(try Self.number(recipe["panelBottomFloor"])))
        #expect(R.barRiseDuration == (try Self.number(recipe["barRiseMs"])) / 1000)
        #expect(R.bandEnterDuration == (try Self.number(recipe["bandEnterMs"])) / 1000)
        #expect(R.bandExitDuration == (try Self.number(recipe["bandExitMs"])) / 1000)
        #expect(R.panelFadeDuration == (try Self.number(recipe["panelFadeMs"])) / 1000)
        #expect(R.bandTravel == CGFloat(try Self.number(recipe["bandTravel"])))
        #expect(R.fallbackKeyboardDurationMs == Int(try Self.number(recipe["fallbackKeyboardDurationMs"])))
    }

    @Test("les jetons : la barre fait 52, son rayon est la moitié, la capsule de validation fait 44 dans la marge de 4")
    func recipe_tokens() {
        typealias R = MeeshyKeyboardDockRecipe
        #expect(R.edge == MeeshySpacing.sm)
        #expect(R.barPadding == MeeshySpacing.xs)
        #expect(R.aboveGap == MeeshySpacing.xs)
        #expect(R.keyboardGap == MeeshySpacing.xsPlus)
        #expect(R.barHeight == MeeshyControlSize.tapTarget + 2 * MeeshySpacing.xs)
        #expect(R.barRadius == R.barHeight / 2)
        #expect(R.confirmHeight == MeeshyModeChromeRecipe.capsuleHeight)
        #expect(R.confirmHeight + 2 * R.barPadding == R.barHeight)
        #expect(R.toolDiameter == MeeshyControlSize.tapTarget)
        #expect(R.panelHorizontalPadding == MeeshySpacing.lg)
        #expect(R.panelVerticalPadding == MeeshySpacing.mdPlus)
        #expect(R.panelGap == MeeshySpacing.md)
    }

    @Test("la largeur de la barre : bornée à 480 et bords à 8")
    func barWidth_followsTheVectors() throws {
        for row in try Self.rows("barWidth") {
            let width = CGFloat(try Self.number(row["containerWidth"]))
            #expect(Self.near(MeeshyKeyboardDockRecipe.barWidth(containerWidth: width), try Self.number(row["expected"])), "\(row)")
        }
    }

    @Test("le bas sans clavier : zone sûre + 6, au moins 12")
    func bottomWithoutKeyboard_followsTheVectors() throws {
        for row in try Self.rows("bottomWithoutKeyboard") {
            let safe = CGFloat(try Self.number(row["safeBottom"]))
            #expect(Self.near(MeeshyKeyboardDockRecipe.bottomWithoutKeyboard(safeBottom: safe), try Self.number(row["expected"])), "\(row)")
        }
    }

    @Test("sans animation : la bande ne se translate plus, le fondu reste")
    func reduceMotion_removesTheOwnTranslation() {
        #expect(MeeshyKeyboardDockRecipe.bandTravel(reduceMotion: false) == MeeshyKeyboardDockRecipe.bandTravel)
        #expect(MeeshyKeyboardDockRecipe.bandTravel(reduceMotion: true) == 0)
        #expect(MeeshyKeyboardDockRecipe.panelFadeDuration == 0.15)
    }

    // MARK: - Loi 13

    @Test("loi 13 : rien si inactif ; jamais le clavier et un panneau ; l'entrée élue redevient le clavier")
    func rule_followsTheVectors() throws {
        for row in try Self.rows("rule") {
            let items = try Self.items(row["items"])
            let input = try Self.input(row["input"])
            let result = MeeshyKeyboardDockRule.resolve(
                isActive: row["isActive"] as? Bool ?? false, input: input, items: items,
                hasAbove: row["hasAbove"] as? Bool ?? false
            )
            let expected = try #require(row["expected"] as? [String: Any])
            #expect(result.input == (try Self.input(expected["input"])), "\(row)")
            #expect(result.showsBar == (expected["showsBar"] as? Bool), "\(row)")
            #expect(result.showsKeyboard == (expected["showsKeyboard"] as? Bool), "\(row)")
            #expect(result.showsPanel == (expected["showsPanel"] as? Bool), "\(row)")
            #expect(result.showsBand == (expected["showsBand"] as? Bool), "\(row)")
            #expect(Self.near(result.bandGap, try Self.number(expected["bandGap"])), "\(row)")
            #expect(result.receivesTouches == (expected["receivesTouches"] as? Bool), "\(row)")
            #expect(result.attachesToField == (expected["attachesToField"] as? Bool), "\(row)")
            #expect(!(result.showsKeyboard && result.showsPanel), "jamais les deux : \(row)")
        }
    }

    @Test("l'écart de la bande n'existe pas sans bande")
    func rule_noGapWithoutBand() {
        let result = MeeshyKeyboardDockRule.resolve(isActive: true, input: .keyboard, items: [], hasAbove: false)
        #expect(!result.showsBand)
        #expect(result.bandGap == 0)
    }

    // MARK: - tapped, fieldTouched

    @Test("tapped : ouvre, bascule d'un outil à l'autre, referme sur l'outil ouvert ; une action simple ne change rien")
    func tapped_followsTheVectors() throws {
        for row in try Self.rows("tapped") {
            let items = try Self.items(row["items"])
            let id = try #require(row["item"] as? String)
            let item = try #require(items.first { $0.id == id })
            let result = MeeshyKeyboardDockRule.tapped(item, in: try Self.input(row["input"]))
            #expect(result == (try Self.input(row["expected"])), "\(row)")
        }
    }

    @Test("toucher le champ rend toujours le clavier")
    func fieldTouched_followsTheVectors() throws {
        for row in try Self.rows("fieldTouched") {
            #expect(MeeshyKeyboardDockRule.fieldTouched(try Self.input(row["input"])) == (try Self.input(row["expected"])))
        }
    }

    @Test("Échap : un panneau ouvert rend le clavier ; sinon la touche va à l'hôte")
    func escape_closesThePanelOnly() {
        #expect(MeeshyKeyboardDockRule.escaped(.panel("font")) == .keyboard)
        #expect(MeeshyKeyboardDockRule.escaped(.keyboard) == nil)
    }

    @Test("le rangement par le système n'est dit que clavier levé, jamais à l'ouverture d'un panneau")
    func dismissal_isReportedOnlyForTheKeyboard() {
        #expect(MeeshyKeyboardDockRule.reportsDismissal(input: .keyboard))
        #expect(!MeeshyKeyboardDockRule.reportsDismissal(input: .panel("font")))
    }

    // MARK: - Hauteur retenue, panneau, mesure

    @Test("seul un clavier d'au moins 160 se retient, jamais le panneau lui-même ni une barre seule")
    func retainedKeyboard_followsTheVectors() throws {
        for row in try Self.rows("retainedKeyboard") {
            let result = MeeshyKeyboardDockRule.retainedKeyboardHeight(
                previous: CGFloat(try Self.number(row["previous"])), overlap: CGFloat(try Self.number(row["overlap"])),
                accessoryHeight: CGFloat(try Self.number(row["accessoryHeight"])), input: try Self.input(row["input"])
            )
            #expect(Self.near(result, try Self.number(row["expected"])), "\(row)")
        }
    }

    @Test("le panneau a la hauteur du clavier retenu ; le repli 291 est borné à 45 % de la fenêtre")
    func panelHeight_followsTheVectors() throws {
        for row in try Self.rows("panelHeight") {
            let result = MeeshyKeyboardDockRule.panelHeight(
                retained: CGFloat(try Self.number(row["retained"])), windowHeight: Self.optional(row["windowHeight"])
            )
            #expect(Self.near(result, try Self.number(row["expected"])), "\(row)")
        }
    }

    @Test("la mesure du clavier : ancré, flottant, scindé, Stage Manager, matériel, trame dégénérée")
    func overlap_followsTheVectors() throws {
        for row in try Self.rows("overlap") {
            let keyboard = try Self.frame(row["keyboard"])
            let window = try Self.optionalFrame(row["window"])
            let measure = MeeshyKeyboardDockRule.measure(
                keyboardEndFrame: keyboard, windowFrame: window, current: CGFloat(try Self.number(row["current"]))
            )
            #expect(Self.near(measure.overlap, try Self.number(row["expected"])), "\(row)")
            #expect(measure.isFloating == (row["isFloating"] as? Bool), "\(row)")
        }
    }

    @Test("la réserve : le recouvrement et l'écart de scène ; 0 quand rien ne recouvre")
    func reserve_followsTheVectors() throws {
        for row in try Self.rows("reserve") {
            let result = MeeshyKeyboardDockRule.reserve(overlap: CGFloat(try Self.number(row["overlap"])))
            #expect(Self.near(result, try Self.number(row["expected"])), "\(row)")
        }
    }

    @Test("la place publiée porte la réserve, la hauteur retenue, la durée du mouvement et le drapeau flottant")
    func place_carriesTheMotion() {
        let measure = MeeshyKeyboardDockRule.Measure(overlap: 343, isFloating: false)
        let place = MeeshyKeyboardDockRule.place(measure: measure, retained: 291, durationMs: 250)
        #expect(place == MeeshyKeyboardDockPlace(reserve: 357, keyboard: 291, durationMs: 250, isFloating: false))
        let floating = MeeshyKeyboardDockRule.place(
            measure: .init(overlap: 0, isFloating: true), retained: 291, durationMs: 400
        )
        #expect(floating.reserve == 0)
        #expect(floating.isFloating)
    }

    @Test("la durée du mouvement : celle de la notification, 250 ms à défaut")
    func durationMs_followsTheVectors() throws {
        for row in try Self.rows("durationMs") {
            #expect(MeeshyKeyboardDockRule.durationMs(seconds: Self.optionalDouble(row["seconds"])) == Int(try Self.number(row["expected"])), "\(row)")
        }
    }

    @Test("une valeur par mouvement : la place identique n'est pas republiée")
    func placeGate_publishesOncePerMovement() {
        var gate = MeeshyKeyboardDockPlaceGate()
        let first = MeeshyKeyboardDockPlace(reserve: 357, keyboard: 291, durationMs: 250, isFloating: false)
        #expect(gate.publish(first) == first)
        #expect(gate.publish(first) == nil)
        let moved = MeeshyKeyboardDockPlace(reserve: 0, keyboard: 291, durationMs: 250, isFloating: false)
        #expect(gate.publish(moved) == moved)
        #expect(gate.publish(first) == first)
    }

    // MARK: - Ajustement de « OK »

    @Test("« OK » passe en coche au vecteur de largeur attendu ; cinq outils tiennent sur 320")
    func fit_followsTheVectors() throws {
        for row in try Self.rows("fit") {
            let available = CGFloat(try Self.number(row["availableWidth"]))
            let count = Int(try Self.number(row["itemCount"]))
            let title = CGFloat(try Self.number(row["titleWidth"]))
            #expect(Self.near(MeeshyKeyboardBarFit.requiredWidth(itemCount: count, titleWidth: title), try Self.number(row["requiredWidth"])), "\(row)")
            let display = MeeshyKeyboardBarFit.display(availableWidth: available, itemCount: count, titleWidth: title)
            #expect(display.rawValue == (row["expected"] as? String), "\(row)")
        }
        let onSmallPhone = MeeshyKeyboardDockRecipe.barWidth(containerWidth: 320)
        #expect(MeeshyKeyboardBarFit.display(availableWidth: onSmallPhone, itemCount: 5, titleWidth: 22) == .title)
    }

    @Test("au plus cinq outils : les suivants ne sont pas dessinés")
    func items_areCappedAtFive() {
        let items = (0..<7).map { MeeshyKeyboardDockItem(id: "i\($0)", label: "Outil \($0)", systemImage: "circle") }
        #expect(MeeshyKeyboardDockRule.visibleItems(items).map(\.id) == ["i0", "i1", "i2", "i3", "i4"])
        #expect(MeeshyKeyboardDockRule.visibleItems([]).isEmpty)
    }

    // MARK: - Les gestes

    @MainActor
    @Test("un outil à panneau : l'hôte entend l'outil UNE fois et l'entrée élue ; une action simple : l'outil seul")
    func activate_item() {
        var heard: [String] = []
        var inputs: [MeeshyKeyboardDockInput] = []
        let font = MeeshyKeyboardDockItem(id: "font", label: "Police", systemImage: "textformat")
        let mention = MeeshyKeyboardDockItem(id: "mention", label: "Mention", systemImage: "at", opensPanel: false)
        MeeshyKeyboardDockRule.activate(font, input: .keyboard, onItem: { heard.append($0) }, onInputChange: { inputs.append($0) })
        MeeshyKeyboardDockRule.activate(font, input: .panel("font"), onItem: { heard.append($0) }, onInputChange: { inputs.append($0) })
        MeeshyKeyboardDockRule.activate(mention, input: .panel("font"), onItem: { heard.append($0) }, onInputChange: { inputs.append($0) })
        #expect(heard == ["font", "font", "mention"])
        #expect(inputs == [.panel("font"), .keyboard])
    }

    @MainActor
    @Test("un outil désactivé : ni action ni changement d'entrée")
    func activate_disabledItem() {
        var heard = 0
        var changed = 0
        let off = MeeshyKeyboardDockItem(id: "font", label: "Police", systemImage: "textformat", isEnabled: false)
        MeeshyKeyboardDockRule.activate(off, input: .keyboard, onItem: { _ in heard += 1 }, onInputChange: { _ in changed += 1 })
        #expect(heard == 0)
        #expect(changed == 0)
    }

    @MainActor
    @Test("« OK » part une fois ; rien si désactivé")
    func confirm_firesOnce() {
        var fired = 0
        let ok = MeeshyKeyboardDockConfirm(title: "OK", label: "Valider le texte", action: { fired += 1 })
        ok.perform()
        #expect(fired == 1)
        let off = MeeshyKeyboardDockConfirm(title: "OK", label: "Valider le texte", isEnabled: false, action: { fired += 1 })
        off.perform()
        #expect(fired == 1)
    }

    @Test("les valeurs d'un outil et de la validation se comparent sans leur fermeture")
    func values_compareWithoutClosures() {
        let one = MeeshyKeyboardDockConfirm(title: "OK", label: "Valider", action: {})
        let two = MeeshyKeyboardDockConfirm(title: "OK", label: "Valider", action: { _ = 1 })
        let three = MeeshyKeyboardDockConfirm(title: "OK", label: "Terminer", action: {})
        #expect(one == two)
        #expect(one != three)
        #expect(MeeshyKeyboardDockInput.panel("a").panelID == "a")
        #expect(MeeshyKeyboardDockInput.keyboard.panelID == nil)
    }

    // MARK: - Le lien au champ

    @MainActor
    @Test("le lien pose et retire les deux vues d'entrée sur un champ factice ; rien ne reste après detach")
    func link_installsAndClears() {
        let link = MeeshyKeyboardDockLink()
        let field = UITextView()
        let accessory = UIView()
        let panel = UIView()
        link.attach(to: field)
        link.install(accessory: accessory, input: nil)
        #expect(field.inputAccessoryView === accessory)
        #expect(field.inputView == nil)
        link.install(accessory: accessory, input: panel)
        #expect(field.inputView === panel)
        link.detach()
        #expect(field.inputAccessoryView == nil)
        #expect(field.inputView == nil)
    }

    @MainActor
    @Test("le lien marche aussi sur un champ d'une ligne")
    func link_acceptsATextField() {
        let link = MeeshyKeyboardDockLink()
        let field = UITextField()
        let accessory = UIView()
        link.attach(to: field)
        link.install(accessory: accessory, input: nil)
        #expect(field.inputAccessoryView === accessory)
        link.detach()
        #expect(field.inputAccessoryView == nil)
    }

    @MainActor
    @Test("le lien recharge les vues d'entrée seulement si elles changent")
    func link_reloadsOnlyOnChange() {
        let link = MeeshyKeyboardDockLink()
        let field = MeeshyKeyboardDockFocusedField()
        let accessory = UIView()
        let panel = UIView()
        link.attach(to: field)
        link.install(accessory: accessory, input: nil)
        #expect(field.reloads == 1)
        link.install(accessory: accessory, input: nil)
        #expect(field.reloads == 1)
        link.install(accessory: accessory, input: panel)
        #expect(field.reloads == 2)
        link.install(accessory: accessory, input: panel)
        #expect(field.reloads == 2)
    }

    @MainActor
    @Test("le lien ne tient le champ que faiblement")
    func link_holdsTheFieldWeakly() {
        let link = MeeshyKeyboardDockLink()
        weak var weakField: UITextView?
        autoreleasepool {
            let field = UITextView()
            weakField = field
            link.attach(to: field)
        }
        #expect(weakField == nil)
        link.install(accessory: UIView(), input: nil)
    }

    @MainActor
    @Test("toucher le champ remonte à l'hôte par le lien")
    func link_reportsTheFieldTouch() {
        let link = MeeshyKeyboardDockLink()
        var touches = 0
        link.onFieldTouched = { touches += 1 }
        link.fieldTouched()
        #expect(touches == 1)
    }

    // MARK: - Les vues d'entrée

    @MainActor
    @Test("les zones transparentes de la vue accessoire rendent un test de toucher nul ; la capsule reçoit les siens")
    func inputView_letsTouchesThrough() {
        let container = MeeshyKeyboardDockInputView(frame: CGRect(x: 0, y: 0, width: 390, height: 120), style: .default)
        let hosted = UIView(frame: container.bounds)
        container.embed(hosted)
        let control = UIButton(frame: CGRect(x: 8, y: 60, width: 100, height: 52))
        hosted.addSubview(control)
        #expect(container.hitTest(CGPoint(x: 300, y: 10), with: nil) == nil)
        #expect(container.hitTest(CGPoint(x: 40, y: 80), with: nil) === control)
    }

    @MainActor
    @Test("le panneau garde la hauteur du clavier retenu, par son cadre ET par sa contrainte")
    func panelInputView_followsTheHeight() {
        let container = MeeshyKeyboardDockInputView(frame: CGRect(x: 0, y: 0, width: 390, height: 291), style: .keyboard)
        container.setHeight(336)
        #expect(container.frame.height == 336)
        let constraint = container.constraints.first { $0.firstAttribute == .height }
        #expect(constraint?.constant == 336)
        container.setHeight(291)
        #expect(container.constraints.first { $0.firstAttribute == .height }?.constant == 291)
    }

    // MARK: - Accessibilité

    @Test("l'ouverture d'un panneau annonce son nom ; le retour au clavier ne dit rien")
    func announcement_onlyForPanels() {
        let items = [MeeshyKeyboardDockItem(id: "font", label: "Police et effet", systemImage: "textformat")]
        #expect(MeeshyKeyboardDockRule.announcement(for: .panel("font"), items: items) == "Police et effet")
        #expect(MeeshyKeyboardDockRule.announcement(for: .keyboard, items: items) == nil)
        #expect(MeeshyKeyboardDockRule.announcement(for: .panel("gone"), items: items) == nil)
    }

    @Test("un outil à panneau est annoncé développé ou réduit ; une action simple ne l'est pas")
    func activation_expandedOnlyForPanels() {
        let font = MeeshyKeyboardDockItem(id: "font", label: "Police", systemImage: "textformat")
        let mention = MeeshyKeyboardDockItem(id: "mention", label: "Mention", systemImage: "at", opensPanel: false)
        #expect(MeeshyKeyboardDockRule.activation(for: font, openItem: "font") == .expanded(true))
        #expect(MeeshyKeyboardDockRule.activation(for: font, openItem: nil) == .expanded(false))
        #expect(MeeshyKeyboardDockRule.activation(for: mention, openItem: "mention") == .none)
    }

    @Test("le contenu de la barre se lit du début à la fin : les outils puis « OK », le panneau après")
    func readingOrder_isToolsThenConfirmThenPanel() throws {
        let bar = try Self.code("MeeshyKeyboardBar.swift")
        let toolsAt = try #require(bar.range(of: "ForEach(tools"))
        let confirmAt = try #require(bar.range(of: "MeeshyModeCapsule("))
        #expect(toolsAt.lowerBound < confirmAt.lowerBound)
        let dock = try Self.code("MeeshyKeyboardDock.swift")
        let aboveAt = try #require(dock.range(of: "above"))
        let barAt = try #require(dock.range(of: "MeeshyKeyboardBar("))
        let panelAt = try #require(dock.range(of: "MeeshyKeyboardPanel("))
        #expect(aboveAt.lowerBound < barAt.lowerBound)
        #expect(barAt.lowerBound < panelAt.lowerBound)
    }

    // MARK: - Non-re-rendu

    @MainActor
    @Test("la barre n'est pas réévaluée quand seules les fermetures changent ; elle l'est quand l'outil ouvert change")
    func bar_isEquatableOnValues() {
        let items = [MeeshyKeyboardDockItem(id: "font", label: "Police", systemImage: "textformat")]
        let confirm = MeeshyKeyboardDockConfirm(title: "OK", label: "Valider", action: {})
        let one = MeeshyKeyboardBar(label: "Barre du texte", items: items, openItem: nil, confirm: confirm, tone: .deep, onItem: { _ in })
        let two = MeeshyKeyboardBar(label: "Barre du texte", items: items, openItem: nil, confirm: confirm, tone: .deep, onItem: { _ in _ = 1 })
        let open = MeeshyKeyboardBar(label: "Barre du texte", items: items, openItem: "font", confirm: confirm, tone: .deep, onItem: { _ in })
        #expect(one == two)
        #expect(one != open)
    }

    // MARK: - Contraste

    @Test("glyphes blancs sur verre `deep` et `onLight` : au moins 3:1 sur le pire fond ; encre pleine et panneau à 15,99:1")
    func contrast_isComputedFromTheRecipes() throws {
        let contrast = try Self.object("contrast")
        let minimum = try Self.number(contrast["glassMinimum"])
        let tolerance = try Self.number(contrast["tolerance"])
        #expect(Self.glassContrast(tone: .deep) >= minimum)
        #expect(Self.glassContrast(tone: .onLight) >= minimum)
        let white = Double(MeeshyColors.onMedia.luminance)
        let indigo = Double(MeeshyColors.indigo950.luminance)
        #expect(abs(CanvasChromeScheme.contrastRatio(white, indigo) - (try Self.number(contrast["solidInkOnWhite"]))) <= tolerance)
        #expect(abs(CanvasChromeScheme.contrastRatio(white, indigo) - (try Self.number(contrast["whiteOnPanel"]))) <= tolerance)
    }

    // MARK: - Gardes de source

    @Test("la barre est une barre d'outils nommée, sans légende ; le panneau défile et ne renvoie jamais le clavier")
    func source_namesTheBarAndScrollsThePanel() throws {
        let bar = try Self.code("MeeshyKeyboardBar.swift")
        #expect(bar.contains(".accessibilityLabel(label)"))
        #expect(bar.contains("assert(!label.isEmpty"))
        #expect(bar.contains("accessibilityShowsLargeContentViewer") || bar.contains("MeeshyGlassButton("))
        let panel = try Self.code("MeeshyKeyboardPanel.swift")
        #expect(panel.contains("ScrollView"))
        #expect(panel.contains(".scrollDismissesKeyboard(.never)"))
        #expect(panel.contains("MeeshyColors.indigo950"))
        let dock = try Self.code("MeeshyKeyboardDock.swift")
        #expect(dock.contains("assert(!label.isEmpty"))
    }

    @Test("aucun verre écrit à la main, aucune couleur ni rayon en dur, aucune légende, aucun type du composer ni des appels")
    func source_hasNoOwnGlassNoLiteralNoDomain() throws {
        let files = ["MeeshyKeyboardDock.swift", "MeeshyKeyboardDockController.swift", "MeeshyKeyboardDockInputView.swift",
                     "MeeshyKeyboardDockLink.swift", "MeeshyKeyboardDockModel.swift", "MeeshyKeyboardBar.swift",
                     "MeeshyKeyboardPanel.swift", "MeeshyKeyboardBarFit.swift", "MeeshyKeyboardDockRecipe.swift",
                     "MeeshyKeyboardDockRule.swift", "Catalog/MeeshyKitCatalog+K17.swift"]
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

    @Test("le catalogue porte les états de la fiche")
    func catalog_states() throws {
        let entry = try #require(MeeshyKitCatalog.listedEntry(matching: "K17"))
        #expect(entry.states.map(\.id) == [
            "barre", "outil-ouvert", "panneau", "bande", "deux-actions", "sans-outil", "coche",
            "desactive", "clair", "sans-clavier", "large",
        ])
        #expect(entry.states.filter(\.isTouchable).map(\.id) == ["barre", "outil-ouvert", "panneau", "bande", "deux-actions"])
    }

    // MARK: - Aides

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K17-MeeshyKeyboardDock.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
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

    private static func near(_ value: CGFloat, _ expected: Double, tolerance: Double = 0.0001) -> Bool {
        abs(Double(value) - expected) <= tolerance
    }

    private static func input(_ value: Any?) throws -> MeeshyKeyboardDockInput {
        let text = try #require(value as? String, "entrée attendue : \(String(describing: value))")
        if text == "keyboard" { return .keyboard }
        return .panel(String(text.dropFirst("panel:".count)))
    }

    private static func items(_ value: Any?) throws -> [MeeshyKeyboardDockItem] {
        let rows = try #require(value as? [[String: Any]])
        return rows.map {
            MeeshyKeyboardDockItem(
                id: $0["id"] as? String ?? "", label: "Outil", systemImage: "circle",
                opensPanel: $0["opensPanel"] as? Bool ?? true, isEnabled: $0["isEnabled"] as? Bool ?? true
            )
        }
    }

    private static func frame(_ value: Any?) throws -> CGRect {
        let row = try #require(value as? [String: Any])
        return CGRect(
            x: try number(row["x"]), y: try number(row["y"]), width: try number(row["w"]), height: try number(row["h"])
        )
    }

    private static func optionalFrame(_ value: Any?) throws -> CGRect? {
        value is NSNull || value == nil ? nil : try frame(value)
    }

    /// Le contraste de l'encre blanche sur le verre du ton, au pire fond qu'il accepte, calculé depuis la
    /// recette de K01 (composition en sRGB encodé).
    private static func glassContrast(tone: MeeshyGlassTone) -> Double {
        let recipe = MeeshyGlassRecipe.resolve(
            tone: tone, density: .regular, isTinted: false, isInteractive: false, isPressed: false,
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

/// Un champ factice qui se dit premier répondant et compte ses rechargements d'entrées.
final class MeeshyKeyboardDockFocusedField: UITextView {
    private(set) var reloads = 0

    override var isFirstResponder: Bool { true }

    override func reloadInputViews() {
        reloads += 1
        super.reloadInputViews()
    }
}
