import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K40 — le bouton libellé lu comme des VALEURS : la recette (hauteur, marges,
/// glyphe, corps par taille), les formes round et hold, les états, la loi du
/// maintien, la paire, les mots dits, puis les gardes de source.
@Suite("MeeshyButton")
struct MeeshyButtonTests {

    private static let file = "K40-MeeshyButton"

    @Test("hauteur, marges, glyphe, corps et cible des quatre tailles")
    func recipe_sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let raw = try #require(row["taille"] as? Int)
            let size = try #require(MeeshyButtonSize(rawValue: raw))
            let recipe = Self.recipe(size: size)
            #expect(recipe.height == row["hauteur"] as? Double, "\(row)")
            #expect(recipe.horizontalMargin == row["marge"] as? Double, "\(row)")
            #expect(recipe.glyphSize == row["glyphe"] as? Double, "\(row)")
            #expect(recipe.fontSize == row["corps"] as? Double, "\(row)")
            #expect(recipe.tapHeight == row["cible"] as? Double, "\(row)")
            #expect(recipe.tapHeight >= MeeshyButtonRecipe.minimumTapHeight, "\(row)")
        }
    }

    @Test("round vaut 56 et hold 96, quelle que soit la taille passée ; ils n'acceptent que primary, accent et tinted")
    func recipe_shapes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "formes") {
            let shape = try #require(MeeshyButtonShape(rawValue: try #require(row["forme"] as? String)))
            let recipe = Self.recipe(size: .s36, shape: shape)
            #expect(recipe.height == row["diametre"] as? Double, "\(row)")
            #expect(recipe.diameter == row["diametre"] as? Double, "\(row)")
            #expect(recipe.glyphSize == row["glyphe"] as? Double, "\(row)")
        }
        let allowed = try #require(try KitAtomVectors.load(Self.file)["genresDesFormes"] as? [String])
        for kind in MeeshyButtonKind.allCases {
            let round = Self.recipe(kind: kind, shape: .round)
            #expect(allowed.contains(round.kind.rawValue), "\(kind)")
            let kept = allowed.contains(kind.rawValue)
            #expect((round.kind == kind) == kept, "\(kind)")
        }
    }

    @Test("pressé : échelle 0,94, sans échelle sous mouvement réduit ; désactivé : 45 %, ni action")
    func recipe_states_followTheVectors() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        let scale = try #require(vectors["pressionEchelle"] as? Double)
        let dim = try #require(vectors["desactiveOpacite"] as? Double)
        #expect(Self.recipe(isPressed: true).scale == scale)
        #expect(Self.recipe(isPressed: true, reduceMotion: true).scale == 1)
        #expect(Self.recipe().scale == 1)
        let off = Self.recipe(isEnabled: false)
        #expect(off.contentOpacity == dim)
        #expect(!off.isActionable)
        #expect(Self.recipe().contentOpacity == 1)
    }

    @Test("occupé : l'indicateur prend la place du glyphe, aucune action, aucune largeur ne bouge ; différé : actif, avec sa pastille")
    func recipe_pendingAndDeferred() {
        let rest = Self.recipe()
        let busy = Self.recipe(isPending: true)
        #expect(busy.showsIndicator && !rest.showsIndicator)
        #expect(!busy.isActionable && rest.isActionable)
        #expect(busy.horizontalMargin == rest.horizontalMargin)
        #expect(busy.glyphSize == rest.glyphSize)
        #expect(busy.height == rest.height)
        let deferred = Self.recipe(isDeferred: true)
        #expect(deferred.isActionable && deferred.showsDeferredClock)
        #expect(!rest.showsDeferredClock)
    }

    @Test("le teinté et le danger sont des fonds doux ; text n'a aucun fond et passe au rouge s'il est destructif")
    func recipe_kinds_pickASurfaceAndAnInk() {
        #expect(Self.recipe(kind: .primary).surface == .brand)
        #expect(Self.recipe(kind: .accent).surface == .accent)
        #expect(Self.recipe(kind: .tinted).surface == .tintedSoft)
        #expect(Self.recipe(kind: .glass).surface == .glass)
        #expect(Self.recipe(kind: .outline).surface == .clear)
        #expect(Self.recipe(kind: .outline).outlineWidth > 0)
        #expect(Self.recipe(kind: .danger).surface == .dangerSoft)
        #expect(Self.recipe(kind: .danger).ink == .danger)
        #expect(Self.recipe(kind: .text).surface == .clear)
        #expect(Self.recipe(kind: .text).ink == .neutral)
        #expect(Self.recipe(kind: .text, isDestructive: true).ink == .danger)
        #expect(Self.recipe(kind: .primary, isDestructive: true).ink == .onBrand)
    }

    @Test("maintien : true au doigt posé, false au doigt levé, jamais deux true de suite, un seul false")
    func holdLaw_neverDoublesATrue() {
        var law = MeeshyButtonHoldLaw()
        #expect(law.press() == true)
        #expect(law.press() == nil)
        #expect(law.release() == false)
        #expect(law.release() == nil)
        #expect(law.press() == true)
        #expect(law.cancel() == false)
        #expect(!law.isHeld)
    }

    @Test("la paire : parts 1,6 et 1, écart 8 ; elle s'empile aux très grandes polices")
    func pair_followsTheVectors() throws {
        let pair = try #require(try KitAtomVectors.load(Self.file)["paire"] as? [String: Any])
        #expect(MeeshyButtonPairLaw.primaryShare == pair["partPrincipal"] as? Double)
        #expect(MeeshyButtonPairLaw.secondaryShare == pair["partSecondaire"] as? Double)
        #expect(MeeshyButtonPairLaw.spacing == pair["ecart"] as? Double)
        let widths = MeeshyButtonPairLaw.widths(total: 268)
        #expect(abs(widths.primary + widths.secondary + MeeshyButtonPairLaw.spacing - 268) < 0.0001)
        #expect(abs(widths.primary / widths.secondary - 1.6) < 0.0001)
        #expect(MeeshyButtonPairLaw.stacks(isAccessibilitySize: true))
        #expect(!MeeshyButtonPairLaw.stacks(isAccessibilitySize: false))
        #expect(MeeshyButtonPairLaw.widths(total: -10).primary == 0)
    }

    @Test("les mots dits : « En cours », « Sera envoyé », la raison d'un bouton éteint")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyButtonWords.spokenValue(isPending: true, isDeferred: false, bundle: fr, locale: locale) == "En cours")
        #expect(MeeshyButtonWords.spokenValue(isPending: false, isDeferred: true, bundle: fr, locale: locale) == "Sera envoyé")
        #expect(MeeshyButtonWords.spokenValue(isPending: false, isDeferred: false, bundle: fr, locale: locale) == nil)
        #expect(MeeshyButtonWords.hint(disabledReason: "Choisis un nom") == "Choisis un nom")
        #expect(MeeshyButtonWords.hint(disabledReason: "") == nil)
        #expect(MeeshyButtonWords.hint(disabledReason: nil) == nil)
    }

    @Test("garde de source : aucun verre dessiné, aucun type du domaine, aucun singleton, aucune couleur en dur")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyButton.swift", "MeeshyButtonRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["UIVisualEffectView", ".ultraThinMaterial", "Color(hex:", "Color(red:", ".shared",
                              "MeeshyUser", "MeeshyConversation", "ThemeManager"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(kind: MeeshyButtonKind = .primary,
                               size: MeeshyButtonSize = .s50,
                               shape: MeeshyButtonShape = .capsule,
                               isPressed: Bool = false,
                               isEnabled: Bool = true,
                               isPending: Bool = false,
                               isDeferred: Bool = false,
                               isDestructive: Bool = false,
                               reduceMotion: Bool = false) -> MeeshyButtonRecipe {
        MeeshyButtonRecipe.resolve(kind: kind, size: size, shape: shape, isPressed: isPressed,
                                   isEnabled: isEnabled, isPending: isPending, isDeferred: isDeferred,
                                   isDestructive: isDestructive, reduceMotion: reduceMotion)
    }
}
