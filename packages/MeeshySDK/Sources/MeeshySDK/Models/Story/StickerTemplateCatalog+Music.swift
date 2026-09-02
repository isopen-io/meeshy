import Foundation

// MARK: - La famille MUSIQUE (#4820)

/// Ce qu'on écoute — la note, le casque, le vinyle, le micro. Aucun
/// emplacement : un TITRE écrit par l'auteur relèverait de la famille TEXTE, et
/// un titre VENU du lecteur de musique serait une donnée que la plateforme lit,
/// donc une famille de scène à part entière (§ « la ligne de partage »
/// de `StickerTemplate`) — ni l'un ni l'autre n'est ce lot.
///
/// Cette famille est la plus animée du catalogue, et c'est voulu : la musique
/// est du MOUVEMENT, un vinyle immobile a l'air en panne.
extension StickerTemplateCatalog.ID {
    public static let musicNote = "music.note"
    public static let musicHeadphones = "music.headphones"
    public static let musicVinyl = "music.vinyl"
    public static let musicGuitar = "music.guitar"
    public static let musicMic = "music.mic"
    public static let musicPiano = "music.piano"
    public static let musicSpeaker = "music.speaker"
    public static let musicNowPlaying = "music.nowPlaying"
    public static let musicBeat = "music.beat"
    public static let musicRadio = "music.radio"
}

extension StickerTemplateCatalog {
    public static let music: [StickerTemplate] = [
        StickerTemplate(id: ID.musicNote, family: .music,
                        fallbackEmoji: "\u{1F3B5}", posedScale: 1.4, animation: .float),
        StickerTemplate(id: ID.musicHeadphones, family: .music,
                        fallbackEmoji: "\u{1F3A7}", posedScale: 1.3, animation: .pulse),
        StickerTemplate(id: ID.musicVinyl, family: .music,
                        fallbackEmoji: "\u{1F4BF}", posedScale: 1.3, animation: .spin),
        StickerTemplate(id: ID.musicGuitar, family: .music,
                        fallbackEmoji: "\u{1F3B8}", posedScale: 1.4, animation: .wobble),
        StickerTemplate(id: ID.musicMic, family: .music,
                        fallbackEmoji: "\u{1F3A4}", posedScale: 1.3, animation: .swing),
        // Immobile : un piano pèse trois cents kilos.
        StickerTemplate(id: ID.musicPiano, family: .music,
                        fallbackEmoji: "\u{1F3B9}", posedScale: 1.3),
        StickerTemplate(id: ID.musicSpeaker, family: .music,
                        fallbackEmoji: "\u{1F50A}", posedScale: 1.3, animation: .shake),
        StickerTemplate(id: ID.musicNowPlaying, family: .music,
                        fallbackEmoji: "\u{1F3B6}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.musicBeat, family: .music,
                        fallbackEmoji: "\u{1F39B}\u{FE0F}", posedScale: 1.2, animation: .bounce),
        StickerTemplate(id: ID.musicRadio, family: .music,
                        fallbackEmoji: "\u{1F4FB}", posedScale: 1.2, animation: .blink),
    ]
}
