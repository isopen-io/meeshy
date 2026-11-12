import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K11 — la pilule qui s'ouvre vers le haut, lue comme des LOIS : la présence
/// remise à K10, l'ouverture, l'échappement, les marges, le plafond du corps et
/// son défilement, les choix d'une confirmation, puis les gardes de source (aucun
/// verre écrit ici, aucun magasin observé, aucune couleur ni rayon en dur) et le
/// contraste mesuré. Les mesures viennent du fichier de vecteurs que lisent aussi
/// Android et le web.
@Suite("MeeshyExpandingPill")
struct MeeshyExpandingPillTests {

    // MARK: - Présence remise à K10

    @Test("chaque vecteur rend la présence que K10 reçoit : l'hôte garde shown et stowed, K11 choisit seul withoutRow")
    func presence_followsTheVectors() throws {
        for row in try Self.rows("presence") {
            let host = try #require(MeeshyGlassPillPresence(rawValue: row["host"] as? String ?? ""))
            let expected = try #require(MeeshyGlassPillPresence(rawValue: row["presence"] as? String ?? ""))
            #expect(MeeshyExpandingPillRule.presence(host: host, option: Self.option(row["option"])) == expected, "\(row)")
        }
    }

    @Test("fermée, la pilule est celle de K10 au repos : rien n'est ouvert, la présence de l'hôte passe telle quelle")
    func closed_isRestingPill() {
        #expect(!MeeshyExpandingPillRule.isOpen(option: nil, bodyIsEmpty: false))
        for host in MeeshyGlassPillPresence.allCases {
            #expect(MeeshyExpandingPillRule.presence(host: host, option: nil) == host)
        }
    }

    @Test("un corps de hauteur nulle sans en-tête : la pilule reste fermée, jamais une bande vide")
    func isOpen_followsTheVectors() throws {
        for row in try Self.rows("isOpen") {
            let open = MeeshyExpandingPillRule.isOpen(
                option: Self.option(row["option"]), bodyIsEmpty: row["bodyIsEmpty"] as? Bool ?? false
            )
            #expect(open == row["open"] as? Bool, "\(row)")
        }
    }

    // MARK: - Échappement

    @Test("Échap : le rappel dédié, sinon ‹, sinon ✕ ; fermée, K11 n'écoute rien")
    func escape_followsTheVectors() throws {
        for row in try Self.rows("escape") {
            let target = MeeshyExpandingPillRule.escapeTarget(
                isOpen: row["isOpen"] as? Bool ?? false, hasEscape: row["hasEscape"] as? Bool ?? false,
                hasBack: row["hasBack"] as? Bool ?? false, hasClose: row["hasClose"] as? Bool ?? false
            )
            #expect(target.rawValue == row["target"] as? String, "\(row)")
        }
    }

    // MARK: - En-tête

    @Test("un bouton d'en-tête n'existe que si son rappel existe ; sans ✕, l'accessoire prend le bord de fin (O9)")
    func headerSlots_followTheVectors() throws {
        for row in try Self.rows("header") {
            let slots = MeeshyExpandingPillRule.headerSlots(
                hasBack: row["hasBack"] as? Bool ?? false, hasClose: row["hasClose"] as? Bool ?? false,
                hasTrailing: row["hasTrailing"] as? Bool ?? false
            )
            #expect(slots.back == row["back"] as? Bool, "\(row)")
            #expect(slots.close == row["close"] as? Bool, "\(row)")
            #expect(slots.reservesStart == row["reservesStart"] as? Bool, "\(row)")
            #expect(slots.reservesEnd == row["reservesEnd"] as? Bool, "\(row)")
        }
    }

    @Test("le titre a la même marge des deux côtés : le bord le plus large plus l'écart, il ne passe sous rien")
    func headerTitleInset_followsTheVectors() throws {
        for row in try Self.rows("headerInset") {
            let inset = MeeshyExpandingPillRule.headerTitleInset(
                start: CGFloat(try Self.number(row["start"])), end: CGFloat(try Self.number(row["end"])),
                gap: CGFloat(try Self.number(row["gap"]))
            )
            #expect(inset == CGFloat(try Self.number(row["inset"])), "\(row)")
        }
        #expect(MeeshyExpandingPillRule.headerTitleInset(start: .nan, end: .infinity, gap: 6) == 6)
    }

    // MARK: - Marges et hauteur

    @Test("10 en haut, 12 sur les côtés, de quoi faire 12 sous le corps avec la rangée ; une confirmation a ses 16")
    func insets_followTheVectors() throws {
        for row in try Self.rows("insets") {
            let option = MeeshyExpandingPillOption(
                id: "x", title: "x", showsHeader: row["showsHeader"] as? Bool ?? true, keepsRow: row["keepsRow"] as? Bool ?? true
            )
            let insets = MeeshyExpandingPillRule.insets(for: option)
            #expect(insets.top == CGFloat(try Self.number(row["top"])), "\(row)")
            #expect(insets.leading == CGFloat(try Self.number(row["leading"])), "\(row)")
            #expect(insets.bottom == CGFloat(try Self.number(row["bottom"])), "\(row)")
            #expect(insets.trailing == CGFloat(try Self.number(row["trailing"])), "\(row)")
        }
    }

    @Test("plafond du corps : 62 % de l'hôte moins l'en-tête, la rangée et les marges, jamais sous 160 ; l'hôte le remplace")
    func ceiling_followsTheVectors() throws {
        for row in try Self.rows("ceiling") {
            let option = MeeshyExpandingPillOption(
                id: "x", title: "x", showsHeader: row["showsHeader"] as? Bool ?? true, keepsRow: row["keepsRow"] as? Bool ?? true
            )
            let ceiling = MeeshyExpandingPillRule.bodyCeiling(
                hostHeight: CGFloat(try Self.number(row["hostHeight"])), option: option,
                override: Self.optionalNumber(row["override"]).map { CGFloat($0) }
            )
            #expect(abs(ceiling - CGFloat(try Self.number(row["ceiling"]))) < 0.001, "\(row) -> \(ceiling)")
        }
    }

    @Test("une hauteur d'hôte non finie donne le plancher ; le verre entier de la vue la plus haute tient sous 62 %")
    func ceiling_degenerateAndTallest() {
        let option = MeeshyExpandingPillOption(id: "audience", title: "Audience", keepsRow: false)
        #expect(MeeshyExpandingPillRule.bodyCeiling(hostHeight: .nan, option: option) == MeeshyExpandingPillRecipe.bodyFloor)
        #expect(MeeshyExpandingPillRule.bodyCeiling(hostHeight: .infinity, option: option) >= MeeshyExpandingPillRecipe.bodyFloor)
        let host: CGFloat = 844
        let ceiling = MeeshyExpandingPillRule.bodyCeiling(hostHeight: host, option: option)
        let insets = MeeshyExpandingPillRule.insets(for: option)
        let glass = ceiling + insets.top + insets.bottom + MeeshyExpandingPillRecipe.sectionGap
            + CGFloat(MeeshyExpandingPillRecipe.headerButtonSize.diameter)
        #expect(glass <= host * MeeshyExpandingPillRecipe.hostShare + 0.001)
    }

    @Test("sous le plafond pas de défilement, au-delà le corps défile ; un demi-point d'arrondi n'en est pas un")
    func scrolls_followsTheVectors() throws {
        for row in try Self.rows("scrolls") {
            let scrolls = MeeshyExpandingPillRule.scrolls(
                contentHeight: CGFloat(try Self.number(row["contentHeight"])), ceiling: CGFloat(try Self.number(row["ceiling"]))
            )
            #expect(scrolls == row["scrolls"] as? Bool, "\(row)")
        }
        #expect(!MeeshyExpandingPillRule.scrolls(contentHeight: .nan, ceiling: 200))
    }

    // MARK: - Confirmation

    @Test("côte à côte tant que chaque choix tient dans sa moitié, empilés sinon")
    func stacks_followTheVectors() throws {
        for row in try Self.rows("stacks") {
            let widths = (row["widths"] as? [NSNumber] ?? []).map { CGFloat($0.doubleValue) }
            let stacks = MeeshyExpandingPillRule.stacksChoices(
                idealWidths: widths, available: CGFloat(try Self.number(row["available"])), gap: CGFloat(try Self.number(row["gap"]))
            )
            #expect(stacks == row["stacks"] as? Bool, "\(row)")
        }
    }

    @Test("neutre au début, destructif en dernier, quel que soit l'ordre donné par l'hôte")
    func order_followsTheVectors() throws {
        for row in try Self.rows("order") {
            let roles = (row["roles"] as? [String] ?? []).compactMap(MeeshyPillChoiceRole.init(rawValue:))
            let choices = roles.enumerated().map { MeeshyPillChoice(title: "choix \($0.offset)", role: $0.element, action: {}) }
            let ordered = MeeshyExpandingPillRule.ordered(choices).map(\.role.rawValue)
            #expect(ordered == row["ordered"] as? [String], "\(row)")
        }
    }

    @Test("le choix neutre garde son rang quand les deux sont neutres : annuler d'abord")
    func order_isStable() {
        let first = MeeshyPillChoice(title: "Annuler", action: {})
        let second = MeeshyPillChoice(title: "Garder", action: {})
        #expect(MeeshyExpandingPillRule.ordered([first, second]).map(\.title) == ["Annuler", "Garder"])
    }

    @Test("un choix se compare sur ses valeurs, pas sur sa fermeture")
    func choice_equatableOnValues() {
        #expect(MeeshyPillChoice(title: "Annuler", action: {}) == MeeshyPillChoice(title: "Annuler", action: { _ = 1 }))
        #expect(MeeshyPillChoice(title: "Annuler", action: {}) != MeeshyPillChoice(title: "Annuler", role: .destructive, action: {}))
    }

    // MARK: - Option et en-tête

    @Test("une option par défaut montre son en-tête et garde la rangée ; sans l'un ni l'autre, c'est une confirmation")
    func option_defaults() {
        let option = MeeshyExpandingPillOption(id: "formats", title: "Publier comme")
        #expect(option.showsHeader && option.keepsRow && !option.isConfirmation)
        #expect(MeeshyExpandingPillOption(id: "c", title: "Tout effacer ?", showsHeader: false, keepsRow: false).isConfirmation)
        #expect(!MeeshyExpandingPillOption(id: "o", title: "Réglages", showsHeader: false).isConfirmation)
        #expect(MeeshyExpandingPillOption(id: "a", title: "A") == MeeshyExpandingPillOption(id: "a", title: "A"))
        #expect(MeeshyExpandingPillOption(id: "a", title: "A") != MeeshyExpandingPillOption(id: "b", title: "A"))
    }

    @Test("l'en-tête sans accessoire se compare sur le titre, la présence des boutons et les libellés")
    @MainActor
    func header_equatableOnValues() {
        let noop: () -> Void = {}
        func header(
            _ title: String = "Audience", back: Bool = true, close: Bool = true, backLabel: String = "Retour"
        ) -> MeeshyExpandingPillHeader<EmptyView> {
            MeeshyExpandingPillHeader(
                title: title, onBack: back ? noop : nil, onClose: close ? noop : nil, backLabel: backLabel
            )
        }
        #expect(header() == header())
        #expect(header() != header("Durée"))
        #expect(header() != header(back: false))
        #expect(header() != header(close: false))
        #expect(header() != header(backLabel: "Retour aux actions"))
    }

    @Test("les mots du kit : Retour et Fermer")
    @MainActor
    func copy_words() {
        #expect(!MeeshyExpandingPillCopy.back.isEmpty)
        #expect(!MeeshyExpandingPillCopy.close.isEmpty)
    }

    // MARK: - Recette

    @Test("les mesures de la recette sont celles des vecteurs")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(MeeshyExpandingPillRecipe.topInset == CGFloat(try Self.number(recipe["topInset"])))
        #expect(MeeshyExpandingPillRecipe.sideInset == CGFloat(try Self.number(recipe["sideInset"])))
        #expect(MeeshyExpandingPillRecipe.sectionGap == CGFloat(try Self.number(recipe["sectionGap"])))
        #expect(MeeshyExpandingPillRecipe.bottomInsetBeforeRow == CGFloat(try Self.number(recipe["bottomInsetBeforeRow"])))
        #expect(MeeshyExpandingPillRecipe.bottomInsetWithoutRow == CGFloat(try Self.number(recipe["bottomInsetWithoutRow"])))
        #expect(MeeshyExpandingPillRecipe.headerButtonSize.diameter == (try Self.number(recipe["headerButton"])))
        #expect(MeeshyExpandingPillRecipe.headerButtonSize == .s40)
        #expect(MeeshyExpandingPillRecipe.headerButtonGap == CGFloat(try Self.number(recipe["headerButtonGap"])))
        #expect(MeeshyExpandingPillRecipe.confirmationInset == CGFloat(try Self.number(recipe["confirmationInset"])))
        #expect(MeeshyExpandingPillRecipe.confirmationGap == CGFloat(try Self.number(recipe["confirmationGap"])))
        #expect(MeeshyExpandingPillRecipe.choiceGap == CGFloat(try Self.number(recipe["choiceGap"])))
        #expect(MeeshyExpandingPillRecipe.choiceHeight == CGFloat(try Self.number(recipe["choiceHeight"])))
        #expect(MeeshyExpandingPillRecipe.choiceRadius == CGFloat(try Self.number(recipe["choiceRadius"])))
        #expect(MeeshyExpandingPillRecipe.choiceInset == CGFloat(try Self.number(recipe["choiceInset"])))
        #expect(MeeshyExpandingPillRecipe.hostShare == CGFloat(try Self.number(recipe["hostShare"])))
        #expect(MeeshyExpandingPillRecipe.bodyFloor == CGFloat(try Self.number(recipe["bodyFloor"])))
        #expect(MeeshyExpandingPillRecipe.edgeFade == CGFloat(try Self.number(recipe["edgeFade"])))
        #expect(MeeshyExpandingPillRecipe.enterScale == CGFloat(try Self.number(recipe["enterScale"])))
        #expect(MeeshyExpandingPillRecipe.webSlide == CGFloat(try Self.number(recipe["webSlide"])))
        #expect(MeeshyExpandingPillRecipe.fadeDuration == (try Self.number(recipe["fadeMs"])) / 1000)
        #expect(MeeshyExpandingPillRecipe.reducedFadeDuration == (try Self.number(recipe["reducedFadeMs"])) / 1000)
        #expect(MeeshyExpandingPillRecipe.neutralFillOpacity == (try Self.number(recipe["neutralFillOpacity"])))
        #expect(MeeshyExpandingPillRecipe.neutralPressedFillOpacity == (try Self.number(recipe["neutralPressedFillOpacity"])))
        #expect(MeeshyExpandingPillRecipe.destructivePressedFillOpacity == (try Self.number(recipe["destructivePressedFillOpacity"])))
        #expect(MeeshyExpandingPillRecipe.choiceHeight >= CGFloat(MeeshyControlSize.tapTarget))
    }

    @Test("les marges sont des jetons du design system, et les durées celles de K10")
    func recipe_usesTokens() {
        #expect(MeeshyExpandingPillRecipe.topInset == MeeshySpacing.smPlus)
        #expect(MeeshyExpandingPillRecipe.sideInset == MeeshySpacing.md)
        #expect(MeeshyExpandingPillRecipe.confirmationInset == MeeshySpacing.lg)
        #expect(MeeshyExpandingPillRecipe.choiceGap == MeeshySpacing.sm)
        #expect(MeeshyExpandingPillRecipe.fadeDuration == MeeshyGlassPillRecipe.stowDuration)
        #expect(MeeshyExpandingPillRecipe.reducedFadeDuration == MeeshyGlassPillRecipe.reducedSizeDuration)
    }

    // MARK: - Contraste

    @Test("le libellé blanc du choix destructif tient 4,5:1 sur son rouge plein")
    func contrast_destructiveChoice() throws {
        let floor = try #require(try Self.object("contrast")["destructiveInkMin"] as? Double)
        let ratio = CanvasChromeScheme.contrastRatio(
            Double(MeeshyExpandingPillRecipe.destructiveInk.luminance),
            Double(MeeshyExpandingPillRecipe.destructiveFill.luminance)
        )
        #expect(ratio >= floor, "contraste mesuré \(ratio)")
    }

    @Test("le texte secondaire tient 4,5:1 sur le verre dense de K01, même posé sur un fond blanc")
    func contrast_secondaryText() throws {
        let floor = try #require(try Self.object("contrast")["secondaryTextMin"] as? Double)
        let fill = MeeshyGlassRecipe.resolve(
            tone: .deep, density: .dense, isTinted: false, isInteractive: false, isPressed: false,
            material: .drawn, reduceMotion: false, isNested: false, isHovered: false
        ).fillOpacity
        let backdrop = 1.0
        let glass = backdrop * (1 - fill)
        let inkAlpha = 0.85
        let text = inkAlpha + (1 - inkAlpha) * glass
        let ratio = CanvasChromeScheme.contrastRatio(
            CanvasChromeScheme.luminance(red: text, green: text, blue: text),
            CanvasChromeScheme.luminance(red: glass, green: glass, blue: glass)
        )
        #expect(ratio >= floor, "contraste mesuré \(ratio)")
    }

    // MARK: - Source

    @Test("K11 n'écrit aucun verre : ni matière, ni flou, ni classe de verre — K10 en demande un seul")
    func source_writesNoGlass() throws {
        for file in Self.files {
            let code = try Self.code(file)
            for word in [".meeshyGlass(", "glassEffect", "adaptiveGlass", "adaptiveLiquidGlass", "UIBlurEffect",
                         ".blur(", "backdrop", "Material", ".ultraThin", ".regularMaterial"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("aucune couleur, aucun rayon en dur, aucune légende sous un bouton")
    func source_hasNoLiteral() throws {
        let forbidden = [
            "caption", "Color(hex:", "Color(red:", "Color(white:", "Color.white", "Color.black", "Color.gray",
            "Color.red", "Color.secondary", "(.secondary", "#FF", "0x", "UIColor", "cornerRadius: 2", "cornerRadius: 3",
        ]
        for file in Self.files + ["Catalog/MeeshyKitCatalog+K11.swift"] {
            let code = try Self.code(file)
            for word in forbidden {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("aucun magasin observé, aucun geste de glissé, aucune haptique jouée ici")
    func source_takesNoStoreNorDragNorHaptic() throws {
        for file in Self.files {
            let code = try Self.code(file)
            for word in ["@ObservedObject", "@StateObject", "@EnvironmentObject", "DragGesture", ".gesture(",
                         "onTapGesture", "HapticFeedback", "sensoryFeedback", "UIImpactFeedbackGenerator"] {
                #expect(!code.contains(word), "\(file) contient \(word)")
            }
        }
    }

    @Test("pas de ViewThatFits autour du corps (rendu asynchrone d'iOS 26) : mesure, plafond, défilement")
    func source_bodyIsMeasuredNotFitted() throws {
        let panel = try Self.code("MeeshyExpandingPillPanel.swift")
        let main = try Self.code("MeeshyExpandingPill.swift")
        #expect(!panel.contains("ViewThatFits") && !main.contains("ViewThatFits"))
        #expect(panel.contains("MeeshyExpandingPillRule.scrolls("))
        #expect(panel.contains("MeeshyFadingScrollView(axis: .vertical"))
        #expect(panel.contains(".onGeometryChange(for: CGFloat.self)"))
        #expect(panel.contains(".frame(maxHeight: ceiling)"))
        #expect(panel.contains(".fixedSize(horizontal: false, vertical: true)"))
        #expect(panel.contains(".onGeometryChange(for: Bool.self) { $0.size.height <= 0 } action: { isEmpty = $0 }"))
        #expect(panel.contains(".scrollDismissesKeyboard(.never)"))
        #expect(panel.contains(".padding(isCollapsed ? EdgeInsets() : MeeshyExpandingPillRule.insets(for: option))"))
    }

    @Test("K11 enveloppe K10 : un seul MeeshyGlassPill, et le dessus est dit montré ou non à l'exécution")
    func source_wrapsTheGlassPill() throws {
        let main = try Self.code("MeeshyExpandingPill.swift")
        #expect(main.components(separatedBy: "MeeshyGlassPill(").count == 2)
        #expect(main.contains("aboveIsShown: isOpen"))
        #expect(main.contains("MeeshyExpandingPillRule.presence(host: presence, option: option)"))
        let pill = try Self.code("MeeshyGlassPill.swift")
        #expect(pill.contains("private var hasAbove: Bool { Self.hasAboveSlot && aboveIsShown }"))
    }

    @Test("la pilule fermée n'écoute rien, et le contenu entre et sort en fondu (échelle ancrée en bas, fondu seul sous « réduire »)")
    func source_motionAndEscape() throws {
        let main = try Self.code("MeeshyExpandingPill.swift")
        let panel = try Self.code("MeeshyExpandingPillPanel.swift")
        #expect(main.contains("isOpen: option != nil"))
        #expect(main.contains(".scale(scale: MeeshyExpandingPillRecipe.enterScale, anchor: .bottom)"))
        #expect(main.contains("reduceMotion\n                ? .opacity"))
        #expect(main.contains(".meeshyExpandingPill("))
        #expect(main.contains(".id(option.id)"))
        #expect(panel.contains(".accessibilityAction(.escape, action)"))
    }

    @Test("ce qui part reste peint jusqu'au terme du fondu, mais inerte et absent du lecteur d'écran")
    func source_departureIsInertAndSilent() throws {
        let panel = try Self.code("MeeshyExpandingPillPanel.swift")
        #expect(panel.contains("removal: fade.combined(with: .modifier("))
        #expect(panel.contains("active: MeeshyExpandingPillDeparture(isLeaving: true)"))
        #expect(panel.contains(".allowsHitTesting(!isLeaving)"))
        #expect(panel.contains(".accessibilityHidden(isLeaving)"))
    }

    @Test("l'en-tête se dispose par sa loi : le titre centré à marge égale, ‹ au début, accessoire et ✕ à la fin")
    func source_headerUsesItsLayout() throws {
        let header = try Self.code("MeeshyExpandingPillHeader.swift")
        #expect(header.contains("MeeshyExpandingPillHeaderLayout(gap: gap)"))
        #expect(header.contains("MeeshyExpandingPillRule.headerTitleInset(start: start.width, end: end.width, gap: gap)"))
        #expect(header.contains("if slots.reservesEnd"))
        #expect(!header.contains("ZStack"))
    }

    @Test("accessibilité : le panneau est un groupe nommé, la confirmation est modale et l'échappement vaut Annuler")
    func source_accessibility() throws {
        let panel = try Self.code("MeeshyExpandingPillPanel.swift")
        let confirmation = try Self.code("MeeshyPillConfirmation.swift")
        let header = try Self.code("MeeshyExpandingPillHeader.swift")
        #expect(panel.contains(".accessibilityElement(children: .contain)"))
        #expect(panel.contains(".accessibilityLabel(option.title)"))
        #expect(confirmation.contains(".accessibilityAddTraits(.isModal)"))
        #expect(confirmation.contains(".accessibilityAction(.escape) { MeeshyPillChoiceButton.fire(cancel) }"))
        #expect(confirmation.contains(".accessibilityFocused($neutralHasFocus)"))
        #expect(header.contains(".accessibilityAddTraits(.isHeader)"))
        #expect(header.contains("kind: .soft"))
        #expect(header.contains("\"chevron.backward\""))
    }

    @Test("le haptique d'un choix passe par le site unique de K02, et ‹ ✕ par le bouton K02 lui-même")
    func source_hapticsGoThroughK02() throws {
        let confirmation = try Self.code("MeeshyPillConfirmation.swift")
        let header = try Self.code("MeeshyExpandingPillHeader.swift")
        #expect(confirmation.contains("MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .light"))
        #expect(header.components(separatedBy: "MeeshyGlassButton(").count == 3)
    }

    @Test("aucun fichier de K11 ne dépasse le budget de cohésion")
    func source_fileBudget() throws {
        for file in Self.files {
            let lines = try Self.code(file).split(separator: "\n", omittingEmptySubsequences: false).count
            #expect(lines <= 400, "\(file) : \(lines) lignes")
        }
    }

    @Test("le catalogue porte les états de la fiche")
    func catalog_states() throws {
        let entry = try #require(MeeshyKitCatalog.listedEntry(matching: "K11"))
        #expect(entry.states.map(\.id) == [
            "repos", "formats", "disposition", "audience", "fond", "duree", "humeur", "outil",
            "description", "temps", "confirmation", "confirmation-courte", "appel", "clair", "defile", "bascule",
        ])
    }

    // MARK: - Aides

    private static let files = [
        "MeeshyExpandingPill.swift", "MeeshyExpandingPillPanel.swift", "MeeshyExpandingPillHeader.swift",
        "MeeshyExpandingPillRecipe.swift", "MeeshyExpandingPillModels.swift", "MeeshyPillConfirmation.swift",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K11-MeeshyExpandingPill.vectors.json")
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

    private static func optionalNumber(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }

    private static func option(_ value: Any?) -> MeeshyExpandingPillOption? {
        guard let row = value as? [String: Any] else { return nil }
        return MeeshyExpandingPillOption(
            id: "x", title: "x", showsHeader: row["showsHeader"] as? Bool ?? true, keepsRow: row["keepsRow"] as? Bool ?? true
        )
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
