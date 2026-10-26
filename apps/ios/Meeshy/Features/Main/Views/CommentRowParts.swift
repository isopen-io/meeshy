import SwiftUI
import MeeshySDK
import MeeshyUI

/// **The header of a comment row** — author, translation, time — one layout
/// for the post sheet, the post detail and the story viewer (#13133). A served
/// translation shows the original / translated chip pair; otherwise the host
/// may offer "Translate". Only the look (author styling, separators, time
/// format) follows the surface.
struct CommentAuthorHeader<Author: View, Offer: View, Time: View>: View {
    let comment: FeedComment
    let readerLanguages: [String]
    @Binding var showOriginal: Bool
    let metrics: LanguageFlagChip.Metrics
    let spacing: CGFloat
    let separatorFont: Font
    let separatorColor: Color
    let time: Time
    @ViewBuilder let author: () -> Author
    @ViewBuilder let translationOffer: () -> Offer

    var body: some View {
        HStack(spacing: spacing) {
            author()
            if comment.hasServedTranslation {
                separator
                HStack(spacing: MeeshySpacing.xs) {
                    CommentTranslationToggle(comment: comment, readerLanguages: readerLanguages,
                                             showOriginal: $showOriginal, metrics: metrics)
                }
            } else {
                translationOffer()
            }
            separator
            time
        }
    }

    private var separator: some View {
        MetaSeparator().font(separatorFont).foregroundColor(separatorColor)
    }
}

/// **The like of a comment** — one control for the post sheet, the post
/// detail and the story viewer (#13133). Its vocabulary is shared: the ACTION
/// is its name ("Like" / "Unlike"), the COUNT its value — a like is not a
/// toggle. It locks while a heart is in flight; only the look follows the
/// surface.
struct CommentLikeButton: View {
    struct Look {
        let accentHex: String
        let inactiveTint: Color
        let countColor: Color
        let countFont: Font
        let glyphSize: CGFloat
        let likedScale: CGFloat
        let spacing: CGFloat
        var filledWhenInactive = false
        var shadowed = false
        var showsZeroCount = true
    }

    let isLiked: Bool
    let likeCount: Int
    let isInFlight: Bool
    let look: Look
    let action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button {
            withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) { action() }
        } label: {
            HStack(spacing: look.spacing) {
                EngagementGlyph(
                    outline: "heart", filled: "heart.fill", participated: isLiked,
                    accentHex: look.accentHex, activeTint: MeeshyColors.error,
                    inactiveTint: look.inactiveTint, filledWhenInactive: look.filledWhenInactive,
                    size: look.glyphSize, shadowed: look.shadowed
                )
                .scaleEffect(isLiked ? look.likedScale : 1.0)
                if look.showsZeroCount || likeCount > 0 {
                    Text("\(likeCount)").font(look.countFont).foregroundColor(look.countColor)
                }
            }
            .contentShape(Rectangle())
        }
        .disabled(isInFlight)
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(isLiked
            ? String(localized: "a11y.comment.unlike", defaultValue: "Je n'aime plus", bundle: .main)
            : String(localized: "a11y.comment.like", defaultValue: "J'aime", bundle: .main))
        .accessibilityValue(LocalizedNumber.exact(likeCount))
        .accessibilityHint(String(localized: "a11y.comment.like.hint", defaultValue: "Aimer ce commentaire", bundle: .main))
    }
}
