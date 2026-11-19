import SwiftUI
import MeeshyUI

/// Le premier chargement de ma vitrine, cache vide (planche `Etat-Chargement`, #19594). Le héros K28 tait déjà la
/// bannière, le disque, le nom et le pseudo ; ce gabarit pose dessous la bio, les pilules de langues, les actions
/// rondes et les cartes, faits du SEUL squelette du kit (K38, loi 12) : aucune forme n'est redessinée ici.
///
/// VoiceOver n'entend qu'une phrase, « Chargement du profil ».
struct ProfileVitrineSkeleton: View {
    static let bioRatios: [Double] = [1, 0.92, 0.58]
    static let languagePillWidths: [Double] = [92, 78, 86, 70]
    static let actionLabelWidths: [Double] = [40, 48, 36, 38]
    static let actionDiameter: Double = 60
    static let cardAspects: [Double] = [3, 4.4]
    static let cardRadius: Double = Double(MeeshyRadius.xxl)

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            bio
            languages
            actions
            cards
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "skeleton.profile.loading", defaultValue: "Chargement du profil", bundle: .main)))
    }

    private var bio: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(Self.bioRatios, id: \.self) { ratio in
                MeeshySkeleton(shape: .line(widthRatio: ratio))
            }
        }
    }

    /// Les pilules de langues : toutes si la largeur les tient, sinon les trois premières (petit écran).
    private var languages: some View {
        ViewThatFits(in: .horizontal) {
            languagePills(Self.languagePillWidths)
            languagePills(Array(Self.languagePillWidths.prefix(3)))
        }
    }

    private func languagePills(_ widths: [Double]) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(widths.map { AsyncRenderRow(id: $0, content: MeeshySkeleton(shape: .pill(width: $0))) },
                    content: asyncRenderRowContent)
        }
    }

    private var actions: some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(Self.actionLabelWidths, id: \.self) { labelWidth in
                VStack(spacing: MeeshySpacing.sm) {
                    MeeshySkeleton(shape: .circle(diameter: Self.actionDiameter))
                    MeeshySkeleton(shape: .line(widthRatio: 1))
                        .frame(width: CGFloat(labelWidth))
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var cards: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(Self.cardAspects, id: \.self) { aspect in
                MeeshySkeleton(shape: .card(aspect: aspect, radius: Self.cardRadius))
            }
        }
    }
}

#if DEBUG
struct ProfileVitrineSkeleton_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ProfileVitrineSkeleton().preferredColorScheme(.light)
            ProfileVitrineSkeleton().preferredColorScheme(.dark)
        }
        .padding(.horizontal, MeeshySpacing.lg)
    }
}
#endif
