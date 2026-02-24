import SwiftUI
import PhotosUI
import CoreLocation
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Feed Sample Data (Global access for ThemedFeedOverlay)
struct FeedSampleData {
    // Helper to generate many comments with replies
    private static func generateComments(count: Int, baseTime: TimeInterval) -> [FeedComment] {
        let authors = ["Alice", "Bob", "Charlie", "Diana", "Emma", "Fran\u{00E7}ois", "Gina", "Hugo", "Isabelle", "Jules",
                       "Karen", "Lucas", "Marie", "Nicolas", "Olivia", "Pierre", "Quentin", "Rachel", "Simon", "Thomas",
                       "Ulysse", "Val\u{00E9}rie", "William", "Xavier", "Yuki", "Zo\u{00E9}", "Antoine", "B\u{00E9}atrice", "C\u{00E9}dric", "Delphine"]
        let contents = [
            "Tellement d'accord! \u{1F44F}", "C'est exactement \u{00E7}a!", "Merci pour le partage \u{1F64F}", "Incroyable!", "J'adore \u{1F60D}",
            "Top! \u{1F525}", "Excellent post", "Je suis fan", "Bien vu!", "100% d'accord",
            "G\u{00E9}nial!", "Super int\u{00E9}ressant", "\u{00C0} partager absolument", "Wow!", "Magnifique \u{1F4AF}",
            "Bravo! \u{1F44D}", "Je confirme", "Parfait", "Trop bien!", "Amazing!",
            "C'est ouf!", "Je valide", "\u{1F440}\u{1F440}\u{1F440}", "\u{1F389}\u{1F389}", "Respect!",
            "Enfin quelqu'un qui dit vrai", "Merci!", "Je note", "Inspirant", "\u{1F4AA}\u{1F4AA}\u{1F4AA}"
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
            content: "\u{1F6A8} BREAKING: Apple vient d'annoncer l'iPhone 17 avec \u{00E9}cran pliable! Premi\u{00E8}re sortie pr\u{00E9}vue en septembre. Qui est hyp\u{00E9}? \u{1F4F1}",
            timestamp: Date().addingTimeInterval(-120),
            likes: 45678,
            comments: generateComments(count: 247, baseTime: -100),
            media: [.video(duration: 180, color: "3498DB")]
        ),

        // === POST WITH 80+ COMMENTS - VIRAL REPOST ===
        FeedPost(
            author: "ViralNews",
            content: "Ceci doit \u{00EA}tre vu par tout le monde! \u{1F30D}",
            timestamp: Date().addingTimeInterval(-300),
            likes: 23456,
            comments: generateComments(count: 89, baseTime: -200),
            repost: RepostContent(
                author: "NASA",
                content: "\u{1F30C} Nous avons d\u{00E9}tect\u{00E9} des signaux radio provenant d'une exoplan\u{00E8}te \u{00E0} 42 ann\u{00E9}es-lumi\u{00E8}re. Les analyses sont en cours...",
                timestamp: Date().addingTimeInterval(-600),
                likes: 156789
            ),
            repostAuthor: "ViralNews"
        ),

        // === POST WITH 50+ COMMENTS ===
        FeedPost(
            author: "FitnessCoach",
            content: "New workout routine dropping! \u{1F4AA} 15 minutes full body HIIT that you can do anywhere. No equipment needed!",
            timestamp: Date().addingTimeInterval(-500),
            likes: 8934,
            comments: generateComments(count: 56, baseTime: -400),
            media: [.video(duration: 912, color: "E74C3C")]
        ),

        // === MULTIPLE REPOSTS - CHAIN VIRAL ===
        FeedPost(
            author: "StartupFounder",
            content: "Thread essentiel pour tous les entrepreneurs \u{1F447}",
            timestamp: Date().addingTimeInterval(-700),
            likes: 12890,
            comments: generateComments(count: 34, baseTime: -600),
            repost: RepostContent(
                author: "YCombinator",
                content: "The 10 most common mistakes we see in YC applications. A thread \u{1F9F5}",
                timestamp: Date().addingTimeInterval(-1200),
                likes: 89234
            ),
            repostAuthor: "StartupFounder"
        ),

        // === POST WITH 30+ COMMENTS - IMAGES ===
        FeedPost(
            author: "TravelBlogger",
            content: "Weekend escape to Provence \u{1F33B} The lavender fields are absolutely breathtaking this time of year!",
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
            content: "\u{1F525} This is HUGE for the industry!",
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
            content: "\u{1F399}\u{FE0F} Nouvel \u{00E9}pisode disponible! On parle de l'avenir de l'IA et son impact sur nos m\u{00E9}tiers.",
            timestamp: Date().addingTimeInterval(-1300),
            likes: 2345,
            comments: generateComments(count: 28, baseTime: -1200),
            media: [.audio(duration: 2847, color: "9B59B6")]
        ),

        // === DOCUMENT POST WITH REPOST ===
        FeedPost(
            author: "InvestorDaily",
            content: "\u{1F4CA} Must-read for anyone in finance",
            timestamp: Date().addingTimeInterval(-1500),
            likes: 8765,
            comments: generateComments(count: 45, baseTime: -1400),
            repost: RepostContent(
                author: "StartupMentor",
                content: "\u{1F4C4} Je partage mon guide complet pour lever des fonds en 2025. 50 pages de conseils gratuits!",
                timestamp: Date().addingTimeInterval(-2000),
                likes: 12345
            ),
            repostAuthor: "InvestorDaily",
            media: [.document(name: "Guide_Lev\u{00E9}e_Fonds_2025.pdf", size: "4.2 MB", pages: 52, color: "F8B500")]
        ),

        // === LOCATION POST WITH MANY COMMENTS ===
        FeedPost(
            author: "FoodCritic",
            content: "\u{1F4CD} D\u{00E9}couverte incroyable! Ce petit restaurant cach\u{00E9} dans le Marais sert les meilleures p\u{00E2}tes fra\u{00EE}ches de Paris!",
            timestamp: Date().addingTimeInterval(-1700),
            likes: 4567,
            comments: generateComments(count: 67, baseTime: -1600),
            media: [.location(name: "Trattoria da Luigi - Le Marais", lat: 48.8566, lon: 2.3522, color: "2ECC71")]
        ),

        // === MUSIC PREVIEW - VIRAL ===
        FeedPost(
            author: "MusicProducer",
            content: "\u{1F3B5} Preview exclusive du nouveau track! Drop pr\u{00E9}vu ce vendredi \u{1F525}",
            timestamp: Date().addingTimeInterval(-1900),
            likes: 15678,
            comments: generateComments(count: 156, baseTime: -1800),
            media: [.audio(duration: 45, color: "E91E63")]
        ),

        // === SIMPLE REPOST ===
        FeedPost(
            author: "David",
            content: "This is exactly what we needed! \u{1F64C}",
            timestamp: Date().addingTimeInterval(-2100),
            likes: 234,
            comments: generateComments(count: 12, baseTime: -2000),
            repost: RepostContent(
                author: "Meeshy Team",
                content: "Welcome to the new V2 design! \u{1F680} We've completely redesigned the experience.",
                timestamp: Date().addingTimeInterval(-3600),
                likes: 4567
            ),
            repostAuthor: "David"
        ),

        // === ANNOUNCEMENT WITH 100+ COMMENTS ===
        FeedPost(
            author: "Meeshy Team",
            content: "\u{1F389} 1 MILLION d'utilisateurs! Merci \u{00E0} vous tous pour votre soutien incroyable. Ce n'est que le d\u{00E9}but de l'aventure!",
            timestamp: Date().addingTimeInterval(-2300),
            likes: 67890,
            comments: generateComments(count: 189, baseTime: -2200),
            media: [.image(color: "4ECDC4")]
        ),

        // === POST WITHOUT COMMENTS ===
        FeedPost(
            author: "Michael",
            content: "The new UI is absolutely stunning! \u{1F60D}",
            timestamp: Date().addingTimeInterval(-2500),
            likes: 198
        ),

        // === REPOST WITHOUT COMMENTS ===
        FeedPost(
            author: "Sophie",
            content: "\u{1F440}",
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
    @StateObject var viewModel = FeedViewModel()
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()
    @State private var searchText = ""
    @State var showComposer = false
    @FocusState var isComposerFocused: Bool
    @State private var composerBounce: Bool = false
    @State var composerText = ""
    @State private var expandedComments: Set<String> = []
    @State private var showStoryViewer = false
    @State private var selectedGroupIndex = 0
    @State private var showStatusComposer = false

    // Attachment states
    @State var pendingAttachments: [MessageAttachment] = []
    @State var pendingMediaFiles: [String: URL] = [:]
    @State var pendingThumbnails: [String: UIImage] = [:]
    @State var pendingAudioURL: URL?
    @State var showPhotoPicker = false
    @State var selectedPhotoItems: [PhotosPickerItem] = []
    @State var showCamera = false
    @State var showFilePicker = false
    @State var showLocationPicker = false
    @State var isUploading = false
    @State var uploadProgress: UploadQueueProgress?
    @State var isLoadingMedia = false
    @StateObject var audioRecorder = AudioRecorderManager()
    @State private var pendingAttachmentType: String?

    var composerHasContent: Bool {
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty
    }

    // Computed property -- uses ViewModel data (falls back to sample)
    private var posts: [FeedPost] {
        viewModel.posts.isEmpty ? FeedSampleData.posts : viewModel.posts
    }

    // Legacy inline sample data removed -- now served by FeedViewModel + FeedSampleData fallback
    private var _legacyPosts: [FeedPost] {
        [
            // === POSTS WITH MEDIA TYPES (NEWEST - AT TOP) ===

            // Post with video
            FeedPost(
                author: "FitnessCoach",
                content: "New workout routine dropping! \u{1F4AA} 15 minutes full body HIIT that you can do anywhere. No equipment needed!",
                timestamp: Date().addingTimeInterval(-300),
                likes: 1245,
                comments: [
                    FeedComment(author: "GymRat", content: "Can't wait to try this tomorrow morning! \u{1F525}", timestamp: Date().addingTimeInterval(-100), likes: 56, replies: 8),
                    FeedComment(author: "Beginner", content: "Is this suitable for beginners?", timestamp: Date().addingTimeInterval(-150), likes: 12, replies: 3),
                    FeedComment(author: "FitnessCoach", content: "@Beginner Absolutely! Start slow and build up \u{1F60A}", timestamp: Date().addingTimeInterval(-200), likes: 45, replies: 0)
                ],
                media: [.video(duration: 912, color: "E74C3C")]
            ),

            // Post with multiple images (gallery)
            FeedPost(
                author: "TravelBlogger",
                content: "Weekend escape to Provence \u{1F33B} The lavender fields are absolutely breathtaking this time of year!",
                timestamp: Date().addingTimeInterval(-600),
                likes: 892,
                comments: [
                    FeedComment(author: "Wanderlust", content: "Adding this to my bucket list! \u{1F4DD}", timestamp: Date().addingTimeInterval(-400), likes: 34, replies: 5),
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
                content: "\u{1F399}\u{FE0F} Nouvel \u{00E9}pisode disponible! On parle de l'avenir de l'IA et son impact sur nos m\u{00E9}tiers. Une discussion passionnante avec des experts du domaine.",
                timestamp: Date().addingTimeInterval(-900),
                likes: 678,
                comments: [
                    FeedComment(author: "TechEnthusiast", content: "Excellent \u{00E9}pisode! J'ai appris beaucoup de choses", timestamp: Date().addingTimeInterval(-700), likes: 42, replies: 6),
                    FeedComment(author: "AIResearcher", content: "Points tr\u{00E8}s pertinents sur l'\u{00E9}thique de l'IA", timestamp: Date().addingTimeInterval(-800), likes: 38, replies: 15)
                ],
                media: [.audio(duration: 2847, color: "9B59B6")]
            ),

            // Post with PDF document
            FeedPost(
                author: "StartupMentor",
                content: "\u{1F4C4} Je partage mon guide complet pour lever des fonds en 2025. 50 pages de conseils, templates et exemples concrets. T\u{00E9}l\u{00E9}chargement gratuit!",
                timestamp: Date().addingTimeInterval(-1200),
                likes: 2341,
                comments: [
                    FeedComment(author: "Entrepreneur", content: "Merci pour ce partage! Exactement ce qu'il me fallait", timestamp: Date().addingTimeInterval(-1000), likes: 89, replies: 23),
                    FeedComment(author: "Investor", content: "Tr\u{00E8}s complet et bien structur\u{00E9}. Je recommande \u{1F44D}", timestamp: Date().addingTimeInterval(-1100), likes: 67, replies: 8)
                ],
                media: [.document(name: "Guide_Lev\u{00E9}e_Fonds_2025.pdf", size: "4.2 MB", pages: 52, color: "F8B500")]
            ),

            // Post with geographic location
            FeedPost(
                author: "FoodCritic",
                content: "\u{1F4CD} D\u{00E9}couverte incroyable! Ce petit restaurant cach\u{00E9} dans le Marais sert les meilleures p\u{00E2}tes fra\u{00EE}ches de Paris. File d'attente garantie mais \u{00E7}a vaut le coup!",
                timestamp: Date().addingTimeInterval(-1500),
                likes: 1567,
                comments: [
                    FeedComment(author: "Foodie", content: "J'y suis all\u{00E9}e hier gr\u{00E2}ce \u{00E0} ton post, c'\u{00E9}tait d\u{00E9}licieux! \u{1F35D}", timestamp: Date().addingTimeInterval(-1300), likes: 78, replies: 19),
                    FeedComment(author: "LocalResident", content: "Enfin quelqu'un qui en parle! C'est mon secret depuis 3 ans", timestamp: Date().addingTimeInterval(-1400), likes: 56, replies: 7)
                ],
                media: [.location(name: "Trattoria da Luigi - Le Marais", lat: 48.8566, lon: 2.3522, color: "2ECC71")]
            ),

            // Post with voice memo (short audio)
            FeedPost(
                author: "MusicProducer",
                content: "\u{1F3B5} Preview exclusive du nouveau track! Dites-moi ce que vous en pensez. Drop pr\u{00E9}vu ce vendredi \u{1F525}",
                timestamp: Date().addingTimeInterval(-1800),
                likes: 4567,
                comments: [
                    FeedComment(author: "MusicFan", content: "FIRE \u{1F525}\u{1F525}\u{1F525} J'ai h\u{00E2}te!", timestamp: Date().addingTimeInterval(-1600), likes: 234, replies: 42),
                    FeedComment(author: "DJ", content: "Le drop est insane! Tu utilises quel synth?", timestamp: Date().addingTimeInterval(-1700), likes: 156, replies: 28)
                ],
                media: [.audio(duration: 45, color: "E91E63")]
            ),

            // === ORIGINAL POSTS ===

            // Post with many comments
            FeedPost(
                author: "Meeshy Team",
                content: "Welcome to the new V2 design! \u{1F680} We've completely redesigned the experience with glass effects, dynamic colors, and smooth animations.",
                timestamp: Date().addingTimeInterval(-2100),
                likes: 230,
                comments: [
                    FeedComment(author: "Sarah", content: "Love the new glass effect! \u{1F60D}", timestamp: Date().addingTimeInterval(-60), likes: 12, replies: 4),
                    FeedComment(author: "Alex", content: "The animations are so smooth", timestamp: Date().addingTimeInterval(-120), likes: 8, replies: 2),
                    FeedComment(author: "Emma", content: "Can't wait to see more updates!", timestamp: Date().addingTimeInterval(-180), likes: 5, replies: 1),
                    FeedComment(author: "John", content: "Great work team!", timestamp: Date().addingTimeInterval(-240), likes: 3, replies: 0),
                    FeedComment(author: "Lisa", content: "This is amazing \u{1F389}", timestamp: Date().addingTimeInterval(-300), likes: 2, replies: 0),
                    FeedComment(author: "Marc", content: "Finally! Been waiting for this", timestamp: Date().addingTimeInterval(-360), likes: 4, replies: 1),
                    FeedComment(author: "Julie", content: "Le design est incroyable \u{1F525}", timestamp: Date().addingTimeInterval(-420), likes: 7, replies: 3)
                ]
            ),

            // Repost without comments
            FeedPost(
                author: "David",
                content: "This is exactly what we needed! \u{1F64C}",
                timestamp: Date().addingTimeInterval(-1800),
                likes: 89,
                comments: [],
                repost: RepostContent(
                    author: "Meeshy Team",
                    content: "Welcome to the new V2 design! \u{1F680} We've completely redesigned the experience.",
                    timestamp: Date().addingTimeInterval(-3600),
                    likes: 230
                ),
                repostAuthor: "David"
            ),

            // Repost WITH comments - viral discussion
            FeedPost(
                author: "Marie",
                content: "Thread important \u{00E0} lire \u{1F447} Tout le monde devrait voir \u{00E7}a",
                timestamp: Date().addingTimeInterval(-2400),
                likes: 456,
                comments: [
                    FeedComment(author: "Thomas", content: "Merci pour le partage! C'est exactement ce que je cherchais", timestamp: Date().addingTimeInterval(-1200), likes: 34, replies: 9),
                    FeedComment(author: "Claire", content: "Je suis compl\u{00E8}tement d'accord avec ce point de vue", timestamp: Date().addingTimeInterval(-1800), likes: 28, replies: 5),
                    FeedComment(author: "Antoine", content: "\u{00C0} partager absolument \u{1F504}", timestamp: Date().addingTimeInterval(-2000), likes: 15, replies: 2),
                    FeedComment(author: "Sophie", content: "Int\u{00E9}ressant! Je n'avais jamais vu les choses sous cet angle", timestamp: Date().addingTimeInterval(-2200), likes: 12, replies: 3),
                    FeedComment(author: "Lucas", content: "\u{1F4AF}\u{1F4AF}\u{1F4AF}", timestamp: Date().addingTimeInterval(-2300), likes: 8, replies: 0)
                ],
                repost: RepostContent(
                    author: "Digital Trends",
                    content: "Les 10 tendances tech qui vont r\u{00E9}volutionner 2025 : IA g\u{00E9}n\u{00E9}rative, r\u{00E9}alit\u{00E9} mixte, blockchain d\u{00E9}centralis\u{00E9}e... Un thread complet sur l'avenir de la technologie.",
                    timestamp: Date().addingTimeInterval(-7200),
                    likes: 3420
                ),
                repostAuthor: "Marie"
            ),

            // Regular post with comments
            FeedPost(
                author: "Emma",
                content: "Just shipped a new feature! Check it out \u{1F389} The collaboration tools are now live and ready for your teams.",
                timestamp: Date().addingTimeInterval(-3600),
                likes: 156,
                comments: [
                    FeedComment(author: "Michael", content: "Congrats! \u{1F973}", timestamp: Date().addingTimeInterval(-1800), likes: 15, replies: 2),
                    FeedComment(author: "Anna", content: "Already tested it, works great!", timestamp: Date().addingTimeInterval(-2400), likes: 9, replies: 4)
                ]
            ),

            // Repost of a funny post with reactions
            FeedPost(
                author: "Kevin",
                content: "\u{1F602}\u{1F602}\u{1F602} Je suis mort de rire",
                timestamp: Date().addingTimeInterval(-4500),
                likes: 892,
                comments: [
                    FeedComment(author: "Laura", content: "AHAHA tellement vrai! \u{1F923}", timestamp: Date().addingTimeInterval(-3000), likes: 67, replies: 18),
                    FeedComment(author: "Pierre", content: "Je tag @tous mes potes devs", timestamp: Date().addingTimeInterval(-3200), likes: 45, replies: 12),
                    FeedComment(author: "Camille", content: "C'est moi tous les lundis matin", timestamp: Date().addingTimeInterval(-3500), likes: 38, replies: 8),
                    FeedComment(author: "Hugo", content: "OMG same \u{1F480}", timestamp: Date().addingTimeInterval(-3800), likes: 22, replies: 3),
                    FeedComment(author: "L\u{00E9}a", content: "Le pire c'est que c'est vrai", timestamp: Date().addingTimeInterval(-4000), likes: 19, replies: 5),
                    FeedComment(author: "Nathan", content: "Je me sens attaqu\u{00E9} personnellement", timestamp: Date().addingTimeInterval(-4200), likes: 31, replies: 7)
                ],
                repost: RepostContent(
                    author: "Dev Humor",
                    content: "Quand tu pushes en prod le vendredi \u{00E0} 17h59 et que tu fermes ton laptop sans regarder les logs \u{1F3C3}\u{200D}\u{2642}\u{FE0F}\u{1F4A8}",
                    timestamp: Date().addingTimeInterval(-10800),
                    likes: 15600
                ),
                repostAuthor: "Kevin"
            ),

            // Simple post with comments
            FeedPost(
                author: "Sophie",
                content: "Coffee meetup tomorrow at 3pm! Who's in? \u{2615}",
                timestamp: Date().addingTimeInterval(-7200),
                likes: 45,
                comments: [
                    FeedComment(author: "Lisa", content: "Count me in!", timestamp: Date().addingTimeInterval(-3600), likes: 3, replies: 1),
                    FeedComment(author: "John", content: "I'll be there \u{1F44B}", timestamp: Date().addingTimeInterval(-5400), likes: 2, replies: 0),
                    FeedComment(author: "Alex", content: "Same here!", timestamp: Date().addingTimeInterval(-6000), likes: 1, replies: 0)
                ]
            ),

            // Simple post without comments
            FeedPost(
                author: "Michael",
                content: "The new UI is absolutely stunning! \u{1F60D}",
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
                content: "F\u{00E9}licitations \u{00E0} toute l'\u{00E9}quipe! \u{1F38A}\u{1F680}",
                timestamp: Date().addingTimeInterval(-16000),
                likes: 324,
                comments: [
                    FeedComment(author: "Investor_One", content: "Well deserved! Amazing growth \u{1F4C8}", timestamp: Date().addingTimeInterval(-14000), likes: 45, replies: 11),
                    FeedComment(author: "TechReporter", content: "Interview exclusive bient\u{00F4}t?", timestamp: Date().addingTimeInterval(-14500), likes: 12, replies: 3),
                    FeedComment(author: "FuturFounder", content: "Inspirant! \u{1F64C}", timestamp: Date().addingTimeInterval(-15000), likes: 8, replies: 0),
                    FeedComment(author: "DevCommunity", content: "La French Tech qui brille!", timestamp: Date().addingTimeInterval(-15500), likes: 23, replies: 6)
                ],
                repost: RepostContent(
                    author: "Meeshy Official",
                    content: "\u{1F389} BREAKING: Meeshy vient de lever 50M\u{20AC} en S\u{00E9}rie B! Merci \u{00E0} tous nos utilisateurs et \u{00E0} notre incroyable communaut\u{00E9}. L'aventure ne fait que commencer!",
                    timestamp: Date().addingTimeInterval(-20000),
                    likes: 8750
                ),
                repostAuthor: "StartupFrance"
            ),

            // Post with image reference and many comments
            FeedPost(
                author: "PhotoArtist",
                content: "Sunset vibes from my balcony tonight \u{1F305} Paris is magical at this hour",
                timestamp: Date().addingTimeInterval(-21600),
                likes: 567,
                comments: [
                    FeedComment(author: "Traveler", content: "Stunning! What camera do you use?", timestamp: Date().addingTimeInterval(-18000), likes: 23, replies: 5),
                    FeedComment(author: "LocalGuide", content: "Best view in the city!", timestamp: Date().addingTimeInterval(-19000), likes: 15, replies: 2),
                    FeedComment(author: "NightOwl", content: "I need to visit Paris \u{1F60D}", timestamp: Date().addingTimeInterval(-20000), likes: 11, replies: 3)
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
                            colors: [MeeshyColors.coral, MeeshyColors.teal],
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
                                colors: [MeeshyColors.teal, MeeshyColors.infoBlue],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 40, height: 40)
                        .shadow(color: MeeshyColors.teal.opacity(0.4), radius: 8, y: 4)

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
        ScrollViewReader { scrollProxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 16) {
                    // Top spacer for floating buttons (also serves as scroll anchor)
                    Spacer().frame(height: 100)
                        .id("feed-top")

                    // Story Tray
                    StoryTrayView(viewModel: storyViewModel) { groupIndex in
                        selectedGroupIndex = groupIndex
                        showStoryViewer = true
                    }

                    // Composer placeholder
                    composerPlaceholder
                        .padding(.bottom, 8)

                    // Posts with infinite scroll
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
                            },
                            onLike: { postId in
                                Task { await viewModel.likePost(postId) }
                            },
                            onRepost: { postId in
                                Task { await viewModel.repostPost(postId) }
                            },
                            onShare: { postId in
                                Task { await viewModel.sharePost(postId) }
                            },
                            onBookmark: { postId in
                                Task { await viewModel.bookmarkPost(postId) }
                            },
                            onSendComment: { postId, content, parentId in
                                Task { await viewModel.sendComment(postId: postId, content: content, parentId: parentId) }
                            },
                            onLikeComment: { postId, commentId in
                                Task { await viewModel.likeComment(postId: postId, commentId: commentId) }
                            }
                        )
                        .onAppear {
                            Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                        }
                    }

                    // Loading more indicator
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(MeeshyColors.teal)
                            .padding()
                    }
                }
                .padding(.top, 12)
                .padding(.bottom, 100)
            }
            .refreshable {
                await viewModel.refresh()
                await storyViewModel.loadStories()
                await statusViewModel.loadStatuses()
            }
            .overlay(alignment: .top) {
                // "New posts" banner
                if viewModel.newPostsCount > 0 {
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            scrollProxy.scrollTo("feed-top", anchor: .top)
                        }
                        viewModel.acknowledgeNewPosts()
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 12, weight: .bold))

                            Text("\(viewModel.newPostsCount) nouveau\(viewModel.newPostsCount > 1 ? "x" : "") post\(viewModel.newPostsCount > 1 ? "s" : "")")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.teal, MeeshyColors.infoBlue],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .shadow(color: MeeshyColors.teal.opacity(0.5), radius: 12, y: 4)
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.top, 120)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(.spring(response: 0.4, dampingFraction: 0.75), value: viewModel.newPostsCount)
                }
            }
        }
        .task {
            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
            viewModel.subscribeToSocketEvents()
            storyViewModel.subscribeToSocketEvents()
            statusViewModel.subscribeToSocketEvents()
        }
        .fullScreenCover(isPresented: $showStoryViewer) {
            StoryViewerView(
                viewModel: storyViewModel,
                groups: storyViewModel.storyGroups,
                currentGroupIndex: selectedGroupIndex,
                isPresented: $showStoryViewer
            )
        }
        .sheet(isPresented: $showStatusComposer) {
            StatusComposerView(viewModel: statusViewModel)
                .presentationDetents([.medium])
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
                        publishPostWithAttachments()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.teal)
                                .scaleEffect(0.8)
                        } else {
                            Text("Publier")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(composerHasContent ? MeeshyColors.teal : theme.textMuted)
                        }
                    }
                    .disabled(!composerHasContent || isUploading)
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
                                    colors: [MeeshyColors.coral, MeeshyColors.teal],
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
                        Text("Qu'avez-vous en t\u{00EA}te ?")
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
                        .frame(minHeight: 120)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }
                .scaleEffect(composerBounce ? 1.01 : 1.0)
                .onChange(of: isComposerFocused) { newValue in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                        composerBounce = newValue
                    }
                }

                // Pending attachments preview
                if !pendingAttachments.isEmpty || isLoadingMedia {
                    feedPendingAttachmentsRow
                }

                // Upload progress
                if isUploading, let progress = uploadProgress {
                    UploadProgressBar(progress: progress, accentColor: "4ECDC4")
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                Spacer(minLength: 0)

                // Toolbar
                HStack(spacing: 24) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "FF6B6B"))
                    }
                    Button {} label: {
                        Image(systemName: "face.smiling.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "F8B500"))
                    }
                    Button { showFilePicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "9B59B6"))
                    }
                    Button { showLocationPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "2ECC71"))
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
            .shadow(color: MeeshyColors.teal.opacity(0.2), radius: 30, y: 20)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
        .zIndex(200)
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFeedFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    handleFeedCameraCapture(image)
                case .video(let url):
                    handleFeedCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: "4ECDC4") { coordinate, address in
                handleFeedLocationSelection(coordinate: coordinate, address: address)
            }
        }
        .onChange(of: selectedPhotoItems) { items in
            handleFeedPhotoSelection(items)
        }
    }
}

// See FeedPostCard.swift, FeedPostCard+Media.swift
// See FeedCommentsSheet.swift (CommentsSheetView, CommentRowView, FeedCard)
