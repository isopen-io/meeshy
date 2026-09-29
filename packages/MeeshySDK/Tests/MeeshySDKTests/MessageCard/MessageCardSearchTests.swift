import Foundation
import Testing
@testable import MeeshySDK

/// La recherche de la galerie — les mêmes promesses que
/// `apps/web/src/lib/export/message-card-search.test.ts`, rejouées sur le miroir iOS.
struct MessageCardSearchTests {

    private static let vocabulary = MessageCardVocabulary(
        typeface: [.rond: "Ronde", .didone: "Didone", .plume: "Plume", .affiche: "Affiche", .futur: "Futuriste",
                   .machine: "Machine à écrire", .marqueur: "Marqueur", .systeme: "Système"],
        link: [.orbite: "Orbite", .filet: "Filet", .guillemets: "Guillemets", .fleche: "Flèche", .bulles: "Bulles", .fil: "Fil", .silence: "Silence"],
        tone: [.dark: "Sombre", .light: "Clair"]
    )

    private static func search(_ query: String, usage: [MessageCardTemplateID: Int] = [:], tone: MessageCardTone? = nil) -> [MessageCardTemplateID] {
        MessageCardSearch.search(query, vocabulary: vocabulary, usage: usage, tone: tone)
    }

    @Test func laGalerieMontreChaqueTemplateUneFoisEtUneSeule() {
        #expect(MessageCardSearch.galleryOrder.count == MessageCardTemplates.all.count)
        #expect(Set(MessageCardSearch.galleryOrder).count == 784)
    }

    @Test func laGalerieCommenceCommeSurLeWeb() {
        #expect(MessageCardSearch.galleryOrder.prefix(2).map(\.rawValue) == ["aurore.rond.orbite", "minuit.didone.filet"])
    }

    @Test func deuxCartesVoisinesNePartagentNiPaletteNiTypographieNiLiaison() {
        let order = MessageCardSearch.galleryOrder
        for index in 0..<60 {
            let (a, b) = (order[index], order[index + 1])
            #expect(a.palette != b.palette)
            #expect(a.typeface != b.typeface)
            #expect(a.link != b.link)
        }
    }

    @Test func uneRechercheVideRendTouteLaGalerie() {
        #expect(Self.search("  ").count == 784)
    }

    @Test func ignoreLaCasseEtLesAccentsEtLitLeDebutDesMots() {
        let found = Self.search("FLECHE pech")
        #expect(found.count == 8)
        #expect(found.allSatisfy { $0.palette == .peche && $0.link == .fleche })
    }

    @Test func chaqueMotTapeResserreLaRecherche() {
        #expect(Self.search("plume").count == 98)
        #expect(Self.search("plume sombre").count == 49)
        #expect(Self.search("plume sombre bulles").count == 7)
    }

    @Test func leTonSeFiltreAussiSansLeTaper() {
        let light = Self.search("", tone: .light)
        #expect(light.count == 392)
        #expect(light.allSatisfy { $0.palette.palette.tone == .light })
    }

    @Test func unMotQuiNeNommeRienNeRendRien() {
        #expect(Self.search("zzz").isEmpty)
    }

    @Test func lesTemplatesDejaUtilisesPassentEnTeteLePlusUtiliseDAbord() {
        let citron = MessageCardTemplateID(palette: .citron, typeface: .machine, link: .orbite)
        let lagon = MessageCardTemplateID(palette: .lagon, typeface: .futur, link: .orbite)
        let found = Self.search("orbite", usage: [citron: 2, lagon: 5])
        #expect(Array(found.prefix(2)) == [lagon, citron])
    }

    @Test func leNomDUnePaletteSeTrouveSansSonAccent() {
        #expect(MessageCardSearch.fold("Éditorial Forêt") == "editorial foret")
        #expect(Self.search("foret").allSatisfy { $0.palette == .foret })
    }
}
