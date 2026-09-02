import Foundation

// MARK: - La famille MÉTÉO (#4820)

/// Le temps qu'il fait, dit en un cartouche. Aucun emplacement : la légende
/// est celle du GABARIT, donc dessinée dans la langue du LECTEUR — le Prisme
/// pour rien, parce que l'id porte le sens (« weather.rainy » se lit « Pluie »
/// en français et « Rain » en anglais).
extension StickerTemplateCatalog.ID {
    public static let weatherSunny = "weather.sunny"
    public static let weatherCloudy = "weather.cloudy"
    public static let weatherRainy = "weather.rainy"
    public static let weatherStormy = "weather.stormy"
    public static let weatherSnowy = "weather.snowy"
    public static let weatherWindy = "weather.windy"
    public static let weatherRainbow = "weather.rainbow"
    public static let weatherHot = "weather.hot"
    public static let weatherCold = "weather.cold"
    public static let weatherNight = "weather.night"
}

extension StickerTemplateCatalog {
    public static let weather: [StickerTemplate] = [
        StickerTemplate(id: ID.weatherSunny, family: .weather,
                        fallbackEmoji: "\u{2600}\u{FE0F}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.weatherCloudy, family: .weather,
                        fallbackEmoji: "\u{2601}\u{FE0F}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.weatherRainy, family: .weather,
                        fallbackEmoji: "\u{1F327}\u{FE0F}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.weatherStormy, family: .weather,
                        fallbackEmoji: "\u{26C8}\u{FE0F}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.weatherSnowy, family: .weather,
                        fallbackEmoji: "\u{2744}\u{FE0F}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.weatherWindy, family: .weather,
                        fallbackEmoji: "\u{1F32C}\u{FE0F}", posedScale: 1.0, animation: .wobble),
        StickerTemplate(id: ID.weatherRainbow, family: .weather,
                        fallbackEmoji: "\u{1F308}", posedScale: 1.0, animation: .pulse),
        StickerTemplate(id: ID.weatherHot, family: .weather,
                        fallbackEmoji: "\u{1F525}", posedScale: 1.0, animation: .heartbeat),
        StickerTemplate(id: ID.weatherCold, family: .weather,
                        fallbackEmoji: "\u{1F976}", posedScale: 1.0, animation: .shake),
        StickerTemplate(id: ID.weatherNight, family: .weather,
                        fallbackEmoji: "\u{1F319}", posedScale: 1.0, animation: .blink),
    ]
}
