import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K46 — la note en ligne lue comme des VALEURS : phrase, tête, conteneur et
/// filet par forme, tête par défaut d'un sens, point qui pulse ou qui se fige,
/// action qui passe dessous, annonce de `warn`, gras d'une valeur, puis les
/// gardes de source (dans le flux, aucune horloge, aucun réseau).
@Suite("MeeshyNote")
struct MeeshyNoteTests {

    private static let file = "K46-MeeshyNote"

    @Test("phrase, tête, conteneur, filet et hauteur minimale de chaque forme")
    func recipe_forms_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "formes") {
            let form = try #require(MeeshyNoteForm(rawValue: try #require(row["forme"] as? String)))
            let recipe = Self.recipe(form: form)
            #expect(recipe.phraseSize == row["phrase"] as? Double, "\(row)")
            #expect(recipe.leadSize == row["tete"] as? Double, "\(row)")
            #expect(recipe.container.rawValue == row["conteneur"] as? String, "\(row)")
            #expect(recipe.ruleWidth == row["filet"] as? Double, "\(row)")
            #expect(recipe.minimumHeight == row["hauteurMin"] as? Double, "\(row)")
            if let radius = row["rayon"] as? Double { #expect(recipe.cornerRadius == radius, "\(row)") }
            if let percent = row["teintePourcent"] as? Int { #expect(recipe.tintPercent == percent, "\(row)") }
            if let bottom = row["filetBas"] as? Double { #expect(recipe.bottomRuleWidth == bottom, "\(row)") }
        }
    }

    @Test("interligne 1,4 ; seconde ligne de 12,5 ; la liste vaut 13 ou 14,5")
    func recipe_text() throws {
        let vectors = try KitAtomVectors.load(Self.file)
        let list = try #require(vectors["liste"] as? [String: Double])
        #expect(MeeshyNoteRecipe.lineHeightMultiplier == vectors["interligne"] as? Double)
        #expect(MeeshyNoteRecipe.detailSize == vectors["secondeLigne"] as? Double)
        #expect(MeeshyNoteRecipe.listPhraseSize(.compact) == list["compact"])
        #expect(MeeshyNoteRecipe.listPhraseSize(.regular) == list["regular"])
    }

    @Test("la tête par défaut d'un sens est un glyphe ; live porte un point qui pulse")
    func recipe_lead() {
        for kind in MeeshyNoteKind.allCases {
            let recipe = Self.recipe(form: .line, kind: kind)
            guard case .glyph(let name) = recipe.lead else {
                Issue.record("pas de glyphe pour \(kind)")
                continue
            }
            #expect(!name.isEmpty)
            #expect(name == MeeshyNoteRecipe.defaultGlyph(for: kind))
        }
        #expect(Set(MeeshyNoteKind.allCases.map(MeeshyNoteRecipe.defaultGlyph(for:))).count == MeeshyNoteKind.allCases.count)
        #expect(Self.recipe(form: .live).lead == .dot(pulsing: true))
        #expect(Self.recipe(form: .line, lead: .none).lead == .none)
        #expect(Self.recipe(form: .line, lead: .systemImage("lock.fill")).lead == .glyph("lock.fill"))
        #expect(Self.recipe(form: .line, lead: .dot).lead == .dot(pulsing: false))
    }

    @Test("périmé : le point se fige et la teinte s'éteint, sans changer la hauteur ; réduit : aucun battement")
    func recipe_stale_and_reduced() {
        let fresh = Self.recipe(form: .live, kind: .ok)
        let stale = Self.recipe(form: .live, kind: .ok, isStale: true)
        #expect(stale.lead == .dot(pulsing: false))
        #expect(stale.inkKind == .neutral)
        #expect(fresh.inkKind == .ok)
        #expect(stale.minimumHeight == fresh.minimumHeight)
        #expect(stale.phraseSize == fresh.phraseSize)
        #expect(Self.recipe(form: .live, reduceMotion: true).lead == .dot(pulsing: false))
        #expect(!Self.recipe(form: .banner, reduceMotion: true).animatesHeight)
        #expect(Self.recipe(form: .banner).animatesHeight)
    }

    @Test("la seconde ligne n'existe qu'en band et banner ; l'action passe dessous sous 320")
    func recipe_detailAndAction() {
        #expect(Self.recipe(form: .band, hasDetail: true).showsDetail)
        #expect(Self.recipe(form: .banner, hasDetail: true).showsDetail)
        #expect(!Self.recipe(form: .line, hasDetail: true).showsDetail)
        #expect(!Self.recipe(form: .live, hasDetail: true).showsDetail)
        #expect(!Self.recipe(form: .band, hasDetail: false).showsDetail)
        #expect(Self.recipe(form: .band, hasAction: true, width: 300).actionWrapsBelow)
        #expect(!Self.recipe(form: .band, hasAction: true, width: 360).actionWrapsBelow)
        #expect(!Self.recipe(form: .band, hasAction: false, width: 300).actionWrapsBelow)
        #expect(Self.recipe(form: .band, hasAction: true).actionTapHeight >= 44)
    }

    @Test("seul warn est annoncé, une fois, sauf avis contraire")
    func announcement() throws {
        for row in try KitAtomVectors.rows(Self.file, "annonce") {
            let kind = try #require(MeeshyNoteKind(rawValue: try #require(row["sens"] as? String)))
            #expect(MeeshyNoteRecipe.announces(kind: kind, override: nil) == row["annonce"] as? Bool, "\(row)")
        }
        #expect(MeeshyNoteRecipe.announces(kind: .ok, override: true))
        #expect(!MeeshyNoteRecipe.announces(kind: .warn, override: false))
        #expect(MeeshyNoteRecipe.shouldAnnounce(previous: nil, current: .warn, override: nil))
        #expect(!MeeshyNoteRecipe.shouldAnnounce(previous: .warn, current: .warn, override: nil))
        #expect(!MeeshyNoteRecipe.shouldAnnounce(previous: nil, current: .info, override: nil))
    }

    @Test("la valeur en gras se trouve où qu'elle tombe, et une valeur absente laisse la phrase intacte")
    func emphasis() {
        let styled = MeeshyNoteRecipe.attributedPhrase("Il reste 3 jours", emphasis: "3 jours")
        #expect(String(styled.characters) == "Il reste 3 jours")
        let boldRuns = styled.runs.filter { $0.inlinePresentationIntent == .stronglyEmphasized }
        #expect(boldRuns.map { String(styled[$0.range].characters) } == ["3 jours"])
        let plain = MeeshyNoteRecipe.attributedPhrase("Hors ligne", emphasis: "absent")
        #expect(plain.runs.allSatisfy { $0.inlinePresentationIntent == nil })
        #expect(String(MeeshyNoteRecipe.attributedPhrase("Bonjour", emphasis: nil).characters) == "Bonjour")
        #expect(String(MeeshyNoteRecipe.attributedPhrase("Bonjour", emphasis: "").characters) == "Bonjour")
    }

    @Test("garde de source : aucun overlay, aucun zIndex, aucune minuterie, aucune horloge, aucun réseau")
    func source_staysInTheFlow() throws {
        for file in ["MeeshyNote.swift", "MeeshyNoteRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".overlay(", ".zIndex(", "Timer", "Date()", "URLSession", "DispatchQueue", "Task.sleep",
                              "Color(hex:", ".shared", "MeeshyUser", "ThemeManager", ".shadow(", ".blur("] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(form: MeeshyNoteForm,
                               kind: MeeshyNoteKind = .neutral,
                               lead: MeeshyNoteLead? = nil,
                               size: MeeshyNoteSize = .regular,
                               isStale: Bool = false,
                               hasDetail: Bool = false,
                               hasAction: Bool = false,
                               width: Double = 390,
                               reduceMotion: Bool = false) -> MeeshyNoteRecipe {
        MeeshyNoteRecipe.resolve(form: form, kind: kind, lead: lead, size: size, isStale: isStale,
                                 hasDetail: hasDetail, hasAction: hasAction, width: width,
                                 reduceMotion: reduceMotion)
    }
}
