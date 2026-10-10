#if DEBUG
import Foundation
import MeeshySDK

/// Les trois interactions de l'en-tête de la fiche App Store (#9904) : des réels drôles qui défilent, chacun écrit dans
/// une autre langue et lu dans celle du lecteur ; une story qui s'ouvre, son texte traduit ; un vocal qui joue dans sa
/// langue, puis se relit et se réentend dans celle du lecteur. Chaque geste emprunte le chemin réel de l'app.
extension VitrineInteractions {
    /// Un réel se laisse voir jouer, sa légende lue, avant que le pouce ne remonte la page.
    static let tenueDUnReel: Duration = .milliseconds(1700)
    /// La page suivante a fini de monter, sa vidéo partie.
    static let monteeDuReelSuivant: Duration = .milliseconds(500)
    /// La story révélée se lit, texte traduit compris ; elle dure 6 s, le lecteur se refermerait ensuite.
    static let tenueDeLaStory: Duration = .milliseconds(3200)
    /// Le vocal dans sa langue d'origine : son karaoké avance, puis le lecteur bascule sur sa propre langue.
    static let ecouteDeLOriginal: TimeInterval = 2.4
    static let delaiDeLOriginal: Duration = .seconds(5)
    static let tenueDeLaTraductionDuVocal: Duration = .milliseconds(3000)

    /// Les réels du kit tels que le fil les remet au lecteur immersif : résolus par le Prisme dans la langue du lecteur.
    static func reelsDuDefilement(_ f: VitrineFixtures) -> [FeedPost] {
        (f.reels ?? []).map { $0.toFeedPost(preferredLanguages: [f.lang]) }
    }

    /// Le lecteur immersif s'ouvre sur le premier réel, comme au toucher de sa carte dans le fil (`ReelsPresenter.present`).
    static func ouvrirLesReels(_ f: VitrineFixtures) {
        let reels = reelsDuDefilement(f)
        guard let premier = reels.first else {
            fatalError("Vitrine « \(VitrineScene.interactionDefilement.rawValue) » : le kit ne sert aucun réel drôle")
        }
        ReelsPresenter.shared.present(posts: reels, startId: premier.id)
    }

    /// Chaque réel joue, puis le pouce remonte la page jusqu'au dernier ; une étape date l'arrivée de chacun.
    static func faireDefilerLesReels(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        let nombre = reelsDuDefilement(f).count
        guard let suivant = VitrineRendu.shared.reelSuivant, nombre > 1 else {
            fatalError("Vitrine « \(scene.rawValue) » : le lecteur des réels n'a pas prêté son passage au suivant")
        }
        for rang in 1...nombre {
            VitrineTournage.etape("reel-\(rang)")
            try? await Task.sleep(for: tenueDUnReel)
            guard rang < nombre else { break }
            suivant()
            try? await Task.sleep(for: monteeDuReelSuivant)
        }
    }

    /// La story s'ouvre par la route `storyDetail:` de la racine — celle d'une notification ou d'un lien —, qui trouve son
    /// auteur dans le bandeau et présente son groupe ; elle est révélée une fois l'intermède de l'auteur passé.
    static func ouvrirLaStory(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        guard let story = f.stories?.first else {
            fatalError("Vitrine « \(scene.rawValue) » : le kit ne sert aucune story")
        }
        VitrineTournage.etape("ouverture")
        NotificationCenter.default.post(name: Notification.Name("pushNavigateToRoute"), object: "storyDetail:\(story.id)")
        await VitrineRendu.shared.attendre([.story])
        VitrineTournage.etape("story")
        try? await Task.sleep(for: tenueDeLaStory)
    }

    /// Le vocal part dans sa langue d'origine — drapeau d'origine touché —, puis le lecteur revient à sa langue : la
    /// transcription et la piste traduite suivent le même choix (`setBubbleActiveDisplayLanguage`).
    static func faireEntendreLaTraduction(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        guard let destination = f.destination(scene.sceneDuKit), let messageId = destination.messageId,
              let attachmentId = destination.attachmentId,
              let conversation = VitrineRendu.shared.conversation,
              let message = conversation.messages.first(where: { $0.id == messageId }) else {
            fatalError("Vitrine « \(scene.rawValue) » : aucun vocal à faire entendre")
        }
        conversation.setBubbleActiveDisplayLanguage(message.originalLanguage, for: messageId)
        conversation.playAudio(attachmentId: attachmentId)
        VitrineTournage.etape("original")
        await attendreLaLecture(jusqua: ecouteDeLOriginal, au: delaiDeLOriginal)
        conversation.setBubbleActiveDisplayLanguage(nil, for: messageId)
        VitrineTournage.etape("traduction")
        try? await Task.sleep(for: tenueDeLaTraductionDuVocal)
    }

    private static func attendreLaLecture(jusqua instant: TimeInterval, au plusTard: Duration) async {
        let limite = ContinuousClock.now + plusTard
        while ConversationAudioCoordinator.shared.currentTime < instant, ContinuousClock.now < limite {
            try? await Task.sleep(for: VitrineTournage.pas)
        }
    }
}
#endif
