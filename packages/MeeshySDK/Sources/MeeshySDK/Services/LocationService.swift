import Foundation
import Combine

// MARK: - Protocol

public protocol LocationServiceProviding: Sendable {
    var liveLocationStarted: PassthroughSubject<LiveLocationStartedEvent, Never> { get }
    var liveLocationUpdated: PassthroughSubject<LiveLocationUpdatedEvent, Never> { get }
    var liveLocationStopped: PassthroughSubject<LiveLocationStoppedEvent, Never> { get }
    func startLiveLocation(conversationId: String, latitude: Double, longitude: Double, durationMinutes: Int)
    func updateLiveLocation(conversationId: String, latitude: Double, longitude: Double, altitude: Double?, accuracy: Double?, speed: Double?, heading: Double?)
    func stopLiveLocation(conversationId: String)
}

public final class LocationService: LocationServiceProviding, Sendable {
    public static let shared = LocationService()
    private init() {}
    private let socketManager = MessageSocketManager.shared

    // MARK: - Combine Publishers

    private struct LiveLocationSubjects {
        let started = PassthroughSubject<LiveLocationStartedEvent, Never>()
        let updated = PassthroughSubject<LiveLocationUpdatedEvent, Never>()
        let stopped = PassthroughSubject<LiveLocationStoppedEvent, Never>()
    }

    private let subjects = Locked(uncheckedState: LiveLocationSubjects())

    public var liveLocationStarted: PassthroughSubject<LiveLocationStartedEvent, Never> {
        subjects.mutateUnchecked { $0.started }
    }

    public var liveLocationUpdated: PassthroughSubject<LiveLocationUpdatedEvent, Never> {
        subjects.mutateUnchecked { $0.updated }
    }

    public var liveLocationStopped: PassthroughSubject<LiveLocationStoppedEvent, Never> {
        subjects.mutateUnchecked { $0.stopped }
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
