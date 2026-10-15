import Foundation
import Testing
@testable import MeeshySDK

/// **Le registre RÉEL des cadres de gloire se lit sur iOS tel que le shared le
/// publie** (#10154, L3) : chaque contrat de pack servi par la passerelle
/// (`services/gateway/assets/packs/<sha16>.json`, nommé par
/// `packages/shared/design/glory-frames/packs.json`) se décode entier, et chaque
/// cadre y porte un placement que la loi de proposition (L4) peut lire.
@Suite("Cadres de gloire — le registre publié se lit, placement compris")
struct GloryFramePlacementTests {

    private struct Entry: Decodable {
        struct Ref: Decodable { let src: String }
        struct Collection: Decodable { let slug: String }
        let slug: String
        let contract: Ref
        let collections: [Collection]
    }

    /// `packages/MeeshySDK/Tests/MeeshySDKTests/Packs/…` : **6** composants à retirer pour atteindre la racine du dépôt.
    private static var repoURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }

    private static func registry() throws -> [Entry] {
        let data = try Data(contentsOf: repoURL.appendingPathComponent("packages/shared/design/glory-frames/packs.json"))
        return try JSONDecoder().decode([Entry].self, from: data)
    }

    private static func contract(_ entry: Entry) throws -> (contract: GloryFramePackContract, rejected: Int)? {
        let data = try Data(contentsOf: repoURL.appendingPathComponent("services/gateway/assets/packs/\(entry.contract.src)"))
        return GloryFramePackContract.parse(data)
    }

    @Test("chaque contrat du registre se lit sans refus, et chaque cadre y a son placement, dans une collection du pack")
    func everyPublishedFrameHasAPlacement() throws {
        let entries = try Self.registry()
        #expect(entries.map(\.slug) == ["afrique", "egypte", "olympe", "celeste", "nord", "abysses", "neon", "moments", "tresor"])
        for entry in entries {
            let parsed = try #require(try Self.contract(entry))
            #expect(parsed.rejected == 0, "\(entry.slug)")
            let collections = Set(entry.collections.map(\.slug))
            #expect(parsed.contract.frames.allSatisfy { frame in frame.placement.map { collections.contains($0.collection) } ?? false },
                    "\(entry.slug)")
        }
    }

    @Test("l'Afrique éternelle : trente-huit cadres, Savane puis Royaumes ; un rang sert son RANG, sa division est dans la cible")
    func eternalAfrica() throws {
        let afrique = try #require(try Self.registry().first { $0.slug == "afrique" })
        let frames = try #require(try Self.contract(afrique)).contract.frames
        #expect(frames.count == 38)
        #expect(frames.first?.placement?.collection == "savane")
        #expect(frames.last?.placement?.collection == "royaumes")
        let ambassadorFive = try #require(frames.first { $0.id == "savane.ambassadeur-5" })
        #expect(ambassadorFive.usage == .rank(.ambassadeur, division: nil))
        #expect(ambassadorFive.placement?.appliesTo == .rank(.ambassadeur, division: .v))
        #expect(ambassadorFive.placement?.option == "V")
        #expect(frames.first { $0.id == "royaumes.mythe-a" }?.placement?.appliesTo == .rank(.mythe, division: nil))
    }

    @Test("les moments et le trésor portent les clés de la loi : palier, Flamme, édition de Meesh, réalisation du jour, palier du trésor")
    func momentKeys() throws {
        let entries = try Self.registry()
        let momentsEntry = try #require(entries.first { $0.slug == "moments" })
        let moments = try #require(try Self.contract(momentsEntry)).contract.frames
        let byID = Dictionary(uniqueKeysWithValues: moments.map { ($0.id, $0.placement?.appliesTo) })
        #expect(byID["moments.palier-aurore"] == .tier(.aurore))
        #expect(byID["moments.flamme-365"] == .flame(days: 365))
        #expect(byID["moments.meesh-100"] == .meesh(.gold))
        #expect(byID["moments.jour-a"] == .day)
        let tresorEntry = try #require(entries.first { $0.slug == "tresor" })
        let tresor = try #require(try Self.contract(tresorEntry)).contract.frames
        #expect(tresor.first { $0.id == "tresor.coffre-c" }?.placement?.appliesTo == .treasury(.coffre))
    }

    private static let thumb = #"{"src":"abababababababab.webp","bytes":1,"sha256":"\#(String(repeating: "ab", count: 32))"}"#

    private static func frame(id: String, usage: String, placement: String) -> Data {
        Data(#"{"schema":1,"frames":[{"id":"\#(id)","usage":\#(usage),"thumb":\#(thumb),"i18n":{"name":"k.name"},\#(placement)}]}"#.utf8)
    }

    @Test("un placement qui contredit l'usage, sort de sa collection ou donne une division au Mythe n'existe pas — le cadre reste en boutique")
    func contradictoryPlacementIsDropped() throws {
        let rank = #"{"kind":"rank","rank":"ambassadeur"}"#
        let ok = #""collection":"savane","appliesTo":{"family":"rank","rank":"ambassadeur","division":1},"option":"I","motifs":[],"hidden":false"#
        let cases: [(String, String, String)] = [
            ("savane.a", #"{"kind":"rank","rank":"orateur"}"#, ok),
            ("royaumes.a", rank, ok),
            ("savane.a", #"{"kind":"rank","rank":"mythe"}"#,
             #""collection":"savane","appliesTo":{"family":"rank","rank":"mythe","division":2},"option":null,"motifs":[],"hidden":false"#),
            ("savane.a", #"{"kind":"moment","family":"flame"}"#,
             #""collection":"savane","appliesTo":{"family":"flame","days":8},"option":null,"motifs":[],"hidden":false"#),
        ]
        for (id, usage, placement) in cases {
            let parsed = try #require(GloryFramePackContract.parse(Self.frame(id: id, usage: usage, placement: placement)))
            #expect(parsed.contract.frames.count == 1)
            #expect(parsed.contract.frames.first?.placement == nil, "\(usage) \(placement)")
        }
        let parsed = try #require(GloryFramePackContract.parse(Self.frame(id: "savane.a", usage: rank, placement: ok)))
        #expect(parsed.contract.frames.first?.placement?.appliesTo == .rank(.ambassadeur, division: .i))
    }
}
