import SwiftUI
import MeeshySDK

/// **Ouvrir la galerie plein écran d'un post — un seul site, quatre surfaces**
/// (#4927).
///
/// ## Ce que ce fichier ferme
///
/// `ConversationMediaGalleryView` est la surface qui FEUILLETTE : plein écran,
/// glissement d'un média au suivant, légende par média. Trois surfaces sociales
/// l'ouvraient déjà — la carte du fil, le détail d'un post, un commentaire — en
/// recopiant chacune une vingtaine de lignes : filtrer les médias visuels, les
/// convertir en pièces jointes, composer l'auteur, dériver la carte des
/// légendes.
///
/// > Une composition recopiée n'a pas besoin de diverger pour coûter : il suffit
/// > qu'une quatrième surface arrive. Le réel est cette quatrième surface, et le
/// > geste juste n'était pas d'écrire un quatrième exemplaire.
///
/// ## Ce qu'il ne décide pas
///
/// Ni QUAND ouvrir (l'hôte tient son `isPresented`), ni PAR OÙ (une pastille, un
/// tap sur la vignette, un appui long). Il tient ce qui doit être identique
/// partout : la sélection des médias, l'auteur servi à chaque page, et la
/// LÉGENDE — `SocialMediaCaption` reste le site unique de la règle, appelé ici
/// une fois pour tout le monde plutôt qu'à quatre endroits.
extension View {

    /// - Parameters:
    ///   - post: le porteur des médias. `nil` ⇒ la feuille ne présente rien —
    ///     l'hôte n'a pas à garder son binding, ce qui évite le cas où l'on
    ///     ouvre un plein écran vide pendant un rechargement.
    ///   - startMediaId: le média par lequel on ENTRE. `nil` ⇒ le premier.
    func socialMediaGallery(
        post: FeedPost?,
        isPresented: Binding<Bool>,
        startMediaId: String?,
        accentColor: String
    ) -> some View {
        fullScreenCover(isPresented: isPresented) {
            if let post {
                SocialMediaGalleryContent(
                    post: post, startMediaId: startMediaId, accentColor: accentColor
                )
            }
        }
    }
}

/// La composition elle-même, en vue plutôt qu'en closure : les `let`
/// intermédiaires (pièces jointes, auteur, carte) se lisent, et le
/// `fullScreenCover` ci-dessus reste une ligne.
struct SocialMediaGalleryContent: View {

    let post: FeedPost
    let startMediaId: String?
    let accentColor: String

    /// **Les médias VISUELS seulement.** Un audio n'a pas sa place dans une
    /// galerie qui feuillette des images : il a son propre plein écran
    /// (`audioFullscreenCover`), avec sa transcription et sa piste.
    private var attachments: [MessageAttachment] {
        post.media
            .filter { $0.type == .image || $0.type == .video }
            .map { $0.toMessageAttachment() }
    }

    /// Tous les médias d'un post partagent le même auteur — d'où une carte
    /// remplie d'une seule valeur, et non une résolution par média.
    private var senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] {
        let info = ConversationViewModel.MediaSenderInfo(
            senderName: post.author,
            senderAvatarURL: post.authorAvatarURL,
            senderColor: post.authorColor,
            sentAt: post.timestamp
        )
        return Dictionary(uniqueKeysWithValues: attachments.map { ($0.id, info) })
    }

    var body: some View {
        let items = attachments
        ConversationMediaGalleryView(
            allAttachments: items,
            startAttachmentId: startMediaId ?? items.first?.id ?? "",
            accentColor: accentColor,
            // `captionMap` est le chemin simple, `captionServings` le chemin
            // riche qui porte les alternatives de langue (#4934) : les deux sont
            // servis, comme la carte du fil le faisait déjà. L'ORDRE suit celui
            // de la déclaration — l'init membre à membre l'impose.
            captionServings: SocialMediaCaption.serving(
                for: post.media, carrier: .from(post: post)
            ),
            captionMap: SocialMediaCaption.map(
                for: post.media, carrierText: post.displayContent
            ),
            senderInfoMap: senderInfoMap
        )
    }
}
