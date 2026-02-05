import SwiftUI

// MARK: - Feed Media Type
enum FeedMediaType: String {
    case image
    case video
    case audio
    case document
    case location
}

// MARK: - Feed Media Model
struct FeedMedia: Identifiable {
    let id: String
    let type: FeedMediaType
    let url: String?
    let thumbnailColor: String

    // Image/Video dimensions
    var width: Int?
    var height: Int?

    // Audio/Video duration in seconds
    var duration: Int?

    // Document info
    var fileName: String?
    var fileSize: String?
    var pageCount: Int?

    // Location info
    var locationName: String?
    var latitude: Double?
    var longitude: Double?

    init(id: String = UUID().uuidString, type: FeedMediaType, url: String? = nil, thumbnailColor: String = "4ECDC4",
         width: Int? = nil, height: Int? = nil, duration: Int? = nil,
         fileName: String? = nil, fileSize: String? = nil, pageCount: Int? = nil,
         locationName: String? = nil, latitude: Double? = nil, longitude: Double? = nil) {
        self.id = id
        self.type = type
        self.url = url
        self.thumbnailColor = thumbnailColor
        self.width = width
        self.height = height
        self.duration = duration
        self.fileName = fileName
        self.fileSize = fileSize
        self.pageCount = pageCount
        self.locationName = locationName
        self.latitude = latitude
        self.longitude = longitude
    }

    // Factory methods
    static func image(color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, thumbnailColor: color, width: 1200, height: 800)
    }

    static func video(duration: Int, color: String = "FF6B6B") -> FeedMedia {
        FeedMedia(type: .video, thumbnailColor: color, width: 1920, height: 1080, duration: duration)
    }

    static func audio(duration: Int, color: String = "9B59B6") -> FeedMedia {
        FeedMedia(type: .audio, thumbnailColor: color, duration: duration)
    }

    static func document(name: String, size: String, pages: Int, color: String = "F8B500") -> FeedMedia {
        FeedMedia(type: .document, thumbnailColor: color, fileName: name, fileSize: size, pageCount: pages)
    }

    static func location(name: String, lat: Double, lon: Double, color: String = "2ECC71") -> FeedMedia {
        FeedMedia(type: .location, thumbnailColor: color, locationName: name, latitude: lat, longitude: lon)
    }

    var durationFormatted: String? {
        guard let d = duration else { return nil }
        let minutes = d / 60
        let seconds = d % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Repost Content Model (separate struct to avoid recursion)
struct RepostContent: Identifiable {
    let id: String
    let author: String
    let authorColor: String
    let content: String
    let timestamp: Date
    var likes: Int

    init(id: String = UUID().uuidString, author: String, content: String, timestamp: Date = Date(), likes: Int = 0) {
        self.id = id
        self.author = author
        self.authorColor = DynamicColorGenerator.colorForName(author)
        self.content = content
        self.timestamp = timestamp
        self.likes = likes
    }
}

// MARK: - Feed Comment Model
struct FeedComment: Identifiable {
    let id: String
    let author: String
    let authorColor: String
    let content: String
    let timestamp: Date
    var likes: Int
    var replies: Int  // Number of replies to this comment

    init(id: String = UUID().uuidString, author: String, content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0) {
        self.id = id
        self.author = author
        self.authorColor = DynamicColorGenerator.colorForName(author)
        self.content = content
        self.timestamp = timestamp
        self.likes = likes
        self.replies = replies
    }
}

// MARK: - Feed Post Model
struct FeedPost: Identifiable {
    let id: String
    let author: String
    let authorColor: String
    let content: String
    let timestamp: Date
    var likes: Int
    var isLiked: Bool = false
    var comments: [FeedComment] = []
    var repost: RepostContent? = nil
    var repostAuthor: String? = nil
    var media: [FeedMedia] = []  // Support multiple media attachments

    var hasMedia: Bool { !media.isEmpty }
    var mediaUrl: String? { media.first?.url }  // Legacy compatibility

    init(id: String = UUID().uuidString, author: String, content: String, timestamp: Date = Date(), likes: Int = 0,
         comments: [FeedComment] = [], repost: RepostContent? = nil, repostAuthor: String? = nil,
         media: [FeedMedia] = [], mediaUrl: String? = nil) {
        self.id = id
        self.author = author
        self.authorColor = DynamicColorGenerator.colorForName(author)
        self.content = content
        self.timestamp = timestamp
        self.likes = likes
        self.comments = comments
        self.repost = repost
        self.repostAuthor = repostAuthor
        // Support both new media array and legacy mediaUrl
        if !media.isEmpty {
            self.media = media
        } else if mediaUrl != nil {
            self.media = [.image()]
        }
    }
}

// MARK: - Feed Sample Data (Global access for ThemedFeedOverlay)
struct FeedSampleData {
    // Helper to generate many comments with replies
    private static func generateComments(count: Int, baseTime: TimeInterval) -> [FeedComment] {
        let authors = ["Alice", "Bob", "Charlie", "Diana", "Emma", "François", "Gina", "Hugo", "Isabelle", "Jules",
                       "Karen", "Lucas", "Marie", "Nicolas", "Olivia", "Pierre", "Quentin", "Rachel", "Simon", "Thomas",
                       "Ulysse", "Valérie", "William", "Xavier", "Yuki", "Zoé", "Antoine", "Béatrice", "Cédric", "Delphine"]
        let contents = [
            "Tellement d'accord! 👏", "C'est exactement ça!", "Merci pour le partage 🙏", "Incroyable!", "J'adore 😍",
            "Top! 🔥", "Excellent post", "Je suis fan", "Bien vu!", "100% d'accord",
            "Génial!", "Super intéressant", "À partager absolument", "Wow!", "Magnifique 💯",
            "Bravo! 👍", "Je confirme", "Parfait", "Trop bien!", "Amazing!",
            "C'est ouf!", "Je valide", "👀👀👀", "🎉🎉", "Respect!",
            "Enfin quelqu'un qui dit vrai", "Merci!", "Je note", "Inspirant", "💪💪💪"
        ]
        return (0..<count).map { i in
            // Top comments get more likes and replies
            let isTopComment = i < 5
            let likesRange = isTopComment ? 200...500 : 1...200
            let repliesRange = isTopComment ? 5...50 : 0...10

            return FeedComment(
                author: authors[i % authors.count],
                content: contents[i % contents.count],
                timestamp: Date().addingTimeInterval(baseTime + Double(i * 60)),
                likes: Int.random(in: likesRange),
                replies: Int.random(in: repliesRange)
            )
        }
    }

    static let posts: [FeedPost] = [
        // === VIRAL POST WITH 200+ COMMENTS ===
        FeedPost(
            author: "TechInfluencer",
            content: "🚨 BREAKING: Apple vient d'annoncer l'iPhone 17 avec écran pliable! Première sortie prévue en septembre. Qui est hypé? 📱",
            timestamp: Date().addingTimeInterval(-120),
            likes: 45678,
            comments: generateComments(count: 247, baseTime: -100),
            media: [.video(duration: 180, color: "3498DB")]
        ),

        // === POST WITH 80+ COMMENTS - VIRAL REPOST ===
        FeedPost(
            author: "ViralNews",
            content: "Ceci doit être vu par tout le monde! 🌍",
            timestamp: Date().addingTimeInterval(-300),
            likes: 23456,
            comments: generateComments(count: 89, baseTime: -200),
            repost: RepostContent(
                author: "NASA",
                content: "🌌 Nous avons détecté des signaux radio provenant d'une exoplanète à 42 années-lumière. Les analyses sont en cours...",
                timestamp: Date().addingTimeInterval(-600),
                likes: 156789
            ),
            repostAuthor: "ViralNews"
        ),

        // === POST WITH 50+ COMMENTS ===
        FeedPost(
            author: "FitnessCoach",
            content: "New workout routine dropping! 💪 15 minutes full body HIIT that you can do anywhere. No equipment needed!",
            timestamp: Date().addingTimeInterval(-500),
            likes: 8934,
            comments: generateComments(count: 56, baseTime: -400),
            media: [.video(duration: 912, color: "E74C3C")]
        ),

        // === MULTIPLE REPOSTS - CHAIN VIRAL ===
        FeedPost(
            author: "StartupFounder",
            content: "Thread essentiel pour tous les entrepreneurs 👇",
            timestamp: Date().addingTimeInterval(-700),
            likes: 12890,
            comments: generateComments(count: 34, baseTime: -600),
            repost: RepostContent(
                author: "YCombinator",
                content: "The 10 most common mistakes we see in YC applications. A thread 🧵",
                timestamp: Date().addingTimeInterval(-1200),
                likes: 89234
            ),
            repostAuthor: "StartupFounder"
        ),

        // === POST WITH 30+ COMMENTS - IMAGES ===
        FeedPost(
            author: "TravelBlogger",
            content: "Weekend escape to Provence 🌻 The lavender fields are absolutely breathtaking this time of year!",
            timestamp: Date().addingTimeInterval(-900),
            likes: 5678,
            comments: generateComments(count: 38, baseTime: -800),
            media: [
                .image(color: "9B59B6"),
                .image(color: "8E44AD"),
                .image(color: "6C3483")
            ]
        ),

        // === ANOTHER VIRAL REPOST ===
        FeedPost(
            author: "TechReporter",
            content: "🔥 This is HUGE for the industry!",
            timestamp: Date().addingTimeInterval(-1100),
            likes: 34567,
            comments: generateComments(count: 123, baseTime: -1000),
            repost: RepostContent(
                author: "OpenAI",
                content: "Introducing GPT-5: Our most capable model yet. Available to all ChatGPT Plus users starting today.",
                timestamp: Date().addingTimeInterval(-1500),
                likes: 234567
            ),
            repostAuthor: "TechReporter"
        ),

        // === POST WITH AUDIO - 25+ COMMENTS ===
        FeedPost(
            author: "PodcastHost",
            content: "🎙️ Nouvel épisode disponible! On parle de l'avenir de l'IA et son impact sur nos métiers.",
            timestamp: Date().addingTimeInterval(-1300),
            likes: 2345,
            comments: generateComments(count: 28, baseTime: -1200),
            media: [.audio(duration: 2847, color: "9B59B6")]
        ),

        // === DOCUMENT POST WITH REPOST ===
        FeedPost(
            author: "InvestorDaily",
            content: "📊 Must-read for anyone in finance",
            timestamp: Date().addingTimeInterval(-1500),
            likes: 8765,
            comments: generateComments(count: 45, baseTime: -1400),
            repost: RepostContent(
                author: "StartupMentor",
                content: "📄 Je partage mon guide complet pour lever des fonds en 2025. 50 pages de conseils gratuits!",
                timestamp: Date().addingTimeInterval(-2000),
                likes: 12345
            ),
            repostAuthor: "InvestorDaily",
            media: [.document(name: "Guide_Levée_Fonds_2025.pdf", size: "4.2 MB", pages: 52, color: "F8B500")]
        ),

        // === LOCATION POST WITH MANY COMMENTS ===
        FeedPost(
            author: "FoodCritic",
            content: "📍 Découverte incroyable! Ce petit restaurant caché dans le Marais sert les meilleures pâtes fraîches de Paris!",
            timestamp: Date().addingTimeInterval(-1700),
            likes: 4567,
            comments: generateComments(count: 67, baseTime: -1600),
            media: [.location(name: "Trattoria da Luigi - Le Marais", lat: 48.8566, lon: 2.3522, color: "2ECC71")]
        ),

        // === MUSIC PREVIEW - VIRAL ===
        FeedPost(
            author: "MusicProducer",
            content: "🎵 Preview exclusive du nouveau track! Drop prévu ce vendredi 🔥",
            timestamp: Date().addingTimeInterval(-1900),
            likes: 15678,
            comments: generateComments(count: 156, baseTime: -1800),
            media: [.audio(duration: 45, color: "E91E63")]
        ),

        // === SIMPLE REPOST ===
        FeedPost(
            author: "David",
            content: "This is exactly what we needed! 🙌",
            timestamp: Date().addingTimeInterval(-2100),
            likes: 234,
            comments: generateComments(count: 12, baseTime: -2000),
            repost: RepostContent(
                author: "Meeshy Team",
                content: "Welcome to the new V2 design! 🚀 We've completely redesigned the experience.",
                timestamp: Date().addingTimeInterval(-3600),
                likes: 4567
            ),
            repostAuthor: "David"
        ),

        // === ANNOUNCEMENT WITH 100+ COMMENTS ===
        FeedPost(
            author: "Meeshy Team",
            content: "🎉 1 MILLION d'utilisateurs! Merci à vous tous pour votre soutien incroyable. Ce n'est que le début de l'aventure!",
            timestamp: Date().addingTimeInterval(-2300),
            likes: 67890,
            comments: generateComments(count: 189, baseTime: -2200),
            media: [.image(color: "4ECDC4")]
        ),

        // === POST WITHOUT COMMENTS ===
        FeedPost(
            author: "Michael",
            content: "The new UI is absolutely stunning! 😍",
            timestamp: Date().addingTimeInterval(-2500),
            likes: 198
        ),

        // === REPOST WITHOUT COMMENTS ===
        FeedPost(
            author: "Sophie",
            content: "👀",
            timestamp: Date().addingTimeInterval(-2700),
            likes: 45,
            repost: RepostContent(
                author: "ElonMusk",
                content: "Something big is coming...",
                timestamp: Date().addingTimeInterval(-3000),
                likes: 567890
            ),
            repostAuthor: "Sophie"
        )
    ]
}

// MARK: - Feed View
struct FeedView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @State private var searchText = ""
    @State private var showComposer = false
    @FocusState private var isComposerFocused: Bool
    @State private var composerText = ""
    @State private var expandedComments: Set<String> = []

    // Sample posts with comments and reposts
    private var posts: [FeedPost] {
        [
            // === POSTS WITH MEDIA TYPES (NEWEST - AT TOP) ===

            // Post with video
            FeedPost(
                author: "FitnessCoach",
                content: "New workout routine dropping! 💪 15 minutes full body HIIT that you can do anywhere. No equipment needed!",
                timestamp: Date().addingTimeInterval(-300),
                likes: 1245,
                comments: [
                    FeedComment(author: "GymRat", content: "Can't wait to try this tomorrow morning! 🔥", timestamp: Date().addingTimeInterval(-100), likes: 56, replies: 8),
                    FeedComment(author: "Beginner", content: "Is this suitable for beginners?", timestamp: Date().addingTimeInterval(-150), likes: 12, replies: 3),
                    FeedComment(author: "FitnessCoach", content: "@Beginner Absolutely! Start slow and build up 😊", timestamp: Date().addingTimeInterval(-200), likes: 45, replies: 0)
                ],
                media: [.video(duration: 912, color: "E74C3C")]
            ),

            // Post with multiple images (gallery)
            FeedPost(
                author: "TravelBlogger",
                content: "Weekend escape to Provence 🌻 The lavender fields are absolutely breathtaking this time of year!",
                timestamp: Date().addingTimeInterval(-600),
                likes: 892,
                comments: [
                    FeedComment(author: "Wanderlust", content: "Adding this to my bucket list! 📝", timestamp: Date().addingTimeInterval(-400), likes: 34, replies: 5),
                    FeedComment(author: "LocalExpert", content: "Try visiting Valensole for the best views", timestamp: Date().addingTimeInterval(-500), likes: 28, replies: 12)
                ],
                media: [
                    .image(color: "9B59B6"),
                    .image(color: "8E44AD"),
                    .image(color: "6C3483")
                ]
            ),

            // Post with audio message
            FeedPost(
                author: "PodcastHost",
                content: "🎙️ Nouvel épisode disponible! On parle de l'avenir de l'IA et son impact sur nos métiers. Une discussion passionnante avec des experts du domaine.",
                timestamp: Date().addingTimeInterval(-900),
                likes: 678,
                comments: [
                    FeedComment(author: "TechEnthusiast", content: "Excellent épisode! J'ai appris beaucoup de choses", timestamp: Date().addingTimeInterval(-700), likes: 42, replies: 6),
                    FeedComment(author: "AIResearcher", content: "Points très pertinents sur l'éthique de l'IA", timestamp: Date().addingTimeInterval(-800), likes: 38, replies: 15)
                ],
                media: [.audio(duration: 2847, color: "9B59B6")]
            ),

            // Post with PDF document
            FeedPost(
                author: "StartupMentor",
                content: "📄 Je partage mon guide complet pour lever des fonds en 2025. 50 pages de conseils, templates et exemples concrets. Téléchargement gratuit!",
                timestamp: Date().addingTimeInterval(-1200),
                likes: 2341,
                comments: [
                    FeedComment(author: "Entrepreneur", content: "Merci pour ce partage! Exactement ce qu'il me fallait", timestamp: Date().addingTimeInterval(-1000), likes: 89, replies: 23),
                    FeedComment(author: "Investor", content: "Très complet et bien structuré. Je recommande 👍", timestamp: Date().addingTimeInterval(-1100), likes: 67, replies: 8)
                ],
                media: [.document(name: "Guide_Levée_Fonds_2025.pdf", size: "4.2 MB", pages: 52, color: "F8B500")]
            ),

            // Post with geographic location
            FeedPost(
                author: "FoodCritic",
                content: "📍 Découverte incroyable! Ce petit restaurant caché dans le Marais sert les meilleures pâtes fraîches de Paris. File d'attente garantie mais ça vaut le coup!",
                timestamp: Date().addingTimeInterval(-1500),
                likes: 1567,
                comments: [
                    FeedComment(author: "Foodie", content: "J'y suis allée hier grâce à ton post, c'était délicieux! 🍝", timestamp: Date().addingTimeInterval(-1300), likes: 78, replies: 19),
                    FeedComment(author: "LocalResident", content: "Enfin quelqu'un qui en parle! C'est mon secret depuis 3 ans", timestamp: Date().addingTimeInterval(-1400), likes: 56, replies: 7)
                ],
                media: [.location(name: "Trattoria da Luigi - Le Marais", lat: 48.8566, lon: 2.3522, color: "2ECC71")]
            ),

            // Post with voice memo (short audio)
            FeedPost(
                author: "MusicProducer",
                content: "🎵 Preview exclusive du nouveau track! Dites-moi ce que vous en pensez. Drop prévu ce vendredi 🔥",
                timestamp: Date().addingTimeInterval(-1800),
                likes: 4567,
                comments: [
                    FeedComment(author: "MusicFan", content: "FIRE 🔥🔥🔥 J'ai hâte!", timestamp: Date().addingTimeInterval(-1600), likes: 234, replies: 42),
                    FeedComment(author: "DJ", content: "Le drop est insane! Tu utilises quel synth?", timestamp: Date().addingTimeInterval(-1700), likes: 156, replies: 28)
                ],
                media: [.audio(duration: 45, color: "E91E63")]
            ),

            // === ORIGINAL POSTS ===

            // Post with many comments
            FeedPost(
                author: "Meeshy Team",
                content: "Welcome to the new V2 design! 🚀 We've completely redesigned the experience with glass effects, dynamic colors, and smooth animations.",
                timestamp: Date().addingTimeInterval(-2100),
                likes: 230,
                comments: [
                    FeedComment(author: "Sarah", content: "Love the new glass effect! 😍", timestamp: Date().addingTimeInterval(-60), likes: 12, replies: 4),
                    FeedComment(author: "Alex", content: "The animations are so smooth", timestamp: Date().addingTimeInterval(-120), likes: 8, replies: 2),
                    FeedComment(author: "Emma", content: "Can't wait to see more updates!", timestamp: Date().addingTimeInterval(-180), likes: 5, replies: 1),
                    FeedComment(author: "John", content: "Great work team!", timestamp: Date().addingTimeInterval(-240), likes: 3, replies: 0),
                    FeedComment(author: "Lisa", content: "This is amazing 🎉", timestamp: Date().addingTimeInterval(-300), likes: 2, replies: 0),
                    FeedComment(author: "Marc", content: "Finally! Been waiting for this", timestamp: Date().addingTimeInterval(-360), likes: 4, replies: 1),
                    FeedComment(author: "Julie", content: "Le design est incroyable 🔥", timestamp: Date().addingTimeInterval(-420), likes: 7, replies: 3)
                ]
            ),

            // Repost without comments
            FeedPost(
                author: "David",
                content: "This is exactly what we needed! 🙌",
                timestamp: Date().addingTimeInterval(-1800),
                likes: 89,
                comments: [],
                repost: RepostContent(
                    author: "Meeshy Team",
                    content: "Welcome to the new V2 design! 🚀 We've completely redesigned the experience.",
                    timestamp: Date().addingTimeInterval(-3600),
                    likes: 230
                ),
                repostAuthor: "David"
            ),

            // Repost WITH comments - viral discussion
            FeedPost(
                author: "Marie",
                content: "Thread important à lire 👇 Tout le monde devrait voir ça",
                timestamp: Date().addingTimeInterval(-2400),
                likes: 456,
                comments: [
                    FeedComment(author: "Thomas", content: "Merci pour le partage! C'est exactement ce que je cherchais", timestamp: Date().addingTimeInterval(-1200), likes: 34, replies: 9),
                    FeedComment(author: "Claire", content: "Je suis complètement d'accord avec ce point de vue", timestamp: Date().addingTimeInterval(-1800), likes: 28, replies: 5),
                    FeedComment(author: "Antoine", content: "À partager absolument 🔄", timestamp: Date().addingTimeInterval(-2000), likes: 15, replies: 2),
                    FeedComment(author: "Sophie", content: "Intéressant! Je n'avais jamais vu les choses sous cet angle", timestamp: Date().addingTimeInterval(-2200), likes: 12, replies: 3),
                    FeedComment(author: "Lucas", content: "💯💯💯", timestamp: Date().addingTimeInterval(-2300), likes: 8, replies: 0)
                ],
                repost: RepostContent(
                    author: "Digital Trends",
                    content: "Les 10 tendances tech qui vont révolutionner 2025 : IA générative, réalité mixte, blockchain décentralisée... Un thread complet sur l'avenir de la technologie.",
                    timestamp: Date().addingTimeInterval(-7200),
                    likes: 3420
                ),
                repostAuthor: "Marie"
            ),

            // Regular post with comments
            FeedPost(
                author: "Emma",
                content: "Just shipped a new feature! Check it out 🎉 The collaboration tools are now live and ready for your teams.",
                timestamp: Date().addingTimeInterval(-3600),
                likes: 156,
                comments: [
                    FeedComment(author: "Michael", content: "Congrats! 🥳", timestamp: Date().addingTimeInterval(-1800), likes: 15, replies: 2),
                    FeedComment(author: "Anna", content: "Already tested it, works great!", timestamp: Date().addingTimeInterval(-2400), likes: 9, replies: 4)
                ]
            ),

            // Repost of a funny post with reactions
            FeedPost(
                author: "Kevin",
                content: "😂😂😂 Je suis mort de rire",
                timestamp: Date().addingTimeInterval(-4500),
                likes: 892,
                comments: [
                    FeedComment(author: "Laura", content: "AHAHA tellement vrai! 🤣", timestamp: Date().addingTimeInterval(-3000), likes: 67, replies: 18),
                    FeedComment(author: "Pierre", content: "Je tag @tous mes potes devs", timestamp: Date().addingTimeInterval(-3200), likes: 45, replies: 12),
                    FeedComment(author: "Camille", content: "C'est moi tous les lundis matin", timestamp: Date().addingTimeInterval(-3500), likes: 38, replies: 8),
                    FeedComment(author: "Hugo", content: "OMG same 💀", timestamp: Date().addingTimeInterval(-3800), likes: 22, replies: 3),
                    FeedComment(author: "Léa", content: "Le pire c'est que c'est vrai", timestamp: Date().addingTimeInterval(-4000), likes: 19, replies: 5),
                    FeedComment(author: "Nathan", content: "Je me sens attaqué personnellement", timestamp: Date().addingTimeInterval(-4200), likes: 31, replies: 7)
                ],
                repost: RepostContent(
                    author: "Dev Humor",
                    content: "Quand tu pushes en prod le vendredi à 17h59 et que tu fermes ton laptop sans regarder les logs 🏃‍♂️💨",
                    timestamp: Date().addingTimeInterval(-10800),
                    likes: 15600
                ),
                repostAuthor: "Kevin"
            ),

            // Simple post with comments
            FeedPost(
                author: "Sophie",
                content: "Coffee meetup tomorrow at 3pm! Who's in? ☕",
                timestamp: Date().addingTimeInterval(-7200),
                likes: 45,
                comments: [
                    FeedComment(author: "Lisa", content: "Count me in!", timestamp: Date().addingTimeInterval(-3600), likes: 3, replies: 1),
                    FeedComment(author: "John", content: "I'll be there 👋", timestamp: Date().addingTimeInterval(-5400), likes: 2, replies: 0),
                    FeedComment(author: "Alex", content: "Same here!", timestamp: Date().addingTimeInterval(-6000), likes: 1, replies: 0)
                ]
            ),

            // Simple post without comments
            FeedPost(
                author: "Michael",
                content: "The new UI is absolutely stunning! 😍",
                timestamp: Date().addingTimeInterval(-10800),
                likes: 198
            ),

            // Repost with deep discussion
            FeedPost(
                author: "Anna",
                content: "Great thoughts on the future of messaging apps!",
                timestamp: Date().addingTimeInterval(-14400),
                likes: 67,
                comments: [
                    FeedComment(author: "David", content: "Totally agree with this perspective", timestamp: Date().addingTimeInterval(-12000), likes: 8, replies: 2),
                    FeedComment(author: "Emma", content: "This is why I love Meeshy!", timestamp: Date().addingTimeInterval(-13000), likes: 6, replies: 1)
                ],
                repost: RepostContent(
                    author: "Tech Insider",
                    content: "The future of messaging is about bringing communities together, not just individuals. We see a shift towards more collaborative and contextual conversations.",
                    timestamp: Date().addingTimeInterval(-18000),
                    likes: 1250
                ),
                repostAuthor: "Anna"
            ),

            // Repost of announcement with celebration
            FeedPost(
                author: "StartupFrance",
                content: "Félicitations à toute l'équipe! 🎊🚀",
                timestamp: Date().addingTimeInterval(-16000),
                likes: 324,
                comments: [
                    FeedComment(author: "Investor_One", content: "Well deserved! Amazing growth 📈", timestamp: Date().addingTimeInterval(-14000), likes: 45, replies: 11),
                    FeedComment(author: "TechReporter", content: "Interview exclusive bientôt?", timestamp: Date().addingTimeInterval(-14500), likes: 12, replies: 3),
                    FeedComment(author: "FuturFounder", content: "Inspirant! 🙌", timestamp: Date().addingTimeInterval(-15000), likes: 8, replies: 0),
                    FeedComment(author: "DevCommunity", content: "La French Tech qui brille!", timestamp: Date().addingTimeInterval(-15500), likes: 23, replies: 6)
                ],
                repost: RepostContent(
                    author: "Meeshy Official",
                    content: "🎉 BREAKING: Meeshy vient de lever 50M€ en Série B! Merci à tous nos utilisateurs et à notre incroyable communauté. L'aventure ne fait que commencer!",
                    timestamp: Date().addingTimeInterval(-20000),
                    likes: 8750
                ),
                repostAuthor: "StartupFrance"
            ),

            // Post with image reference and many comments
            FeedPost(
                author: "PhotoArtist",
                content: "Sunset vibes from my balcony tonight 🌅 Paris is magical at this hour",
                timestamp: Date().addingTimeInterval(-21600),
                likes: 567,
                comments: [
                    FeedComment(author: "Traveler", content: "Stunning! What camera do you use?", timestamp: Date().addingTimeInterval(-18000), likes: 23, replies: 5),
                    FeedComment(author: "LocalGuide", content: "Best view in the city!", timestamp: Date().addingTimeInterval(-19000), likes: 15, replies: 2),
                    FeedComment(author: "NightOwl", content: "I need to visit Paris 😍", timestamp: Date().addingTimeInterval(-20000), likes: 11, replies: 3)
                ],
                media: [.image(color: "FF6B6B")]
            )
        ]
    }

    var body: some View {
        ZStack {
            // Themed background
            theme.backgroundGradient.ignoresSafeArea()

            // Ambient orbs
            ForEach(0..<theme.ambientOrbs.count, id: \.self) { i in
                let orb = theme.ambientOrbs[i]
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size / 3)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }

            VStack(spacing: 0) {
                feedScrollView
            }

            // Full-screen composer overlay
            if showComposer {
                composerOverlay
            }
        }
    }

    // MARK: - Composer Placeholder
    private var composerPlaceholder: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)

                Text("M")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
            }

            // Text input placeholder
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showComposer = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        isComposerFocused = true
                    }
                }
                HapticFeedback.light()
            }) {
                HStack {
                    Text("Partager quelque chose avec le monde...")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(theme.inputBorder, lineWidth: 1)
                        )
                )
            }
            .buttonStyle(PlainButtonStyle())

            // Add content button (+)
            Button(action: {
                // TODO: Show attachment picker
                HapticFeedback.light()
            }) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 40, height: 40)
                        .shadow(color: Color(hex: "4ECDC4").opacity(0.4), radius: 8, y: 4)

                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: "4ECDC4"))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(theme.border(tint: "4ECDC4", intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Feed Scroll View
    private var feedScrollView: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 16) {
                // Top spacer for floating buttons
                Spacer().frame(height: 100)

                // Composer placeholder
                composerPlaceholder
                    .padding(.bottom, 8)

                // Posts
                ForEach(posts) { post in
                    FeedPostCard(
                        post: post,
                        isCommentsExpanded: expandedComments.contains(post.id),
                        onToggleComments: {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                if expandedComments.contains(post.id) {
                                    expandedComments.remove(post.id)
                                } else {
                                    expandedComments.insert(post.id)
                                }
                            }
                            HapticFeedback.light()
                        }
                    )
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 100)
        }
    }

    // MARK: - Composer Overlay
    private var composerOverlay: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = false
                        isComposerFocused = false
                    }
                }

            // Composer card
            VStack(spacing: 0) {
                // Header
                HStack {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showComposer = false
                            isComposerFocused = false
                            composerText = ""
                        }
                    } label: {
                        Text("Annuler")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }

                    Spacer()

                    Text("Nouveau post")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Button {
                        // TODO: Post content
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showComposer = false
                            isComposerFocused = false
                            composerText = ""
                        }
                        HapticFeedback.success()
                    } label: {
                        Text("Publier")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(composerText.isEmpty ? theme.textMuted : Color(hex: "4ECDC4"))
                    }
                    .disabled(composerText.isEmpty)
                }
                .padding(16)
                .background(theme.backgroundSecondary)

                Divider().background(theme.inputBorder)

                // User row
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 40, height: 40)

                        Text("M")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Moi")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)

                        Text("Public")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                // Text editor
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text("Qu'avez-vous en tête ?")
                            .font(.system(size: 17))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }

                    TextEditor(text: $composerText)
                        .focused($isComposerFocused)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(theme.textPrimary)
                        .font(.system(size: 17))
                        .frame(minHeight: 150)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }

                Spacer()

                // Toolbar
                HStack(spacing: 24) {
                    ForEach([
                        ("photo.fill", "4ECDC4"),
                        ("camera.fill", "FF6B6B"),
                        ("face.smiling.fill", "F8B500"),
                        ("link", "9B59B6"),
                        ("location.fill", "2ECC71")
                    ], id: \.0) { icon, color in
                        Button {} label: {
                            Image(systemName: icon)
                                .font(.system(size: 20))
                                .foregroundColor(Color(hex: color))
                        }
                    }

                    Spacer()
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
            .background(theme.backgroundPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(theme.border(tint: "4ECDC4", intensity: 0.3), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 80)
            .shadow(color: Color(hex: "4ECDC4").opacity(0.2), radius: 30, y: 20)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
        .zIndex(200)
    }
}

// MARK: - Feed Post Card
struct FeedPostCard: View {
    let post: FeedPost
    var isCommentsExpanded: Bool = false
    var onToggleComments: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isLiked = false
    @State private var showCommentsSheet = false

    private var accentColor: String { post.authorColor }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Main content
            VStack(alignment: .leading, spacing: 12) {
                // Author header
                authorHeader

                // Post content
                Text(post.content)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(nil)

                // Media preview
                if post.hasMedia {
                    mediaPreview
                }

                // Reposted content
                if let repost = post.repost {
                    repostView(repost)
                }

                // Actions bar
                actionsBar
            }
            .padding(16)

            // Comments preview (compact)
            if !post.comments.isEmpty {
                commentsPreview
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(theme.border(tint: accentColor, intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .sheet(isPresented: $showCommentsSheet) {
            CommentsSheetView(post: post, accentColor: accentColor)
        }
    }

    // MARK: - Author Header
    private var authorHeader: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)

                Text(String(post.author.prefix(1)))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)

            VStack(alignment: .leading, spacing: 2) {
                // Author name with repost indicator
                HStack(spacing: 6) {
                    Text(post.author)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    // Repost indicator inline
                    if post.repostAuthor != nil {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.system(size: 10))
                            Text("a republié")
                                .font(.system(size: 11))
                        }
                        .foregroundColor(theme.textMuted)
                    }
                }

                Text(timeAgo(from: post.timestamp))
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16))
                    .foregroundColor(theme.textMuted)
                    .padding(8)
            }
        }
    }

    // MARK: - Repost View
    private func repostView(_ repost: RepostContent) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Original author
            HStack(spacing: 8) {
                Circle()
                    .fill(Color(hex: repost.authorColor).opacity(0.3))
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(String(repost.author.prefix(1)))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: repost.authorColor))
                    )

                Text(repost.author)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: repost.authorColor))

                Text("·")
                    .foregroundColor(theme.textMuted)

                Text(timeAgo(from: repost.timestamp))
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            // Original content
            Text(repost.content)
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)
                .lineLimit(4)

            // Original stats
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 10))
                    Text("\(repost.likes)")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(Color(hex: repost.authorColor).opacity(0.7))
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color(hex: repost.authorColor).opacity(0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Media Preview
    @ViewBuilder
    private var mediaPreview: some View {
        let mediaList = post.media
        let count = mediaList.count
        let spacing: CGFloat = 3

        if count == 1, let media = mediaList.first {
            singleMediaView(media)
                .frame(height: mediaIsCompact(media) ? nil : 220)
        } else if count == 2 {
            // Two images side by side - equal width
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                galleryImageView(mediaList[1])
            }
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 3 {
            // One large left, two stacked right
            HStack(spacing: spacing) {
                galleryImageView(mediaList[0])
                    .aspectRatio(0.75, contentMode: .fill)

                VStack(spacing: spacing) {
                    galleryImageView(mediaList[1])
                    galleryImageView(mediaList[2])
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count == 4 {
            // 2x2 grid
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                    galleryImageView(mediaList[1])
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                    galleryImageView(mediaList[3])
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else if count >= 5 {
            // First row: 2 images, Second row: 3 images with +N overlay
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[0])
                    galleryImageView(mediaList[1])
                }
                HStack(spacing: spacing) {
                    galleryImageView(mediaList[2])
                    galleryImageView(mediaList[3])
                    ZStack {
                        galleryImageView(mediaList[4])
                        if count > 5 {
                            Color.black.opacity(0.6)
                            Text("+\(count - 5)")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // Gallery-specific image view (no individual rounding)
    private func galleryImageView(_ media: FeedMedia) -> some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Type-specific overlay
            switch media.type {
            case .image:
                Image(systemName: "photo.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white.opacity(0.4))
            case .video:
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.3))
                            .frame(width: 44, height: 44)
                        Image(systemName: "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                    if let duration = media.durationFormatted {
                        Text(duration)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }
                }
            default:
                EmptyView()
            }
        }
        .clipped()
    }

    // Check if media should be compact (audio, document, location)
    private func mediaIsCompact(_ media: FeedMedia) -> Bool {
        switch media.type {
        case .audio, .document, .location:
            return true
        default:
            return false
        }
    }

    @ViewBuilder
    private func singleMediaView(_ media: FeedMedia) -> some View {
        switch media.type {
        case .image:
            imageMediaView(media)
        case .video:
            videoMediaView(media)
        case .audio:
            audioMediaView(media)
        case .document:
            documentMediaView(media)
        case .location:
            locationMediaView(media)
        }
    }

    private func imageMediaView(_ media: FeedMedia) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Image(systemName: "photo.fill")
                .font(.system(size: 32))
                .foregroundColor(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func videoMediaView(_ media: FeedMedia) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.3))
                        .frame(width: 56, height: 56)

                    Image(systemName: "play.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.white)
                }

                if let duration = media.durationFormatted {
                    Text(duration)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.black.opacity(0.5)))
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 180)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func audioMediaView(_ media: FeedMedia) -> some View {
        HStack(spacing: 14) {
            // Play button
            ZStack {
                Circle()
                    .fill(Color(hex: media.thumbnailColor))
                    .frame(width: 48, height: 48)

                Image(systemName: "play.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.white)
            }

            // Waveform placeholder
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 2) {
                    ForEach(0..<25, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color(hex: media.thumbnailColor).opacity(0.6))
                            .frame(width: 3, height: CGFloat.random(in: 8...24))
                    }
                }

                if let duration = media.durationFormatted {
                    Text(duration)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1)
                )
        )
    }

    private func documentMediaView(_ media: FeedMedia) -> some View {
        HStack(spacing: 14) {
            // Document icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                    .frame(width: 48, height: 56)

                Image(systemName: "doc.fill")
                    .font(.system(size: 24))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }

            // Document info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.fileName ?? "Document")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let size = media.fileSize {
                        Text(size)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }

                    if let pages = media.pageCount {
                        Text("•")
                            .foregroundColor(theme.textMuted)
                        Text("\(pages) pages")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }
                }
            }

            Spacer()

            // Download button
            Image(systemName: "arrow.down.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: media.thumbnailColor))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1)
                )
        )
    }

    private func locationMediaView(_ media: FeedMedia) -> some View {
        HStack(spacing: 14) {
            // Map placeholder
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: media.thumbnailColor).opacity(0.3), Color(hex: media.thumbnailColor).opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 64, height: 64)

                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }

            // Location info
            VStack(alignment: .leading, spacing: 4) {
                Text(media.locationName ?? "Location")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(2)

                if let lat = media.latitude, let lon = media.longitude {
                    Text(String(format: "%.4f, %.4f", lat, lon))
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            // Open in maps
            Image(systemName: "arrow.up.right.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: media.thumbnailColor))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Actions Bar
    private var actionsBar: some View {
        HStack(spacing: 0) {
            // Like
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    isLiked.toggle()
                }
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .font(.system(size: 18))
                        .foregroundColor(isLiked ? Color(hex: "FF6B6B") : theme.textSecondary)
                        .scaleEffect(isLiked ? 1.1 : 1.0)

                    Text("\(post.likes + (isLiked ? 1 : 0))")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(isLiked ? Color(hex: "FF6B6B") : theme.textSecondary)
                }
            }

            Spacer()

            // Comment
            Button {
                showCommentsSheet = true
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.right")
                        .font(.system(size: 17))

                    if !post.comments.isEmpty {
                        Text("\(post.comments.count)")
                            .font(.system(size: 13, weight: .medium))
                    }
                }
                .foregroundColor(showCommentsSheet ? Color(hex: accentColor) : theme.textSecondary)
            }

            Spacer()

            // Repost
            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "arrow.2.squarepath")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            // Bookmark
            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "bookmark")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            // Share
            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Comments Preview (Top 3 Comments)
    private var commentsPreview: some View {
        Button {
            showCommentsSheet = true
            HapticFeedback.light()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // Divider
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.5))
                    .frame(height: 1)
                    .padding(.horizontal, 16)

                VStack(alignment: .leading, spacing: 12) {
                    // Top 3 comments sorted by likes
                    let topComments = post.comments.sorted { $0.likes > $1.likes }.prefix(3)

                    ForEach(Array(topComments.enumerated()), id: \.element.id) { index, comment in
                        topCommentRow(comment: comment, isLast: index == topComments.count - 1)
                    }

                    // "See all comments" link
                    HStack(spacing: 8) {
                        // Stacked avatars of remaining commenters
                        if post.comments.count > 3 {
                            HStack(spacing: -6) {
                                ForEach(Array(post.comments.dropFirst(3).prefix(3).enumerated()), id: \.element.id) { index, comment in
                                    Circle()
                                        .fill(Color(hex: comment.authorColor))
                                        .frame(width: 20, height: 20)
                                        .overlay(
                                            Text(String(comment.author.prefix(1)))
                                                .font(.system(size: 8, weight: .bold))
                                                .foregroundColor(.white)
                                        )
                                        .overlay(
                                            Circle()
                                                .stroke(theme.backgroundPrimary, lineWidth: 1.5)
                                        )
                                        .zIndex(Double(3 - index))
                                }
                            }
                        }

                        Text("Voir les \(post.comments.count) commentaires")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor))

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, 4)
                }
                .padding(14)
            }
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Top Comment Row
    private func topCommentRow(comment: FeedComment, isLast: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                // Avatar
                Circle()
                    .fill(Color(hex: comment.authorColor))
                    .frame(width: 32, height: 32)
                    .overlay(
                        Text(String(comment.author.prefix(1)))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    // Author name
                    Text(comment.author)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))

                    // Content
                    Text(comment.content)
                        .font(.system(size: 14))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(2)

                    // Stats row: likes and replies
                    HStack(spacing: 16) {
                        // Likes
                        HStack(spacing: 4) {
                            Image(systemName: "heart.fill")
                                .font(.system(size: 11))
                                .foregroundColor(Color(hex: "FF6B6B"))
                            Text("\(comment.likes)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }

                        // Replies
                        if comment.replies > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(Color(hex: accentColor).opacity(0.7))
                                Text("\(comment.replies) réponses")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Timestamp
                        Text(timeAgo(from: comment.timestamp))
                            .font(.system(size: 10))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, 2)
                }
            }

            // Separator (except for last item)
            if !isLast {
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.3))
                    .frame(height: 1)
                    .padding(.leading, 42)
                    .padding(.top, 10)
            }
        }
    }

    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Comments Sheet View
struct CommentsSheetView: View {
    let post: FeedPost
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @State private var commentText = ""
    @State private var replyingTo: FeedComment? = nil
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Comments list
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            // Post preview at top
                            postPreview
                                .padding(.bottom, 16)

                            // Comments
                            ForEach(post.comments) { comment in
                                CommentRowView(
                                    comment: comment,
                                    accentColor: accentColor,
                                    onReply: {
                                        replyingTo = comment
                                        isComposerFocused = true
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }

                    // Composer
                    commentComposer
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("\(post.comments.count) commentaires")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }

                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(theme.inputBackground))
                    }
                }
            }
        }
        .presentationDetents([.large, .medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Post Preview
    private var postPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Author
            HStack(spacing: 10) {
                Circle()
                    .fill(Color(hex: post.authorColor))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(String(post.author.prefix(1)))
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(timeAgo(from: post.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }
            }

            // Content
            Text(post.content)
                .font(.system(size: 15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(3)

            // Stats
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 12))
                    Text("\(post.likes)")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Color(hex: "FF6B6B"))

                HStack(spacing: 4) {
                    Image(systemName: "bubble.right.fill")
                        .font(.system(size: 12))
                    Text("\(post.comments.count)")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor, intensity: 0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Comment Composer
    private var commentComposer: some View {
        VStack(spacing: 0) {
            // Reply indicator
            if let replyingTo = replyingTo {
                HStack(spacing: 8) {
                    Rectangle()
                        .fill(Color(hex: replyingTo.authorColor))
                        .frame(width: 3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Réponse à \(replyingTo.author)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: replyingTo.authorColor))

                        Text(replyingTo.content)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }

                    Spacer()

                    Button {
                        self.replyingTo = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(theme.backgroundSecondary)
            }

            // Composer
            HStack(spacing: 12) {
                // Avatar
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text("M")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    )

                // Text field
                HStack(spacing: 8) {
                    TextField(replyingTo != nil ? "Répondre..." : "Ajouter un commentaire...", text: $commentText)
                        .focused($isComposerFocused)
                        .font(.system(size: 15))
                        .foregroundColor(theme.textPrimary)

                    // Emoji button
                    Button {
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 20))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(
                                    isComposerFocused ?
                                    Color(hex: accentColor).opacity(0.5) :
                                        theme.inputBorder,
                                    lineWidth: 1
                                )
                        )
                )

                // Send button
                if !commentText.isEmpty {
                    Button {
                        // Send comment
                        commentText = ""
                        replyingTo = nil
                        isComposerFocused = false
                        HapticFeedback.success()
                    } label: {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 36, height: 36)
                            .overlay(
                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                                    .rotationEffect(.degrees(45))
                                    .offset(x: -1)
                            )
                            .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Rectangle()
                            .fill(theme.backgroundPrimary.opacity(0.8))
                    )
                    .shadow(color: Color.black.opacity(0.1), radius: 10, y: -5)
            )
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: commentText.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: replyingTo?.id)
    }

    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Comment Row View
struct CommentRowView: View {
    let comment: FeedComment
    let accentColor: String
    let onReply: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isLiked = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Avatar
            Circle()
                .fill(Color(hex: comment.authorColor))
                .frame(width: 36, height: 36)
                .overlay(
                    Text(String(comment.author.prefix(1)))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                )

            VStack(alignment: .leading, spacing: 6) {
                // Author and time
                HStack(spacing: 6) {
                    Text(comment.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))

                    Text("·")
                        .foregroundColor(theme.textMuted)

                    Text(timeAgo(from: comment.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                // Content
                Text(comment.content)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                // Actions
                HStack(spacing: 20) {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                            isLiked.toggle()
                        }
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: isLiked ? "heart.fill" : "heart")
                                .font(.system(size: 14))
                                .foregroundColor(isLiked ? Color(hex: "FF6B6B") : theme.textMuted)
                                .scaleEffect(isLiked ? 1.1 : 1.0)

                            Text("\(comment.likes + (isLiked ? 1 : 0))")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(isLiked ? Color(hex: "FF6B6B") : theme.textMuted)
                        }
                    }

                    Button {
                        onReply()
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrowshape.turn.up.left")
                                .font(.system(size: 13))
                            Text("Répondre")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(theme.textMuted)
                    }

                    Spacer()

                    Button {
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 12)
        .overlay(
            Rectangle()
                .fill(theme.inputBorder.opacity(0.3))
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Legacy Support
struct FeedCard: View {
    let item: FeedItem

    var body: some View {
        FeedPostCard(
            post: FeedPost(author: item.author, content: item.content, timestamp: item.timestamp, likes: item.likes)
        )
    }
}
