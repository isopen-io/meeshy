import Foundation

// MARK: - Feed Media Type
public enum FeedMediaType: String {
    case image, video, audio, document, location
}

// MARK: - Feed Media Model
public struct FeedMedia: Identifiable {
    public let id: String
    public let type: FeedMediaType
    public let url: String?
    public let thumbnailColor: String
    public var width: Int?
    public var height: Int?
    public var duration: Int?
    public var fileName: String?
    public var fileSize: String?
    public var pageCount: Int?
    public var locationName: String?
    public var latitude: Double?
    public var longitude: Double?

    public init(id: String = UUID().uuidString, type: FeedMediaType, url: String? = nil, thumbnailColor: String = "4ECDC4",
                width: Int? = nil, height: Int? = nil, duration: Int? = nil,
                fileName: String? = nil, fileSize: String? = nil, pageCount: Int? = nil,
                locationName: String? = nil, latitude: Double? = nil, longitude: Double? = nil) {
        self.id = id; self.type = type; self.url = url; self.thumbnailColor = thumbnailColor
        self.width = width; self.height = height; self.duration = duration
        self.fileName = fileName; self.fileSize = fileSize; self.pageCount = pageCount
        self.locationName = locationName; self.latitude = latitude; self.longitude = longitude
    }

    public static func image(color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func image(url: String, color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, url: url, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func video(duration: Int, color: String = "FF6B6B") -> FeedMedia {
        FeedMedia(type: .video, thumbnailColor: color, width: 1920, height: 1080, duration: duration)
    }

    public static func audio(duration: Int, color: String = "9B59B6") -> FeedMedia {
        FeedMedia(type: .audio, thumbnailColor: color, duration: duration)
    }

    public static func document(name: String, size: String, pages: Int, color: String = "F8B500") -> FeedMedia {
        FeedMedia(type: .document, thumbnailColor: color, fileName: name, fileSize: size, pageCount: pages)
    }

    public static func location(name: String, lat: Double, lon: Double, color: String = "2ECC71") -> FeedMedia {
        FeedMedia(type: .location, thumbnailColor: color, locationName: name, latitude: lat, longitude: lon)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        return String(format: "%d:%02d", d / 60, d % 60)
    }
}

// MARK: - Repost Content Model
public struct RepostContent: Identifiable {
    public let id: String
    public let author: String
    public let authorColor: String
    public let content: String
    public let timestamp: Date
    public var likes: Int

    public init(id: String = UUID().uuidString, author: String, content: String, timestamp: Date = Date(), likes: Int = 0) {
        self.id = id; self.author = author
        self.authorColor = DynamicColorGenerator.colorForName(author)
        self.content = content; self.timestamp = timestamp; self.likes = likes
    }
}

// MARK: - Feed Comment Model
public struct FeedComment: Identifiable {
    public let id: String
    public let author: String
    public let authorColor: String
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public var replies: Int

    public init(id: String = UUID().uuidString, author: String, content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0) {
        self.id = id; self.author = author
        self.authorColor = DynamicColorGenerator.colorForName(author)
        self.content = content; self.timestamp = timestamp; self.likes = likes; self.replies = replies
    }
}

// MARK: - Feed Post Model
public struct FeedPost: Identifiable {
    public let id: String
    public let author: String
    public let authorColor: String
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public var isLiked: Bool = false
    public var comments: [FeedComment] = []
    public var commentCount: Int = 0
    public var repost: RepostContent? = nil
    public var repostAuthor: String? = nil
    public var media: [FeedMedia] = []

    public var hasMedia: Bool { !media.isEmpty }
    public var mediaUrl: String? { media.first?.url }

    public init(id: String = UUID().uuidString, author: String, content: String, timestamp: Date = Date(), likes: Int = 0,
                comments: [FeedComment] = [], commentCount: Int? = nil, repost: RepostContent? = nil, repostAuthor: String? = nil,
                media: [FeedMedia] = [], mediaUrl: String? = nil) {
        self.id = id; self.author = author
        self.authorColor = DynamicColorGenerator.colorForName(author)
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.comments = comments; self.commentCount = commentCount ?? comments.count
        self.repost = repost; self.repostAuthor = repostAuthor
        if !media.isEmpty { self.media = media }
        else if mediaUrl != nil { self.media = [.image()] }
    }
}
