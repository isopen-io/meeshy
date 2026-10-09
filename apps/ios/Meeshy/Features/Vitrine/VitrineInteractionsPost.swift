#if DEBUG
import Foundation
import MeeshySDK
import MeeshyUI

nonisolated enum VitrineInteractionsErreur: Error {
    case aucunPost
    case aucunVocal
}

/// Les interactions sur le DÉTAIL d'un post (#9810) : le vrai écran (`PostDetailView`), servi par le cache, sur le post
/// le plus récent du kit — sa photo, son texte traduit par le Prisme.
extension VitrineInteractions {
    /// La montée du vocal : la ligne optimiste se montre en cours d'envoi.
    static let monteeDuVocal: Duration = .milliseconds(900)
    /// Le commentaire créé se pose dans la liste, puis le doigt l'amène dans la vue.
    static let avantLeDefilement: Duration = .milliseconds(300)
    /// Whisper rend la transcription…
    static let avantLaTranscription: Duration = .milliseconds(1300)
    /// … puis NLLB et la synthèse, les pistes traduites.
    static let avantLaTraduction: Duration = .milliseconds(1600)
    static let tenueDeLaTraduction: Duration = .milliseconds(1800)
    /// La palette se laisse voir entière, ses émojis entrés, avant le toucher.
    static let tenueDeLaPalette: Duration = .milliseconds(1100)
    /// Le cœur d'un post est la seule réaction qu'il PEINT (compteur et cœur plein) : un autre émoji part sans trace
    /// à l'écran (`PostDetailView.sendDetailReaction`), et un film n'en montrerait que la palette refermée.
    static let emojiDuPost = MeeshyQuickReactions.heart

    /// Le post que la scène ouvre : le plus récent du kit. Son fil de commentaires est VIDE et le dit — le kit n'en
    /// sert aucun, et « 24 commentaires » au-dessus d'une liste vide serait un écran qui ment.
    static func postCommente(_ f: VitrineFixtures) -> FeedPost? {
        guard var post = f.posts.first?.toFeedPost(preferredLanguages: [f.lang]) else { return nil }
        post.commentCount = 0
        post.comments = []
        return post
    }

    /// Une fois la session restaurée : le post et son fil sous les clés que le détail lit (`loadPost`, `loadComments`),
    /// frais — aucun appel réseau —, et pour le commentaire vocal, la passerelle des commentaires.
    static func remplir(_ scene: VitrineScene, _ f: VitrineFixtures) async throws {
        guard let interaction = scene.interaction else { return }
        if interaction == .reel {
            VitrineReel.installer(lecteur: f.lecteur)
            return
        }
        guard [.commentaireAudio, .emojiPost].contains(interaction) else { return }
        guard let post = postCommente(f) else { throw VitrineInteractionsErreur.aucunPost }
        try await CacheCoordinator.shared.feed.save([post], for: post.id)
        try await CacheCoordinator.shared.comments.save([], for: "post-\(post.id)")
        guard interaction == .commentaireAudio else { return }
        guard let vocal = VitrineCommentaireVocal.depuis(f, dossier: VitrineLaunch.dossierMedias) else {
            throw VitrineInteractionsErreur.aucunVocal
        }
        VitrineCommentaire.installer(VitrineCommentaireServeur(lecteur: f.lecteur, postId: post.id, vocal: vocal, montee: monteeDuVocal))
    }

    /// Le détail s'ouvre comme depuis un profil ou une notification : la route `postDetail` de la racine.
    static func ouvrirLePost(_ f: VitrineFixtures) {
        guard let post = postCommente(f) else {
            fatalError("Vitrine : le kit ne sert aucun post à ouvrir")
        }
        NotificationCenter.default.post(name: Notification.Name("pushNavigateToRoute"), object: "postDetail:\(post.id)")
    }

    /// Le vocal part comme à la fin d'un enregistrement ; la passerelle le crée, puis le pipeline audio pousse sa
    /// transcription et ses pistes traduites par `comment:media-updated`, que le détail écoute.
    static func commenterDeVive(_ scene: VitrineScene, _ f: VitrineFixtures) async {
        guard let vocal = VitrineCommentaireVocal.depuis(f, dossier: VitrineLaunch.dossierMedias),
              let serveur = VitrineCommentaire.installe,
              let envoyer = VitrineRendu.shared.envoyerUnVocal,
              let copie = copierPourLEnvoi(vocal.fichier) else {
            fatalError("Vitrine « \(scene.rawValue) » : aucun vocal à envoyer, ou le composeur n'a pas prêté son envoi")
        }
        envoyer(copie, vocal.duree)
        let cree = await serveur.attendreLaCreation()
        VitrineTournage.etape("creation")
        try? await Task.sleep(for: avantLeDefilement)
        VitrineRendu.shared.montrerUnCommentaire?(cree.id)
        try? await Task.sleep(for: avantLaTranscription)
        VitrineTournage.etape("transcription")
        if let transcription = serveur.transcriptionArrivee() { SocialSocketManager.shared.commentMediaUpdated.send(transcription) }
        try? await Task.sleep(for: avantLaTraduction)
        VitrineTournage.etape("traduction")
        if let traduction = serveur.traductionArrivee() { SocialSocketManager.shared.commentMediaUpdated.send(traduction) }
        try? await Task.sleep(for: tenueDeLaTraduction)
    }

    /// L'appui long sur le cœur ouvre la palette, l'émoji s'y choisit — les deux par les fonctions du geste.
    static func reagirAuPost(_ scene: VitrineScene) async {
        guard let ouvrir = VitrineRendu.shared.ouvrirLaPalette else {
            fatalError("Vitrine « \(scene.rawValue) » : le cœur du post n'a pas prêté sa palette")
        }
        ouvrir()
        await VitrineRendu.shared.attendre([.paletteDeReactions])
        VitrineTournage.etape("palette")
        try? await Task.sleep(for: tenueDeLaPalette)
        guard let choisir = VitrineRendu.shared.choisirDansLaPalette else {
            fatalError("Vitrine « \(scene.rawValue) » : la palette n'a pas prêté son geste")
        }
        VitrineTournage.etape("choix")
        choisir(emojiDuPost)
        try? await Task.sleep(for: tenueDeLaReaction)
    }

    /// Le commentaire envoyé efface ses fichiers locaux une fois servi : il emporte une COPIE, jamais le média du kit.
    private static func copierPourLEnvoi(_ fichier: URL) -> URL? {
        let copie = FileManager.default.temporaryDirectory
            .appendingPathComponent("vitrine-commentaire-\(UUID().uuidString).\(fichier.pathExtension)")
        return (try? FileManager.default.copyItem(at: fichier, to: copie)).map { copie }
    }
}
#endif
