import Foundation
import MeeshySDK

/// **La politique média d'un instant (#9880)** — PURE. La chaleur, le mode
/// Économie d'énergie et le tier de l'appareil donnent, ensemble, les réglages
/// de TOUS les lecteurs : tampon d'avance, cadence d'observateur, préchargement,
/// autoplay des voisins, animations décoratives, nombre de lecteurs préparés.
///
/// - **L'économie d'énergie règle les lecteurs comme une chaleur sérieuse**,
///   sans jamais suspendre le préchargement : la fenêtre des réels garde son
///   plancher N±2 (`ReelPreloadWindow`, qui rend lui aussi le plancher dans
///   les deux cas).
/// - **Le seuil de chaleur est celui de `DeviceMediaInputs.Thermal`**, lu à
///   l'identique par la fenêtre des réels et par le tier.
///
/// La politique VIVANTE est publiée par `MediaPolicyMonitor`, l'unique
/// observateur de `thermalStateDidChangeNotification` et de
/// `NSProcessInfoPowerStateDidChange` côté lecture.
public nonisolated struct MediaPolicy: Sendable, Equatable {

    /// Ce que joue un élément : l'image à l'écran, ou un voisin préparé
    /// d'avance qui ne sera peut-être jamais vu.
    public enum PlaybackRole: Sendable {
        case watched, prerolled
    }

    public let thermalState: ProcessInfo.ThermalState
    public let lowPower: Bool
    public let tier: DeviceMediaTier

    public init(thermalState: ProcessInfo.ThermalState, lowPower: Bool, tier: DeviceMediaTier) {
        self.thermalState = thermalState
        self.lowPower = lowPower
        self.tier = tier
    }

    /// La politique de cet appareil, maintenant.
    public static func live() -> MediaPolicy {
        let info = ProcessInfo.processInfo
        return MediaPolicy(
            thermalState: info.thermalState,
            lowPower: info.isLowPowerModeEnabled,
            tier: DeviceMediaTier.current
        )
    }

    /// Chaleur sérieuse ou pire, OU économie d'énergie.
    public var isConstrained: Bool { lowPower || thermal.isUnderPressure }

    public func forwardBufferDuration(for role: PlaybackRole) -> Double {
        switch role {
        case .watched: return MediaThermalPolicy.watchedForwardBufferDuration(thermalState: tuningThermalState)
        case .prerolled: return MediaThermalPolicy.forwardBufferDuration(thermalState: tuningThermalState)
        }
    }

    public var timeObserverInterval: Double {
        MediaThermalPolicy.timeObserverInterval(thermalState: tuningThermalState)
    }

    /// Seule la chaleur critique suspend le préchargement vidéo.
    public var prefetchesVideo: Bool { MediaThermalPolicy.shouldPrefetchVideo(thermalState: thermalState) }

    /// Le réel suivant se prépare à jouer pendant que l'actif joue.
    public var autoplaysNeighbors: Bool { !isConstrained }

    /// Les animations qui ne portent aucune information (cadres animés, fonds).
    public var animatesDecoration: Bool { !isConstrained }

    /// Combien de lecteurs le pool garde préparés.
    public var preparedPlayers: Int { PlayerPoolCapacity.players(for: tier) }

    /// Le contexte de la fenêtre des réels, avec les MÊMES signaux d'énergie,
    /// de chaleur et de tier que la politique.
    public func reelWindowContext(
        visits: [ReelPreloadWindow.Visit],
        network: ReelPreloadWindow.Network,
        deviceMemoryGb: Double?
    ) -> ReelPreloadWindow.Context {
        ReelPreloadWindow.Context(
            visits: visits,
            network: network,
            deviceMemoryGb: deviceMemoryGb,
            lowPower: lowPower,
            thermalState: thermalState,
            tier: tier
        )
    }

    private var thermal: DeviceMediaInputs.Thermal { DeviceMediaInputs.Thermal(thermalState) }

    /// L'état thermique qui RÈGLE les lecteurs : l'économie d'énergie le porte
    /// au moins à `.serious`.
    private var tuningThermalState: ProcessInfo.ThermalState {
        lowPower && !thermal.isUnderPressure ? .serious : thermalState
    }
}
