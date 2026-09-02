import Testing
import Foundation
@testable import MeeshySDK

/// #4821 — **le mouvement d'une décoration est une fonction PURE du temps.**
/// Les témoins portent sur le CONTRAT des courbes (identité à zéro, bornes,
/// périodicité) et sur le fil : ils ne dessinent rien.
struct StickerAnimationTests {

    private func proche(_ a: StickerAnimation.Pose, _ b: StickerAnimation.Pose,
                        tolérance: Double = 1e-6) -> Bool {
        abs(a.scale - b.scale) < tolérance
            && abs(a.rotationDegrees - b.rotationDegrees) < tolérance
            && abs(a.offsetX - b.offsetX) < tolérance
            && abs(a.offsetY - b.offsetY) < tolérance
            && abs(a.opacity - b.opacity) < tolérance
    }

    // MARK: - Le contrat des courbes

    /// **À zéro, l'identité** — une vignette ou une couverture, rendues à
    /// `t = 0`, montrent la décoration telle qu'elle a été posée.
    @Test func everyAnimation_isTheIdentity_atZero_andBefore() {
        for animation in StickerAnimation.allCases {
            #expect(animation.pose(at: 0) == .identity, "\(animation.rawValue)")
            #expect(animation.pose(at: -1) == .identity, "\(animation.rawValue)")
            #expect(animation.pose(at: .nan) == .identity, "\(animation.rawValue)")
        }
    }

    /// **Toute pose est BORNÉE** : une décoration animée ne quitte jamais
    /// l'endroit où l'auteur l'a mise.
    @Test func everyAnimation_staysBounded_overThreePeriods() {
        for animation in StickerAnimation.allCases {
            for t in stride(from: 0.0, through: animation.period * 3, by: 0.01) {
                let pose = animation.pose(at: t)
                #expect(pose.scale >= 0.7 && pose.scale <= 1.3, "\(animation.rawValue) @\(t) scale")
                #expect(abs(pose.offsetX) <= 0.2, "\(animation.rawValue) @\(t) offsetX")
                #expect(abs(pose.offsetY) <= 0.2, "\(animation.rawValue) @\(t) offsetY")
                #expect(pose.opacity >= 0.4 && pose.opacity <= 1, "\(animation.rawValue) @\(t) opacity")
                #expect(abs(pose.rotationDegrees) <= 360, "\(animation.rawValue) @\(t) rotation")
            }
        }
    }

    /// Une animation qui ne bouge JAMAIS serait une case sans effet.
    @Test func everyAnimation_moves_somewhereInItsPeriod() {
        for animation in StickerAnimation.allCases {
            let bouge = stride(from: 0.0, to: animation.period, by: 0.01)
                .contains { !animation.pose(at: $0).isIdentity }
            #expect(bouge, "\(animation.rawValue) reste immobile")
        }
    }

    /// Une animation CONTINUE se répète : deux instants à une période
    /// d'écart rendent la même pose.
    @Test func continuousAnimations_arePeriodic() {
        for animation in StickerAnimation.allCases where !animation.isOneShot {
            for t in [0.13, 0.37, 0.71] {
                #expect(proche(animation.pose(at: t), animation.pose(at: t + animation.period)),
                        "\(animation.rawValue) @\(t)")
            }
        }
    }

    /// Une animation en UN COUP se tient immobile après avoir joué.
    @Test func oneShotAnimations_restAfterTheirPeriod() {
        for animation in StickerAnimation.allCases where animation.isOneShot {
            #expect(animation.pose(at: animation.period) == .identity, "\(animation.rawValue)")
            #expect(animation.pose(at: animation.period + 10) == .identity, "\(animation.rawValue)")
            #expect(!animation.pose(at: animation.period / 2).isIdentity, "\(animation.rawValue)")
        }
    }

    // MARK: - Le fil

    @Test func sticker_encodesItsAnimation_byName() throws {
        let sticker = StorySticker(id: "st", emoji: "\u{2764}\u{FE0F}", animation: .heartbeat)
        let data = try JSONEncoder().encode(sticker)
        let objet = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(objet["animation"] as? String == "heartbeat")
        let back = try JSONDecoder().decode(StorySticker.self, from: data)
        #expect(back.animation == .heartbeat)
    }

    /// Un sticker immobile se réencode EXACTEMENT comme avant ce lot.
    @Test func stillSticker_gainsNoKey() throws {
        let data = try JSONEncoder().encode(StorySticker(id: "st", emoji: "\u{1F30D}"))
        let objet = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(objet["animation"] == nil)
    }

    /// Un nom publié par une version PLUS RÉCENTE se décode en « immobile »,
    /// jamais en plantage.
    @Test func unknownAnimationName_decodesAsStill() throws {
        let json = """
        {"id":"st","emoji":"\u{1F30D}","x":0.5,"y":0.5,"scale":1,"rotation":0,"zIndex":0,"animation":"cartwheel"}
        """
        let back = try JSONDecoder().decode(StorySticker.self, from: Data(json.utf8))
        #expect(back.animation == nil)
        #expect(back.emoji == "\u{1F30D}")
    }

    @Test func animation_travelsThroughTheV3Wire() throws {
        var effects = StoryEffects()
        effects.stickerObjects = [StorySticker(id: "st", emoji: "\u{2764}\u{FE0F}", animation: .pulse)]
        let document = CanvasV3(migrating: effects)
        let object = try #require(document.scenes.first?.objects.first { $0.id == "st" })
        #expect(object.payload["animation"] == .string("pulse"))
        let back = StoryEffects(rendering: document, sceneIndex: 0)
        #expect(back.stickerObjects?.first?.animation == .pulse)
    }

    /// Un gabarit déclare le mouvement avec lequel il se pose ; le cœur bat.
    @Test func heartFrame_posesBeating() throws {
        let cœur = try #require(StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.loveHeartFrame))
        #expect(cœur.animation == .heartbeat)
        let cadran = try #require(StickerTemplateCatalog.template(id: StickerTemplateCatalog.ID.timeAnalog))
        #expect(cadran.animation == nil)
    }
}
