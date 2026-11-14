import AVFoundation
import Foundation

/// **Les lecteurs vivants** (#18510) : chaque `AVPlayer` de lecture de story et
/// de réel s'y inscrit à sa création ; un lecteur libéré en sort de lui-même
/// (table faible). N'existe que si la trace de navigation est demandée — sinon
/// `shared` est `nil` et l'inscription ne coûte rien.
public final class PlaybackPlayerCensus {
    public static let shared: PlaybackPlayerCensus? = StoryNavigationTrace.isRequested ? PlaybackPlayerCensus() : nil

    private let players = NSHashTable<AVPlayer>.weakObjects()

    nonisolated deinit {}

    public init() {}

    public func track(_ player: AVPlayer) {
        players.add(player)
    }

    public var liveCount: Int { players.allObjects.count }
}
