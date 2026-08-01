import SwiftUI

/// U4 — reprise d'un brouillon de story : cover composite, métadonnées
/// (slides, fraîcheur) et deux actions, « Reprendre » et « Recommencer ».
///
/// S5 — BANDEAU, plus modale. La disposition verticale centrée derrière un
/// voile noir à 0,55 d'opacité était le premier écran rencontré à presque
/// chaque ouverture et interdisait tout accès au canvas avant d'avoir tranché
/// (A3 : « aucun choix bloquant avant le canvas »). La forme est désormais
/// horizontale et compacte pour se poser en bas sans rien recouvrir : le canvas
/// vit derrière, et l'hôte range le bandeau dès que l'utilisateur y touche.
/// « Recommencer » reste le SEUL discard — le libellé DIT la destruction, ce
/// qu'un « Ignorer » (qui suggère un simple report) ne ferait pas ; les 7
/// traductions du catalogue portent la même promesse.
///
/// Building block PUR (SDK purity) : paramètres opaques, aucune décision
/// produit — le composer décide QUAND le présenter et fournit le cover (rendu
/// composite) et les callbacks. `cover == nil` dégrade sans image (le brouillon
/// reste repérable et actionnable).
public struct DraftResumeCard: View {
    /// Hauteur maximale du bandeau. Une valeur nommée, pas un nombre magique :
    /// c'est la borne que le test de rendu oppose à toute re-modalisation.
    public static let bannerMaxHeight: CGFloat = 132

    /// Gabarit du cover dans le bandeau. Légèrement plus large qu'un 9:16 : c'est
    /// le `scaledToFill` ci-dessous qui recadre, jamais le rendu.
    public static let coverSize = CGSize(width: 40, height: 68)

    /// Résolution à laquelle l'hôte compose le cover : une frame de STORY (9:16)
    /// qui couvre le gabarit à @3x (120×204). Publiée ICI parce que c'est le
    /// bandeau qui connaît la taille de son slot — le composer rendait 270×480 sous
    /// un commentaire qui invoquait une carte 108×192 disparue avec la modale, soit
    /// ~6× la surface utile composée puis décompressée pour une vignette.
    public static let coverRenderSize = CGSize(width: 135, height: 240)
    let cover: UIImage?
    let slideCount: Int
    let updatedAt: Date?
    let onResume: () -> Void
    let onDiscard: () -> Void

    public init(cover: UIImage?,
                slideCount: Int,
                updatedAt: Date?,
                onResume: @escaping () -> Void,
                onDiscard: @escaping () -> Void) {
        self.cover = cover
        self.slideCount = slideCount
        self.updatedAt = updatedAt
        self.onResume = onResume
        self.onDiscard = onDiscard
    }

    /// Libellé de fraîcheur PUR (testable) : « à l'instant », « il y a Xmin »,
    /// « il y a Xh », « il y a Xj ». `nil` quand la date est inconnue.
    public static func freshnessLabel(from updatedAt: Date?, now: Date = Date()) -> String? {
        guard let updatedAt else { return nil }
        let seconds = max(0, Int(now.timeIntervalSince(updatedAt)))
        if seconds < 60 {
            return String(localized: "story.draft.freshness.now",
                          defaultValue: "modifié à l'instant", bundle: .module)
        }
        if seconds < 3600 {
            return String(localized: "story.draft.freshness.minutes",
                          defaultValue: "modifié il y a \(seconds / 60) min", bundle: .module)
        }
        if seconds < 86_400 {
            return String(localized: "story.draft.freshness.hours",
                          defaultValue: "modifié il y a \(seconds / 3600) h", bundle: .module)
        }
        return String(localized: "story.draft.freshness.days",
                      defaultValue: "modifié il y a \(seconds / 86_400) j", bundle: .module)
    }

    public var body: some View {
        HStack(spacing: 12) {
            if let cover {
                Image(uiImage: cover)
                    .resizable()
                    .scaledToFill()
                    .frame(width: Self.coverSize.width, height: Self.coverSize.height)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(MeeshyColors.indigo400.opacity(0.6), lineWidth: 1)
                    )
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(String(localized: "story.draft.resume.title",
                            defaultValue: "Reprendre votre story ?", bundle: .module))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(String(localized: "story.draft.resume.slides",
                                defaultValue: "\(slideCount) slide(s)", bundle: .module))
                    if let freshness = Self.freshnessLabel(from: updatedAt) {
                        Text("·").accessibilityHidden(true)
                        Text(freshness)
                    }
                }
                .font(MeeshyFont.relative(12))
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
            }

            Spacer(minLength: 4)

            // Deux actions côte à côte, 44 pt de contact chacune (D1).
            // « Recommencer » porte la seule destruction — ranger n'est PAS
            // jeter, et c'est l'hôte qui range sur interaction avec le canvas.
            HStack(spacing: 8) {
                Button(action: onDiscard) {
                    Text(String(localized: "story.draft.resume.discard",
                                defaultValue: "Recommencer", bundle: .module))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                        .background(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
                }
                Button(action: onResume) {
                    Text(String(localized: "story.draft.resume.resume",
                                defaultValue: "Reprendre", bundle: .module))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                        .background(Capsule().fill(MeeshyColors.brandGradient))
                }
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.draft.resume.a11y",
                                   defaultValue: "Brouillon de story, \(slideCount) slide(s)",
                                   bundle: .module))
    }
}
