import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le poster d'une vidéo CITÉE dont la vignette serveur a raté** (#8230).
///
/// La passerelle ne sert pas toujours de vignette vidéo : ffmpeg échoue en
/// silence sur une vidéo de moins d'une seconde ou sur un conteneur qu'il lit
/// mal. La bulle vidéo, elle, montre quand même une image — elle l'extrait de
/// la première frame. La citation de la même vidéo retombait sur un glyphe :
/// ce composant lui donne la même image, par la même cascade
/// (`VideoPosterResolver.resolveQuotePoster`) et sous la même clé
/// `thumb:<url>`, si bien qu'un poster extrait pour l'une sert à l'autre.
///
/// Rendu en trois temps, sans jamais une surface vide : le poster persisté au
/// premier `body` (lecture synchrone), sinon le flou ThumbHash que la citation
/// transporte, sinon un aplat de la couleur de l'auteur — puis le poster
/// extrait, en fondu.
///
/// Ne reçoit JAMAIS une pièce protégée : `ReplyReference.quotedAttachment`
/// n'en reconstruit pas, faute d'adresse de fichier.
struct QuotedVideoPoster: View {
    let attachment: MessageAttachment
    let size: CGSize
    let cornerRadius: CGFloat
    let placeholderHex: String

    @State private var poster: UIImage?
    private let blur: UIImage?

    init(attachment: MessageAttachment, size: CGSize, cornerRadius: CGFloat, placeholderHex: String) {
        self.attachment = attachment
        self.size = size
        self.cornerRadius = cornerRadius
        self.placeholderHex = placeholderHex
        self.blur = attachment.thumbHash.flatMap { $0.isEmpty ? nil : UIImage.fromThumbHash($0) }
        _poster = State(initialValue: VideoPosterResolver.persistedQuotePoster(for: attachment))
    }

    var body: some View {
        surface
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .task(id: attachment.fileUrl) {
                guard poster == nil,
                      let resolved = await VideoPosterResolver.resolveQuotePoster(for: attachment),
                      !Task.isCancelled
                else { return }
                withAnimation(.easeIn(duration: 0.15)) { poster = resolved }
            }
    }

    @ViewBuilder
    private var surface: some View {
        if let poster {
            Image(uiImage: poster)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else if let blur {
            Image(uiImage: blur)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            Color(hex: placeholderHex).opacity(0.3)
        }
    }
}
