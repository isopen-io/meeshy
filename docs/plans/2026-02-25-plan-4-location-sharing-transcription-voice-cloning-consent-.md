# Plan 4: Location Sharing, Transcription, Voice Cloning Consent/Profile

## Goal

Implement three feature groups for the Meeshy iOS app and supporting backend:
1. **Location Sharing** -- Static + live location messages with interactive maps
2. **Transcription** -- On-device (Apple SFSpeechRecognizer) + server (Whisper) transcription displayed under audio/video bubbles
3. **Voice Cloning Consent/Profile** -- Multi-step wizard for GDPR consent, voice recording, profile management

## Architecture Overview

```
apps/ios/Meeshy (SwiftUI)
  |-- ConversationViewModel (send location, transcribe, voice wizard trigger)
  |-- ThemedMessageBubble+Media (location bubble, transcription badge)
  |-- LocationPickerView (extend for live sharing)
  |-- VoiceProfileWizardView (new, MeeshyUI)
  
packages/MeeshySDK
  |-- MeeshySDK target: LocationModels, LocationService, TranscriptionService, VoiceProfileModels, VoiceProfileService
  |-- MeeshyUI target: LocationMessageView, LocationFullscreenView, LiveLocationBadge, TranscriptionBadgeView, VoiceProfileWizardView, VoiceRecordingView, VoiceProfileManageView

services/gateway (Fastify 5)
  |-- voice-profile.ts (already exists -- no changes needed)
  |-- voice/translation.ts (transcribe endpoint already exists -- no changes needed)
  |-- socketio-events.ts (add location:share-live, location:update, location:stop)
  |-- MeeshySocketIOManager.ts (add live location event handlers)

packages/shared
  |-- socketio-events.ts (add location events)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| iOS UI | SwiftUI, MapKit, CoreLocation, AVFoundation, Speech framework |
| iOS SDK | MeeshySDK (models, services), MeeshyUI (views) |
| Backend | Fastify 5, Socket.IO, Redis (live location TTL), MongoDB/Prisma |
| Shared | TypeScript types, Socket.IO event conventions |

---

## Task Group A: Location -- Backend

### A1. Extend Socket.IO Events for Live Location

**File**: `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/socketio-events.ts`

The `MessageType` already includes `'location'` (line 619). The `MessageSendData` already has `messageType?: string` (line 493). No schema change needed for static location -- the existing message creation flow handles `messageType: 'location'` with content containing the address and lat/lng stored in attachment fields.

Add three new events for live location:

```typescript
// In CLIENT_EVENTS (line ~167, after FEED_UNSUBSCRIBE):
LOCATION_SHARE_LIVE: 'location:share-live',
LOCATION_UPDATE: 'location:update',
LOCATION_STOP: 'location:stop',

// In SERVER_EVENTS (line ~138, after TRANSCRIPTION_READY):
LOCATION_LIVE_STARTED: 'location:live-started',
LOCATION_LIVE_UPDATED: 'location:live-updated',
LOCATION_LIVE_STOPPED: 'location:live-stopped',
```

Add event data interfaces:

```typescript
export interface LocationShareLiveData {
  readonly conversationId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address?: string;
  readonly durationMinutes: number; // 15, 60, or 480
}

export interface LocationUpdateData {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface LocationStopData {
  readonly conversationId: string;
  readonly sessionId: string;
}

export interface LocationLiveStartedEventData {
  readonly sessionId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly username: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address?: string;
  readonly expiresAt: string; // ISO date
}

export interface LocationLiveUpdatedEventData {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly updatedAt: string;
}

export interface LocationLiveStoppedEventData {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly reason: 'user_stopped' | 'expired';
}
```

Add to `ClientToServerEvents` and `ServerToClientEvents` type maps.

**Verification**: `npm run build` in `packages/shared/` must pass.

### A2. Live Location Handler in MeeshySocketIOManager

**File**: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/socketio/MeeshySocketIOManager.ts`

Add a `Map<string, LiveLocationSession>` in memory (or Redis with TTL). Each session:

```typescript
interface LiveLocationSession {
  sessionId: string;
  messageId: string;
  conversationId: string;
  userId: string;
  username: string;
  latitude: number;
  longitude: number;
  address?: string;
  expiresAt: Date;
  intervalHandle?: NodeJS.Timeout;
}
```

Handler for `location:share-live`:
1. Validate user is member of conversation with `canSendLocations` permission (from `ConversationMember` model, line 361 of schema: `canSendLocations Boolean @default(true)`)
2. Create a message with `messageType: 'location'`, content = address or "Position en direct"
3. Store session in memory/Redis with TTL = durationMinutes
4. Emit `location:live-started` to conversation room
5. Set interval to auto-expire session

Handler for `location:update`:
1. Find session by sessionId, validate ownership
2. Update lat/lng
3. Emit `location:live-updated` to conversation room

Handler for `location:stop`:
1. Find session, validate ownership
2. Clear interval, remove session
3. Emit `location:live-stopped` to room

**No REST route needed** -- static location uses existing `POST /conversations/:id/messages` with `messageType: 'location'`. Live location is purely Socket.IO.

### A3. Static Location via REST

The existing message creation flow in `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/services/messaging/MessagingService.ts` already supports `messageType: 'location'` through the `MessageRequest.messageType` field. The `SendMessageBody` type in `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/conversations/types.ts` needs to accept optional `latitude`, `longitude`, `address` fields.

**File**: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/conversations/types.ts`

Add to `SendMessageBody`:
```typescript
latitude?: number;
longitude?: number;
address?: string;
```

**File**: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/services/messaging/MessageProcessor.ts`

In `saveMessage`, when `messageType === 'location'`, store the lat/lng/address in the message content as JSON, or create an attachment with `mimeType: 'application/x-location'` and `latitude`/`longitude` fields (matching the existing `MeeshyMessageAttachment` pattern that already has `latitude: Double?` and `longitude: Double?` fields).

---

## Task Group B: Location -- SDK + UI

### B1. LocationModels.swift (MeeshySDK)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/LocationModels.swift`

```swift
import Foundation

// MARK: - Coordinates

public struct MeeshyCoordinates: Codable {
    public let latitude: Double
    public let longitude: Double
    
    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

// MARK: - Location Message

public struct LocationMessage {
    public let messageId: String
    public let coordinates: MeeshyCoordinates
    public let address: String?
    public let isLive: Bool
    public let liveSessionId: String?
    public let liveExpiresAt: Date?
    
    public init(messageId: String, coordinates: MeeshyCoordinates, address: String? = nil,
                isLive: Bool = false, liveSessionId: String? = nil, liveExpiresAt: Date? = nil) {
        self.messageId = messageId
        self.coordinates = coordinates
        self.address = address
        self.isLive = isLive
        self.liveSessionId = liveSessionId
        self.liveExpiresAt = liveExpiresAt
    }
}

// MARK: - Live Location Session

public struct LiveLocationSession: Identifiable {
    public let id: String // sessionId
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let username: String
    public var coordinates: MeeshyCoordinates
    public let address: String?
    public let expiresAt: Date
    
    public var isExpired: Bool { expiresAt < Date() }
    
    public var remainingMinutes: Int {
        max(0, Int(expiresAt.timeIntervalSinceNow / 60))
    }
    
    public init(id: String, messageId: String, conversationId: String, userId: String,
                username: String, coordinates: MeeshyCoordinates, address: String? = nil, expiresAt: Date) {
        self.id = id; self.messageId = messageId; self.conversationId = conversationId
        self.userId = userId; self.username = username; self.coordinates = coordinates
        self.address = address; self.expiresAt = expiresAt
    }
}

// MARK: - Live Location Duration

public enum LiveLocationDuration: Int, CaseIterable, Identifiable {
    case fifteenMinutes = 15
    case oneHour = 60
    case eightHours = 480
    
    public var id: Int { rawValue }
    
    public var label: String {
        switch self {
        case .fifteenMinutes: return "15 min"
        case .oneHour: return "1 heure"
        case .eightHours: return "8 heures"
        }
    }
    
    public var expiresAt: Date {
        Date().addingTimeInterval(TimeInterval(rawValue * 60))
    }
}

// MARK: - Socket Events

public struct LocationLiveStartedEvent: Decodable {
    public let sessionId: String
    public let messageId: String
    public let conversationId: String
    public let userId: String
    public let username: String
    public let latitude: Double
    public let longitude: Double
    public let address: String?
    public let expiresAt: Date
}

public struct LocationLiveUpdatedEvent: Decodable {
    public let sessionId: String
    public let conversationId: String
    public let userId: String
    public let latitude: Double
    public let longitude: Double
    public let updatedAt: Date
}

public struct LocationLiveStoppedEvent: Decodable {
    public let sessionId: String
    public let conversationId: String
    public let userId: String
    public let reason: String
}
```

### B2. LocationService.swift (MeeshySDK)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/LocationService.swift`

Follow the same singleton pattern as `MessageService.shared`:

```swift
import Foundation

public final class LocationService {
    public static let shared = LocationService()
    private init() {}
    private var api: APIClient { APIClient.shared }
    
    /// Send a static location message via REST
    public func sendLocationMessage(
        conversationId: String,
        latitude: Double,
        longitude: Double,
        address: String?
    ) async throws -> SendMessageResponseData {
        struct LocationBody: Encodable {
            let content: String
            let messageType: String
            let latitude: Double
            let longitude: Double
            let address: String?
        }
        let body = LocationBody(
            content: address ?? "Position partagee",
            messageType: "location",
            latitude: latitude,
            longitude: longitude,
            address: address
        )
        let response: APIResponse<SendMessageResponseData> = try await api.post(
            endpoint: "/conversations/\(conversationId)/messages",
            body: body
        )
        return response.data
    }
}
```

Live location uses Socket.IO emissions directly from `MessageSocketManager`.

### B3. Extend MessageSocketManager for Live Location

**File**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

Add Combine publishers:
```swift
public let locationLiveStarted = PassthroughSubject<LocationLiveStartedEvent, Never>()
public let locationLiveUpdated = PassthroughSubject<LocationLiveUpdatedEvent, Never>()
public let locationLiveStopped = PassthroughSubject<LocationLiveStoppedEvent, Never>()
```

Add emission methods:
```swift
public func startLiveLocation(conversationId: String, latitude: Double, longitude: Double, address: String?, durationMinutes: Int) {
    socket?.emit("location:share-live", [
        "conversationId": conversationId,
        "latitude": latitude,
        "longitude": longitude,
        "address": address as Any,
        "durationMinutes": durationMinutes
    ])
}

public func updateLiveLocation(conversationId: String, sessionId: String, latitude: Double, longitude: Double) {
    socket?.emit("location:update", [
        "conversationId": conversationId,
        "sessionId": sessionId,
        "latitude": latitude,
        "longitude": longitude
    ])
}

public func stopLiveLocation(conversationId: String, sessionId: String) {
    socket?.emit("location:stop", [
        "conversationId": conversationId,
        "sessionId": sessionId
    ])
}
```

Add event handlers in `setupEventHandlers()`:
```swift
socket.on("location:live-started") { [weak self] data, _ in
    guard let self, let dict = data[0] as? [String: Any],
          let jsonData = try? JSONSerialization.data(withJSONObject: dict),
          let event = try? self.decoder.decode(LocationLiveStartedEvent.self, from: jsonData) else { return }
    DispatchQueue.main.async { self.locationLiveStarted.send(event) }
}
// Similar for location:live-updated and location:live-stopped
```

### B4. LocationMessageView.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Media/LocationMessageView.swift`

Interactive map snapshot in a 150pt-tall bubble:

```swift
import SwiftUI
import MapKit
import MeeshySDK

public struct LocationMessageView: View {
    public let latitude: Double
    public let longitude: Double
    public let address: String?
    public let accentColor: String
    public let isLive: Bool
    public let liveExpiresAt: Date?
    public let onTap: (() -> Void)?
    
    @State private var snapshotImage: UIImage?
    
    public init(latitude: Double, longitude: Double, address: String? = nil,
                accentColor: String = "4ECDC4", isLive: Bool = false,
                liveExpiresAt: Date? = nil, onTap: (() -> Void)? = nil) {
        self.latitude = latitude; self.longitude = longitude; self.address = address
        self.accentColor = accentColor; self.isLive = isLive
        self.liveExpiresAt = liveExpiresAt; self.onTap = onTap
    }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                if let img = snapshotImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    Rectangle()
                        .fill(Color.gray.opacity(0.15))
                        .overlay(ProgressView())
                }
                
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Color(hex: accentColor), Color.white)
                    .shadow(radius: 4)
                
                if isLive, let expires = liveExpiresAt {
                    VStack {
                        HStack {
                            Spacer()
                            LiveLocationBadge(expiresAt: expires, accentColor: accentColor)
                                .padding(6)
                        }
                        Spacer()
                    }
                }
            }
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            
            if let addr = address, !addr.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "mappin")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                    Text(addr)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.primary.opacity(0.8))
                        .lineLimit(2)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            }
        }
        .frame(width: 240)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemBackground).opacity(0.05)))
        .onTapGesture { onTap?() }
        .task { await generateSnapshot() }
    }
    
    private func generateSnapshot() async {
        let options = MKMapSnapshotter.Options()
        let coord = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        options.region = MKCoordinateRegion(center: coord, latitudinalMeters: 500, longitudinalMeters: 500)
        options.size = CGSize(width: 480, height: 300)
        options.mapType = .standard
        
        let snapshotter = MKMapSnapshotter(options: options)
        do {
            let snapshot = try await snapshotter.start()
            snapshotImage = snapshot.image
        } catch {
            // Fallback: show plain map icon
        }
    }
}
```

### B5. LocationFullscreenView.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Media/LocationFullscreenView.swift`

Fullscreen map with a "Directions" button that deep-links to Apple Maps:

```swift
import SwiftUI
import MapKit
import MeeshySDK

public struct LocationFullscreenView: View {
    public let latitude: Double
    public let longitude: Double
    public let address: String?
    public let accentColor: String
    @Environment(\.dismiss) private var dismiss
    @State private var cameraPosition: MapCameraPosition
    
    public init(latitude: Double, longitude: Double, address: String? = nil, accentColor: String = "4ECDC4") {
        self.latitude = latitude; self.longitude = longitude
        self.address = address; self.accentColor = accentColor
        let coord = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        _cameraPosition = State(initialValue: .region(MKCoordinateRegion(
            center: coord, latitudinalMeters: 1000, longitudinalMeters: 1000
        )))
    }
    
    public var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                Map(position: $cameraPosition) {
                    Annotation("", coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude)) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(Color(hex: accentColor), Color(hex: accentColor).opacity(0.3))
                    }
                }
                .mapControls { MapUserLocationButton(); MapCompass() }
                .ignoresSafeArea(edges: .bottom)
                
                directionsButton
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
                ToolbarItem(placement: .principal) {
                    Text(address ?? "Position")
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)
                }
            }
        }
    }
    
    private var directionsButton: some View {
        Button {
            let url = URL(string: "http://maps.apple.com/?daddr=\(latitude),\(longitude)")!
            UIApplication.shared.open(url)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                Text("Itineraire")
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(
                Capsule().fill(
                    LinearGradient(colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.8)],
                                   startPoint: .leading, endPoint: .trailing)
                )
                .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 8, y: 4)
            )
        }
        .padding(.bottom, 32)
    }
}
```

### B6. LiveLocationBadge.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Media/LiveLocationBadge.swift`

```swift
import SwiftUI

public struct LiveLocationBadge: View {
    public let expiresAt: Date
    public let accentColor: String
    @State private var remainingText: String = ""
    
    public init(expiresAt: Date, accentColor: String = "FF2E63") {
        self.expiresAt = expiresAt; self.accentColor = accentColor
    }
    
    public var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(Color(hex: accentColor))
                .frame(width: 6, height: 6)
                .modifier(PulseModifier())
            
            Text("En direct")
                .font(.system(size: 9, weight: .bold))
            
            Text(remainingText)
                .font(.system(size: 9, weight: .medium))
                .monospacedDigit()
        }
        .foregroundColor(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.black.opacity(0.6)))
        .task { await updateTimer() }
    }
    
    private func updateTimer() async {
        while !Task.isCancelled {
            let remaining = max(0, expiresAt.timeIntervalSinceNow)
            if remaining <= 0 { remainingText = "expire"; return }
            let minutes = Int(remaining / 60)
            if minutes > 60 {
                remainingText = "\(minutes / 60)h\(minutes % 60)min"
            } else {
                remainingText = "\(minutes)min"
            }
            try? await Task.sleep(nanoseconds: 30_000_000_000) // Update every 30s
        }
    }
}

private struct PulseModifier: ViewModifier {
    @State private var isPulsing = false
    func body(content: Content) -> some View {
        content
            .scaleEffect(isPulsing ? 1.3 : 1.0)
            .opacity(isPulsing ? 0.6 : 1.0)
            .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: isPulsing)
            .onAppear { isPulsing = true }
    }
}
```

### B7. Extend LocationPickerView -- Add Live Sharing Option

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`

Modify the `bottomCard` to add a "Partager en direct" section with duration picker. Add a new callback:

```swift
let onSelectLive: ((CLLocationCoordinate2D, String?, LiveLocationDuration) -> Void)?
```

Add a toggle and duration picker below the existing "Confirmer" button:

```swift
// Live location section
Divider().padding(.vertical, 8)

HStack(spacing: 8) {
    Image(systemName: "location.circle")
        .font(.system(size: 14))
        .foregroundColor(Color(hex: accentColor))
    Text("Partager en direct")
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(theme.textPrimary)
    Spacer()
}

if showLivePicker {
    HStack(spacing: 8) {
        ForEach(LiveLocationDuration.allCases) { duration in
            Button {
                selectedLiveDuration = duration
            } label: {
                Text(duration.label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(selectedLiveDuration == duration ? .white : Color(hex: accentColor))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(selectedLiveDuration == duration
                            ? Color(hex: accentColor) : Color(hex: accentColor).opacity(0.1))
                    )
            }
        }
    }
    
    Button { /* start live sharing */ } label: {
        Text("Demarrer le partage en direct")
    }
}
```

### B8. Extend ThemedMessageBubble+Media -- Render Location

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift`

The existing `attachmentView` (around line 1101) has a `.location` case that renders a simple gradient rectangle. Replace it with `LocationMessageView`:

```swift
case .location:
    LocationMessageView(
        latitude: attachment.latitude ?? 0,
        longitude: attachment.longitude ?? 0,
        address: message.content.isEmpty ? nil : message.content,
        accentColor: contactColor,
        isLive: false, // TODO: detect from message metadata
        liveExpiresAt: nil,
        onTap: { fullscreenAttachment = attachment }
    )
```

### B9. Extend ConversationViewModel -- Send Location Message

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

Add `sendLocationMessage` and `startLiveSharing` methods:

```swift
func sendLocationMessage(latitude: Double, longitude: Double, address: String?) async {
    isSending = true
    
    let tempId = "temp_\(UUID().uuidString)"
    let optimistic = Message(
        id: tempId,
        conversationId: conversationId,
        senderId: currentUserId,
        content: address ?? "Position partagee",
        messageType: .location,
        createdAt: Date(), updatedAt: Date(),
        attachments: [MessageAttachment.location(latitude: latitude, longitude: longitude)],
        deliveryStatus: .sending, isMe: true
    )
    messages.append(optimistic)
    newMessageAppended += 1
    
    do {
        let response = try await LocationService.shared.sendLocationMessage(
            conversationId: conversationId,
            latitude: latitude,
            longitude: longitude,
            address: address
        )
        if let idx = messages.firstIndex(where: { $0.id == tempId }) {
            messages[idx].id = response.id // Note: messages[idx] requires var binding
        }
    } catch {
        // Mark as failed
        if let idx = messages.firstIndex(where: { $0.id == tempId }) {
            messages[idx].deliveryStatus = .failed
        }
    }
    
    isSending = false
}
```

Add `@Published var liveLocationSessions: [String: LiveLocationSession] = [:]` and subscribe to live location events.

---

## Task Group C: Transcription

### C1. TranscriptionService.swift (MeeshySDK)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/TranscriptionService.swift`

Wraps Apple's `SFSpeechRecognizer` for on-device transcription. Falls back to server `/api/v1/voice/transcribe` endpoint (already exists at `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/voice/translation.ts` line 557).

```swift
import Foundation
import Speech
import AVFoundation

public final class TranscriptionService {
    public static let shared = TranscriptionService()
    private init() {}
    
    public enum TranscriptionSource {
        case onDevice  // SFSpeechRecognizer
        case server    // Whisper via /api/v1/voice/transcribe
    }
    
    // MARK: - Permission
    
    public func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }
    
    public var isAvailable: Bool {
        SFSpeechRecognizer.authorizationStatus() == .authorized
            && SFSpeechRecognizer()?.isAvailable == true
    }
    
    // MARK: - Transcribe Audio File (on-device)
    
    public func transcribeAudioFile(url: URL, language: String? = nil) async throws -> TranscriptionResult {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language ?? "fr-FR")),
              recognizer.isAvailable else {
            throw TranscriptionError.recognizerUnavailable
        }
        
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        request.addsPunctuation = true
        
        return try await withCheckedThrowingContinuation { continuation in
            recognizer.recognitionTask(with: request) { result, error in
                if let error {
                    continuation.resume(throwing: TranscriptionError.recognitionFailed(error))
                    return
                }
                guard let result, result.isFinal else { return }
                
                let segments = result.bestTranscription.segments.map { seg in
                    TranscriptionSegmentResult(
                        text: seg.substring,
                        startTime: seg.timestamp,
                        endTime: seg.timestamp + seg.duration,
                        confidence: Double(seg.confidence)
                    )
                }
                
                let avgConfidence = segments.isEmpty ? 0.0 :
                    segments.reduce(0.0) { $0 + $1.confidence } / Double(segments.count)
                
                continuation.resume(returning: TranscriptionResult(
                    text: result.bestTranscription.formattedString,
                    language: language ?? "fr",
                    confidence: avgConfidence,
                    source: .onDevice,
                    segments: segments
                ))
            }
        }
    }
    
    // MARK: - Transcribe via Server (Whisper)
    
    public func transcribeViaServer(audioData: Data, format: String = "m4a", language: String? = nil) async throws -> TranscriptionResult {
        struct TranscribeBody: Encodable {
            let audioBase64: String
            let audioFormat: String
            let language: String?
        }
        
        let body = TranscribeBody(
            audioBase64: audioData.base64EncodedString(),
            audioFormat: format,
            language: language
        )
        
        let response: APIResponse<ServerTranscriptionResponse> = try await APIClient.shared.post(
            endpoint: "/v1/voice/transcribe",
            body: body
        )
        
        let data = response.data
        return TranscriptionResult(
            text: data.transcription?.text ?? "",
            language: data.transcription?.language ?? "fr",
            confidence: data.transcription?.confidence ?? 0,
            source: .server,
            segments: []
        )
    }
}

// MARK: - Result Types

public struct TranscriptionResult {
    public let text: String
    public let language: String
    public let confidence: Double
    public let source: TranscriptionService.TranscriptionSource
    public let segments: [TranscriptionSegmentResult]
}

public struct TranscriptionSegmentResult {
    public let text: String
    public let startTime: Double
    public let endTime: Double
    public let confidence: Double
}

public enum TranscriptionError: Error, LocalizedError {
    case recognizerUnavailable
    case recognitionFailed(Error)
    case permissionDenied
    
    public var errorDescription: String? {
        switch self {
        case .recognizerUnavailable: return "Reconnaissance vocale non disponible"
        case .recognitionFailed(let err): return "Erreur de transcription: \(err.localizedDescription)"
        case .permissionDenied: return "Permission de reconnaissance vocale refusee"
        }
    }
}

private struct ServerTranscriptionResponse: Decodable {
    let taskId: String?
    let status: String
    let transcription: ServerTranscription?
}

private struct ServerTranscription: Decodable {
    let text: String
    let language: String
    let confidence: Double?
    let source: String?
    let segments: [ServerSegment]?
    let durationMs: Int?
}

private struct ServerSegment: Decodable {
    let text: String
    let startMs: Double?
    let endMs: Double?
}
```

### C2. TranscriptionBadgeView.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Media/TranscriptionBadgeView.swift`

Discreet expandable text badge under audio/video bubbles:

```swift
import SwiftUI
import MeeshySDK

public struct TranscriptionBadgeView: View {
    public let text: String
    public let language: String
    public let confidence: Double?
    public let accentColor: String
    public let isServerTranscription: Bool
    
    @State private var isExpanded = false
    
    public init(text: String, language: String, confidence: Double? = nil,
                accentColor: String = "4ECDC4", isServerTranscription: Bool = false) {
        self.text = text; self.language = language; self.confidence = confidence
        self.accentColor = accentColor; self.isServerTranscription = isServerTranscription
    }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "text.quote")
                        .font(.system(size: 9, weight: .semibold))
                    
                    Text(isExpanded ? "Masquer la transcription" : "Transcription")
                        .font(.system(size: 10, weight: .medium))
                    
                    if let conf = confidence {
                        Text("\(Int(conf * 100))%")
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .opacity(0.6)
                    }
                    
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                }
                .foregroundColor(Color(hex: accentColor).opacity(0.8))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
            }
            .accessibilityLabel("Transcription")
            .accessibilityHint(isExpanded ? "Masquer" : "Afficher la transcription du message vocal")
            
            if isExpanded {
                Text(text)
                    .font(.system(size: 12))
                    .foregroundColor(.primary.opacity(0.8))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(hex: accentColor).opacity(0.06))
                    )
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }
}
```

### C3. Extend ThemedMessageBubble+Media -- Show TranscriptionBadgeView

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`

After the audio player view within `mediaStandaloneView`, add:

```swift
// After AudioPlayerView, check for transcription
if let transcription = transcription, !transcription.text.isEmpty {
    TranscriptionBadgeView(
        text: transcription.text,
        language: transcription.language,
        confidence: transcription.confidence,
        accentColor: contactColor,
        isServerTranscription: true
    )
    .padding(.horizontal, 4)
    .padding(.top, 2)
}
```

### C4. Extend ConversationViewModel -- Auto-transcribe on device

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

Add a method that auto-transcribes audio messages that lack transcription:

```swift
func transcribeIfNeeded(message: Message) {
    guard message.messageType == .audio,
          messageTranscriptions[message.id] == nil,
          let audioAttachment = message.attachments.first(where: { $0.type == .audio }),
          let urlString = MeeshyConfig.resolveMediaURL(audioAttachment.fileUrl)?.absoluteString
    else { return }
    
    Task {
        do {
            let data = try await MediaCacheManager.shared.data(for: urlString)
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(message.id).m4a")
            try data.write(to: tempURL)
            defer { try? FileManager.default.removeItem(at: tempURL) }
            
            let result = try await TranscriptionService.shared.transcribeAudioFile(url: tempURL)
            
            let transcription = MessageTranscription(
                attachmentId: audioAttachment.id,
                text: result.text,
                language: result.language,
                confidence: result.confidence,
                segments: result.segments.map {
                    MessageTranscriptionSegment(text: $0.text, startTime: $0.startTime, endTime: $0.endTime)
                }
            )
            messageTranscriptions[message.id] = transcription
        } catch {
            // Silently fail -- on-device transcription is best-effort
        }
    }
}
```

### C5. Handle Server Whisper Transcription Updates

The ViewModel already subscribes to `MessageSocketManager.shared.transcriptionReady` (the `subscribeToSocket()` method). When the server returns a Whisper transcription via the `audio:transcription-ready` event, it is already handled and stored in `messageTranscriptions`. The on-device transcription serves as an immediate fallback that gets replaced when the server version arrives with higher confidence.

---

## Task Group D: Voice Cloning Consent/Profile

### D1. VoiceProfileModels.swift (MeeshySDK)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/VoiceProfileModels.swift`

Models matching the backend API at `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/voice-profile.ts`:

```swift
import Foundation

// MARK: - Consent

public struct VoiceConsent {
    public let voiceRecordingConsentAt: Date?
    public let voiceCloningEnabledAt: Date?
    public let ageVerificationConsentAt: Date?
    
    public var hasRecordingConsent: Bool { voiceRecordingConsentAt != nil }
    public var hasCloningConsent: Bool { voiceCloningEnabledAt != nil }
    public var hasAgeVerification: Bool { ageVerificationConsentAt != nil }
}

public struct VoiceConsentRequest: Encodable {
    public let voiceRecordingConsent: Bool
    public let voiceCloningConsent: Bool?
    public let birthDate: String?  // YYYY-MM-DD
    
    public init(voiceRecordingConsent: Bool, voiceCloningConsent: Bool? = nil, birthDate: String? = nil) {
        self.voiceRecordingConsent = voiceRecordingConsent
        self.voiceCloningConsent = voiceCloningConsent
        self.birthDate = birthDate
    }
}

// MARK: - Profile

public struct VoiceProfile {
    public let profileId: String?
    public let userId: String
    public let exists: Bool
    public let qualityScore: Double
    public let audioDurationMs: Int
    public let audioCount: Int
    public let voiceCharacteristics: [String: Any]?
    public let signatureShort: String?
    public let version: Int
    public let createdAt: Date?
    public let updatedAt: Date?
    public let expiresAt: Date?
    public let needsCalibration: Bool
    public let consentStatus: VoiceConsent
}

// Internal Decodable for API response
struct VoiceConsentResponse: Decodable {
    let voiceRecordingConsentAt: Date?
    let voiceCloningEnabledAt: Date?
    let ageVerificationConsentAt: Date?
}

struct VoiceProfileResponse: Decodable {
    let profileId: String?
    let userId: String
    let exists: Bool?
    let qualityScore: Double?
    let audioDurationMs: Int?
    let audioCount: Int?
    let signatureShort: String?
    let version: Int?
    let createdAt: Date?
    let updatedAt: Date?
    let expiresAt: Date?
    let needsCalibration: Bool?
    let consentStatus: VoiceConsentResponse?
}

struct VoiceRegisterResponse: Decodable {
    let profileId: String
    let qualityScore: Double
    let audioDurationMs: Int
    let needsCalibration: Bool
    let expiresAt: Date?
}

// MARK: - Voice Profile Stats (for manage screen)

public struct VoiceProfileStats {
    public let totalTranslations: Int
    public let totalAudioMinutes: Double
    public let languagesUsed: [String]
    public let averageQuality: Double
}
```

### D2. VoiceProfileService.swift (MeeshySDK)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/VoiceProfileService.swift`

Calls the existing backend routes at `/api/voice/profile/*`:

```swift
import Foundation

public final class VoiceProfileService {
    public static let shared = VoiceProfileService()
    private init() {}
    private var api: APIClient { APIClient.shared }
    
    // MARK: - Consent
    
    public func getConsent() async throws -> VoiceConsent {
        let response: APIResponse<VoiceConsentResponse> = try await api.request(
            endpoint: "/voice/profile/consent"
        )
        let data = response.data
        return VoiceConsent(
            voiceRecordingConsentAt: data.voiceRecordingConsentAt,
            voiceCloningEnabledAt: data.voiceCloningEnabledAt,
            ageVerificationConsentAt: data.ageVerificationConsentAt
        )
    }
    
    public func updateConsent(_ request: VoiceConsentRequest) async throws -> VoiceConsent {
        let response: APIResponse<VoiceConsentResponse> = try await api.post(
            endpoint: "/voice/profile/consent",
            body: request
        )
        let data = response.data
        return VoiceConsent(
            voiceRecordingConsentAt: data.voiceRecordingConsentAt,
            voiceCloningEnabledAt: data.voiceCloningEnabledAt,
            ageVerificationConsentAt: data.ageVerificationConsentAt
        )
    }
    
    // MARK: - Profile
    
    public func getProfile() async throws -> VoiceProfile {
        let response: APIResponse<VoiceProfileResponse> = try await api.request(
            endpoint: "/voice/profile"
        )
        return mapToProfile(response.data)
    }
    
    public func registerProfile(audioData: Data, audioFormat: String) async throws -> VoiceRegisterResponse {
        struct RegisterBody: Encodable {
            let audioData: String
            let audioFormat: String
            let includeTranscription: Bool
        }
        let body = RegisterBody(
            audioData: audioData.base64EncodedString(),
            audioFormat: audioFormat,
            includeTranscription: true
        )
        let response: APIResponse<VoiceRegisterResponse> = try await api.post(
            endpoint: "/voice/profile/register",
            body: body
        )
        return response.data
    }
    
    public func deleteProfile() async throws {
        let _: APIResponse<[String: String]> = try await api.delete(endpoint: "/voice/profile")
    }
    
    private func mapToProfile(_ data: VoiceProfileResponse) -> VoiceProfile {
        VoiceProfile(
            profileId: data.profileId,
            userId: data.userId,
            exists: data.exists ?? false,
            qualityScore: data.qualityScore ?? 0,
            audioDurationMs: data.audioDurationMs ?? 0,
            audioCount: data.audioCount ?? 0,
            voiceCharacteristics: nil,
            signatureShort: data.signatureShort,
            version: data.version ?? 0,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            expiresAt: data.expiresAt,
            needsCalibration: data.needsCalibration ?? false,
            consentStatus: VoiceConsent(
                voiceRecordingConsentAt: data.consentStatus?.voiceRecordingConsentAt,
                voiceCloningEnabledAt: data.consentStatus?.voiceCloningEnabledAt,
                ageVerificationConsentAt: data.consentStatus?.ageVerificationConsentAt
            )
        )
    }
}
```

### D3. VoiceProfileWizardView.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Profile/VoiceProfileWizardView.swift`

Multi-step wizard with 5 steps:

```swift
import SwiftUI
import AVFoundation
import MeeshySDK

public struct VoiceProfileWizardView: View {
    public let accentColor: String
    public let onComplete: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var currentStep = 0
    @State private var consentRecording = false
    @State private var consentCloning = false
    @State private var consentDataProcessing = false
    @State private var birthDate = Date()
    @State private var needsAgeVerification = false
    @State private var recordedAudioURL: URL?
    @State private var recordedAudioData: Data?
    @State private var isRegistering = false
    @State private var registrationResult: VoiceRegisterResponse?
    @State private var errorMessage: String?
    
    public init(accentColor: String = "A855F7", onComplete: (() -> Void)? = nil) {
        self.accentColor = accentColor; self.onComplete = onComplete
    }
    
    private let steps = ["Decouvrir", "Consentement", "Age", "Enregistrement", "Confirmation"]
    
    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progressBar
                
                TabView(selection: $currentStep) {
                    step1ExplanationView.tag(0)
                    step2ConsentView.tag(1)
                    step3AgeView.tag(2)
                    step4RecordingView.tag(3)
                    step5ConfirmationView.tag(4)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: currentStep)
                
                navigationButtons
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                        .foregroundColor(Color(hex: accentColor))
                }
            }
        }
    }
    
    // Step 1: Explanation with animation
    private var step1ExplanationView: some View {
        VStack(spacing: 24) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(
                    LinearGradient(colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.6)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .symbolEffect(.pulse)
            
            Text("Profil vocal")
                .font(.system(size: 24, weight: .bold))
            
            Text("Creez votre profil vocal pour que Meeshy puisse reproduire votre voix lors des traductions audio. Vos messages seront traduits avec votre propre voix.")
                .font(.system(size: 15))
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal, 32)
        }
        .padding(.top, 60)
    }
    
    // Step 2: Consent checkboxes
    private var step2ConsentView: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Consentement")
                .font(.system(size: 22, weight: .bold))
                .padding(.top, 32)
            
            consentToggle(
                title: "Enregistrement vocal",
                description: "J'autorise Meeshy a enregistrer et stocker mon profil vocal.",
                isOn: $consentRecording,
                required: true
            )
            
            consentToggle(
                title: "Clonage vocal",
                description: "J'autorise l'utilisation de mon profil pour synthetiser ma voix dans d'autres langues.",
                isOn: $consentCloning,
                required: false
            )
            
            consentToggle(
                title: "Traitement des donnees",
                description: "J'accepte le traitement de mes donnees vocales conformement a la politique de confidentialite.",
                isOn: $consentDataProcessing,
                required: true
            )
            
            Spacer()
        }
        .padding(.horizontal, 24)
    }
    
    // Step 3: Age verification
    // Step 4: Voice recording (VoiceRecordingView)
    // Step 5: Confirmation + preview
    // ... (full implementation with AVAudioRecorder waveform)
    
    private var canProceed: Bool {
        switch currentStep {
        case 0: return true
        case 1: return consentRecording && consentDataProcessing
        case 2: return true
        case 3: return recordedAudioData != nil
        case 4: return registrationResult != nil
        default: return false
        }
    }
}
```

### D4. VoiceRecordingView.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Profile/VoiceRecordingView.swift`

AVAudioRecorder with waveform visualization and 10-second minimum timer:

```swift
import SwiftUI
import AVFoundation
import MeeshySDK

public struct VoiceRecordingView: View {
    public let accentColor: String
    public let minimumDuration: TimeInterval // 10 seconds
    @Binding public var recordedURL: URL?
    @Binding public var recordedData: Data?
    
    @State private var isRecording = false
    @State private var recorder: AVAudioRecorder?
    @State private var elapsedTime: TimeInterval = 0
    @State private var waveformLevels: [CGFloat] = []
    @State private var timer: Timer?
    @State private var permissionGranted = false
    
    public init(accentColor: String = "A855F7", minimumDuration: TimeInterval = 10,
                recordedURL: Binding<URL?>, recordedData: Binding<Data?>) {
        self.accentColor = accentColor; self.minimumDuration = minimumDuration
        _recordedURL = recordedURL; _recordedData = recordedData
    }
    
    public var body: some View {
        VStack(spacing: 24) {
            // Waveform visualization
            HStack(spacing: 2) {
                ForEach(0..<40, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: accentColor).opacity(isRecording ? 0.8 : 0.3))
                        .frame(width: 4, height: index < waveformLevels.count ? max(4, waveformLevels[index] * 60) : 4)
                        .animation(.easeOut(duration: 0.1), value: waveformLevels)
                }
            }
            .frame(height: 60)
            
            // Timer
            Text(formatTime(elapsedTime))
                .font(.system(size: 32, weight: .bold, design: .monospaced))
                .foregroundColor(isRecording ? Color(hex: accentColor) : .secondary)
            
            // Minimum indicator
            if elapsedTime < minimumDuration && isRecording {
                Text("Minimum \(Int(minimumDuration))s requis")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.orange)
            }
            
            // Record button
            Button {
                isRecording ? stopRecording() : startRecording()
            } label: {
                Circle()
                    .fill(isRecording ? Color.red : Color(hex: accentColor))
                    .frame(width: 72, height: 72)
                    .overlay(
                        isRecording
                            ? AnyView(RoundedRectangle(cornerRadius: 6).fill(.white).frame(width: 24, height: 24))
                            : AnyView(Circle().fill(.white).frame(width: 24, height: 24))
                    )
                    .shadow(color: (isRecording ? Color.red : Color(hex: accentColor)).opacity(0.4), radius: 12, y: 4)
            }
            .accessibilityLabel(isRecording ? "Arreter l'enregistrement" : "Commencer l'enregistrement")
        }
        .task { await requestMicPermission() }
    }
    
    private func startRecording() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_profile_\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder?.isMeteringEnabled = true
            recorder?.record()
            isRecording = true
            elapsedTime = 0
            waveformLevels = []
            
            timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
                Task { @MainActor in
                    elapsedTime += 0.05
                    recorder?.updateMeters()
                    let level = CGFloat(max(0, (recorder?.averagePower(forChannel: 0) ?? -160) + 50) / 50)
                    waveformLevels.append(level)
                    if waveformLevels.count > 40 { waveformLevels.removeFirst() }
                }
            }
        } catch { }
    }
    
    private func stopRecording() {
        guard elapsedTime >= minimumDuration else { return }
        recorder?.stop()
        isRecording = false
        timer?.invalidate()
        timer = nil
        
        if let url = recorder?.url {
            recordedURL = url
            recordedData = try? Data(contentsOf: url)
        }
    }
    
    private func requestMicPermission() async {
        permissionGranted = await AVAudioApplication.requestRecordPermission()
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
```

### D5. VoiceProfileManageView.swift (MeeshyUI)

**New file**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Profile/VoiceProfileManageView.swift`

Shows profile details, listen to sample, re-record, usage stats, GDPR delete:

```swift
import SwiftUI
import MeeshySDK

public struct VoiceProfileManageView: View {
    public let accentColor: String
    @State private var profile: VoiceProfile?
    @State private var isLoading = true
    @State private var showDeleteConfirm = false
    @State private var showWizard = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss
    
    public init(accentColor: String = "A855F7") {
        self.accentColor = accentColor
    }
    
    public var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    ProgressView()
                } else if let profile, profile.exists {
                    existingProfileView(profile)
                } else {
                    noProfileView
                }
            }
            .navigationTitle("Profil vocal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
            .task { await loadProfile() }
            .sheet(isPresented: $showWizard) {
                VoiceProfileWizardView(accentColor: accentColor) {
                    Task { await loadProfile() }
                }
            }
            .alert("Supprimer le profil vocal", isPresented: $showDeleteConfirm) {
                Button("Annuler", role: .cancel) {}
                Button("Supprimer", role: .destructive) {
                    Task { await deleteProfile() }
                }
            } message: {
                Text("Cette action est irreversible. Toutes vos donnees vocales seront definitivement supprimees.")
            }
        }
    }
    
    private func existingProfileView(_ profile: VoiceProfile) -> some View {
        VStack(spacing: 20) {
            // Quality score ring
            ZStack {
                Circle()
                    .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: profile.qualityScore / 100)
                    .stroke(Color(hex: accentColor), style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack {
                    Text("\(Int(profile.qualityScore))")
                        .font(.system(size: 36, weight: .bold))
                    Text("Qualite")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }
            .frame(width: 120, height: 120)
            
            // Stats
            HStack(spacing: 16) {
                statCard(title: "Duree", value: "\(profile.audioDurationMs / 1000)s", icon: "timer")
                statCard(title: "Version", value: "v\(profile.version)", icon: "number")
                statCard(title: "Echantillons", value: "\(profile.audioCount)", icon: "waveform")
            }
            
            // Expiration
            if let expiresAt = profile.expiresAt {
                let daysLeft = max(0, Int(expiresAt.timeIntervalSinceNow / 86400))
                HStack {
                    Image(systemName: "clock")
                    Text("Expire dans \(daysLeft) jours")
                }
                .font(.system(size: 13))
                .foregroundColor(daysLeft < 14 ? .orange : .secondary)
            }
            
            // Actions
            Button("Re-enregistrer") { showWizard = true }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: accentColor))
            
            Button("Supprimer le profil (RGPD)") { showDeleteConfirm = true }
                .foregroundColor(.red)
                .font(.system(size: 13))
        }
        .padding(24)
    }
    
    private var noProfileView: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform.circle")
                .font(.system(size: 60))
                .foregroundColor(Color(hex: accentColor).opacity(0.5))
            Text("Aucun profil vocal")
                .font(.system(size: 17, weight: .semibold))
            Text("Creez un profil pour activer le clonage vocal")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
            Button("Creer un profil") { showWizard = true }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: accentColor))
        }
        .padding(32)
    }
    
    private func statCard(title: String, value: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 16)).foregroundColor(Color(hex: accentColor))
            Text(value).font(.system(size: 16, weight: .bold))
            Text(title).font(.system(size: 10)).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(hex: accentColor).opacity(0.08)))
    }
    
    private func loadProfile() async {
        isLoading = true
        do {
            profile = try await VoiceProfileService.shared.getProfile()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    private func deleteProfile() async {
        do {
            try await VoiceProfileService.shared.deleteProfile()
            profile = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

### D6. Extend SettingsView -- Add "Profil vocal" Section

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

Add `@State private var showVoiceProfile = false` to the state variables.

In `scrollContent` (line 104), add `voiceProfileSection` between `languageSection` and `dataSection`:

```swift
VStack(spacing: 20) {
    accountSection
    appearanceSection
    notificationsSection
    languageSection
    voiceProfileSection   // NEW
    dataSection
    supportSection
    aboutSection
    logoutSection
    Spacer().frame(height: 40)
}
```

Add the section:

```swift
private var voiceProfileSection: some View {
    settingsSection(title: "Profil vocal", icon: "waveform.circle.fill", color: "A855F7") {
        Button {
            HapticFeedback.light()
            showVoiceProfile = true
        } label: {
            settingsRow(icon: "waveform", title: "Gerer le profil vocal", color: "A855F7") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
        }
        .accessibilityLabel("Profil vocal")
        .accessibilityHint("Gerer votre profil vocal et le clonage de voix")
    }
}
```

Add `.sheet(isPresented: $showVoiceProfile) { VoiceProfileManageView() }`.

### D7. First Audio Send Trigger

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

In the `sendMessage` method, before actually sending an audio message (when `attachmentIds` contains audio), check if voice profile consent exists:

```swift
// Before sending, check if first audio and no voice consent
if let attachments = attachmentIds, !attachments.isEmpty {
    let hasVoiceConsent = AuthManager.shared.currentUser?.voiceProfileConsentAt != nil
    if !hasVoiceConsent {
        // Set a published flag to trigger the wizard sheet
        shouldShowVoiceWizard = true
        // Still send the message (don't block)
    }
}
```

Add `@Published var shouldShowVoiceWizard = false` to ConversationViewModel.

---

## Implementation Sequence

1. **Backend first** (A1-A2): Socket.IO events + live location handler
2. **SDK Models** (B1, D1): LocationModels, VoiceProfileModels
3. **SDK Services** (B2-B3, C1, D2): LocationService, TranscriptionService, VoiceProfileService, MessageSocketManager extensions
4. **MeeshyUI Views** (B4-B6, C2, D3-D5): LocationMessageView, LocationFullscreenView, LiveLocationBadge, TranscriptionBadgeView, VoiceProfileWizardView, VoiceRecordingView, VoiceProfileManageView
5. **App Integration** (B7-B9, C3-C4, D6-D7): Extend LocationPickerView, ThemedMessageBubble, ConversationViewModel, SettingsView

## Build Verification

After each task group:
```bash
# Backend
cd packages/shared && npm run build
cd services/gateway && npm run build

# iOS
./apps/ios/meeshy.sh build
```

---

### Critical Files for Implementation

- `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/socketio-events.ts` - Add location:share-live, location:update, location:stop events and their data interfaces; this is the single source of truth for all Socket.IO event definitions
- `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` - Add live location emit methods and event handlers; central hub for all real-time communication in the SDK
- `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` - Replace the placeholder location rendering (line 1101) with LocationMessageView; add TranscriptionBadgeView display under audio bubbles
- `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` - Add sendLocationMessage, transcribeIfNeeded, live location subscription, shouldShowVoiceWizard trigger; this is the central orchestrator for all conversation features
- `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/voice-profile.ts` - Existing voice profile backend API (consent, register, get, delete) that the SDK will call; reference for exact API shape and response format
