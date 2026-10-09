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

    mutating func majority(_ id: String) {
        activeId = id
    }

    mutating func settled(_ id: String?) {
        guard let id else { return }
        activeId = id
    }
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
        guard engineShowsThis, let enginePlayer else { return pooledPlayer }
        return enginePlayer
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
        switch tier {
        case .decode, .mount: return true
        case .play, .prime, .idle: return false
        }
    }

    /// Les adresses audio que la page de `reel` jouera, dans l'ordre du Prisme.
    static func urls(for reel: FeedPost, preferredLanguages: [String]) -> [URL] {
        if let media = reel.reelPrincipalAudioMedia {
            return [playedTrack(of: media, originalLanguage: reel.originalLanguage,
                                preferredLanguages: preferredLanguages)]
                .compactMap(MeeshyConfig.resolveMediaURL)
        }
        guard let effects = reel.storyEffects else { return [] }
        let tracks = effects.resolvedForegroundAudioPlayers + [effects.resolvedBackgroundAudio].compactMap { $0 }
        let media = reel.media
        let resolver: (String) -> URL? = { id in
            media.first { $0.id == id }?.url.flatMap(MeeshyConfig.resolveMediaURL)
        }
        return tracks
            .compactMap { StoryAudioSourceResolver.remoteURL(for: $0, preferredLanguages: preferredLanguages, resolver: resolver) }
            .filter { !$0.isFileURL }
    }

    /// La piste que `ReelPageView.startActiveAudioIfNeeded` jouera : le TTS de
    /// la langue que le Prisme élit, sinon l'original — la même résolution que
    /// `autoSelectPreferredAudioLanguage` + `resolvedAudioUrl(for:)`.
    private static func playedTrack(of media: FeedMedia, originalLanguage: String?,
                                    preferredLanguages: [String]) -> String {
        let elected = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: media.transcription?.language ?? originalLanguage,
            preferredLanguages: preferredLanguages,
            availableLanguages: media.translatedAudios.map(\.targetLanguage)
        )?.lowercased()
        let translated = elected.flatMap { lang in
            media.translatedAudios.first { $0.targetLanguage.lowercased() == lang }
        }
        return translated?.url ?? media.toMessageAttachment().fileUrl
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

    mutating func elect(_ id: String, at seconds: TimeInterval) {
        pendingId = id
        electedAt = seconds
    }

    mutating func mediaStarted(_ id: String, at seconds: TimeInterval) -> Int? {
        guard pendingId == id else { return nil }
        pendingId = nil
        return Int(((seconds - electedAt) * 1000).rounded())
    }
}
