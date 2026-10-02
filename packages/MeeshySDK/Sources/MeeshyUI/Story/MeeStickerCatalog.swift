import SwiftUI
import UIKit
import MeeshySDK

// MARK: - Mee et Meo, les deux colibris (#9053)

/// **Les stickers de Mee et Meo, tels qu'iOS les reçoit du web.**
///
/// Le dessin n'a qu'UNE source : `apps/web/src/lib/mee/`, des SVG animés en
/// CSS. Plutôt que d'en recopier deux cents scènes en Swift — une jumelle qui
/// divergerait au premier trait —, `apps/web/scripts/mee-ios-stickers.ts` les
/// FILME : un WebP animé par sticker dans `Resources/MeeStickers/`, et l'index
/// `MeeStickerCatalog+Index.swift`. Relancer le script après toute retouche du
/// dessin.
///
/// Le contrat du message est celui du web : `templateId: "mee.<id>"`, l'emoji
/// de repli, et le PNG joint pour les clients qui ne savent pas le redessiner.
/// Les stickers « Instants » (lieu, heure, météo, message saisis à l'envoi) ne
/// sont pas dans l'index : un film ne peut pas porter un emplacement.
nonisolated public struct MeeSticker: Hashable, Identifiable, Sendable {

    /// L'onglet : Mee seule, Meo seul, ou Mee & Meo ensemble (#9058).
    nonisolated public enum Character: String, Sendable {
        case mee
        case meo
        case duo
    }

    /// **Ce que le sticker permet de DIRE** (#9058) — la section de la
    /// feuille. Les valeurs brutes sont celles du web (`MEE_INTENTS`).
    nonisolated public enum Intent: String, Sendable {
        case bonjour
        case amour
        case fete
        case soutien
        case rale
        case coupDeMou = "coup-de-mou"
        case surprise
        case quotidien
        case humourNoir = "humour-noir"
    }

    public let id: String
    public let tab: Character
    public let intent: Intent
    /// Le nom du sticker — celui que VoiceOver dit, comme le `aria-label` du web.
    public let title: String
    public let emoji: String
    public let animated: Bool

    public init(id: String, tab: Character, intent: Intent, title: String, emoji: String, animated: Bool) {
        self.id = id
        self.tab = tab
        self.intent = intent
        self.title = title
        self.emoji = emoji
        self.animated = animated
    }

    public var templateId: String { MeeStickerCatalog.templatePrefix + id }

    /// Le descripteur du message : aucun emplacement, un film n'en porte pas.
    public var messageSticker: MessageSticker {
        MessageSticker(templateId: templateId, emoji: emoji)
    }
}

/// L'index est `nonisolated` : la bulle résout un `templateId` hors du fil
/// principal. Seule la lecture des FILMS passe par `Bundle.module`, que ce
/// module isole au `MainActor` — d'où l'index en Swift plutôt qu'en JSON.
nonisolated public enum MeeStickerCatalog {

    public static let templatePrefix = "mee."

    nonisolated public struct SectionGroup: Identifiable, Sendable {
        public let intent: MeeSticker.Intent
        public let stickers: [MeeSticker]
        public var id: MeeSticker.Intent { intent }
    }

    private static let byID: [String: MeeSticker] =
        Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

    public static func stickers(of character: MeeSticker.Character) -> [MeeSticker] {
        all.filter { $0.tab == character }
    }

    /// Une section par intention, dans l'ordre du web ; une intention sans
    /// sticker dans cet onglet ne laisse aucune section vide.
    public static func sections(of character: MeeSticker.Character) -> [SectionGroup] {
        let ofCharacter = stickers(of: character)
        return intentOrder.compactMap { intent in
            let stickers = ofCharacter.filter { $0.intent == intent }
            return stickers.isEmpty ? nil : SectionGroup(intent: intent, stickers: stickers)
        }
    }

    /// Le sticker qu'un `templateId` de message désigne — `nil` s'il ne vient
    /// pas de ce catalogue (ou d'une version plus récente du web : la bulle
    /// sert alors le PNG joint).
    public static func sticker(forTemplateID templateID: String?) -> MeeSticker? {
        guard let templateID, templateID.hasPrefix(templatePrefix) else { return nil }
        return byID[String(templateID.dropFirst(templatePrefix.count))]
    }

    // MARK: - Les films (bundle ⇒ `MainActor`)

    @MainActor
    public static func fileURL(for sticker: MeeSticker) -> URL? {
        let name = "mee.\(sticker.id)"
        return Bundle.module.url(forResource: name, withExtension: "webp")
            ?? Bundle.module.url(forResource: name, withExtension: "webp", subdirectory: "MeeStickers")
    }

    /// La première image, pleine définition — le PNG joint à l'envoi et la
    /// vignette d'un sticker FIXE, que le décodeur d'animation rend `nil`.
    @MainActor
    public static func stillImage(_ sticker: MeeSticker) -> UIImage? {
        guard let url = fileURL(for: sticker),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return nil }
        return UIImage(data: data)
    }

    /// Le film décodé, lu dans le cache ou décodé sur place.
    @MainActor
    public static func decoded(_ sticker: MeeSticker, maxPixelSize: Int) -> AnimatedImageDecoder.Decoded? {
        guard let url = fileURL(for: sticker) else { return nil }
        return decode(url: url, maxPixelSize: maxPixelSize)
    }

    /// **Le film décodé HORS du fil principal.** Un film de 48 images décodé
    /// sur le rendu ferait sauter des images au défilement. `Decoded` n'étant
    /// pas `Sendable`, la tâche de fond REMPLIT le cache, et la vue y lit
    /// ensuite (`decoded`) sur son propre fil.
    @concurrent
    public static func prepareFilm(at url: URL, maxPixelSize: Int) async {
        _ = decode(url: url, maxPixelSize: maxPixelSize)
    }

    private static func decode(url: URL, maxPixelSize: Int) -> AnimatedImageDecoder.Decoded? {
        let key = "\(url.lastPathComponent)|\(maxPixelSize)" as NSString
        if let hit = films.object(forKey: key) { return hit.decoded }
        guard let bytes = try? Data(contentsOf: url, options: .mappedIfSafe),
              let decoded = AnimatedImageDecoder.decode(bytes, maxPixelSize: maxPixelSize) else { return nil }
        let cost = decoded.frames.reduce(0) { $0 + $1.bytesPerRow * $1.height }
        films.setObject(FilmEntry(decoded), forKey: key, cost: cost)
        return decoded
    }

    /// `NSCache` est sûr entre fils (même choix que `StoryFilterProcessor`).
    /// La borne est en OCTETS, pas en nombre : un film de 48 images à 360 px
    /// pèse 25 Mo décodé, et vingt-quatre d'entre eux rempliraient la mémoire
    /// d'un iPhone.
    nonisolated(unsafe) private static let films: NSCache<NSString, FilmEntry> = {
        let cache = NSCache<NSString, FilmEntry>()
        cache.totalCostLimit = 96 * 1024 * 1024
        return cache
    }()

    /// `nonisolated deinit` : `NSCache` évince sur le fil qu'il choisit, et une
    /// deinit isolée au `MainActor` double-libère sur iOS 26.1 (voir
    /// `AnimatedImageMemo.Entry`).
    nonisolated private final class FilmEntry {
        let decoded: AnimatedImageDecoder.Decoded
        init(_ decoded: AnimatedImageDecoder.Decoded) { self.decoded = decoded }
        nonisolated deinit {}
    }
}

// MARK: - Le titre et l'explication d'une intention

extension MeeSticker.Intent {

    /// Le titre de la section — les libellés du web, en sept langues.
    @MainActor
    public var title: String {
        switch self {
        case .bonjour: String(localized: "sticker.sheet.intent.bonjour.title", defaultValue: "Bonjour, merci", bundle: .module)
        case .amour: String(localized: "sticker.sheet.intent.amour.title", defaultValue: "Dire je t’aime", bundle: .module)
        case .fete: String(localized: "sticker.sheet.intent.fete.title", defaultValue: "Rire et fêter", bundle: .module)
        case .soutien: String(localized: "sticker.sheet.intent.soutien.title", defaultValue: "Consoler et soutenir", bundle: .module)
        case .rale: String(localized: "sticker.sheet.intent.rale.title", defaultValue: "Râler et bouder", bundle: .module)
        case .coupDeMou: String(localized: "sticker.sheet.intent.coup-de-mou.title", defaultValue: "Coup de mou", bundle: .module)
        case .surprise: String(localized: "sticker.sheet.intent.surprise.title", defaultValue: "Surprise et frisson", bundle: .module)
        case .quotidien: String(localized: "sticker.sheet.intent.quotidien.title", defaultValue: "Le quotidien", bundle: .module)
        case .humourNoir: String(localized: "sticker.sheet.intent.humour-noir.title", defaultValue: "Humour noir", bundle: .module)
        }
    }

    /// **Quand l'employer** — la phrase sous le titre.
    @MainActor
    public var hint: String {
        switch self {
        case .bonjour: String(localized: "sticker.sheet.intent.bonjour.hint", defaultValue: "Pour saluer, remercier, dire oui, s’excuser ou souhaiter bonne nuit", bundle: .module)
        case .amour: String(localized: "sticker.sheet.intent.amour.hint", defaultValue: "Pour un mot doux, un bisou, un câlin ou une déclaration", bundle: .module)
        case .fete: String(localized: "sticker.sheet.intent.fete.hint", defaultValue: "Pour une bonne nouvelle, un succès, un anniversaire ou un fou rire", bundle: .module)
        case .soutien: String(localized: "sticker.sheet.intent.soutien.hint", defaultValue: "Pour encourager, réconforter ou dire « je suis là »", bundle: .module)
        case .rale: String(localized: "sticker.sheet.intent.rale.hint", defaultValue: "Pour dire son agacement, sa colère, sa jalousie ou prendre ses distances", bundle: .module)
        case .coupDeMou: String(localized: "sticker.sheet.intent.coup-de-mou.hint", defaultValue: "Pour la tristesse, le chagrin, la fatigue ou l’envie de dormir", bundle: .module)
        case .surprise: String(localized: "sticker.sheet.intent.surprise.hint", defaultValue: "Pour l’étonnement, la peur, la gêne ou un « oups »", bundle: .module)
        case .quotidien: String(localized: "sticker.sheet.intent.quotidien.hint", defaultValue: "Pour dire ce qu’on fait : un café, un repas, le travail, la route, un retard", bundle: .module)
        case .humourNoir: String(localized: "sticker.sheet.intent.humour-noir.hint", defaultValue: "Pour rire de tout, même du pire : mort de rire, fantômes et pierres tombales", bundle: .module)
        }
    }
}

// MARK: - L'hôte qui ENVOIE un Mee

/// **Les onglets Mee et Meo n'existent que si un hôte sait envoyer le
/// sticker** (loi 4). La conversation l'injecte ; la scène d'une story, qui ne
/// sait pas poser un film, ne l'injecte pas — et la feuille n'y montre pas les
/// onglets, au lieu de les montrer inertes.
public struct MeeStickerPickKey: EnvironmentKey {
    public static let defaultValue: ((MeeSticker) -> Void)? = nil
}

extension EnvironmentValues {
    public var meeStickerPick: ((MeeSticker) -> Void)? {
        get { self[MeeStickerPickKey.self] }
        set { self[MeeStickerPickKey.self] = newValue }
    }
}

extension View {
    public func meeStickersProvided(onPick: @escaping (MeeSticker) -> Void) -> some View {
        environment(\.meeStickerPick, onPick)
    }
}
