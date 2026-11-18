import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K15 et le profil : la surface de verre d'une feuille posée sur une carte, et les formes
/// `modal` et `confirm`. Mesures lues dans les vecteurs K15 partagés.
@Suite("MeeshyAnchoredSheet — verre et formes")
struct MeeshyAnchoredSheetFormTests {
    private static let file = "K15-MeeshyAnchoredSheet.vectors.json"

    @Test("trois surfaces : le verre prend l'encre du média et la poignée du sombre")
    func surfaces_followTheVectors() throws {
        let rows = try KitEvolutionVectors.rows(Self.file, "surfaces")
        #expect(MeeshyAnchoredSheetSurface.allCases.map(\.rawValue) == rows.compactMap { $0["surface"] as? String })
        for row in rows {
            let surfaceRaw = try #require(row["surface"] as? String)
            let surface = try #require(MeeshyAnchoredSheetSurface(rawValue: surfaceRaw))
            #expect(MeeshyAnchoredSheetMetrics.usesMediaInk(surface: surface) == row["encreMedia"] as? Bool, "\(row)")
            #expect(MeeshyAnchoredSheetMetrics.handleOpacity(surface: surface) == row["poignee"] as? Double, "\(row)")
        }
    }

    @Test("chaque forme décide de la hauteur, du voile, du toucher hors feuille, du flou et de la poignée")
    func forms_followTheVectors() throws {
        let rows = try KitEvolutionVectors.rows(Self.file, "formes")
        #expect(MeeshyAnchoredSheetForm.allCases.map(\.rawValue) == rows.compactMap { $0["forme"] as? String })
        for row in rows {
            let formRaw = try #require(row["forme"] as? String)
            let form = try #require(MeeshyAnchoredSheetForm(rawValue: formRaw))
            let law = MeeshyAnchoredSheetFormLaw.resolve(form)
            #expect(law.height == Self.height(row["hauteur"]), "\(row)")
            #expect(law.scrim == row["voile"] as? Bool, "\(row)")
            #expect(law.outside.rawValue == row["exterieur"] as? String, "\(row)")
            #expect(Double(law.hostBlur) == row["flou"] as? Double, "\(row)")
            #expect(law.showsHandle == row["poignee"] as? Bool, "\(row)")
            #expect(law.isAlert == row["alerte"] as? Bool, "\(row)")
        }
    }

    @Test("sous Réduire la transparence ou les animations, l'hôte ne se floute pas ; le voile reste")
    func forms_reducedEffects_dropTheBlurOnly() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "formesSansEffets") {
            let formRaw = try #require(row["forme"] as? String)
            let form = try #require(MeeshyAnchoredSheetForm(rawValue: formRaw))
            let law = MeeshyAnchoredSheetFormLaw.resolve(form, reducesEffects: true)
            #expect(Double(law.hostBlur) == row["flou"] as? Double, "\(row)")
            #expect(law.scrim)
        }
    }

    @Test("la confirmation est faite du kit : médaillon K45, paire K40, fenêtre modale, titre en en-tête")
    func source_confirmIsMadeOfTheKit() throws {
        let code = try KitEvolutionVectors.code("MeeshyAnchoredSheetForm.swift")
        #expect(code.contains("MeeshyMedallion("))
        #expect(code.contains("MeeshyButtonPair {"))
        #expect(code.contains(".accessibilityAddTraits(.isModal)"))
        #expect(code.contains(".accessibilityAddTraits(.isHeader)"))
        for word in ["Color(hex:", "Color.white", "Color.black", ".alert(", "confirmationDialog"] {
            #expect(!code.contains(word), "MeeshyAnchoredSheetForm.swift contient \(word)")
        }
        let sheet = try KitEvolutionVectors.code("MeeshyAnchoredSheet.swift")
        #expect(sheet.contains(".meeshyGlass(in: RoundedCorner(radius: MeeshyRadius.xxl, corners: [.topLeft, .topRight]), tone: .deep)"))
    }

    private static func height(_ value: Any?) -> MeeshyAnchoredSheetHeight? {
        if let name = value as? String, name == "content" { return .content }
        if let part = value as? Double { return .fraction(CGFloat(part)) }
        return nil
    }
}
