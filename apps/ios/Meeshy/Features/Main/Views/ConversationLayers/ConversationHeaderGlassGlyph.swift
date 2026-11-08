import SwiftUI
import MeeshyUI

// MARK: - Le glyphe des icônes de l'en-tête de conversation (#17095)

/// LE gabarit de toute icône de l'en-tête : un cercle de verre INTERACTIF de
/// 28 pt teinté à l'accent de la conversation, sur une cible de 44 pt. C'est le
/// gabarit du bouton d'appel, extrait pour que l'appel, la loupe, la porte de
/// l'aperçu, le partage et la fermeture de l'invité répondent au doigt de la
/// même façon : le verre réagit dès le toucher (iOS 26), la surbrillance du
/// `Button` ou du `Menu` qui le porte fait le reste en deçà.
///
/// Struct NOMINALE : le type structurel du glyphe (opaques `adaptiveGlass` +
/// `meeshyTapTarget`) reste scopé à ce body au lieu de gonfler le mangled name
/// du bouton hôte — dont le décodage récursif a déjà débordé la pile du main
/// thread au premier rendu sur appareil (.ips 2026-07-30).
///
/// Les capsules de l'en-tête (retour, puce de mode) reprennent la même teinte
/// et la même interactivité par `glassTintOpacity` et `isGlassInteractive`.
struct ConversationHeaderGlassGlyph: View {
    static let diameter: CGFloat = MeeshyControlSize.small
    static let glassTintOpacity: Double = 0.4
    static let isGlassInteractive = true

    let systemName: String
    let accentColor: String
    let secondaryColor: String

    var body: some View {
        Image(systemName: systemName)
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
            .foregroundStyle(
                LinearGradient(
                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            // `.adaptiveGlass` DOIT précéder `.meeshyTapTarget()` : le verre est
            // un Circle dimensionné aux bornes COURANTES de la vue — appliqué
            // après le `.frame(minWidth: 44…)` de la cible, il se dessinerait à 44 pt.
            .frame(width: Self.diameter, height: Self.diameter)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(Self.glassTintOpacity), interactive: Self.isGlassInteractive)
            .meeshyTapTarget()
    }
}
