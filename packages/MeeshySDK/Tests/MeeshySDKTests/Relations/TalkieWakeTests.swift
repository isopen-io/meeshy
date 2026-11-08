import Foundation
import Testing
@testable import MeeshySDK

/// LE RÉVEIL DU TALKIE (#17141, #17143) — ce que l'iPhone lit d'un push de réveil : `talkie_incoming` (notification
/// time-sensitive) ou la charge `pushtotalk`, mêmes clés.
struct TalkieWakeTests {

    @Test func unPushDeReveil_rendSaPriseDeParoleSonEmetteurEtSonNom() {
        let push = TalkieWakePush(userInfo: [
            "type": "talkie_incoming",
            "talkieId": "aaaaaaaaaaaaaaaaaaaaaaaa",
            "fromUserId": "bbbbbbbbbbbbbbbbbbbbbbbb",
            "fromUserName": "Awa",
        ])
        #expect(push == TalkieWakePush(talkieId: "aaaaaaaaaaaaaaaaaaaaaaaa", fromUserId: "bbbbbbbbbbbbbbbbbbbbbbbb", fromUserName: "Awa", voiceURL: nil))
    }

    @Test func leNomSeLitSousSesAutresCles_etUneVoixServieSeGarde() {
        let push = TalkieWakePush(userInfo: [
            "type": "talkie_incoming",
            "talkieId": "t1",
            "fromUserId": "u1",
            "senderName": "Awa",
            "voiceUrl": "/api/v1/attachments/file/x.m4a",
        ])
        #expect(push?.fromUserName == "Awa")
        #expect(push?.voiceURL == "/api/v1/attachments/file/x.m4a")
    }

    @Test func laVoixAttacheeSousLesClesDUnVocal_seLitAussi() {
        let push = TalkieWakePush(userInfo: ["type": "talkie_incoming", "talkieId": "t1", "fromUserId": "u1", "attachmentUrl": "https://x/v.m4a"])
        #expect(push?.voiceURL == "https://x/v.m4a")
    }

    @Test func unAutrePush_ouUneChargeIncomplete_neReveillentRien() {
        #expect(TalkieWakePush(userInfo: ["type": "new_message", "talkieId": "t1", "fromUserId": "u1"]) == nil)
        #expect(TalkieWakePush(userInfo: ["type": "talkie_incoming", "talkieId": "", "fromUserId": "u1"]) == nil)
        #expect(TalkieWakePush(userInfo: ["type": "talkie_incoming", "talkieId": "t1"]) == nil)
    }

    @Test func laChargePushToTalk_seLitSansType() {
        let push = TalkieWakePush(pushToTalkPayload: ["talkieId": "t1", "fromUserId": "u1", "fromUserName": "Awa"])
        #expect(push?.talkieId == "t1")
        #expect(TalkieWakePush(pushToTalkPayload: ["fromUserId": "u1"]) == nil)
    }

    @Test func leNomAffiche_retombeSurUnLibelleQuandIlManque() {
        let push = TalkieWakePush(talkieId: "t1", fromUserId: "u1", fromUserName: "  ", voiceURL: nil)
        #expect(push.displayName(fallback: "Un proche") == "Un proche")
    }

    @Test func leRattrapage_tientSoixanteSecondesApresLaFin() {
        #expect(TalkieWakeContract.catchUpWindow == 60 + TalkieContract.maxDuration)
        #expect(TalkieWakeContract.pushType == "talkie_incoming")
        #expect(TalkieWakeContract.category == "MEESHY_TALKIE")
    }

    @Test func leSonDeLaNotification_neDepassePasTrenteSecondes() {
        #expect(TalkieWakeContract.mayRingAsSound(duration: 30))
        #expect(!TalkieWakeContract.mayRingAsSound(duration: 30.5))
        #expect(!TalkieWakeContract.mayRingAsSound(duration: 0))
        #expect(TalkieWakeContract.soundFileName(talkieId: "ab/../c") == "talkie-abc.caf")
    }
}
