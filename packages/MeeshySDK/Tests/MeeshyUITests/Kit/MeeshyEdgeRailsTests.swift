import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K12 — les rails d'actions des bords, lus comme des VALEURS : la recette et ses
/// lois (longueurs, largeur élue par couloir, capacité, translation par côté et
/// par sens de lecture), le contenu d'un rail, la présence (monté, sorti, rangé,
/// démonté), l'activation et le contraste. Les mesures viennent du fichier de
/// vecteurs que lisent aussi Android et le web.
@Suite("MeeshyEdgeRails")
struct MeeshyEdgeRailsTests {

    // MARK: - Recette

    @Test("la recette suit les vecteurs : capsule, rangée, en-tête, pied")
    func recipe_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        #expect(Double(MeeshyEdgeRailsRecipe.discSide) == recipe["discSide"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.compactSpacing) == recipe["compactSpacing"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.compactPadding) == recipe["compactPadding"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.compactWidth) == recipe["compactWidth"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.dividerHeight) == recipe["dividerHeight"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.dividerInset) == recipe["dividerInset"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.compactDividerOpacity == recipe["compactDividerOpacity"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.labeledDividerOpacity == recipe["labeledDividerOpacity"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.labeledRadius) == recipe["labeledRadius"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.rowHeight) == recipe["rowHeight"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.rowRadius) == recipe["rowRadius"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.rowSpacing) == recipe["rowSpacing"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.glyphSide) == recipe["glyphSide"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.glyphSize) == recipe["glyphSize"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.trailingInset) == recipe["trailingInset"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.headerSize) == recipe["headerSize"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.headerTrackingEm == recipe["headerTrackingEm"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.headerOpacity == recipe["headerOpacity"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.headerBlock) == recipe["headerBlock"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.footMargin) == recipe["footMargin"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.footInset) == recipe["footInset"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.footSpacing) == recipe["footSpacing"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.defaultEdgeInset) == recipe["defaultEdgeInset"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.dimmedOpacity == recipe["dimmedOpacity"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.disabledOpacity == recipe["disabledOpacity"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.itemDimmedOpacity == recipe["itemDimmedOpacity"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.slideSeconds * 1000 == recipe["slideMs"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.dimSeconds * 1000 == recipe["dimMs"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.reducedFadeSeconds * 1000 == recipe["reducedFadeMs"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.rowTintSeconds * 1000 == recipe["rowTintMs"] as? Double)
        #expect(MeeshyEdgeRailsRecipe.longPressSeconds * 1000 == recipe["longPressMs"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.laneForRegular) == recipe["laneForRegular"] as? Double)
        #expect(Double(MeeshyEdgeRailsRecipe.laneForNarrow) == recipe["laneForNarrow"] as? Double)
    }

    @Test("les trois largeurs libellées, et ce qui en dépend, suivent les vecteurs")
    func recipe_perWidth_followsTheVectors() throws {
        let recipe = try Self.object("recipe")
        let widths = try #require(recipe["widths"] as? [String: Double])
        let padding = try #require(recipe["padding"] as? [String: Double])
        let gap = try #require(recipe["glyphGap"] as? [String: Double])
        let word = try #require(recipe["wordSize"] as? [String: Double])
        let lines = try #require(recipe["wordLines"] as? [String: Int])
        for width in MeeshyEdgeRailWidth.allCases {
            let key = width.rawValue
            #expect(Double(width.points) == widths[key], "largeur \(key)")
            #expect(Double(MeeshyEdgeRailsRecipe.padding(width)) == padding[key], "marge \(key)")
            #expect(Double(MeeshyEdgeRailsRecipe.glyphGap(width)) == gap[key], "écart glyphe-mot \(key)")
            #expect(Double(MeeshyEdgeRailsRecipe.wordSize(width)) == word[key], "mot \(key)")
            #expect(MeeshyEdgeRailsRecipe.wordLines(width) == lines[key], "lignes \(key)")
        }
    }

    @Test("la cible tactile : 44 pt sur iOS, jamais moins que le disque")
    func recipe_tapTarget() throws {
        let tapTarget = try #require(try Self.object("recipe")["tapTarget"] as? [String: Double])
        #expect(Double(MeeshyEdgeRailsRecipe.rowHeight) == tapTarget["ios"])
        #expect(MeeshyEdgeRailsRecipe.rowHeight >= MeeshyControlSize.tapTarget)
        #expect(MeeshyEdgeRailsRecipe.discSide >= MeeshyControlSize.tapTarget)
    }

    @Test("les mesures sont des jetons du design system, pas des nombres propres")
    func recipe_isMadeOfTokens() {
        #expect(MeeshyEdgeRailsRecipe.discSide == MeeshyControlSize.tapTarget)
        #expect(MeeshyEdgeRailsRecipe.compactSpacing == MeeshySpacing.xsPlus)
        #expect(MeeshyEdgeRailsRecipe.dividerInset == MeeshySpacing.sm)
        #expect(MeeshyEdgeRailsRecipe.rowHeight == MeeshyControlSize.tapTarget)
        #expect(MeeshyEdgeRailsRecipe.rowRadius == MeeshyRadius.xlPlus)
        #expect(MeeshyEdgeRailsRecipe.rowSpacing == MeeshySpacing.xs)
        #expect(MeeshyEdgeRailsRecipe.glyphSize == MeeshyIconSize.xl)
        #expect(MeeshyEdgeRailsRecipe.trailingInset == MeeshySpacing.md)
        #expect(MeeshyEdgeRailsRecipe.padding(.regular) == MeeshySpacing.smPlus)
        #expect(MeeshyEdgeRailsRecipe.padding(.narrow) == MeeshySpacing.sm)
        #expect(MeeshyEdgeRailsRecipe.wordSize(.regular) == MeeshyFont.bodySize)
        #expect(MeeshyEdgeRailsRecipe.wordSize(.narrow) == MeeshyFont.labelSize)
        #expect(MeeshyEdgeRailsRecipe.wordSize(.tight) == MeeshyFont.smallSize)
        #expect(MeeshyEdgeRailsRecipe.headerSize == MeeshyFont.smallSize)
        #expect(MeeshyEdgeRailsRecipe.footMargin == MeeshySpacing.xsPlus)
        #expect(MeeshyEdgeRailsRecipe.footSpacing == MeeshySpacing.xsPlus)
        #expect(MeeshyEdgeRailsRecipe.defaultEdgeInset == MeeshySpacing.smPlus)
        #expect(MeeshyEdgeRailsRecipe.disabledOpacity == MeeshyGlassButtonRecipe.disabledOpacity)
        #expect(MeeshyEdgeRailsRecipe.longPressSeconds == MeeshyGlassButtonRecipe.longPressDuration)
    }

    // MARK: - Lois

    @Test("la longueur d'un rail court : n × 44 + (n − 1) × 6 + 10, et jamais plus")
    func compactLength_vectors() throws {
        for row in try Self.rows("compactLength") {
            let count = try #require(row["count"] as? Int)
            let dividers = try #require(row["dividers"] as? Int)
            let length = try #require(row["length"] as? Double)
            #expect(Double(MeeshyEdgeRailsRecipe.length(count: count, dividers: dividers)) == length, "n = \(count), filets = \(dividers)")
        }
    }

    @Test("la longueur d'un rail libellé : 46 + n × 44 + (n − 1) × 4 + pied")
    func labeledLength_vectors() throws {
        for row in try Self.rows("labeledLength") {
            let count = try #require(row["count"] as? Int)
            let foot = try #require(row["foot"] as? Int)
            let header = try #require(row["header"] as? Bool)
            let length = try #require(row["length"] as? Double)
            let measured = MeeshyEdgeRailsRecipe.labeledLength(count: count, footCount: foot, hasHeader: header)
            #expect(Double(measured) == length, "n = \(count), pied = \(foot), en-tête = \(header)")
        }
    }

    @Test("la largeur est élue par le couloir : 210 dès 250, 150 dès 166, sinon 112")
    func labeledWidth_vectors() throws {
        for row in try Self.rows("labeledWidth") {
            let lane = try #require(row["lane"] as? Double)
            let width = try #require(row["width"] as? Double)
            #expect(Double(MeeshyEdgeRailsRecipe.labeledWidth(lane: CGFloat(lane)).points) == width, "couloir \(lane)")
        }
    }

    @Test("la translation d'un rail rangé : vers SON bord, retournée en lecture de droite à gauche")
    func slideOffset_vectors() throws {
        for row in try Self.rows("slideOffset") {
            let side = try kitRequired(MeeshyEdgeRailSide(rawValue: try #require(row["side"] as? String)))
            let offset = try #require(row["offset"] as? Double)
            let measured = MeeshyEdgeRailsRecipe.slideOffset(
                side: side, isRightToLeft: try #require(row["rtl"] as? Bool),
                edgeInset: CGFloat(try #require(row["edge"] as? Double)),
                safeInset: CGFloat(try #require(row["safe"] as? Double))
            )
            #expect(Double(measured) == offset, "\(row)")
        }
    }

    @Test("la capacité : combien de boutons tiennent dans la hauteur donnée")
    func capacity_vectors() throws {
        for row in try Self.rows("capacity") {
            let height = try #require(row["height"] as? Double)
            let labeled = try #require(row["labeled"] as? Bool)
            let fits = try #require(row["fits"] as? Int)
            #expect(MeeshyEdgeRailsRecipe.capacity(height: CGFloat(height), labeled: labeled) == fits, "\(row)")
        }
    }

    @Test("un rail défile seulement s'il dépasse sa bande, d'un demi-point près")
    func scrolls_vectors() throws {
        for row in try Self.rows("scrolls") {
            let length = try #require(row["length"] as? Double)
            let band = try #require(row["band"] as? Double)
            let scrolls = try #require(row["scrolls"] as? Bool)
            #expect(MeeshyEdgeRailsRecipe.scrolls(length: CGFloat(length), band: CGFloat(band)) == scrolls, "\(row)")
        }
    }

    @Test("la visibilité : opacité, lecteur d'écran, toucher")
    func visibility_vectors() throws {
        for row in try Self.rows("visibility") {
            let visibility = try kitRequired(MeeshyEdgeRailsVisibility(rawValue: try #require(row["visibility"] as? String)))
            #expect(MeeshyEdgeRailsRecipe.opacity(of: visibility) == row["opacity"] as? Double)
            #expect(MeeshyEdgeRailsRecipe.isReadByScreenReader(visibility) == row["readByScreenReader"] as? Bool)
            #expect(MeeshyEdgeRailsRecipe.servesTouch(visibility) == row["servesTouch"] as? Bool)
        }
    }

    @Test("passer de 210 à 150 change la mesure, pas la place : la largeur est sèche")
    func widths_areOrdered() {
        #expect(MeeshyEdgeRailWidth.regular.points > MeeshyEdgeRailWidth.narrow.points)
        #expect(MeeshyEdgeRailWidth.narrow.points > MeeshyEdgeRailWidth.tight.points)
    }

    // MARK: - Contenu d'un rail

    @Test("un rail sans entrée n'existe pas, ni un rail fait seulement de filets")
    func spec_withoutEntries_isNotRenderable() {
        #expect(!Self.spec(entries: []).isRenderable)
        #expect(!Self.spec(entries: [.divider, .divider]).isRenderable)
        #expect(Self.spec(entries: [.item(Self.item("a"))]).isRenderable)
        #expect(Self.spec(entries: [.custom(id: "paste")]).isRenderable)
    }

    @Test("pas de filet en tête, en queue ni doublé")
    func spec_cleansDividers() {
        let a = MeeshyEdgeRailEntry.item(Self.item("a"))
        let b = MeeshyEdgeRailEntry.item(Self.item("b"))
        let cleaned = Self.spec(entries: [.divider, a, .divider, .divider, b, .divider]).cleanedEntries
        #expect(cleaned == [a, .divider, b])
        #expect(Self.spec(entries: [a, b]).cleanedEntries == [a, b])
    }

    @Test("les boutons d'un rail comptent les rangées et les emplacements, pas les filets")
    func spec_countsButtons() {
        let spec = Self.spec(entries: [.item(Self.item("a")), .divider, .custom(id: "paste"), .item(Self.item("b"))])
        #expect(spec.buttonCount == 3)
        #expect(spec.dividerCount == 1)
    }

    @Test("pas de pied sans bouton : un pied vide ne laisse ni filet ni marge")
    func spec_footWithoutButtons_hasNoFoot() {
        #expect(!Self.spec(entries: [.item(Self.item("a"))]).hasFoot)
        #expect(Self.spec(entries: [.item(Self.item("a"))], foot: [Self.item("undo")]).hasFoot)
    }

    @Test("le mot affiché est `title`, à défaut `label` ; `label` doit contenir `title`")
    func item_titleDefaultsToLabel() {
        #expect(Self.item("a", label: "Ajouter un texte").displayTitle == "Ajouter un texte")
        #expect(Self.item("a", label: "Ajouter un texte", title: "Texte").displayTitle == "Texte")
        #expect(Self.item("a", label: "Ajouter un texte", title: "Texte").labelCoversTitle)
        #expect(!Self.item("a", label: "Ajouter", title: "Texte").labelCoversTitle)
        #expect(Self.item("a", label: "Ajouter").labelCoversTitle)
    }

    @Test("allumée par `isOn` ou par l'activation de K02 : la rangée dit « sélectionné » dans les deux cas")
    func item_isOn_comesFromEitherSource() {
        #expect(Self.item("a").effectiveActivation == .none)
        #expect(Self.item("a", isOn: true).effectiveActivation == .selected(true))
        #expect(Self.item("a", activation: .toggle(true)).effectiveActivation == .toggle(true))
        #expect(Self.item("a", activation: .toggle(true)).isLit)
        #expect(!Self.item("a", activation: .toggle(false)).isLit)
    }

    @Test("le rôle destructif prend la tenue destructive du disque, sauf allumé")
    func item_kind() {
        #expect(Self.item("a").discKind == .normal)
        #expect(Self.item("a", role: .destructive).discKind == .destructive)
        #expect(Self.item("a", isOn: true).discKind == .active)
        #expect(Self.item("a", isOn: true, role: .destructive).discKind == .active)
    }

    // MARK: - Présence

    @Test("monté à la demande : entrant, puis à sa place une image plus tard")
    func presence_entersThenSettles() {
        var presence = MeeshyEdgeRailsPresence<Int>()
        #expect(!presence.isMounted)
        presence.wants(1)
        #expect(presence.phase == .entering)
        #expect(presence.isMounted)
        #expect(presence.isAway)
        presence.settled()
        #expect(presence.phase == .present)
        #expect(!presence.isAway)
    }

    @Test("rangé : le rail repart, garde sa dernière liste, et ne se démonte qu'après la sortie")
    func presence_leavesKeepingItsLastContent() {
        var presence = MeeshyEdgeRailsPresence<Int>()
        presence.wants(7)
        presence.settled()
        presence.wants(nil)
        #expect(presence.phase == .leaving)
        #expect(presence.content == 7)
        #expect(presence.isMounted)
        #expect(presence.isAway)
        presence.exited()
        #expect(presence.phase == .absent)
        #expect(presence.content == nil)
        #expect(!presence.isMounted)
    }

    @Test("un rail qui repart répond au toucher jusqu'au bout")
    func presence_leavingStillServesTouch() {
        var presence = MeeshyEdgeRailsPresence<Int>()
        presence.wants(1)
        presence.settled()
        presence.wants(nil)
        #expect(presence.acceptsTouch)
        presence.exited()
        #expect(!presence.acceptsTouch)
    }

    @Test("demandé de nouveau pendant la sortie : le rail revient sans se démonter")
    func presence_interrupted() {
        var presence = MeeshyEdgeRailsPresence<Int>()
        presence.wants(1)
        presence.settled()
        presence.wants(nil)
        presence.wants(2)
        #expect(presence.phase == .present)
        #expect(presence.content == 2)
        #expect(!presence.isAway)
    }

    @Test("une nouvelle liste pendant la présence remplace l'ancienne sans rejouer l'entrée")
    func presence_contentChangesInPlace() {
        var presence = MeeshyEdgeRailsPresence<Int>()
        presence.wants(1)
        presence.settled()
        presence.wants(5)
        #expect(presence.phase == .present)
        #expect(presence.content == 5)
    }

    @Test("rien à ranger, rien à entrer : les appels redondants ne changent rien")
    func presence_idempotent() {
        var presence = MeeshyEdgeRailsPresence<Int>()
        presence.wants(nil)
        presence.exited()
        presence.settled()
        #expect(presence == MeeshyEdgeRailsPresence<Int>())
        presence.wants(1)
        presence.wants(1)
        #expect(presence.phase == .entering)
    }

    @Test("« réduire les animations » : aucune translation, un fondu de 150 ms")
    func motion_reduced() {
        #expect(MeeshyEdgeRailsRecipe.travel(side: .leading, isRightToLeft: false, edgeInset: 10, safeInset: 0, isAway: true, reduceMotion: true) == 0)
        #expect(MeeshyEdgeRailsRecipe.travel(side: .leading, isRightToLeft: false, edgeInset: 10, safeInset: 0, isAway: true, reduceMotion: false) == -64)
        #expect(MeeshyEdgeRailsRecipe.travel(side: .leading, isRightToLeft: false, edgeInset: 10, safeInset: 0, isAway: false, reduceMotion: false) == 0)
        #expect(MeeshyEdgeRailsRecipe.slideDuration(reduceMotion: true) == MeeshyEdgeRailsRecipe.reducedFadeSeconds)
        #expect(MeeshyEdgeRailsRecipe.slideDuration(reduceMotion: false) == MeeshyEdgeRailsRecipe.slideSeconds)
        #expect(MeeshyEdgeRailsRecipe.dimDuration(reduceMotion: true) == MeeshyEdgeRailsRecipe.reducedFadeSeconds)
        #expect(MeeshyEdgeRailsRecipe.dimDuration(reduceMotion: false) == MeeshyEdgeRailsRecipe.dimSeconds)
        #expect(MeeshyEdgeRailsRecipe.opacity(away: true) == 0)
        #expect(MeeshyEdgeRailsRecipe.opacity(away: false) == 1)
    }

    // MARK: - Activation

    @MainActor
    @Test("un toucher : UN impact léger, puis l'action ; désactivé, rien")
    func trigger_tap() {
        var events: [String] = []
        let served = MeeshyEdgeRailsTrigger.tap(isEnabled: true, play: { events.append("haptic:\($0)") }, action: { events.append("action") })
        #expect(served)
        #expect(events == ["haptic:light", "action"])
        events = []
        let refused = MeeshyEdgeRailsTrigger.tap(isEnabled: false, play: { events.append("haptic:\($0)") }, action: { events.append("action") })
        #expect(!refused)
        #expect(events.isEmpty)
    }

    @MainActor
    @Test("un appui long : UN impact moyen, puis `onLongPress` ; désactivé, rien")
    func trigger_longPress() {
        var events: [String] = []
        let served = MeeshyEdgeRailsTrigger.longPress(isEnabled: true, play: { events.append("haptic:\($0)") }, action: { events.append("long") })
        #expect(served)
        #expect(events == ["haptic:medium", "long"])
        events = []
        let refused = MeeshyEdgeRailsTrigger.longPress(isEnabled: false, play: { events.append("haptic:\($0)") }, action: { events.append("long") })
        #expect(!refused)
        #expect(events.isEmpty)
    }

    // MARK: - Lecteur d'écran

    @Test("le nom accessible d'une rangée est `label`, sa valeur s'ajoute, la pastille se tait")
    func accessibility_nameAndValue() {
        let item = Self.item("a", label: "Ajouter un texte", title: "Texte", value: "2")
        #expect(item.accessibilityName == "Ajouter un texte")
        #expect(item.accessibilityValue == "2")
        #expect(Self.item("a").accessibilityValue == nil)
    }

    @Test("l'ordre de lecture : le rail de début puis celui de fin ; dans un rail, en-tête, entrées, pied")
    func accessibility_readingOrder() {
        #expect(MeeshyEdgeRailSide.allCases == [.leading, .trailing])
        let spec = Self.spec(entries: [.item(Self.item("a")), .item(Self.item("b"))], foot: [Self.item("undo")], header: "Sélection")
        #expect(spec.readingOrder == ["header", "a", "b", "undo"])
        #expect(Self.spec(entries: [.item(Self.item("a"))]).readingOrder == ["a"])
    }

    // MARK: - Contraste

    @Test("le contraste du mot, de l'en-tête et de la rangée allumée tient 4,5:1 sur le plateau")
    func contrast_followsTheRecipe() {
        let plateau = Self.rgb("1E1B4B")
        let white = (r: 255.0, g: 255.0, b: 255.0)
        let word = Self.contrast(white, plateau)
        let opacity = MeeshyEdgeRailsRecipe.headerOpacity
        let header = Self.contrast(Self.blend(white, over: plateau, alpha: opacity), plateau)
        let lit = Self.contrast(white, Self.rgb("1E1B4B"))
        #expect(word >= 4.5)
        #expect(header >= 4.5)
        #expect(lit >= 15.9)
    }

    // MARK: - Garde de source

    @Test("aucun verre dessiné ni chaîne traduite dans les fichiers de K12")
    func source_hasNoGlassNorTranslatedString() throws {
        let files = try Self.k12Sources()
        #expect(files.count >= 3)
        let forbidden = [
            "glassEffect", "adaptiveGlass", "AdaptiveGlassContainer", ".ultraThinMaterial", ".thinMaterial",
            ".regularMaterial", "String(localized", "NSLocalizedString", "LocalizedStringKey(",
            "Color(hex", "Color(red", "Color.white", "Color.black", "UIColor(",
        ]
        for (name, code) in files {
            for token in forbidden {
                #expect(!code.contains(token), "\(name) contient « \(token) »")
            }
        }
    }

    @Test("aucun jumeau ni écran touché : le kit ne nomme ni les appels ni le composer")
    func source_isAgnostic() throws {
        let forbidden = ["CallView", "CallAction", "CallRails", "Composer", "CallControls", "MeeshyConversation"]
        for (name, code) in try Self.k12Sources() {
            for token in forbidden {
                #expect(!code.contains(token), "\(name) nomme « \(token) »")
            }
        }
    }

    // MARK: - Aides

    private static func item(
        _ id: String,
        label: String = "Rangée",
        title: String? = nil,
        isOn: Bool = false,
        role: MeeshyEdgeRailRole = .normal,
        activation: MeeshyGlassButtonActivation = .none,
        value: String? = nil
    ) -> MeeshyEdgeRailItem {
        MeeshyEdgeRailItem(
            id: id, label: label, title: title, glyph: .system("plus"), isOn: isOn, role: role,
            activation: activation, value: value
        )
    }

    private static func spec(
        entries: [MeeshyEdgeRailEntry],
        foot: [MeeshyEdgeRailItem] = [],
        header: String? = nil
    ) -> MeeshyEdgeRailSpec {
        MeeshyEdgeRailSpec(name: "Rail", header: header, entries: entries, foot: foot)
    }

    private static func rgb(_ hex: String) -> (r: Double, g: Double, b: Double) {
        let value = UInt32(hex, radix: 16) ?? 0
        return (Double((value >> 16) & 0xFF), Double((value >> 8) & 0xFF), Double(value & 0xFF))
    }

    private static func blend(
        _ top: (r: Double, g: Double, b: Double), over bottom: (r: Double, g: Double, b: Double), alpha: Double
    ) -> (r: Double, g: Double, b: Double) {
        (top.r * alpha + bottom.r * (1 - alpha), top.g * alpha + bottom.g * (1 - alpha), top.b * alpha + bottom.b * (1 - alpha))
    }

    private static func luminance(_ color: (r: Double, g: Double, b: Double)) -> Double {
        func channel(_ value: Double) -> Double {
            let unit = value / 255
            return unit <= 0.03928 ? unit / 12.92 : pow((unit + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    }

    private static func contrast(_ a: (r: Double, g: Double, b: Double), _ b: (r: Double, g: Double, b: Double)) -> Double {
        let (high, low) = (max(luminance(a), luminance(b)), min(luminance(a), luminance(b)))
        return (high + 0.05) / (low + 0.05)
    }

    private static func k12Sources() throws -> [(String, String)] {
        let folder = repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Kit")
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
            .filter { $0.hasPrefix("MeeshyEdgeRail") && $0.hasSuffix(".swift") }
            .sorted()
        return try names.map { name in
            let text = try String(contentsOf: folder.appendingPathComponent(name), encoding: .utf8)
            let code = text.split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            return (name, code)
        }
    }

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func json() throws -> [String: Any] {
        let url = repositoryRoot.appendingPathComponent("docs/product/kit/K12-MeeshyEdgeRails.vectors.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    private static func rows(_ key: String) throws -> [[String: Any]] {
        try #require(try json()[key] as? [[String: Any]])
    }

    private static func object(_ key: String) throws -> [String: Any] {
        try #require(try json()[key] as? [String: Any])
    }
}
