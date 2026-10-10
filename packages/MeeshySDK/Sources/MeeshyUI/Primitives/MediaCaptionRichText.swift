import SwiftUI
import MeeshySDK

/// **Le rendu d'une légende posée sur un média** — adresses, mentions et
/// hashtags CLIQUABLES, en blanc sur la scène (#9075).
///
/// Le rendu par défaut (`MediaCaptionPlainText`) est du texte simple : une
/// adresse y restait une chaîne morte. Celui-ci passe par `MessageTextRenderer`,
/// et une adresse présente dans `trackedLinks` (la carte `{ url → token }` que
/// la passerelle sert avec le contenu) s'ouvre par `<origine web>/l/<token>` —
/// le clic est compté, l'adresse AFFICHÉE reste celle que l'auteur a écrite.
///
/// Un seul rendu pour les légendes de story, de galerie, de scène et de réel :
/// le même texte ne doit pas être cliquable sur une surface et mort sur l'autre.
public struct MediaCaptionRichText: View {
    private let text: String
    private let size: CGFloat
    private let trackedLinks: [String: String]
    private let validUsernames: Set<String>?
    private let webOrigin: String

    public init(_ text: String,
                size: CGFloat,
                trackedLinks: [String: String] = [:],
                validUsernames: Set<String>? = nil,
                webOrigin: String = MeeshyConfig.shared.webOrigin) {
        self.text = text
        self.size = size
        self.trackedLinks = trackedLinks
        self.validUsernames = validUsernames
        self.webOrigin = webOrigin
    }

    /// Ce que la légende peint, liens compris — lisible sans monter la vue.
    public var attributed: AttributedString {
        MessageTextRenderer.attributed(
            text,
            fontSize: size,
            color: .white,
            mentionColor: MeeshyColors.mentionColor(isDark: true),
            hashtagColor: MeeshyColors.hashtagColor(isDark: true),
            accentColor: .white,
            usesRelativeFont: true,
            trackedLinks: trackedLinks.isEmpty ? nil : trackedLinks,
            validUsernames: validUsernames,
            webOrigin: webOrigin
        )
    }

    public var body: some View {
        Text(attributed)
            .tint(.white)
    }
}

public extension MediaCaptionOverlay where TextBody == MediaCaptionRichText {
    /// La légende aux adresses suivies : la règle de repli du composant, le
    /// rendu riche de `MediaCaptionRichText`.
    init(caption: String,
         isExpanded: Bool,
         trackedLinks: [String: String],
         validUsernames: Set<String>? = nil,
         horizontalInset: CGFloat = 20,
         maxExpandedHeight: CGFloat = 420,
         expandedTrailingInset: CGFloat = 0,
         scrollToTopToken: Int = 0,
         dimsBackgroundWhenExpanded: Bool = true,
         accessory: AnyView? = nil,
         onToggle: @escaping () -> Void) {
        self.init(caption: caption,
                  isExpanded: isExpanded,
                  horizontalInset: horizontalInset,
                  maxExpandedHeight: maxExpandedHeight,
                  expandedTrailingInset: expandedTrailingInset,
                  scrollToTopToken: scrollToTopToken,
                  dimsBackgroundWhenExpanded: dimsBackgroundWhenExpanded,
                  accessory: accessory,
                  onToggle: onToggle,
                  render: { texte, taille in
                      MediaCaptionRichText(texte, size: taille,
                                           trackedLinks: trackedLinks,
                                           validUsernames: validUsernames)
                  })
    }
}
