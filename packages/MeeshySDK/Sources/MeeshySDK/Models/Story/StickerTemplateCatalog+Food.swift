import Foundation

// MARK: - La famille NOURRITURE (#4820)

/// On mange, on boit, c'est bon — une tasse, une part, un gâteau, deux
/// flûtes, un cornet, un croissant, un bol, un burger, et deux mots. Aucun
/// emplacement : ce qui s'y lit est la légende du GABARIT, dessinée dans la
/// langue du LECTEUR (« Café ? » se lit « Coffee? » à Londres).
///
/// Les cinq motifs nus — part, gâteau, cornet, bol, burger — ne portent aucun
/// texte : rien ne les fait mesurer large, d'où une échelle de pose au-dessus
/// de 1, la même raison que les cœurs de la famille AMOUR. Les cartouches et
/// les rubans mesurent leur mot et se posent à 1.
extension StickerTemplateCatalog.ID {
    public static let foodCoffee = "food.coffee"
    public static let foodPizza = "food.pizza"
    public static let foodBirthdayCake = "food.birthdayCake"
    public static let foodCheers = "food.cheers"
    public static let foodIceCream = "food.iceCream"
    public static let foodCroissant = "food.croissant"
    public static let foodRamen = "food.ramen"
    public static let foodBurger = "food.burger"
    public static let foodYum = "food.yum"
    public static let foodBonAppetit = "food.bonAppetit"
}

extension StickerTemplateCatalog {
    public static let food: [StickerTemplate] = [
        // La vapeur flotte ; la bougie clignote ; les flûtes font « tada » au
        // choc ; le croissant, le bol et le ruban restent à table.
        StickerTemplate(id: ID.foodCoffee, family: .food,
                        fallbackEmoji: "\u{2615}", posedScale: 1.0, animation: .float),
        StickerTemplate(id: ID.foodPizza, family: .food,
                        fallbackEmoji: "\u{1F355}", posedScale: 1.4, animation: .wobble),
        StickerTemplate(id: ID.foodBirthdayCake, family: .food,
                        fallbackEmoji: "\u{1F382}", posedScale: 1.3, animation: .blink),
        StickerTemplate(id: ID.foodCheers, family: .food,
                        fallbackEmoji: "\u{1F942}", posedScale: 1.0, animation: .tada),
        StickerTemplate(id: ID.foodIceCream, family: .food,
                        fallbackEmoji: "\u{1F366}", posedScale: 1.4, animation: .swing),
        StickerTemplate(id: ID.foodCroissant, family: .food,
                        fallbackEmoji: "\u{1F950}", posedScale: 1.0),
        StickerTemplate(id: ID.foodRamen, family: .food,
                        fallbackEmoji: "\u{1F35C}", posedScale: 1.3),
        StickerTemplate(id: ID.foodBurger, family: .food,
                        fallbackEmoji: "\u{1F354}", posedScale: 1.4, animation: .bounce),
        StickerTemplate(id: ID.foodYum, family: .food,
                        fallbackEmoji: "\u{1F60B}", posedScale: 1.0, animation: .pop),
        StickerTemplate(id: ID.foodBonAppetit, family: .food,
                        fallbackEmoji: "\u{1F37D}\u{FE0F}", posedScale: 1.0),
    ]
}
