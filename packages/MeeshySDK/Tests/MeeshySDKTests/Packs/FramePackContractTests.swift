import Foundation
import Testing
@testable import MeeshySDK

/// **Le contrat d'un pack de cadres et sa boutique se lisent comme le shared
/// les lit** (#10150, miroir de `packages/shared/types/glory-frame-pack.ts`) :
/// fail-closed PAR CADRE, version inconnue ⇒ rien, champs inconnus ignorés,
/// et une boutique dont un pack est illisible garde les autres.
@Suite("Packs de cadres — contrat, résumé, décodage par item")
struct FramePackContractTests {

    static let sha = String(repeating: "ab", count: 32)
    static let otherSha = String(repeating: "cd", count: 32)

    static func thumb(_ sha: String = FramePackContractTests.sha) -> String {
        #"{"src":"\#(sha.prefix(16)).webp","bytes":1200,"sha256":"\#(sha)"}"#
    }

    static func frame(id: String, usage: String = #"{"kind":"rank","rank":"ambassadeur","division":4}"#,
                      thumb: String = FramePackContractTests.thumb(), name: String = #""name":"frame.a4.name""#) -> String {
        #"{"id":"\#(id)","usage":\#(usage),"thumb":\#(thumb),"i18n":{\#(name)},"family":"savane"}"#
    }

    static func contract(_ frames: [String], schema: Int = 1) -> Data {
        Data(#"{"schema":\#(schema),"formats":["story"],"frames":[\#(frames.joined(separator: ","))]}"#.utf8)
    }

    @Test("un contrat lisible rend ses cadres, dans l'ordre, usage décodé par la loi")
    func readableContract() throws {
        let parsed = try #require(GloryFramePackContract.parse(Self.contract([
            Self.frame(id: "exemple-savane.ambassadeur-4"),
            Self.frame(id: "exemple-savane.ambassadeur-1", usage: #"{"kind":"rank","rank":"ambassadeur","division":1}"#),
        ])))
        #expect(parsed.rejected == 0)
        #expect(parsed.contract.frames.map(\.id) == ["exemple-savane.ambassadeur-4", "exemple-savane.ambassadeur-1"])
        #expect(parsed.contract.frames.first?.usage == .rank(.ambassadeur, division: .iv))
        #expect(parsed.contract.frames.first?.nameKey == "frame.a4.name")
    }

    @Test("un cadre invalide tombe SEUL et se compte")
    func badFramesFallAlone() throws {
        let parsed = try #require(GloryFramePackContract.parse(Self.contract([
            Self.frame(id: "ok.un"),
            Self.frame(id: "libre", usage: #"{"kind":"free","surfaces":["call"]}"#),
            Self.frame(id: "sans-usage", usage: "null"),
            Self.frame(id: "vignette", thumb: #"{"src":"cover.webp","bytes":1,"sha256":"\#(Self.sha)"}"#),
            Self.frame(id: "empreinte", thumb: #"{"src":"\#(Self.otherSha.prefix(16)).webp","bytes":1,"sha256":"\#(Self.sha)"}"#),
            Self.frame(id: "sans-nom", name: #""story":"x""#),
            Self.frame(id: "ok.un"),
            "42",
        ])))
        #expect(parsed.contract.frames.map(\.id) == ["ok.un"])
        #expect(parsed.rejected == 7)
    }

    @Test("une version de contrat inconnue ou une forme illisible ne se lit pas")
    func unknownSchema() {
        #expect(GloryFramePackContract.parse(Self.contract([Self.frame(id: "a")], schema: 2)) == nil)
        #expect(GloryFramePackContract.parse(Data(#"{"schema":1,"frames":{}}"#.utf8)) == nil)
        #expect(GloryFramePackContract.parse(Data("[]".utf8)) == nil)
    }

    @Test("les chaînes d'une langue : une paire illisible tombe seule")
    func strings() {
        let table = PackStringKey.parseStrings(Data(#"{"frame.a4.name":"Savane IV","Bad":"x","vide":"  ","n":3}"#.utf8))
        #expect(table == ["frame.a4.name": "Savane IV"])
        #expect(PackStringKey.parseStrings(Data("[1]".utf8)).isEmpty)
    }

    @Test("le résumé servi par /packs/glory-frame : usage, couverture relative, nom par langue")
    func summary() throws {
        let json = #"""
        {"slug":"exemple-savane","name":"Savane","description":"d","author":"Meeshy","builtin":false,
         "status":"approved","itemCount":4,"coverUrl":"/api/v1/pack-assets/\#(Self.sha.prefix(16)).webp",
         "installed":false,"installCount":0,"domain":"glory-frame","origin":"official","version":1,
         "downloadBytes":{"story":4000,"square":null},"removable":true,
         "names":{"en":{"name":"Savannah","description":"e"},"xx":{"oops":1}},"preview":null,
         "usage":{"kind":"rank","rank":"ambassadeur"}}
        """#
        let pack = try JSONDecoder().decode(FramePack.self, from: Data(json.utf8))
        #expect(pack.usage == .rank(.ambassadeur, division: nil))
        #expect(pack.coverFile?.name == "\(Self.sha.prefix(16)).webp")
        #expect(pack.coverFile?.sha256 == nil)
        #expect(pack.localizedName(language: "en") == "Savannah")
        #expect(pack.localizedName(language: "pt-BR") == "Savane")
        #expect(pack.origin == .official)
        #expect(!pack.isBundled)
    }

    @Test("une adresse qui n'est pas un fichier de pack n'est pas une couverture stockée")
    func coverOutsidePackAssets() {
        #expect(PackAssetFile(servedPath: "/api/v1/attachments/file/x.webp") == nil)
        #expect(PackAssetFile(servedPath: "/api/v1/pack-assets/not-hex.webp") == nil)
        #expect(PackAssetFile(servedPath: nil) == nil)
    }

    @Test("une boutique dont un pack est illisible garde les autres")
    func lossyList() throws {
        let json = #"[{"slug":"a"},{"name":"sans slug"},7,{"slug":"b","usage":{"kind":"martien"}}]"#
        let list = try JSONDecoder().decode(LossyDecodableArray<FramePack>.self, from: Data(json.utf8))
        #expect(list.elements.map(\.slug) == ["a", "b"])
        #expect(list.dropped == 2)
        #expect(list.elements.last?.usage == nil, "un usage illisible se tait, le pack reste")
    }

    @Test("le détail porte le contrat et les chaînes ; la langue du lecteur, sinon le français")
    func detailStrings() throws {
        let ref = Self.thumb().replacingOccurrences(of: ".webp", with: ".json")
        let json = #"{"slug":"s","contractSchema":1,"contract":\#(ref),"strings":{"fr":\#(ref),"en":\#(ref)},"collections":[{"slug":"c","usage":null}]}"#
        let pack = try JSONDecoder().decode(FramePack.self, from: Data(json.utf8))
        #expect(pack.contract?.src == "\(Self.sha.prefix(16)).json")
        #expect(pack.stringsRef(language: "de") == pack.strings["fr"])
        #expect(pack.stringsRef(language: "en") == pack.strings["en"])
        #expect(pack.collections.map(\.slug) == ["c"])
    }
}
