# Media Module - Quick Reference Card

One-page reference for the most common Media & Attachments operations.

---

## 🚀 Quick Setup

### 1. Add to Info.plist
```xml
<key>NSCameraUsageDescription</key>
<string>Take photos and videos</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Select photos to share</string>
<key>NSMicrophoneUsageDescription</key>
<string>Record voice messages</string>
```

### 2. Initialize in App
```swift
@main
struct MeeshyApp: App {
    init() {
        _ = ImageCacheManager.shared
        _ = AttachmentUploadManager.shared
    }
}
```

---

## 📸 Common Use Cases

### Pick Photos/Videos
```swift
@State private var showPicker = false

Button("Attach Media") { showPicker = true }
.sheet(isPresented: $showPicker) {
    MediaPickerView { attachments in
        handleAttachments(attachments)
    }
}
```

### Take Photo with Camera
```swift
CameraView { image in
    let attachment = createAttachment(from: image)
    sendAttachment(attachment)
}
```

### Record Voice Message
```swift
AudioRecorderView(
    onRecordingComplete: { audioURL in
        sendAudio(audioURL)
    },
    onCancel: {
        // User cancelled
    }
)
```

### Upload Attachment
```swift
Task {
    let uploaded = try await AttachmentUploadManager.shared
        .uploadAttachment(attachment, to: conversationId)
    print("URL: \(uploaded.url)")
}
```

### Show Full-Screen Preview
```swift
MediaPreviewView(
    attachments: [image1, image2],
    initialIndex: 0,
    canDelete: true
)
```

### Compress Image
```swift
let compressed = ImageCompressor.compress(
    image,
    maxSizeMB: 5.0,
    quality: .balanced
)
```

### Compress Video
```swift
let compressedURL = try await VideoCompressor.compress(
    videoURL,
    quality: .medium
)
```

### Check Permission
```swift
if await PermissionManager.shared.requestCameraAccess() {
    // Permission granted
} else {
    PermissionManager.shared.openSettings()
}
```

---

## 🎨 UI Components

### Thumbnail
```swift
ThumbnailView(attachment: attachment, size: 60)
```

### Progress Ring
```swift
ProgressRingWithPercentage(progress: 0.75, size: 60)
```

### Waveform
```swift
WaveformView(levels: audioLevels, color: .blue)
```

### Document Bubble
```swift
DocumentBubbleView(attachment: pdfAttachment)
```

### Audio Player
```swift
AudioPlayerView(url: audioURL)
```

### Video Player
```swift
VideoPlayerView(url: videoURL)
```

---

## 📦 Data Models

### Attachment
```swift
Attachment(
    id: UUID().uuidString,
    type: .image,
    url: "https://...",
    fileName: "photo.jpg",
    fileSize: 1234567,
    mimeType: "image/jpeg",
    thumbnailUrl: "https://...",
    localURL: fileURL,
    createdAt: Date()
)
```

### Attachment Types
- `.image` - Photos, PNG, JPEG
- `.video` - MP4, MOV
- `.audio` - Voice messages, M4A
- `.file` - Documents, PDFs
- `.location` - GPS coordinates

---

## 🔧 Service APIs

### ImageCacheManager
```swift
// Cache image
await ImageCacheManager.shared.cacheImage(image, for: key)

// Get cached image
let image = await ImageCacheManager.shared.getImage(for: key)

// Clear cache
ImageCacheManager.shared.clearCache()

// Get size
let size = await ImageCacheManager.shared.getCacheSize()
```

### AttachmentUploadManager
```swift
let manager = AttachmentUploadManager.shared

// Upload
try await manager.uploadAttachment(attachment, to: conversationId)

// Cancel
manager.cancelUpload(attachmentId)

// Retry
try await manager.retryUpload(attachmentId)

// Observe progress
manager.$uploadProgress
manager.$uploadStatus
```

---

## ⚙️ Configuration

### Image Compression Quality
```swift
enum CompressionQuality {
    case fast       // 60% quality
    case balanced   // 70% quality (default)
    case high       // 80% quality
}
```

### Video Compression Quality
```swift
enum VideoQuality {
    case low        // 480p, 1 Mbps
    case medium     // 720p, 2.5 Mbps (default)
    case high       // 1080p, 5 Mbps
}
```

### Cache Limits
```swift
// Memory: 50MB
// Disk: 200MB
// Auto cleanup: 7 days
```

---

## 🐛 Troubleshooting

### Permission Denied
```swift
if PermissionManager.shared.cameraStatus == .denied {
    // Show alert with option to open Settings
    PermissionManager.shared.openSettings()
}
```

### Upload Failed
```swift
do {
    let uploaded = try await uploadManager.uploadAttachment(...)
} catch {
    // Handle error
    print("Upload failed: \(error.localizedDescription)")
    // Retry or show error to user
}
```

### Image Not Loading
```swift
// Check cache first
if let cached = await ImageCacheManager.shared.getImage(for: key) {
    self.image = cached
} else {
    // Download from URL
}
```

---

## 📱 Platform Support

- **iOS 16+** required
- **SwiftUI** native
- **No external dependencies**
- **Xcode 14+** recommended

---

## 🔗 File Paths

```
Features/Media/
├── Views/              # 13 SwiftUI views
├── Services/           # 5 service classes
├── ViewModels/         # 2 view models
├── Components/         # 3 reusable components
└── Models/             # 1 data model
```

---

## 📚 Documentation

- **README.md** - Full feature documentation
- **INTEGRATION.md** - Integration examples
- **PERMISSIONS.md** - Permission setup guide
- **SUMMARY.md** - Development summary

---

## ⚡ Performance Tips

1. Use `LazyVGrid` for large galleries
2. Compress before upload (saves bandwidth)
3. Generate thumbnails (256x256)
4. Limit concurrent uploads (3 max)
5. Clear cache on memory warnings

---

## ✅ Checklist for Production

- [ ] Add Info.plist permissions
- [ ] Test on real device
- [ ] Configure upload endpoint
- [ ] Test all permission flows
- [ ] Update privacy policy
- [ ] Enable background uploads (optional)
- [ ] Add analytics (optional)

---

## 🆘 Support

**Documentation**: Check README.md, INTEGRATION.md
**Examples**: See INTEGRATION.md
**Issues**: Contact development team

---

*Quick Reference v1.0 - Meeshy Media Module*
