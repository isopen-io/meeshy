#if DEBUG
import Combine
import Foundation
import MeeshySDK

/// Déroule une scène de vitrine (#8855) : prépare la session AVANT `checkExistingSession()`,
/// remplit les vraies bases APRÈS, ouvre l'écran une fois la racine découverte, puis dépose le
/// marqueur « prêt » que le script de capture attend.
@MainActor
enum VitrineStage {
    /// L'adresse que montrent les liens partagés : celle de la production, jamais l'hôte local.
    static let originePublique = "https://meeshy.me"

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
            servir(f.lienInvitation, pour: scene)
            if scene.ouvreUneSession {
                try VitrineSession.poser(f.lecteur)
            } else {
                VitrineSession.retirer()
                DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier: f.lienInvitation.linkId)
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
    /// l'écran de la scène s'ouvre une fois le voile parti.
    static func ouvrir(apres voile: Published<LaunchSplashController.Phase>.Publisher) {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        Task {
            guard await attendreLaRacine(voile.values) else { return }
            montrer(scene, f)
            marquerPret(scene, apres: .seconds(3))
        }
    }

    static func attendreLaRacine(_ phases: AsyncPublisher<Published<LaunchSplashController.Phase>.Publisher>) async -> Bool {
        for await phase in phases where phase == .gone {
            return true
        }
        return false
    }

    /// Sur la scène « lien », l'accueil a demandé l'aperçu du lien : il est rendu deux secondes après.
    private static func servir(_ lien: ShareLinkInfo, pour scene: VitrineScene) {
        ShareLinkService.debugLinkInfoOverride = { identifiant in
            guard identifiant == lien.linkId else { return nil }
            if scene == .lien {
                Task { @MainActor in marquerPret(scene, apres: .seconds(2)) }
            }
            return lien
        }
    }

    private static func montrer(_ scene: VitrineScene, _ f: VitrineFixtures) {
        switch scene {
        case .global:
            guard let global = f.conversations.first(where: { $0.type == "global" }) else { return }
            NotificationCenter.default.post(name: .navigateToConversation, object: global.toConversation(currentUserId: f.lecteur.id))
        case .progression:
            NotificationCenter.default.post(name: Notification.Name("pushNavigateToRoute"), object: "progression")
        case .lien:
            break
        }
    }

    private static func marquerPret(_ scene: VitrineScene, apres delai: Duration) {
        Task {
            try? await Task.sleep(for: delai)
            try? FileManager.default.createDirectory(at: VitrineLaunch.dossier, withIntermediateDirectories: true)
            try? Data(scene.rawValue.utf8).write(to: VitrineLaunch.marqueurPret)
        }
    }
}
#endif
