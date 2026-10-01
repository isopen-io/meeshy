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

    nonisolated public enum Character: String, Sendable {
        case mee
        case meo
    }

    nonisolated public enum Section: String, Sendable {
        case solo
        case duo
    }

    public let id: String
    public let tab: Character
    public let section: Section
    /// Le nom du sticker — celui que VoiceOver dit, comme le `aria-label` du web.
    public let title: String
    public let emoji: String
    public let animated: Bool

    public init(id: String, tab: Character, section: Section, title: String, emoji: String, animated: Bool) {
        self.id = id
        self.tab = tab
        self.section = section
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
        public let section: MeeSticker.Section
        public let stickers: [MeeSticker]
        public var id: MeeSticker.Section { section }
    }

    private static let byID: [String: MeeSticker] =
        Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

    public static func stickers(of character: MeeSticker.Character) -> [MeeSticker] {
        all.filter { $0.tab == character }
    }

    /// Solo d'abord, puis « à deux » — l'ordre des onglets du web.
    public static func sections(of character: MeeSticker.Character) -> [SectionGroup] {
        let ofCharacter = stickers(of: character)
        return [MeeSticker.Section.solo, .duo].compactMap { section in
            let stickers = ofCharacter.filter { $0.section == section }
            return stickers.isEmpty ? nil : SectionGroup(section: section, stickers: stickers)
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
