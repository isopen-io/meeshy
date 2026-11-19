import SwiftUI

/// Les polices du kit dont la TAILLE est une valeur de recette : le titre qui se
/// replie de 36 à 17, le chiffre de 48, 34 ou 24, le glyphe d'un disque. Elles ne
/// se rangent pas dans l'échelle de texte relative sans perdre leur valeur ; la
/// grande police est portée par la mise en page (la bande s'empile, la grille
/// perd une colonne), pas par un corps qui grossit.
enum MeeshyKitFont {
    static func exact(_ size: Double, weight: Font.Weight = .regular, design: Font.Design = .default) -> Font {
        Font.system(size: CGFloat(size), weight: weight, design: design)
    }
}
