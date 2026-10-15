import Foundation
import Testing
@testable import MeeshySDK

@Suite("ConversationAppearance — décodage tolérant par champ (#10631)")
struct ConversationAppearanceTests {

    private func decode(_ json: String) throws -> ConversationAppearance {
        try JSONDecoder().decode(ConversationAppearance.self, from: Data(json.utf8))
    }

    @Test("un kind inconnu retombe sur Signature et GARDE l'accent")
    func unknownKindFallsBackToSignatureKeepingAccent() throws {
        let appearance = try decode(#"{"v":1,"background":{"kind":"hologram","depth":3},"accent":"corail","animate":false}"#)
        #expect(appearance.background == .signature)
        #expect(appearance.accent == "corail")
        #expect(appearance.animate == false)
    }

    @Test("un accent hors gamme est perdu SANS perdre le fond")
    func unknownAccentKeepsBackground() throws {
        let appearance = try decode(#"{"v":1,"background":{"kind":"solid","color":"azur"},"accent":"fuchsia-laser","animate":true}"#)
        #expect(appearance.background == .solid(color: "azur"))
        #expect(appearance.accent == nil)
    }

    @Test("une valeur qui n'est pas un objet donne l'apparence par défaut, jamais une erreur")
    func nonObjectIsDefault() throws {
        struct Holder: Decodable { let appearance: ConversationAppearance? }
        let holder = try JSONDecoder().decode(Holder.self, from: Data(#"{"appearance":"garbage"}"#.utf8))
        #expect(holder.appearance == .default)
    }

    @Test("une apparence absente se lit comme le défaut : Signature, accent calculé")
    func emptyObjectIsDefault() throws {
        #expect(try decode("{}") == .default)
        #expect(ConversationAppearance.default.isDefault)
    }

    @Test("les quatre fonds font l'aller-retour, accent null explicite")
    func roundTrip() throws {
        let cases: [ConversationAppearance] = [
            .default,
            ConversationAppearance(background: .design(pack: "heritages", design: "zellige"), accent: "lagon", animate: true),
            ConversationAppearance(background: .solid(color: "sable"), accent: nil, animate: false),
            ConversationAppearance(background: .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.4, blur: 8), accent: "prune", animate: true),
        ]
        for appearance in cases {
            let data = try JSONEncoder().encode(appearance)
            #expect(try JSONDecoder().decode(ConversationAppearance.self, from: data) == appearance)
        }
        let json = String(decoding: try JSONEncoder().encode(ConversationAppearance.default), as: UTF8.self)
        #expect(json.contains(#""accent":null"#))
        #expect(json.contains(#""v":1"#))
    }

    @Test("un voile ou un flou hors bornes est ramené dans ses bornes")
    func photoBoundsAreClamped() throws {
        let appearance = try decode(#"{"v":1,"background":{"kind":"photo","attachmentId":"64b7f0c2a1b2c3d4e5f60718","veil":2.5,"blur":99},"accent":null,"animate":true}"#)
        #expect(appearance.background == .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.8, blur: 24))
    }
}

@Suite("AppearanceCatalog — la copie embarquée (#10631)")
struct AppearanceCatalogTests {

    @Test("le catalogue embarqué porte 16 couleurs, 5 packs de fonds, 15 modèles et 7 bannières")
    func bundledCatalogShape() {
        let catalog = AppearanceCatalog.shared
        #expect(catalog.gamut.entries.count == 16)
        #expect(catalog.wallpaperPacks.map(\.slug) == ["essentiels", "heritages", "nature-et-ciel", "illustrations", "animes"])
        #expect(catalog.wallpaperPacks.flatMap(\.designs).count == 15)
        #expect(catalog.bannerPacks.flatMap(\.designs).count == 7)
    }

    @Test("trouve un modèle par (pack, clé) et refuse une clé d'un autre pack")
    func lookup() {
        let catalog = AppearanceCatalog.shared
        #expect(catalog.wallpaper(pack: "heritages", design: "zellige")?.style == .pattern)
        #expect(catalog.wallpaper(pack: "essentiels", design: "zellige") == nil)
        #expect(catalog.wallpaper(pack: "illustrations", design: "baobab")?.style == .illustration)
        #expect(catalog.wallpaper(pack: "essentiels", design: "aurore")?.style == .gradient)
    }

    /// c35652f640 installe d'office le pack animé « Brume vivante » (`animes`) — même attente que le web
    /// (`visibleWallpaperPacks(new Set())` → essentiels, animes) ; ce témoin iOS n'avait pas suivi.
    @Test("« Essentiels » et les fonds animés sont présentés d'emblée")
    func defaultWallpapers() {
        let packs = Set(AppearanceCatalog.shared.defaultWallpapers.map(\.pack.slug))
        #expect(packs == ["essentiels", "animes"])
    }

    @Test("la gamme donne surface et accent par schéma, et refuse une clé inconnue")
    func gamutLookup() {
        let gamut = AppearanceCatalog.shared.gamut
        #expect(gamut.surface("indigo", scheme: .light) == "#EEF0FF")
        #expect(gamut.accent("indigo", scheme: .dark) == "#818CF8")
        #expect(gamut.accent("nope", scheme: .dark) == nil)
    }

    @Test("les noms suivent la langue, retombent sur le français puis sur rien")
    func names() {
        let catalog = AppearanceCatalog.shared
        #expect(catalog.designName("monogramme", language: "fr") == "Monogramme")
        #expect(catalog.designName("art-deco", language: "fr-CA") == "Art déco")
        #expect(catalog.designName("zzz", language: "en") == nil)
        #expect(catalog.gamutName("bleu-nuit", language: "xx") == "Bleu nuit")
    }

    @Test("un modèle illisible est écarté SEUL : le pack et le catalogue restent")
    func lossyDesigns() throws {
        let json = #"""
        {"version":1,"gamut":[],"banners":[],"strings":{},
         "wallpapers":[{"slug":"p","order":0,"installedByDefault":true,"removable":false,"designs":[
           {"key":"ok","style":"pattern","palettes":{"light":{"base":"#FFFFFF","ink":"#000000","soft":"#EEEEEE"},"dark":{"base":"#000000","ink":"#FFFFFF","soft":"#111111"}},"tile":{"width":8,"height":8,"scale":1,"rotation":0,"paths":[]}},
           {"key":"futur","style":"hologram"}
         ]}]}
        """#
        let catalog = try AppearanceCatalog.decode(Data(json.utf8))
        #expect(catalog.wallpaperPacks.first?.designs.map(\.key) == ["ok"])
    }
}
