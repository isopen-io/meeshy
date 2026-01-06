# Media & Attachments Module

Complete media handling system for the Meeshy iOS app with photo/video capture, file selection, compression, and upload capabilities.

## Features

### Media Pickers
- **MediaPickerView**: Tabbed picker for Photos, Camera, and Files
- **CameraView**: Full-featured camera with photo/video capture
- **FilePickerView**: Document browser integration
- Multi-select support (up to 10 items)
- Real-time thumbnail preview

### Media Preview
- **MediaPreviewView**: Full-screen swipeable gallery
- Pinch-to-zoom for images
- Video playback with custom controls
- Share and download options

### Media Processing
- **ImageCompressor**: Intelligent image compression (60-80% size reduction)
- **VideoCompressor**: Video compression with H.264 codec
- Thumbnail generation (256x256px)
- Progressive JPEG support

### Caching System
- **ImageCacheManager**: Two-tier caching (memory + disk)
- Automatic cache cleanup
- Memory warning handling
- LRU eviction policy

### Upload Management
- **AttachmentUploadManager**: Background upload queue
- Progress tracking per attachment
- Automatic retry on failure
- Multipart form data upload

### Audio Recording
- **AudioRecorderView**: Swipe-to-cancel interface
- Waveform visualization
- Lock recording feature
- **AudioPlayerView**: Playback with speed control

### Location Sharing
- **LocationPickerView**: Apple Maps integration
- Current location sharing
- Place search
- Custom location selection

### Media Gallery
- **ConversationMediaView**: All media in a conversation
- Tabs: Photos, Videos, Files, Links
- Infinite scroll pagination
- Bulk selection mode

## Required Info.plist Permissions

Add these to your Info.plist:

```xml
<!-- Camera Access -->
<key>NSCameraUsageDescription</key>
<string>Meeshy needs access to your camera to take photos and videos</string>

<!-- Photo Library Access -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Meeshy needs access to your photo library to select and share images</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Meeshy needs access to save photos to your library</string>

<!-- Microphone Access -->
<key>NSMicrophoneUsageDescription</key>
<string>Meeshy needs access to your microphone to record voice messages</string>

<!-- Location Access -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Meeshy needs access to your location to share it with others</string>
```

## Usage Examples

### Show Media Picker
```swift
@State private var showMediaPicker = false

Button("Attach Media") {
    showMediaPicker = true
}
.sheet(isPresented: $showMediaPicker) {
    MediaPickerView { attachments in
        // Handle selected attachments
        handleAttachments(attachments)
    }
}
```

### Upload Attachment
```swift
let manager = AttachmentUploadManager.shared

Task {
    do {
        let uploadedAttachment = try await manager.uploadAttachment(
            attachment,
            to: conversationId
        )
        print("Upload complete: \(uploadedAttachment.url)")
    } catch {
        print("Upload failed: \(error)")
    }
}
```

### Show Full-Screen Preview
```swift
@State private var showPreview = false

Button("View Image") {
    showPreview = true
}
.fullScreenCover(isPresented: $showPreview) {
    MediaPreviewView(
        attachments: [attachment],
        initialIndex: 0,
        canDelete: true
    ) { deletedAttachment in
        // Handle deletion
    }
}
```

### Record Audio
```swift
AudioRecorderView { audioURL in
    // Handle recorded audio
    let attachment = createAudioAttachment(from: audioURL)
    sendAttachment(attachment)
} onCancel: {
    // Handle cancellation
}
```

### Share Location
```swift
@State private var showLocationPicker = false

Button("Share Location") {
    showLocationPicker = true
}
.sheet(isPresented: $showLocationPicker) {
    LocationPickerView { coordinate, address in
        // Handle selected location
        shareLocation(coordinate, address: address)
    }
}
```

## File Structure

```
Features/Media/
├── Views/
│   ├── MediaPickerView.swift          # Main picker with tabs
│   ├── CameraView.swift                # Camera capture
│   ├── FilePickerView.swift            # Document picker
│   ├── MediaPreviewView.swift          # Full-screen preview
│   ├── AttachmentPickerSheet.swift     # Bottom sheet options
│   ├── ImageGalleryView.swift          # Grid gallery
│   ├── DocumentBubbleView.swift        # File attachment
│   ├── AudioRecorderView.swift         # Voice recorder
│   ├── AudioPlayerView.swift           # Audio playback
│   ├── VideoPlayerView.swift           # Video player
│   ├── LocationPickerView.swift        # Location sharing
│   └── ConversationMediaView.swift     # Media gallery
├── Services/
│   ├── ImageCompressor.swift           # Image processing
│   ├── VideoCompressor.swift           # Video processing
│   ├── ImageCacheManager.swift         # Caching system
│   ├── AttachmentUploadManager.swift   # Upload handling
│   └── PermissionManager.swift         # iOS permissions
├── ViewModels/
│   ├── MediaPickerViewModel.swift      # Picker logic
│   └── MediaGalleryViewModel.swift     # Gallery logic
├── Components/
│   ├── ThumbnailView.swift             # Thumbnail component
│   ├── ProgressRing.swift              # Progress indicator
│   └── WaveformView.swift              # Audio waveform
└── Models/
    └── Attachment.swift                # Data model
```

## Performance Optimizations

1. **Lazy Loading**: Only load visible thumbnails
2. **Background Processing**: Compression runs off main thread
3. **Progressive JPEG**: Blur-to-sharp loading
4. **Memory Management**: Automatic cache cleanup on warnings
5. **Batch Operations**: Concurrent uploads with limit (3 max)

## iOS Compatibility

- Minimum: iOS 16.0
- Tested: iOS 16-26
- Uses modern APIs: PHPicker, AVFoundation, MapKit

## Dependencies

- SwiftUI
- Photos (PHPicker)
- AVFoundation (Camera, Audio)
- AVKit (Video Player)
- CoreLocation (Location)
- MapKit (Maps)
- QuickLook (File Preview)
- UniformTypeIdentifiers (File Types)

## TODO

- [ ] iCloud Photo Library support
- [ ] Live Photos support
- [ ] HDR video recording
- [ ] Image filters and editing
- [ ] GIF support
- [ ] Sticker creation
- [ ] Document scanning (VisionKit)
- [ ] AR Quick Look for 3D models

## Notes

- All compression is done locally before upload
- Target file sizes: Images 5MB, Videos 50MB
- Thumbnails are 256x256px
- Cache size limit: Memory 50MB, Disk 200MB
- Upload queue max concurrent: 3 uploads
- Photo selection limit: 10 items

## Support

For issues or questions, contact the development team.
