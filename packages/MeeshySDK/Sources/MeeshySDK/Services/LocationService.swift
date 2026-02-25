import Foundation
import Combine

public final class LocationService {
    public static let shared = LocationService()
    private init() {}
    private let socketManager = MessageSocketManager.shared

    // MARK: - Combine Publishers

    public let locationShared = PassthroughSubject<LocationSharedEvent, Never>()
    public let liveLocationStarted = PassthroughSubject<LiveLocationStartedEvent, Never>()
    public let liveLocationUpdated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
    public let liveLocationStopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()

    // MARK: - Share Static Location

    public func shareLocation(conversationId: String, latitude: Double, longitude: Double,
                               altitude: Double? = nil, accuracy: Double? = nil,
                               placeName: String? = nil, address: String? = nil) {
        let payload = LocationSharePayload(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            altitude: altitude, accuracy: accuracy,
            placeName: placeName, address: address
        )
        socketManager.emitLocationShare(payload: payload)
    }

    // MARK: - Start Live Location

    public func startLiveLocation(conversationId: String, latitude: Double, longitude: Double,
                                   durationMinutes: Int) {
        let payload = LiveLocationStartPayload(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            durationMinutes: durationMinutes
        )
        socketManager.emitLiveLocationStart(payload: payload)
    }

    // MARK: - Update Live Location

    public func updateLiveLocation(conversationId: String, latitude: Double, longitude: Double,
                                    altitude: Double? = nil, accuracy: Double? = nil,
                                    speed: Double? = nil, heading: Double? = nil) {
        let payload = LiveLocationUpdatePayload(
            conversationId: conversationId,
            latitude: latitude, longitude: longitude,
            altitude: altitude, accuracy: accuracy,
            speed: speed, heading: heading
        )
        socketManager.emitLiveLocationUpdate(payload: payload)
    }

    // MARK: - Stop Live Location

    public func stopLiveLocation(conversationId: String) {
        socketManager.emitLiveLocationStop(conversationId: conversationId)
    }
}
