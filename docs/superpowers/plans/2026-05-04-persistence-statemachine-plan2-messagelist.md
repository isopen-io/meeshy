# Plan 2: Message List — UICollectionView + Socket + Retry + Gap Detector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UICollectionView-based message list with cell recycling, refactored socket handler writing to the persistence actor, retry engine, gap detector, media snapshot store, thumbnail prefetcher, and notification extension pre-persist.

**Architecture:** UICollectionView + CompositionalLayout + DiffableDataSource wrapped in UIViewControllerRepresentable. All socket events write to MessagePersistenceActor. DatabaseRegionObservation propagates to MessageStore which drives DiffableDataSource snapshots. Cell recycling keeps ~15 cells in memory. NSCache for decoded thumbnails.

**Tech Stack:** Swift 6.2, UIKit (UICollectionView), GRDB 6.29.3, Combine, XCTest

**Depends on:** Plan 1 (Core Persistence) must be completed first.

**Spec reference:** `docs/superpowers/specs/2026-05-04-ios-persistence-statemachine-design.md` (Sections 4-8, F1-F4, O1-O7)

---

## File Structure

### New Files (MeeshySDK)

| File | Responsibility |
|------|---------------|
| `Sources/MeeshySDK/Persistence/RetryEngine.swift` | Reactive auto-retry via ValueObservation |
| `Sources/MeeshySDK/Persistence/ReconnectionGapDetector.swift` | Paginated delta sync on socket reconnect |
| `Sources/MeeshySDK/Persistence/MediaSnapshotStore.swift` | Local media snapshot before upload |
| `Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift` | mmap + CGImageSource + NSCache 50MB |
| `Sources/MeeshySDK/Cache/DecodedImageCache.swift` | NSCache wrapper for CGImage |

### New Files (App)

| File | Responsibility |
|------|---------------|
| `Meeshy/Features/Main/Views/MessageListViewController.swift` | UICollectionView + CompositionalLayout + DiffableDataSource + infinite scroll up |
| `Meeshy/Features/Main/Views/MessageListView.swift` | UIViewControllerRepresentable bridge |
| `Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift` | Text bubble with timestamp inline (CTFramesetter) |
| `Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift` | Image/video bubble with NSCache |
| `Meeshy/Features/Main/Views/Cells/AudioBubbleCell.swift` | Audio waveform bubble |
| `Meeshy/Features/Main/Views/Cells/SystemMessageCell.swift` | System message (joined, left, etc.) |
| `Meeshy/Features/Main/Views/Cells/DeliveryIndicatorView.swift` | Clock → check → double-check → blue UIKit view |

### Modified Files

| File | Changes |
|------|---------|
| `ConversationSocketHandler.swift` | Write to Actor instead of ViewModel (25 events) |
| `ConversationViewModel.swift` | Strip to orchestrator, use MessageStore |
| `ConversationView.swift` | Use MessageListView (UIKit bridge) |
| `MeeshyNotificationExtension/NotificationService.swift` | Pre-persist to App Group DB |
| `Meeshy/Core/DependencyContainer.swift` | Add RetryEngine, GapDetector, MediaSnapshotStore, ThumbnailPrefetcher |

### Test Files

| File | Tests |
|------|-------|
| `Tests/MeeshySDKTests/Persistence/RetryEngineTests.swift` | ~5 tests |
| `Tests/MeeshySDKTests/Persistence/MediaSnapshotStoreTests.swift` | ~5 tests |
| `MeeshyTests/Integration/MessageListIntegrationTests.swift` | ~8 tests |

---

## Task 1: DecodedImageCache — NSCache wrapper

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedImageCache.swift`

- [ ] **Step 1: Implement DecodedImageCache**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedImageCache.swift

import Foundation
import CoreGraphics

/// NSObject wrapper for CGImage (required by NSCache)
public final class CGImageRef: NSObject {
    public let image: CGImage
    public init(_ image: CGImage) { self.image = image }
}

/// (O3) NSCache cost-based for decoded CGImages
/// Auto-evicts on memory warning without NotificationCenter
public final class DecodedImageCache: Sendable {
    public static let shared = DecodedImageCache()

    private let cache: NSCache<NSString, CGImageRef>

    public init(totalCostLimit: Int = 50 * 1024 * 1024, countLimit: Int = 300) {
        cache = NSCache()
        cache.totalCostLimit = totalCostLimit
        cache.countLimit = countLimit
    }

    public func get(_ key: String) -> CGImage? {
        cache.object(forKey: key as NSString)?.image
    }

    public func set(_ image: CGImage, forKey key: String) {
        let cost = image.bytesPerRow * image.height
        cache.setObject(CGImageRef(image), forKey: key as NSString, cost: cost)
    }

    public func remove(_ key: String) {
        cache.removeObject(forKey: key as NSString)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedImageCache.swift
git commit -m "feat(sdk): add DecodedImageCache NSCache wrapper for CGImage (O3)"
```

---

## Task 2: ThumbnailPrefetcher — mmap + CGImageSource

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift`

- [ ] **Step 1: Implement ThumbnailPrefetcher**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift

import Foundation
import ImageIO
import CoreGraphics

public actor ThumbnailPrefetcher {
    public static let shared = ThumbnailPrefetcher()

    private let cache: DecodedImageCache
    private let diskCache: DiskCacheStore
    private var inFlight: Set<String> = []
    private let maxConcurrent = 4

    public init(cache: DecodedImageCache = .shared, diskCache: DiskCacheStore = .shared) {
        self.cache = cache
        self.diskCache = diskCache
    }

    /// Get a decoded thumbnail — check NSCache first, then disk, then nil
    public func get(key: String) async -> CGImage? {
        if let cached = cache.get(key) { return cached }

        guard let path = await diskCache.filePath(forKey: key) else { return nil }
        return await decodeFromDisk(url: path, cacheKey: key)
    }

    /// Prefetch thumbnails for a batch of keys
    public func prefetchBatch(_ keys: [String]) async {
        await withTaskGroup(of: Void.self) { group in
            var launched = 0
            for key in keys {
                guard cache.get(key) == nil else { continue }
                guard !inFlight.contains(key) else { continue }
                guard launched < maxConcurrent else { break }

                inFlight.insert(key)
                launched += 1

                group.addTask { [weak self] in
                    defer { Task { await self?.inFlight.remove(key) } }
                    guard let path = await self?.diskCache.filePath(forKey: key) else { return }
                    _ = await self?.decodeFromDisk(url: path, cacheKey: key)
                }
            }
        }
    }

    /// Decode from disk via mmap + CGImageSource — NEVER on MainActor
    private func decodeFromDisk(url: URL, cacheKey: String) async -> CGImage? {
        await Task.detached(priority: .utility) { [cache] in
            guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
            guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }

            let options: [CFString: Any] = [
                kCGImageSourceThumbnailMaxPixelSize: 300,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceShouldCacheImmediately: true
            ]

            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
            else { return nil }

            cache.set(cgImage, forKey: cacheKey)
            return cgImage
        }.value
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift
git commit -m "feat(sdk): add ThumbnailPrefetcher with mmap + CGImageSource + NSCache"
```

---

## Task 3: RetryEngine — Reactive via ValueObservation

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/RetryEngine.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/RetryEngineTests.swift`

- [ ] **Step 1: Write failing tests**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/RetryEngineTests.swift

import XCTest
import GRDB
@testable import MeeshySDK

final class RetryEngineTests: XCTestCase {

    private var dbPool: DatabasePool!
    private var persistence: MessagePersistenceActor!

    override func setUp() async throws {
        dbPool = try DatabasePool(path: ":memory:")
        try MessageDatabaseMigrations.runAll(on: dbPool)
        persistence = MessagePersistenceActor(dbPool: dbPool)
    }

    func test_queuedMessageIsDetectedByObservation() async throws {
        var record = MessageRecordFactory.make(localId: "retry_001", state: .sending)
        try await persistence.insertOptimistic(record)
        _ = try await persistence.applyEvent(localId: "retry_001",
            event: .sendFailed(RetryTestError.network))

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .queued)
        XCTAssertEqual(fetched[0].retryCount, 1)
    }

    func test_manualRetry_resetsCountAndRequeues() async throws {
        var record = MessageRecordFactory.make(localId: "retry_002", state: .failed)
        record.retryCount = 3
        try await persistence.insertOptimistic(record)

        _ = try await persistence.applyEvent(localId: "retry_002", event: .retry)

        let fetched = try persistence.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .queued)
        XCTAssertEqual(fetched[0].retryCount, 0)
    }
}

private enum RetryTestError: Error, LocalizedError {
    case network
    var errorDescription: String? { "network" }
}
```

- [ ] **Step 2: Implement RetryEngine**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/RetryEngine.swift

import Foundation
import GRDB

public protocol MessageSending: Sendable {
    func send(conversationId: String, content: String?, contentType: String,
              encryptedPayload: Data?, attachments: Data?) async throws -> SendMessageResponse
}

public struct SendMessageResponse: Sendable {
    public let id: String
    public let createdAt: Date
    public init(id: String, createdAt: Date) {
        self.id = id
        self.createdAt = createdAt
    }
}

public actor RetryEngine {
    private let persistence: MessagePersistenceActor
    private let sender: MessageSending
    private let dbPool: DatabasePool
    private var observationCancellable: AnyDatabaseCancellable?
    private var isProcessing = false

    private static let backoffBase: TimeInterval = 1
    private static let backoffMultiplier: Double = 3

    public init(persistence: MessagePersistenceActor, dbPool: DatabasePool, sender: MessageSending) {
        self.persistence = persistence
        self.sender = sender
        self.dbPool = dbPool
    }

    public func start() {
        let observation = ValueObservation.tracking { db in
            try MessageRecord
                .filter(Column("state") == MessageState.queued.rawValue)
                .order(Column("createdAt").asc)
                .fetchAll(db)
        }

        observationCancellable = observation.start(in: dbPool) { [weak self] queuedMessages in
            Task { await self?.processQueue(queuedMessages) }
        }
    }

    public func stop() {
        observationCancellable = nil
    }

    private func processQueue(_ messages: [MessageRecord]) async {
        guard !isProcessing, !messages.isEmpty else { return }
        isProcessing = true
        defer { isProcessing = false }

        for message in messages {
            let delay = Self.backoffBase * pow(Self.backoffMultiplier, Double(message.retryCount))
            try? await Task.sleep(for: .seconds(delay))

            _ = try? await persistence.applyEvent(localId: message.localId, event: .startSending)

            do {
                let response = try await sender.send(
                    conversationId: message.conversationId,
                    content: message.content,
                    contentType: message.contentType,
                    encryptedPayload: message.encryptedPayload,
                    attachments: message.attachmentsJson
                )
                _ = try? await persistence.applyEvent(
                    localId: message.localId,
                    event: .serverAck(serverId: response.id, at: response.createdAt)
                )
            } catch {
                _ = try? await persistence.applyEvent(
                    localId: message.localId, event: .sendFailed(error))
            }
        }
    }

    public func manualRetry(localId: String) async {
        _ = try? await persistence.applyEvent(localId: localId, event: .retry)
    }
}
```

- [ ] **Step 3: Run tests — verify pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test`
Expected: RetryEngine tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/RetryEngine.swift
git add packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/RetryEngineTests.swift
git commit -m "feat(sdk): add RetryEngine with reactive ValueObservation + backoff"
```

---

## Task 4: ReconnectionGapDetector

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReconnectionGapDetector.swift`

- [ ] **Step 1: Implement ReconnectionGapDetector**

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReconnectionGapDetector.swift

import Foundation

public actor ReconnectionGapDetector {
    private let persistence: MessagePersistenceActor
    private let messageService: MessageServiceProviding
    private var lastReceivedTimestamps: [String: Date] = [:]
    private var activeConversations: Set<String> = []
    private let syncSemaphore = AsyncSemaphore(limit: 3)

    public init(persistence: MessagePersistenceActor, messageService: MessageServiceProviding) {
        self.persistence = persistence
        self.messageService = messageService
        restoreTimestamps()
    }

    public func activate(conversationId: String) {
        activeConversations.insert(conversationId)
    }

    public func deactivate(conversationId: String) {
        activeConversations.remove(conversationId)
    }

    public func recordReceived(conversationId: String, at date: Date) {
        let current = lastReceivedTimestamps[conversationId]
        if current == nil || date > current! {
            lastReceivedTimestamps[conversationId] = date
            persistTimestamps()
        }
    }

    public func onReconnected() async {
        await withTaskGroup(of: Void.self) { group in
            for convId in activeConversations {
                group.addTask { await self.syncGap(for: convId) }
            }
        }
    }

    private func syncGap(for conversationId: String) async {
        await syncSemaphore.wait()
        defer { syncSemaphore.signal() }

        var cursor = lastReceivedTimestamps[conversationId] ?? Date().addingTimeInterval(-3600)
        var totalFetched = 0
        let maxTotal = 1000

        while totalFetched < maxTotal {
            guard let page = try? await messageService.list(
                conversationId: conversationId, after: cursor, limit: 100
            ) else { break }
            guard !page.isEmpty else { break }

            let incoming = page.map {
                MessagePersistenceActor.IncomingMessageData(
                    id: $0.id, conversationId: $0.conversationId,
                    senderId: $0.senderId, content: $0.content,
                    createdAt: $0.createdAt, computedState: .sent
                )
            }
            await persistence.bufferIncoming(incoming)

            cursor = page.last!.createdAt
            totalFetched += page.count
            if page.count < 100 { break }
        }

        lastReceivedTimestamps[conversationId] = cursor
        persistTimestamps()
    }

    private func persistTimestamps() {
        let data = try? JSONEncoder().encode(lastReceivedTimestamps)
        UserDefaults.standard.set(data, forKey: "gap_detector_timestamps")
    }

    private func restoreTimestamps() {
        guard let data = UserDefaults.standard.data(forKey: "gap_detector_timestamps"),
              let restored = try? JSONDecoder().decode([String: Date].self, from: data)
        else { return }
        lastReceivedTimestamps = restored
    }
}

/// Simple async semaphore for concurrency limiting
public actor AsyncSemaphore {
    private var count: Int
    private var waiters: [CheckedContinuation<Void, Never>] = []

    public init(limit: Int) { self.count = limit }

    public func wait() async {
        if count > 0 {
            count -= 1
        } else {
            await withCheckedContinuation { waiters.append($0) }
        }
    }

    public func signal() {
        if let waiter = waiters.first {
            waiters.removeFirst()
            waiter.resume()
        } else {
            count += 1
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReconnectionGapDetector.swift
git commit -m "feat(sdk): add ReconnectionGapDetector with paginated sync + semaphore"
```

---

## Task 5: DeliveryIndicatorView — UIKit

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/DeliveryIndicatorView.swift`

- [ ] **Step 1: Implement DeliveryIndicatorView**

```swift
// apps/ios/Meeshy/Features/Main/Views/Cells/DeliveryIndicatorView.swift

import UIKit
import MeeshySDK

final class DeliveryIndicatorView: UIView {
    private let timestampLabel = UILabel()
    private let iconView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        let stack = UIStackView(arrangedSubviews: [timestampLabel, iconView])
        stack.axis = .horizontal
        stack.spacing = 4
        stack.alignment = .center
        addSubview(stack)
        stack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])

        timestampLabel.font = .systemFont(ofSize: 11)
        timestampLabel.textColor = .secondaryLabel

        iconView.contentMode = .scaleAspectFit
        iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 10)
        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 16),
            iconView.heightAnchor.constraint(equalToConstant: 12)
        ])
    }

    func configure(state: MessageState, timestamp: Date, isFromCurrentUser: Bool) {
        timestampLabel.text = Self.timeFormatter.string(from: timestamp)

        guard isFromCurrentUser else {
            iconView.isHidden = true
            return
        }
        iconView.isHidden = false

        let (image, color) = iconConfig(for: state)
        UIView.transition(with: iconView, duration: 0.25, options: .transitionCrossDissolve) {
            self.iconView.image = image
            self.iconView.tintColor = color
        }
    }

    private func iconConfig(for state: MessageState) -> (UIImage?, UIColor) {
        switch state {
        case .sending, .queued, .draft:
            return (UIImage(systemName: "clock"), .secondaryLabel)
        case .sent:
            return (UIImage(systemName: "checkmark"), .secondaryLabel)
        case .delivered:
            return (UIImage(systemName: "checkmark")?.withConfiguration(
                UIImage.SymbolConfiguration(paletteColors: [.secondaryLabel])), .secondaryLabel)
        case .read:
            return (UIImage(systemName: "checkmark")?.withConfiguration(
                UIImage.SymbolConfiguration(paletteColors: [.systemBlue])), .systemBlue)
        case .failed:
            return (UIImage(systemName: "exclamationmark.circle"), .systemRed)
        }
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Cells/DeliveryIndicatorView.swift
git commit -m "feat(ios): add DeliveryIndicatorView UIKit (clock → check → double-check)"
```

---

## Task 6: TextBubbleCell + MediaBubbleCell + SystemMessageCell

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/AudioBubbleCell.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/Cells/SystemMessageCell.swift`

- [ ] **Step 1: Implement TextBubbleCell**

```swift
// apps/ios/Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift

import UIKit
import MeeshySDK

final class TextBubbleCell: UICollectionViewCell {
    private let bubbleView = UIView()
    private let textLabel = UILabel()
    private let deliveryIndicator = DeliveryIndicatorView()
    private let senderLabel = UILabel()
    private var currentRecord: MessageRecord?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        bubbleView.layer.cornerRadius = 16
        bubbleView.clipsToBounds = true
        contentView.addSubview(bubbleView)
        bubbleView.translatesAutoresizingMaskIntoConstraints = false

        senderLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        bubbleView.addSubview(senderLabel)
        senderLabel.translatesAutoresizingMaskIntoConstraints = false

        textLabel.font = .systemFont(ofSize: 16)
        textLabel.numberOfLines = 0
        bubbleView.addSubview(textLabel)
        textLabel.translatesAutoresizingMaskIntoConstraints = false

        bubbleView.addSubview(deliveryIndicator)
        deliveryIndicator.translatesAutoresizingMaskIntoConstraints = false
    }

    func configure(with record: MessageRecord, isMe: Bool) {
        currentRecord = record
        textLabel.text = record.content
        senderLabel.text = isMe ? nil : record.senderName
        senderLabel.textColor = UIColor(hex: record.senderColor ?? "#6366F1")
        senderLabel.isHidden = isMe

        bubbleView.backgroundColor = isMe
            ? UIColor(named: "BubbleOutgoing") ?? .systemBlue.withAlphaComponent(0.15)
            : UIColor(named: "BubbleIncoming") ?? .secondarySystemBackground

        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)

        setNeedsLayout()
    }

    override func preferredLayoutAttributesFitting(
        _ layoutAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutAttributes {
        let attrs = super.preferredLayoutAttributesFitting(layoutAttributes)
        if let record = currentRecord, let height = record.cachedBubbleHeight {
            attrs.size.height = CGFloat(height) + 4 // +4 for cell spacing
        }
        return attrs
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        currentRecord = nil
        textLabel.text = nil
        senderLabel.text = nil
    }
}
```

- [ ] **Step 2: Implement MediaBubbleCell**

```swift
// apps/ios/Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift

import UIKit
import MeeshySDK

final class MediaBubbleCell: UICollectionViewCell {
    private let imageView = UIImageView()
    private let deliveryIndicator = DeliveryIndicatorView()
    private let durationLabel = UILabel()
    private var currentRecord: MessageRecord?
    private var loadTask: Task<Void, Never>?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.layer.cornerRadius = 16
        imageView.backgroundColor = .systemGray5
        contentView.addSubview(imageView)
        imageView.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(deliveryIndicator)
        deliveryIndicator.translatesAutoresizingMaskIntoConstraints = false

        durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        durationLabel.textColor = .white
        durationLabel.isHidden = true
        contentView.addSubview(durationLabel)
        durationLabel.translatesAutoresizingMaskIntoConstraints = false
    }

    func configure(with record: MessageRecord, isMe: Bool, imageCache: DecodedImageCache) {
        currentRecord = record

        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)

        durationLabel.isHidden = record.messageType != "video"

        // Check NSCache first (O(1))
        if let cached = imageCache.get(record.localId) {
            imageView.image = UIImage(cgImage: cached)
        } else {
            imageView.image = nil
            imageView.backgroundColor = .systemGray5
            loadTask = Task { [weak self] in
                let decoded = await ThumbnailPrefetcher.shared.get(key: record.localId)
                guard !Task.isCancelled, let decoded else { return }
                await MainActor.run {
                    self?.imageView.image = UIImage(cgImage: decoded)
                }
            }
        }
    }

    override func preferredLayoutAttributesFitting(
        _ layoutAttributes: UICollectionViewLayoutAttributes
    ) -> UICollectionViewLayoutAttributes {
        let attrs = super.preferredLayoutAttributesFitting(layoutAttributes)
        if let record = currentRecord, let height = record.cachedBubbleHeight {
            attrs.size.height = CGFloat(height) + 4
        }
        return attrs
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        loadTask?.cancel()
        loadTask = nil
        currentRecord = nil
        imageView.image = nil
        imageView.backgroundColor = .systemGray5
    }
}
```

- [ ] **Step 3: Implement AudioBubbleCell**

```swift
// apps/ios/Meeshy/Features/Main/Views/Cells/AudioBubbleCell.swift

import UIKit
import MeeshySDK

final class AudioBubbleCell: UICollectionViewCell {
    private let bubbleView = UIView()
    private let playButton = UIButton()
    private let waveformView = UIView()
    private let durationLabel = UILabel()
    private let deliveryIndicator = DeliveryIndicatorView()
    private var currentRecord: MessageRecord?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupViews() {
        bubbleView.layer.cornerRadius = 16
        bubbleView.clipsToBounds = true
        contentView.addSubview(bubbleView)
        bubbleView.translatesAutoresizingMaskIntoConstraints = false

        playButton.setImage(UIImage(systemName: "play.fill"), for: .normal)
        bubbleView.addSubview(playButton)
        playButton.translatesAutoresizingMaskIntoConstraints = false

        waveformView.backgroundColor = .systemGray4
        waveformView.layer.cornerRadius = 2
        bubbleView.addSubview(waveformView)
        waveformView.translatesAutoresizingMaskIntoConstraints = false

        durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
        durationLabel.textColor = .secondaryLabel
        bubbleView.addSubview(durationLabel)
        durationLabel.translatesAutoresizingMaskIntoConstraints = false

        bubbleView.addSubview(deliveryIndicator)
        deliveryIndicator.translatesAutoresizingMaskIntoConstraints = false
    }

    func configure(with record: MessageRecord, isMe: Bool) {
        currentRecord = record
        bubbleView.backgroundColor = isMe
            ? UIColor(named: "BubbleOutgoing") ?? .systemBlue.withAlphaComponent(0.15)
            : UIColor(named: "BubbleIncoming") ?? .secondarySystemBackground
        deliveryIndicator.configure(
            state: record.state, timestamp: record.createdAt, isFromCurrentUser: isMe)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        currentRecord = nil
    }
}
```

- [ ] **Step 4: Implement SystemMessageCell**

```swift
// apps/ios/Meeshy/Features/Main/Views/Cells/SystemMessageCell.swift

import UIKit
import MeeshySDK

final class SystemMessageCell: UICollectionViewCell {
    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        label.font = .systemFont(ofSize: 13)
        label.textColor = .secondaryLabel
        label.textAlignment = .center
        label.numberOfLines = 0
        contentView.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 40),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -40)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func configure(with record: MessageRecord) {
        label.text = record.content
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        label.text = nil
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/Cells/TextBubbleCell.swift
git add apps/ios/Meeshy/Features/Main/Views/Cells/MediaBubbleCell.swift
git add apps/ios/Meeshy/Features/Main/Views/Cells/AudioBubbleCell.swift
git add apps/ios/Meeshy/Features/Main/Views/Cells/SystemMessageCell.swift
git commit -m "feat(ios): add UICollectionView cells — Text, Media, Audio, System"
```

---

## Task 7: MessageListViewController — UICollectionView + DiffableDataSource

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`

- [ ] **Step 1: Implement MessageListViewController**

This is the core UICollectionView with flipped transform, infinite scroll up, DiffableDataSource, and cell recycling. See the spec Section "Message List : UICollectionView hybrid" for the full implementation.

The file will be ~300 lines containing:
- `configureCollectionView()` — CompositionalLayout + flipped transform
- `configureDataSource()` — CellRegistration for all 4 cell types
- `applySnapshot()` — DateSection-based snapshot from MessageStore.sections
- `scrollViewDidScroll()` — infinite scroll UP detection (flipped)
- `scrollToBottom()` — scroll to index 0 (flipped)
- `prefetchItemsAt` — thumbnail prefetch
- `observeStore()` — Combine subscription to MessageStore.messagesDidChange

- [ ] **Step 2: Implement MessageListView (SwiftUI bridge)**

```swift
// apps/ios/Meeshy/Features/Main/Views/MessageListView.swift

import SwiftUI
import MeeshySDK

struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    let currentUserId: String
    var onNewMessagesBadge: ((Int) -> Void)?

    func makeUIViewController(context: Context) -> MessageListViewController {
        let vc = MessageListViewController(store: store, currentUserId: currentUserId)
        vc.onNewMessagesBadge = onNewMessagesBadge
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        // Updates flow through MessageStore observation, not through this bridge
    }
}
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift
git add apps/ios/Meeshy/Features/Main/Views/MessageListView.swift
git commit -m "feat(ios): add MessageListViewController with UICollectionView + DiffableDataSource"
```

---

## Task 8: Refactor ConversationSocketHandler — write to Actor

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`

This is a large refactoring. The socket handler currently writes to the ViewModel's `@Published` properties. After refactoring, ALL persistent state writes go to `MessagePersistenceActor`. Typing and non-persistent state use callbacks.

The 25 socket events documented in the spec Section 7 must all be handled. The key change: `delegate.messages[idx] = ...` becomes `try? await persistence.reconcileIncoming(...)`.

- [ ] **Step 1: Refactor — replace ViewModel writes with Actor writes**
- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift
git commit -m "refactor(ios): ConversationSocketHandler writes to Actor instead of ViewModel"
```

---

## Task 9: Refactor ConversationViewModel — orchestrator only

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`

Strip ConversationViewModel to orchestrator:
- Replace `@Published var messages: [Message]` with `let store: MessageStore`
- Replace in-memory `pendingServerIds` with GRDB `pending_ids`
- `send(text:)` → `persistence.insertOptimistic()` + REST + `persistence.applyEvent()`
- `onAppear()` → `store.startObserving()` + `socketHandler.arm()` + `gapDetector.activate()`
- ConversationView uses `MessageListView` instead of `LazyVStack`

- [ ] **Step 1: Refactor ConversationViewModel**
- [ ] **Step 2: Refactor ConversationView to use MessageListView**
- [ ] **Step 3: Build + run tests**
- [ ] **Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift
git commit -m "refactor(ios): ConversationViewModel as orchestrator + MessageListView UIKit bridge"
```

---

## Task 10: NotificationServiceExtension — pre-persist

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/NotificationService.swift`

- [ ] **Step 1: Add GRDB pre-persist in didReceive**

The NSE opens the same App Group DatabasePool and inserts the message BEFORE the app opens. Set `isEncrypted = false` after successful decryption.

- [ ] **Step 2: Build + test manually via push**
- [ ] **Step 3: Commit**

```bash
git add apps/ios/MeeshyNotificationExtension/NotificationService.swift
git commit -m "feat(ios): NotificationServiceExtension pre-persists messages to App Group DB"
```

---

## Task 11: Wire everything in DependencyContainer

**Files:**
- Modify: `apps/ios/Meeshy/Core/DependencyContainer.swift`

- [ ] **Step 1: Add RetryEngine, GapDetector, ThumbnailPrefetcher**

```swift
// Add to DependencyContainer
let retryEngine: RetryEngine
let gapDetector: ReconnectionGapDetector
let thumbnailPrefetcher: ThumbnailPrefetcher

// In init():
self.retryEngine = RetryEngine(persistence: messagePersistence, dbPool: pool, sender: MessageRESTSender())
self.gapDetector = ReconnectionGapDetector(persistence: messagePersistence, messageService: MessageService.shared)
self.thumbnailPrefetcher = ThumbnailPrefetcher.shared

// Start services
Task { await retryEngine.start() }
```

- [ ] **Step 2: Build**
- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Core/DependencyContainer.swift
git commit -m "feat(ios): wire RetryEngine + GapDetector + ThumbnailPrefetcher in DependencyContainer"
```

---

## Plan 2 Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | DecodedImageCache (NSCache) | 0 |
| 2 | ThumbnailPrefetcher (mmap + CGImageSource) | 0 |
| 3 | RetryEngine (reactive ValueObservation) | 2 |
| 4 | ReconnectionGapDetector (paginated sync) | 0 |
| 5 | DeliveryIndicatorView (UIKit) | 0 |
| 6 | Cells: Text, Media, Audio, System | 0 |
| 7 | MessageListViewController (UICollectionView) + bridge | 0 (build) |
| 8 | Refactor ConversationSocketHandler → Actor | existing tests |
| 9 | Refactor ConversationViewModel + ConversationView | existing tests |
| 10 | NotificationServiceExtension pre-persist | manual |
| 11 | Wire DependencyContainer | 0 (build) |

**Total: 11 tasks, ~2 new tests + existing test suite validation, ~2000 lines of production code**
