import Foundation
import Testing
@testable import MeeshySDK

/// **Le cadre de bannière et les mouvements déclarés** (#10932) — miroir de
/// `packages/shared/types/banner-frame-design.ts` et `frame-decor.ts`. Décodage
/// TOLÉRANT là où l'ancien client doit survivre au nouveau serveur : un
/// mouvement ou un dégradé inconnu est ignoré, un côté de décor inconnu aussi,
/// jamais le profil.
@Suite("Cadres de bannière — format partagé, décodage tolérant")
struct BannerFrameDecorTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private static let frameJSON = #"""
    {"key":"haussmannien","viewBox":[0,0,300,100],
     "palette":["#DCD2C0","#A99B83","#22262B","#B8954F"],
     "gradients":[{"kind":"linear","x1":0,"y1":0,"x2":1,"y2":0,"stops":[{"color":3,"at":0},{"color":0,"at":1,"opacity":0.4}]}],
     "border":{"width":9.6,"color":0,"opacity":1,"filets":[{"inset":0.6,"width":0.6,"color":1,"opacity":1}]},
     "reach":{"corner":14,"cartouche":{"width":40,"depth":16,"edge":"top"}},
     "pieces":[{"anchor":"start","paths":[{"d":"M2 2 h10 v10 h-10 Z","color":3,"opacity":1,"group":"rosaces"}]},
               {"anchor":"center","paths":[{"d":"M140 0 L150 14 L160 0 Z","color":3,"gradient":0,"opacity":1,"fillRule":"evenodd"}]}],
     "friezes":[{"module":4.8,"from":16,"to":16,"fit":"repeat","paths":[{"d":"M16.5 2.2 h2.6 v3.2 h-2.6 Z","color":1,"opacity":1}]}],
     "motion":[{"kind":"twinkle","targets":["rosaces"],"duration":3.4,"stagger":0.8},
               {"kind":"morph","targets":["rosaces"],"duration":2},
               {"kind":"skew","targets":["frange"],"duration":4,"amplitude":7,"direction":"alternate","origin":"top"}]}
    """#

    // MARK: Le cadre de bannière

    @Test("lit le cadre de la planche, pièces, frises et filets compris")
    func readsThePlancheFrame() throws {
        let frame = try decode(BannerFrameDesign.self, Self.frameJSON)
        #expect(frame.key == "haussmannien")
        #expect(frame.border.width == 9.6)
        #expect(frame.border.filets.count == 1)
        #expect(frame.reach.corner == 14)
        #expect(frame.reach.cartouche?.edge == .top)
        #expect(frame.pieces.map(\.anchor) == [.start, .center])
        #expect(frame.pieces[1].paths[0].fillRule == .evenodd)
        #expect(frame.pieces[1].paths[0].gradient == 0)
        #expect(frame.friezes.first?.fit == .repeat)
        #expect(frame.friezes.first?.module == 4.8)
    }

    @Test("un mouvement inconnu est ignoré, les autres restent")
    func anUnknownMotionIsIgnored() throws {
        let frame = try decode(BannerFrameDesign.self, Self.frameJSON)
        #expect(frame.motion.map(\.kind) == [.twinkle, .skew])
        #expect(frame.motion[1].origin == .top)
        #expect(frame.motion[1].direction == .alternate)
        #expect(frame.motion[0].stagger == 0.8)
    }

    @Test("un cadre qui viole la loi du centre transparent ne se lit pas")
    func aFrameThatCoversTheCenterIsRejected() throws {
        let thick = Self.frameJSON.replacingOccurrences(of: #""width":9.6"#, with: #""width":30"#)
        #expect(throws: (any Error).self) { try decode(BannerFrameDesign.self, thick) }
        let deep = Self.frameJSON.replacingOccurrences(of: #""corner":14"#, with: #""corner":40"#)
        #expect(throws: (any Error).self) { try decode(BannerFrameDesign.self, deep) }
        let wideCartouche = Self.frameJSON.replacingOccurrences(of: #""width":40,"depth":16"#, with: #""width":200,"depth":16"#)
        #expect(throws: (any Error).self) { try decode(BannerFrameDesign.self, wideCartouche) }
    }

    @Test("les bornes du TypeScript tiennent aussi en Swift : frise de module nul, opacité, chemin, filets, dégradé absent")
    func theTypeScriptBoundsHoldInSwift() throws {
        let cases = [
            (#""module":4.8"#, #""module":0"#),
            (#""from":16,"to":16"#, #""from":150,"to":150"#),
            (#""color":3,"opacity":1,"group":"rosaces""#, #""color":3,"opacity":1.5,"group":"rosaces""#),
            (#""d":"M2 2 h10 v10 h-10 Z""#, #""d":"<script>""#),
            (#""inset":0.6,"width":0.6"#, #""inset":0.6,"width":3"#),
            (#""color":3,"gradient":0,"opacity":1"#, #""color":3,"gradient":2,"opacity":1"#),
            (#""key":"haussmannien""#, #""key":"Haussmannien!""#),
        ]
        for (original, broken) in cases {
            #expect(Self.frameJSON.contains(original), "\(original)")
            #expect(throws: (any Error).self, "\(broken)") { try decode(BannerFrameDesign.self, Self.frameJSON.replacingOccurrences(of: original, with: broken)) }
        }
    }

    @Test("une couleur hors palette ou illisible ne se dessine pas")
    func anOutOfPaletteColorIsRejected() throws {
        let outside = Self.frameJSON.replacingOccurrences(of: #""color":1,"opacity":1}]}],"#, with: #""color":7,"opacity":1}]}],"#)
        #expect(throws: (any Error).self) { try decode(BannerFrameDesign.self, outside) }
        let notHex = Self.frameJSON.replacingOccurrences(of: ##""#DCD2C0""##, with: #""rouge""#)
        #expect(throws: (any Error).self) { try decode(BannerFrameDesign.self, notHex) }
    }

    @Test("un pack de cadres garde les cadres lisibles et tait les autres")
    func aPackKeepsItsReadableFrames() throws {
        let broken = Self.frameJSON.replacingOccurrences(of: #""width":9.6"#, with: #""width":30"#)
        let pack = try decode(BannerFramePackContract.self, #"{"domain":"banner-frame","frames":[\#(Self.frameJSON),\#(broken)]}"#)
        #expect(pack.frames.map(\.key) == ["haussmannien"])
        #expect(throws: (any Error).self) { try decode(BannerFramePackContract.self, #"{"domain":"banner","frames":[]}"#) }
    }

    @Test("le centre transparent : le trou, les coins et le cartouche, à toute largeur")
    func theDrawableRegionKeepsTheCenterClear() throws {
        let frame = try decode(BannerFrameDesign.self, Self.frameJSON)
        let region = frame.drawableRegion(width: 600)
        #expect(region.hole == FrameRect(x: 9.6, y: 9.6, width: 600 - 19.2, height: 100 - 19.2))
        #expect(region.reserved.count == 5)
        #expect(region.reserved.last == FrameRect(x: 280, y: 0, width: 40, height: 16))
        #expect(region.reserved[1] == FrameRect(x: 586, y: 0, width: 14, height: 14))
    }

    // MARK: Le contour d'avatar gagne dégradés et mouvements

    @Test("un contour récent se lit avec dégradés et mouvements ; un ancien sans")
    func ringsGainGradientsAndMotion() throws {
        let ring = try decode(AvatarRingDesign.self, #"""
        {"key":"tresse","stroke":{"style":"solid","width":0.08,"colors":["#C9A34A","#2E3A46"]},
         "ornament":{"paths":[{"d":"M50 6 L52 8 Z","color":0,"opacity":1,"group":"triskele","gradient":0}]},
         "gradients":[{"kind":"linear","x1":0,"y1":0,"x2":1,"y2":1,"stops":[{"color":0,"at":0},{"color":1,"at":1}]},
                      {"kind":"conic","stops":[]}],
         "motion":[{"kind":"rotate","targets":["triskele"],"duration":8,"origin":"self"},{"kind":"wobble","targets":["x"],"duration":1}]}
        """#)
        #expect(ring.motion.map(\.kind) == [.rotate])
        #expect(ring.gradients.count == 2)
        #expect(ring.gradients[0]?.stops.count == 2)
        #expect(ring.gradients[1] == nil, "un dégradé inconnu garde sa place : l'index des traits reste juste, le trait retombe sur sa couleur")
        #expect(ring.ornament[0].group == "triskele")
        #expect(ring.ornament[0].gradient == 0)

        let legacy = try decode(AvatarRingDesign.self, ##"{"key":"filet","stroke":{"style":"solid","width":0.06,"colors":["#6366F1"]}}"##)
        #expect(legacy.motion.isEmpty)
        #expect(legacy.gradients.isEmpty)
    }

    @Test("un mouvement hors bornes est ignoré, pas le contour")
    func anOutOfBoundsMotionIsIgnored() throws {
        let motions = try decode([LossyBox<FrameMotion>].self, #"""
        [{"kind":"skew","targets":["f"],"duration":4,"amplitude":40},
         {"kind":"rotate","targets":["f"],"duration":0.1},
         {"kind":"sweep","targets":["r"],"duration":6,"amplitude":2},
         {"kind":"twinkle","targets":["c"],"duration":3,"origin":"top"},
         {"kind":"pulse","targets":[],"duration":3},
         {"kind":"pulse","targets":["p"],"duration":3.6,"amplitude":0.1,"origin":"self"}]
        """#).compactMap(\.value)
        #expect(motions.map(\.kind) == [.pulse])
    }
}
