# Media Module Integration Guide

Complete guide for integrating the Media & Attachments module into the Meeshy iOS app.

## Quick Start

### 1. Add Files to Xcode Project

1. Open Xcode project
2. Right-click on `Features` group
3. Select "Add Files to Meeshy..."
4. Navigate to `Features/Media` folder
5. Select all folders:
   - Views
   - Services
   - ViewModels
   - Components
   - Models
6. Ensure "Copy items if needed" is **unchecked**
7. Ensure "Create groups" is selected
8. Click "Add"

### 2. Configure Info.plist

Add required permissions to `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Meeshy needs access to your camera to take photos and videos</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Meeshy needs access to your photo library to select images</string>

<key>NSMicrophoneUsageDescription</key>
<string>Meeshy needs access to your microphone to record voice messages</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Meeshy needs access to your location to share it with contacts</string>
```

See `PERMISSIONS.md` for complete permission configuration.

### 3. Initialize Managers

In your app's initialization (usually `AppDelegate` or `@main` struct):

```swift
import SwiftUI

@main
struct MeeshyApp: App {
    init() {
        // Initialize permission manager
        _ = PermissionManager.shared

        // Initialize image cache
        _ = ImageCacheManager.shared

        // Initialize upload manager
        _ = AttachmentUploadManager.shared
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

## Integration Examples

### Chat View Integration

```swift
import SwiftUI

struct ChatView: View {
    let conversation: Conversation
    @State private var message = ""
    @State private var attachments: [Attachment] = []
    @State private var showMediaPicker = false
    @State private var showAttachmentSheet = false
    @State private var isRecordingAudio = false

    var body: some View {
        VStack {
            // Messages list
            messagesList

            // Input bar
            inputBar
        }
        .sheet(isPresented: $showMediaPicker) {
            MediaPickerView { selectedAttachments in
                attachments.append(contentsOf: selectedAttachments)
            }
        }
        .sheet(isPresented: $showAttachmentSheet) {
            AttachmentPickerSheet { type in
                handleAttachmentType(type)
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            // Attachment button
            Button {
                showAttachmentSheet = true
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .foregroundColor(.blue)
            }

            // Text field or audio recorder
            if isRecordingAudio {
                AudioRecorderView { audioURL in
                    handleAudioRecording(audioURL)
                } onCancel: {
                    isRecordingAudio = false
                }
            } else {
                TextField("Message", text: $message)
                    .textFieldStyle(.roundedBorder)

                // Voice message button
                Button {
                    isRecordingAudio = true
                } label: {
                    Image(systemName: "mic.fill")
                        .foregroundColor(.blue)
                }
            }

            // Send button
            if !message.isEmpty || !attachments.isEmpty {
                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundColor(.blue)
                }
            }
        }
        .padding()
    }

    private func handleAttachmentType(_ type: AttachmentType) {
        switch type {
        case .camera:
            // Camera is part of MediaPickerView
            showMediaPicker = true
        case .photoVideo:
            showMediaPicker = true
        case .document:
            showMediaPicker = true
        case .location:
            // Show location picker
            break
        case .contact:
            // Show contact picker
            break
        case .poll:
            // Show poll creator
            break
        }
    }

    private func sendMessage() {
        Task {
            // Upload attachments first
            for attachment in attachments {
                do {
                    _ = try await AttachmentUploadManager.shared.uploadAttachment(
                        attachment,
                        to: conversation.id
                    )
                } catch {
                    print("Upload failed: \(error)")
                }
            }

            // Send message with attachments
            // ... your message sending logic

            // Clear
            message = ""
            attachments = []
        }
    }

    private func handleAudioRecording(_ audioURL: URL) {
        // Create audio attachment
        let fileSize = (try? FileManager.default.attributesOfItem(atPath: audioURL.path)[.size] as? Int64) ?? 0

        let attachment = Attachment(
            id: UUID().uuidString,
            type: .audio,
            url: "",
            fileName: "voice_message.m4a",
            fileSize: fileSize,
            mimeType: "audio/mp4",
            localURL: audioURL,
            createdAt: Date()
        )

        attachments.append(attachment)
        isRecordingAudio = false
    }
}
```

### Message Bubble with Attachments

```swift
struct MessageBubbleView: View {
    let message: Message
    @State private var showMediaPreview = false
    @State private var selectedAttachmentIndex = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Attachments
            if !message.attachments.isEmpty {
                attachmentsView
            }

            // Text
            if !message.text.isEmpty {
                Text(message.text)
                    .padding(12)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(16)
            }
        }
        .fullScreenCover(isPresented: $showMediaPreview) {
            MediaPreviewView(
                attachments: message.attachments,
                initialIndex: selectedAttachmentIndex,
                canDelete: message.isOwnMessage
            )
        }
    }

    @ViewBuilder
    private var attachmentsView: some View {
        let imageAttachments = message.attachments.filter { $0.type == .image || $0.type == .video }
        let otherAttachments = message.attachments.filter { $0.type != .image && $0.type != .video }

        // Images/Videos grid
        if !imageAttachments.isEmpty {
            if imageAttachments.count == 1 {
                singleImageView(imageAttachments[0])
            } else {
                imageGridView(imageAttachments)
            }
        }

        // Other attachments
        ForEach(otherAttachments) { attachment in
            attachmentView(attachment)
        }
    }

    private func singleImageView(_ attachment: Attachment) -> some View {
        AsyncImage(url: attachment.imageURL) { image in
            image
                .resizable()
                .scaledToFill()
        } placeholder: {
            ProgressView()
        }
        .frame(width: 250, height: 200)
        .cornerRadius(12)
        .onTapGesture {
            selectedAttachmentIndex = 0
            showMediaPreview = true
        }
    }

    private func imageGridView(_ attachments: [Attachment]) -> some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 4) {
            ForEach(Array(attachments.prefix(4).enumerated()), id: \.element.id) { index, attachment in
                ThumbnailView(attachment: attachment, size: 120)
                    .onTapGesture {
                        selectedAttachmentIndex = index
                        showMediaPreview = true
                    }
            }
        }
    }

    @ViewBuilder
    private func attachmentView(_ attachment: Attachment) -> some View {
        switch attachment.type {
        case .audio:
            AudioPlayerView(url: attachment.localURL ?? URL(string: attachment.url)!)
        case .file:
            DocumentBubbleView(attachment: attachment)
        default:
            EmptyView()
        }
    }
}
```

### Conversation Info - Media Gallery

```swift
struct ConversationInfoView: View {
    let conversation: Conversation
    @State private var showMediaGallery = false

    var body: some View {
        List {
            // ... other conversation info

            Section {
                NavigationLink {
                    ConversationMediaView(conversationId: conversation.id)
                } label: {
                    HStack {
                        Image(systemName: "photo.on.rectangle")
                        Text("Media, Links, and Docs")
                        Spacer()
                        Text("123")
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }
}
```

### Upload Progress Tracking

```swift
struct ChatInputView: View {
    @StateObject private var uploadManager = AttachmentUploadManager.shared
    @State private var attachments: [Attachment] = []

    var body: some View {
        VStack {
            // Show upload progress
            if !uploadManager.activeTasks.isEmpty {
                uploadProgressView
            }

            // Input field
            // ...
        }
    }

    private var uploadProgressView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(Array(uploadManager.activeTasks.values), id: \.id) { task in
                    uploadProgressCell(task)
                }
            }
            .padding()
        }
        .background(Color(.systemGray6))
    }

    private func uploadProgressCell(_ task: UploadTask) -> some View {
        VStack(spacing: 8) {
            ZStack {
                ThumbnailView(attachment: task.attachment, size: 60)

                ProgressRingWithPercentage(
                    progress: task.progress,
                    size: 60
                )
            }

            Text(statusText(for: task.status))
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }

    private func statusText(for status: UploadStatus) -> String {
        switch status {
        case .pending: return "Pending"
        case .compressing: return "Compressing"
        case .uploading(let progress): return "\(Int(progress * 100))%"
        case .completed: return "Done"
        case .failed(let error): return "Failed"
        }
    }
}
```

## Advanced Usage

### Custom Image Compression

```swift
// Compress with custom settings
let result = ImageCompressor.compress(
    image,
    maxSizeMB: 3.0,
    quality: .high
)

if let result = result {
    print("Original: \(result.originalSize) bytes")
    print("Compressed: \(result.compressedSize) bytes")
    print("Saved: \(result.savedPercentage)%")
}
```

### Video Compression with Progress

```swift
Task {
    do {
        let compressedURL = try await VideoCompressor.compress(
            videoURL,
            quality: .medium
        ) { progress in
            print("Compression progress: \(progress * 100)%")
        }

        print("Compressed video: \(compressedURL)")
    } catch {
        print("Compression failed: \(error)")
    }
}
```

### Cache Management

```swift
// Get cache size
let size = await ImageCacheManager.shared.getCacheSize()
let formatted = await ImageCacheManager.shared.getCacheSizeFormatted()
print("Cache size: \(formatted)")

// Clear old cache (7+ days)
await ImageCacheManager.shared.cleanupOldCache(olderThan: 7)

// Trim to size
await ImageCacheManager.shared.trimCacheToSize(100) // 100 MB

// Clear all cache
ImageCacheManager.shared.clearCache()
```

## Testing

### Unit Tests

```swift
import XCTest
@testable import Meeshy

final class ImageCompressorTests: XCTestCase {
    func testImageCompression() {
        let image = UIImage(systemName: "photo")!
        let result = ImageCompressor.compress(image, maxSizeMB: 1.0)

        XCTAssertNotNil(result)
        XCTAssertLessThan(result!.compressedSize, result!.originalSize)
    }

    func testThumbnailGeneration() {
        let image = UIImage(systemName: "photo")!
        let thumbnail = ImageCompressor.generateThumbnail(image)

        XCTAssertNotNil(thumbnail)
        XCTAssertEqual(thumbnail!.size.width, 256)
    }
}
```

### UI Tests

```swift
func testMediaPicker() {
    let app = XCUIApplication()
    app.launch()

    // Open chat
    app.buttons["New Chat"].tap()

    // Open media picker
    app.buttons["Attach"].tap()

    // Select photo
    app.buttons["Photo & Video"].tap()
    app.collectionViews.cells.firstMatch.tap()

    // Send
    app.buttons["Send 1 item"].tap()

    XCTAssertTrue(app.images["Attachment"].exists)
}
```

## Performance Tips

1. **Lazy Loading**: Use `LazyVGrid` for large galleries
2. **Background Processing**: Compress media off main thread
3. **Cache Wisely**: Clear cache on memory warnings
4. **Limit Uploads**: Max 3 concurrent uploads
5. **Thumbnail First**: Always load thumbnails before full images

## Troubleshooting

### Images not loading
- Check network connectivity
- Verify URLs are valid
- Check cache size limits

### Upload failing
- Check network request format
- Verify API endpoint
- Check file size limits

### Camera not working
- Verify permissions granted
- Check Info.plist has description
- Test on real device (not simulator)

## Migration Guide

If migrating from an older attachment system:

1. Update `Attachment` model to match new structure
2. Migrate existing attachments to new format
3. Re-compress old images for consistency
4. Update API endpoints for multipart upload
5. Test backward compatibility

## Support

For issues or questions:
- Check README.md for documentation
- Review PERMISSIONS.md for setup
- Contact development team
