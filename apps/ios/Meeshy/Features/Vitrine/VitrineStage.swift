#if DEBUG
import Combine
import Foundation
import MeeshySDK
import MeeshyUI
import UIKit

/// Déroule une scène de vitrine (#8855) : prépare la session AVANT `checkExistingSession()`,
/// remplit les vraies bases APRÈS, ouvre l'écran une fois la racine découverte, puis dépose le
/// marqueur « prêt » que le script de capture attend.
@MainActor
enum VitrineStage {
    /// L'adresse que montrent les liens partagés : celle de la production, jamais l'hôte local.
    static let originePublique = "https://meeshy.me"

    /// Le temps qu'une transition ou un ressort se pose, une fois le rendu observé.
    static let pose: Duration = .milliseconds(800)

    static var appareil: VitrineAppareil { UIDevice.current.userInterfaceIdiom == .pad ? .ipad : .iphone }

    private static var fixtures: VitrineFixtures?

    /// Juste AVANT `MeeshyConfig.shared.restoreEnvironment()` : un refus arrête l'app avant que
    /// l'environnement de la vitrine ne soit recopié dans les préférences.
    static func preparer() {
        guard let scene = VitrineLaunch.scene() else { return }
        do {
            try VitrineSession.verifierIsolement(origine: MeeshyConfig.shared.persistedServerOrigin)
            let f = try VitrineFixtures.charger()
            try VitrineSession.verifierProprietaire(lecteur: f.lecteur.id)
            MeeshyConfig.debugWebOriginOverride = originePublique
            fixtures = f
            try? FileManager.default.removeItem(at: VitrineLaunch.marqueurPret)
            servir(f.lienInvitation)
            if scene.ouvreUneSession {
                try VitrineSession.poser(f.lecteur)
            } else {
                VitrineSession.retirer()
                JoinFlowViewModel.debugOnPreviewShown = { VitrineRendu.shared.signaler(.lien) }
                DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier: f.lienInvitation.linkId)
                Task {
                    await VitrineRendu.shared.attendre(scene.rendusAttendus(conversationId: nil, appareil: appareil))
                    await annoncer(scene)
                }
            }
        } catch {
            fatalError("Vitrine « \(scene.rawValue) » impossible à préparer : \(error)")
        }
    }

    /// Juste après `CacheCoordinator.shared.start()`, AVANT la restauration de la session : le cache
    /// est déjà lié au compte du lecteur (`activeUserId` relit le trousseau que `preparer` vient
    /// d'écrire), et les racines lisent le fil et les médias dès leur montage (#8922).
    static func remplirLesCaches() async {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        do {
            try await VitrineSeeder.remplirLesCaches(f, medias: VitrineLaunch.dossierMedias, dans: VitrineSeedTargetsReels())
        } catch {
            fatalError("Vitrine « \(scene.rawValue) » : fil et médias impossibles à ranger — \(error)")
        }
    }

    /// Une fois la session restaurée, avant le préchargement de la liste.
    static func remplir() async {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        do {
            try await VitrineSeeder.remplir(f, dans: VitrineSeedTargetsReels())
        } catch {
            fatalError("Vitrine « \(scene.rawValue) » : remplissage impossible — \(error)")
        }
    }

    /// Posté sous le voile du lancement, un ordre d'ouverture n'aurait encore aucun abonné :
    /// l'écran de la scène s'ouvre une fois le voile parti, et « prêt » attend son rendu.
    static func ouvrir(apres voile: Published<LaunchSplashController.Phase>.Publisher) {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        Task {
            guard await attendreLaRacine(voile.values) else { return }
            let destination = f.destination(scene)
            montrer(scene, destination, f)
            await VitrineRendu.shared.attendre(scene.rendusAttendus(conversationId: destination?.conversationId, appareil: appareil))
            await annoncer(scene)
        }
    }

    static func attendreLaRacine(_ phases: AsyncPublisher<Published<LaunchSplashController.Phase>.Publisher>) async -> Bool {
        for await phase in phases where phase == .gone {
            return true
        }
        return false
    }

    private static func servir(_ lien: ShareLinkInfo) {
        ShareLinkService.debugLinkInfoOverride = { identifiant in identifiant == lien.linkId ? lien : nil }
    }

    private static func montrer(_ scene: VitrineScene, _ destination: VitrineFixtures.Destination?, _ f: VitrineFixtures) {
        switch scene {
        case .global:
            guard let conversation = f.conversationsServies().first(where: { $0.id == destination?.conversationId }) else {
                fatalError("Vitrine « \(scene.rawValue) » : sa conversation manque aux fixtures")
            }
            NotificationCenter.default.post(name: .navigateToConversation, object: conversation)
        case .progression:
            NotificationCenter.default.post(name: Notification.Name("pushNavigateToRoute"), object: "progression")
        case .lien:
            break
        }
    }

    /// Le rendu est observé ; « prêt » tombe une fois la pose passée.
    private static func annoncer(_ scene: VitrineScene) async {
        try? await Task.sleep(for: pose)
        try? FileManager.default.createDirectory(at: VitrineLaunch.dossier, withIntermediateDirectories: true)
        try? Data(scene.rawValue.utf8).write(to: VitrineLaunch.marqueurPret)
    }
}
#endif
