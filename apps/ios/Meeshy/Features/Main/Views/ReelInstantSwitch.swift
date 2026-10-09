import Foundation
import MeeshySDK
import MeeshyUI

// =============================================================================
//  Le réel suivant joue dès qu'on y arrive (#9837)
// =============================================================================
//
//  Quatre lois pures, une par question que pose le passage de réel à réel :
//  QUAND le réel devient-il actif, QUELLE image la page montre-t-elle avant et
//  après, QUEL son précharger pour le voisin, et COMBIEN de temps l'utilisateur
//  a-t-il attendu. Le diagnostic est sur l'issue #9837.

// MARK: - Quand : l'élection

/// **Le réel actif est celui qu'on voit majoritairement — dès le geste.**
///
/// Le pager signale la page qui passe la moitié de l'écran PENDANT le
/// défilement (`VerticalPagerMajority`) ; la fin du geste (`scrollPosition`)
/// confirme. La dernière des deux l'emporte : revenir sous la moitié sans
/// relâcher rend la main au réel d'avant, et une page posée par le code (seed,
/// lien profond) s'impose sans attendre de géométrie.
nonisolated struct ReelPlaybackElection: Equatable {
    private(set) var activeId: String?

    init(activeId: String? = nil) {
        self.activeId = activeId
    }

    mutating func majority(_ id: String) {}

    mutating func settled(_ id: String?) {}
}

// MARK: - Quelle image : la surface vidéo

/// **Quel lecteur la surface d'un réel vidéo affiche.**
///
/// - Le moteur partagé lit CE réel ⇒ son lecteur, que la page soit active ou
///   qu'elle s'en aille : la page quittée garde son image sous le doigt au lieu
///   de retomber sur le poster.
/// - Sinon, le lecteur préparé du pool, en pause : la première image du voisin
///   est déjà rendue quand il arrive, et le moteur adoptera cette même instance.
/// - Sinon rien : le poster.
nonisolated enum ReelVideoDisplay {
    static func player<Player: AnyObject>(
        engineShowsThis: Bool,
        enginePlayer: Player?,
        pooledPlayer: Player?
    ) -> Player? {
        nil
    }
}

// MARK: - Quel son : le préchargement audio des voisins

/// **Le son d'un réel est préchargé avec son voisinage, pas à son élection.**
///
/// Le préchargeur ne connaissait que le fichier VIDÉO : la piste d'un réel
/// audio, son TTS préféré, le son emprunté et les sons d'une scène partaient
/// sur le réseau au moment où le réel devenait actif. Les adresses rendues ici
/// sont celles que la lecture ira chercher dans `CacheCoordinator.audio`, sous
/// la même clé (URL résolue).
enum ReelAudioPrefetch {

    /// Le palier « décode » (N±1) et le palier « monté » (N±2) préchargent leur
    /// son : quelques centaines de Ko, critiques au premier instant. Au-delà, la
    /// bande passante revient aux vidéos proches.
    nonisolated static func prefetches(tier: ReelPreloadWindow.Tier) -> Bool {
        false
    }

    /// Les adresses audio que la page de `reel` jouera, dans l'ordre du Prisme.
    static func urls(for reel: FeedPost, preferredLanguages: [String]) -> [URL] {
        []
    }
}

// MARK: - Combien : la mesure

/// **Le délai entre l'élection d'un réel et son premier média qui joue.**
///
/// Une élection ouvre une mesure ; le premier départ de média pour CE réel la
/// ferme et rend sa durée. Un départ pour un autre réel, ou un second départ,
/// ne rend rien : chaque passage se mesure une fois.
nonisolated struct ReelSwitchMeter: Equatable {
    private(set) var pendingId: String?
    private var electedAt: TimeInterval = 0

    mutating func elect(_ id: String, at seconds: TimeInterval) {}

    mutating func mediaStarted(_ id: String, at seconds: TimeInterval) -> Int? {
        nil
    }
}
