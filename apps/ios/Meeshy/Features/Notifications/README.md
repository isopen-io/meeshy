# Notifications & Calls Implementation

This document provides an overview of the Notifications and Call Management features for the Meeshy iOS app.

## Features Implemented

### 1. Notifications
- ✅ Push notification support (Firebase Cloud Messaging ready)
- ✅ Local notification scheduling
- ✅ Notification categories with actions (Reply, Mark as Read, Call Back, Dismiss)
- ✅ In-app notification banner with animations
- ✅ Notification list with grouping (Today, Yesterday, Earlier)
- ✅ Notification settings (sounds, vibration, Do Not Disturb)
- ✅ Badge count management
- ✅ Deep linking from notifications
- ✅ Swipe actions (delete, mark as read)
- ✅ Pull-to-refresh

### 2. Calls
- ✅ CallKit integration for native iOS call experience
- ✅ Audio and video call support (UI ready)
- ✅ Call history with filtering (All, Missed)
- ✅ Incoming call full-screen UI with pulse animation
- ✅ Active call UI with controls (mute, speaker, video toggle)
- ✅ Call details view
- ✅ Call back functionality
- ✅ Swipe actions on call history
- ✅ Connection quality indicators
- ✅ Call duration timer

## Architecture

### Notifications

```
Features/Notifications/
├── Views/
│   ├── NotificationListView.swift      - Main notifications screen
│   ├── NotificationRowView.swift       - Individual notification item
│   └── NotificationSettingsView.swift  - Settings sheet
├── ViewModels/
│   └── NotificationListViewModel.swift - Notifications logic
├── Managers/
│   └── NotificationManager.swift       - Push notification handling
└── Components/
    └── NotificationBanner.swift        - In-app banner
```

### Calls

```
Features/Calls/
├── Views/
│   ├── CallListView.swift          - Call history screen
│   ├── CallRowView.swift           - Call history item
│   ├── IncomingCallView.swift      - Full-screen incoming call
│   ├── ActiveCallView.swift        - During call interface
│   └── CallDetailsView.swift       - Call details sheet
├── ViewModels/
│   └── CallViewModel.swift         - Call history logic
├── Managers/
│   ├── CallKitManager.swift        - CallKit integration
│   └── WebRTCManager.swift         - WebRTC architecture (placeholder)
└── Services/
    └── CallService.swift           - Call state management
```

## iOS Compatibility

### iOS 16+ Features Used
- `UNAuthorizationOptions.providesAppNotificationSettings` - iOS 12+
- `UNNotificationPresentationOptions.banner` - iOS 14+
- `CXProviderConfiguration.includesCallsInRecents` - iOS 16+

### Availability Checks Implemented
```swift
// iOS 14+ notification presentation
if #available(iOS 14.0, *) {
    completionHandler([.banner, .sound, .badge, .list])
} else {
    completionHandler([.alert, .sound, .badge])
}

// iOS 16+ CallKit features
if #available(iOS 16.0, *) {
    configuration.includesCallsInRecents = true
}

// Firebase Messaging
if #available(iOS 16.0, *) {
    Messaging.messaging().apnsToken = token
}
```

## Setup Instructions

### 1. Firebase Cloud Messaging Setup

1. **Add Firebase to your project:**
   ```bash
   # Add Firebase SDK via SPM
   https://github.com/firebase/firebase-ios-sdk
   ```

2. **Add GoogleService-Info.plist:**
   - Download from Firebase Console
   - Add to Xcode project

3. **Initialize Firebase in AppDelegate:**
   ```swift
   import Firebase

   func application(_ application: UIApplication,
                    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
       FirebaseApp.configure()
       setupNotifications()
       return true
   }
   ```

4. **Enable Push Notifications:**
   - In Xcode: Target > Signing & Capabilities > + Capability > Push Notifications
   - Enable Background Modes > Remote notifications

### 2. CallKit Setup

CallKit is already integrated. No additional setup needed for basic functionality.

**Capabilities Required:**
- Background Modes > Voice over IP (for VoIP calls)

### 3. WebRTC Integration (Optional - for actual video/audio)

For production calls, integrate WebRTC:

1. **Add WebRTC SDK:**
   ```swift
   // SPM
   https://github.com/stasel/WebRTC.git

   // Or CocoaPods
   pod 'GoogleWebRTC'
   ```

2. **Implement WebRTCManager:**
   - See `WebRTCManager.swift` for complete architecture
   - Connect to signaling server (WebSocket)
   - Handle SDP offers/answers
   - Manage ICE candidates

3. **Camera & Microphone Permissions:**
   Add to Info.plist:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Meeshy needs camera access for video calls</string>
   <key>NSMicrophoneUsageDescription</key>
   <string>Meeshy needs microphone access for calls</string>
   ```

### 4. VoIP Push Notifications (Optional - for instant call wake)

For instant call notifications even when app is killed:

1. **Add PushKit framework**
2. **Uncomment VoIP section** in `AppDelegate+Notifications.swift`
3. **Register for VoIP pushes:**
   ```swift
   setupVoIPPush()
   ```

## Notification Types

### 1. Message Notifications
- Category: `MESSAGE`
- Actions: Reply (text input), Mark as Read
- Deep link: Opens conversation

### 2. Mention Notifications
- Category: `MENTION`
- Actions: Reply (text input), Mark as Read
- Deep link: Opens conversation at mentioned message

### 3. Call Notifications
- Category: `CALL`
- Actions: Call Back, Dismiss
- Deep link: Opens call history or initiates call

### 4. System Notifications
- Category: `SYSTEM`
- Actions: Dismiss
- Deep link: Based on action data

## Notification Payload Format

### Expected Server Payload
```json
{
  "aps": {
    "alert": {
      "title": "New message from Alice",
      "body": "Hey! Are you coming to the meeting?"
    },
    "badge": 5,
    "sound": "default"
  },
  "category": "MESSAGE",
  "type": "message",
  "notificationId": "notif123",
  "senderId": "user1",
  "senderName": "Alice Johnson",
  "conversationId": "conv123"
}
```

### Call Notification Payload
```json
{
  "aps": {
    "alert": {
      "title": "Incoming call from Bob",
      "body": "Video call"
    },
    "sound": "default"
  },
  "category": "CALL",
  "type": "call",
  "callId": "call123",
  "userId": "user2",
  "userName": "Bob Smith",
  "callType": "video"
}
```

## Call Flow

### Outgoing Call
1. User taps "New Call" → selects contact
2. `CallViewModel.initiateCall()` called
3. `CallService` creates Call object
4. `CallKitManager.startCall()` reports to CallKit
5. Send initiation to server via WebSocket
6. Wait for answer or timeout (30s)

### Incoming Call
1. Server sends push notification
2. `NotificationManager` receives notification
3. Extract call data from payload
4. `CallService.handleIncomingCallNotification()` called
5. `CallKitManager.reportIncomingCall()` shows native UI
6. User accepts/declines via CallKit
7. `CallKitManager` callbacks trigger `CallService` actions

### Active Call
1. Call connected
2. `ActiveCallView` displayed
3. User controls: mute, speaker, video, end
4. `CallService` manages state
5. WebRTC handles media (when implemented)
6. Duration timer updates every second

## Testing

### Test Notifications
```swift
// Schedule test notification
Task {
    try await NotificationManager.shared.scheduleLocalNotification(
        title: "Test Message",
        body: "This is a test notification",
        category: .message,
        data: ["conversationId": "test123"],
        delay: 2
    )
}
```

### Test Incoming Call
```swift
// Simulate incoming call
let callUUID = UUID()
CallKitManager.shared.reportIncomingCall(
    uuid: callUUID,
    handle: "Test User",
    hasVideo: true
) { error in
    if let error = error {
        print("Error: \(error)")
    }
}
```

## Known Limitations

1. **WebRTC Not Implemented**: Actual audio/video streaming requires WebRTC integration
2. **Mock Data**: Call history and notifications use mock data until API is connected
3. **No Backend Integration**: Token registration and call signaling need backend API
4. **Simulator Limitations**:
   - Push notifications don't work on simulator
   - CallKit works but no actual call audio
   - Camera/microphone not available

## Production Checklist

- [ ] Integrate Firebase Cloud Messaging
- [ ] Add WebRTC SDK
- [ ] Implement signaling server connection
- [ ] Connect notification APIs
- [ ] Connect call APIs
- [ ] Add STUN/TURN servers for WebRTC
- [ ] Test on physical devices
- [ ] Request App Store permissions
- [ ] Add error handling for failed calls
- [ ] Implement call quality monitoring
- [ ] Add call recording (if needed)
- [ ] Implement group calls (future)
- [ ] Add screen sharing (future)

## Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging/ios/client)
- [CallKit Documentation](https://developer.apple.com/documentation/callkit)
- [WebRTC iOS Guide](https://webrtc.org/getting-started/ios)
- [PushKit Documentation](https://developer.apple.com/documentation/pushkit)
- [Apple HIG - Calling](https://developer.apple.com/design/human-interface-guidelines/calling)

## Support

For questions or issues, refer to the main project documentation or contact the development team.
