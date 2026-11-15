import Foundation
import MeeshySDK

// MARK: - Sticker Template Family Drawing

/// Ce qu'un type de famille déclare : la famille du catalogue qu'il dessine,
/// et ses dessinateurs. Un type par famille, dans son propre fichier — jamais
/// une extension commune, qui reformerait une unité de douze mille lignes.
@MainActor
protocol StickerTemplateFamilyDrawing {
    static var family: StickerTemplateFamily { get }
    static var drawers: [StickerTemplateDrawer] { get }
}

// MARK: - Sticker Template Family Table

/// **Une famille du catalogue, un type de dessin** (LOT-22).
///
/// Le `switch` est EXHAUSTIF et sans `default` : ajouter une
/// `StickerTemplateFamily` sans lui donner son type ne compile pas. C'est le
/// compilateur, et non un témoin, qui garantit « au moins un dessinateur par
/// famille ».
enum StickerTemplateFamilyTable {

    @MainActor
    static func drawing(for family: StickerTemplateFamily) -> any StickerTemplateFamilyDrawing.Type {
        switch family {
        case .location: LocationStickerTemplates.self
        case .time: TimeStickerTemplates.self
        case .love: LoveStickerTemplates.self
        case .weather: WeatherStickerTemplates.self
        case .text: TextStickerTemplates.self
        case .joy: JoyStickerTemplates.self
        case .surprise: SurpriseStickerTemplates.self
        case .mood: MoodStickerTemplates.self
        case .greeting: GreetingStickerTemplates.self
        case .reaction: ReactionStickerTemplates.self
        case .party: PartyStickerTemplates.self
        case .availability: AvailabilityStickerTemplates.self
        case .nature: NatureStickerTemplates.self
        case .cheer: CheerStickerTemplates.self
        case .answer: AnswerStickerTemplates.self
        case .food: FoodStickerTemplates.self
        case .sport: SportStickerTemplates.self
        case .travel: TravelStickerTemplates.self
        case .work: WorkStickerTemplates.self
        case .music: MusicStickerTemplates.self
        }
    }

    @MainActor
    static func drawers(for family: StickerTemplateFamily) -> [StickerTemplateDrawer] {
        drawing(for: family).drawers
    }
}
