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
    ///   - startSceneIndex: la SCÈNE par laquelle on entre, quand le post en
    ///     porte plusieurs — le doigt sur une tuile de mosaïque ouvre SA scène
    ///     (directive porteur 2026-09-06). Sans défaut chez les appelants qui
    ///     n'ont qu'un média à feuilleter : `0` ne coûte rien à une galerie.
    ///   - preferredContentLanguages: le Prisme du LECTEUR, servi au player
    ///     quand le post porte une scène. Vide ⇒ le player retombe sur les
    ///     textes originaux, ce qui est licite mais jamais souhaitable.
    func socialMediaGallery(
        post: FeedPost?,
        isPresented: Binding<Bool>,
        startMediaId: String?,
        startSceneIndex: Int = 0,
        accentColor: String,
        preferredContentLanguages: [String] = []
    ) -> some View {
        fullScreenCover(isPresented: isPresented) {
            if let post {
                // **Une SCÈNE se rejoue, elle ne se feuillette pas** (directive
                // porteur 2026-09-05). Le site unique d'ouverture est le seul
                // endroit qui connaisse la NATURE du post ; c'est donc ici que
                // la question se pose, une fois pour les quatre surfaces qui
                // ouvrent un plein écran.
                //
                // Sans cette branche, un canvas s'ouvrait sur son fond — la
                // photo source, en paysage, sans le texte ni les stickers que
                // l'auteur avait posés. La carte du fil montrait la scène et le
                // plein écran montrait autre chose : le seul des deux formats
                // qu'on ouvre POUR mieux voir était celui qui montrait le moins.
                if let document = SocialFullscreenRoute.scene(of: post) {
                    SocialSceneFullscreenView(
                        post: post,
                        document: document,
                        accentColor: accentColor,
                        preferredContentLanguages: preferredContentLanguages,
                        startSceneIndex: startSceneIndex
                    )
                } else {
                    SocialMediaGalleryContent(
                        post: post, startMediaId: startMediaId, accentColor: accentColor
                    )
                }
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

/// **Ce qu'un post OUVRE en plein écran** — une décision, donc une règle pure
/// et non une condition enfouie dans un `@ViewBuilder`.
///
/// La question n'a qu'une forme : *ce post porte-t-il une scène ?* Un canvas se
/// rejoue par le player ; tout le reste se feuillette par la galerie. Séparée
/// du rendu, elle s'éprouve — et c'est ce qui empêche un futur lot de rerouter
/// silencieusement une scène vers ses ingrédients.
/// `nonisolated` : la règle ne touche rien de l'interface. Sans l'annotation
/// elle hérite de l'isolation `@MainActor` du module et devient inappelable
/// depuis un témoin synchrone — une décision qu'aucun test ne peut interroger
/// n'est pas une décision gardée.
nonisolated enum SocialFullscreenRoute {

    /// Le canvas à rejouer, ou `nil` quand le post n'en porte pas — auquel cas
    /// l'hôte feuillette ses médias.
    ///
    /// **Un canvas VIDE n'est pas une scène.** Le composer stampe une enveloppe
    /// dès qu'il touche une publication ; sans slide, elle ne décrit rien et le
    /// player n'aurait rien à peindre. La galerie, elle, a toujours les médias.
    static func scene(of post: FeedPost) -> CanvasV3? {
        guard let document = post.storyEffects?.canvasV3,
              !document.scenes.isEmpty,
              coversEveryVisual(document, of: post)
        else { return nil }
        return document
    }

    /// **Un canvas qui ne montre pas TOUT ce que le post porte n'a pas le
    /// dernier mot** (régression mesurée puis corrigée le 2026-09-06).
    ///
    /// Mesuré au simulateur : un post composé de DEUX photos part avec ses deux
    /// médias et leurs deux légendes — et un canvas d'UNE seule scène, portant
    /// UN seul média en fond (le composer ne publie que sa slide courante). La
    /// route vers la scène montrait donc une photo sur deux, sans pellicule ni
    /// moyen d'atteindre l'autre. La galerie, elle, les montre toutes.
    ///
    /// > **Un correctif qui améliore le cas visé peut dégrader son voisin.**
    /// > Router une scène vers son player est juste quand le canvas EST la
    /// > publication ; c'est une perte quand il n'en est qu'une partie. La
    /// > première écriture de cette règle ne posait que la question « y a-t-il
    /// > une scène ? » — il fallait aussi demander « montre-t-elle tout ? ».
    ///
    /// La comparaison porte sur le NOMBRE de visuels, pas sur leur identité :
    /// pendant la composition les médias n'ont pas encore d'id serveur, et le
    /// canvas les référence par des clés que le post ne porte pas. Un compte
    /// suffit à répondre à la seule question qui décide — la scène laisse-t-elle
    /// quelque chose dehors ?
    ///
    /// Le jour où le composer publiera toutes ses slides, cette garde deviendra
    /// vraie d'elle-même et cessera de router quoi que ce soit vers la galerie.
    private static func coversEveryVisual(_ document: CanvasV3, of post: FeedPost) -> Bool {
        let visuelsDuPost = post.media.filter { $0.type == .image || $0.type == .video }.count
        guard visuelsDuPost > 0 else { return true }
        let visuelsDuCanvas = document.scenes
            .flatMap(\.objects)
            .filter { $0.kind == .media }
            .count
        return visuelsDuCanvas >= visuelsDuPost
    }
}
