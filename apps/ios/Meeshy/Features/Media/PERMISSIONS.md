# iOS Permissions Configuration

This document outlines all required permissions for the Media & Attachments module.

## Required Info.plist Entries

Add the following entries to your `Info.plist` file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Camera Permission -->
    <key>NSCameraUsageDescription</key>
    <string>Meeshy needs access to your camera to take photos and videos for sharing with your contacts.</string>

    <!-- Photo Library Permission -->
    <key>NSPhotoLibraryUsageDescription</key>
    <string>Meeshy needs access to your photo library to select and share images and videos.</string>

    <!-- Photo Library Add Permission -->
    <key>NSPhotoLibraryAddUsageDescription</key>
    <string>Meeshy needs permission to save photos and videos you receive to your photo library.</string>

    <!-- Microphone Permission -->
    <key>NSMicrophoneUsageDescription</key>
    <string>Meeshy needs access to your microphone to record and send voice messages.</string>

    <!-- Location Permission (When In Use) -->
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>Meeshy needs access to your location to share it with your contacts when you choose to send your location.</string>

    <!-- File Provider (Optional but recommended) -->
    <key>LSSupportsOpeningDocumentsInPlace</key>
    <true/>

    <key>UISupportsDocumentBrowser</key>
    <true/>
</dict>
</plist>
```

## Permission Descriptions

### Camera (NSCameraUsageDescription)
**Required for**: `CameraView`
- Taking photos in chat
- Recording videos
- QR code scanning (future feature)

**User experience**:
- Alert appears when first opening camera
- User can allow or deny
- If denied, shows settings alert

### Photo Library (NSPhotoLibraryUsageDescription)
**Required for**: `MediaPickerView`
- Selecting photos from library
- Selecting videos from library
- PHPicker integration

**User experience**:
- Alert appears when first accessing photos
- iOS 14+ uses limited access by default
- User can grant full or limited access

### Photo Library Add (NSPhotoLibraryAddUsageDescription)
**Required for**: Saving media
- Saving received images
- Saving received videos
- Downloading media from chat

**User experience**:
- Alert appears when first saving media
- Separate from read permission
- Can be granted independently

### Microphone (NSMicrophoneUsageDescription)
**Required for**: `AudioRecorderView`
- Recording voice messages
- Video recording with audio

**User experience**:
- Alert appears when starting voice recording
- Required for AVAudioRecorder
- Can deny and still use other features

### Location When In Use (NSLocationWhenInUseUsageDescription)
**Required for**: `LocationPickerView`
- Sharing current location
- Location-based features

**User experience**:
- Alert appears when opening location picker
- Only while app is active
- Can deny and manually select location

## Permission Handling

### PermissionManager Usage

```swift
// Check permission status
let status = PermissionManager.shared.cameraStatus

// Request permission
let granted = await PermissionManager.shared.requestCameraAccess()

// Open settings if denied
if !granted {
    PermissionManager.shared.openSettings()
}
```

### Permission States

```swift
enum PermissionStatus {
    case notDetermined  // User hasn't been asked yet
    case granted        // User allowed access
    case denied         // User denied access
    case restricted     // System restricted (parental controls)
}
```

### Best Practices

1. **Request at Point of Use**
   - Only request when feature is accessed
   - Don't request all permissions on launch
   - Provide context before requesting

2. **Handle Denial Gracefully**
   - Show informative alert
   - Offer to open Settings
   - Provide alternative workflows

3. **Provide Context**
   - Explain why permission is needed
   - Show value to user
   - Use clear, friendly language

4. **Respect User Choice**
   - Don't repeatedly ask if denied
   - Don't block entire app if optional permission denied
   - Provide workarounds

## Testing Permissions

### Reset Permissions (iOS Simulator)
```bash
# Reset all permissions for app
xcrun simctl privacy booted reset all com.meeshy.app

# Reset specific permission
xcrun simctl privacy booted reset camera com.meeshy.app
xcrun simctl privacy booted reset photos com.meeshy.app
xcrun simctl privacy booted reset microphone com.meeshy.app
xcrun simctl privacy booted reset location com.meeshy.app
```

### Test Scenarios

1. **First Launch**
   - No permissions granted
   - Test permission requests
   - Verify alerts show correct descriptions

2. **Permission Denied**
   - Deny each permission
   - Verify graceful handling
   - Test settings navigation

3. **Permission Restricted**
   - Enable Screen Time restrictions
   - Test restricted scenarios
   - Verify appropriate messaging

4. **Permission Granted**
   - Grant all permissions
   - Test full functionality
   - Verify no repeated requests

## Privacy Manifest (iOS 17+)

For iOS 17 and later, also include a `PrivacyInfo.xcprivacy` file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Declare what data types are collected -->
    </array>
    <key>NSPrivacyTracking</key>
    <false/>
</dict>
</plist>
```

## App Store Review Guidelines

When submitting to App Store:

1. **Clear Purpose Strings**
   - Each permission must have clear, user-friendly description
   - Explain specific use case
   - Avoid technical jargon

2. **Minimal Permissions**
   - Only request permissions you actually use
   - Remove unused permission requests
   - Request at appropriate time

3. **Privacy Policy**
   - Document all data collection
   - Explain how data is used
   - Provide opt-out mechanisms

## Troubleshooting

### Permission Alert Not Showing
- Check Info.plist has correct keys
- Verify descriptions are present
- Reset permission in Settings > Privacy

### Permission Denied Even When Granted
- Check authorization status is actually granted
- Verify using correct permission APIs
- Check for iOS version compatibility

### Settings Navigation Not Working
- Verify URL scheme is correct
- Check that app has Settings bundle
- Test on actual device (not just simulator)

## References

- [Apple Documentation: Requesting Authorization](https://developer.apple.com/documentation/avfoundation/cameras_and_media_capture/requesting_authorization_for_media_capture_on_ios)
- [Human Interface Guidelines: Permissions](https://developer.apple.com/design/human-interface-guidelines/patterns/accessing-private-data)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy)
