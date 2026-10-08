import Foundation

/// Un bloc `game` tel que la passerelle le sert — PRODUIT par `buildGameBlock`
/// (`packages/shared/utils/game/game-block.ts`) sur les faits d'un joueur
/// niveau 34, record 36, neuf Meeshes, Flamme de 4 jours, première mission
/// finie. Une forme écrite à la main ici dériverait du contrat sans que rien ne
/// le dise ; celle-ci vient du producteur.
enum GameBlockFixture {
    static let json = """
    {"level":{"level":34,"tier":"eclat","score":12180,"floorScore":11560,"nextThreshold":12250,"pointsToNext":70,"progress":0.8985507246376812,"record":36,"prestige":0,"canPrestige":false},"glory":{"glory":7000,"rank":"voix","division":3,"division5":5,"next":{"rank":"voix","division":3,"division5":4,"minGlory":7800},"gloryMissing":800,"progress":0.5555555555555556},"treasury":{"held":9,"tier":"bourse","next":{"key":"escarcelle","minHeld":10,"missing":1}},"mint":{"number":13,"price":1294,"edition":"silver","canMint":true,"missingPoints":0,"levelBefore":34,"levelAfter":32,"levelsLost":2,"gloryGained":1000},"missions":{"dayKey":"2026-10-05","prismDay":false,"unlocked":true,"items":[{"id":"m0","templateKey":"send-texts","difficulty":"easy","signal":"axis:content.text_message","prism":false,"target":10,"progress":10,"reward":47,"glory":40,"completedAt":"2026-10-05T08:00:00.000Z"},{"id":"m1","templateKey":"reply-conversations","difficulty":"medium","signal":"reply-distinct-conversations","prism":false,"target":6,"progress":1,"reward":94,"glory":100,"completedAt":null},{"id":"m2","templateKey":"publish-posts","difficulty":"hard","signal":"axis:content.post","prism":false,"target":4,"progress":1,"reward":188,"glory":250,"completedAt":null}],"rerollAvailable":true},"chest":{"status":"locked","odds":{"minPoints":60,"maxPoints":200,"fragment":0.16666666666666666,"freeze":0.05},"reward":null},"flame":{"days":4,"form":"braise","bonusPercent":8,"freezes":1,"maxFreezes":2,"freezePrice":1,"relightPrice":3,"status":"lit","canRelight":false},"boosts":{"tailwind":1.25,"prismHour":{"startMinute":1185,"endMinute":1245,"multiplier":2}},"guideSeen":["onboarding.welcome","first-level"]}
    """

    static var data: Data { Data(json.utf8) }

    /// Le même bloc, mais une clé de palier que ce client ne connaît pas encore.
    static var withUnknownTier: Data {
        Data(json.replacingOccurrences(of: "\"tier\":\"eclat\"", with: "\"tier\":\"hypernova\"").utf8)
    }

    /// Le même bloc, amputé de sa Flamme : un bloc partiel.
    static var withoutFlame: Data {
        guard var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return Data() }
        object.removeValue(forKey: "flame")
        return (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }

    /// Le même bloc, avec une clé en plus que ce client ignore.
    static var withExtraKey: Data {
        guard var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return Data() }
        object["leagues"] = ["division": "jade"]
        return (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }
}
