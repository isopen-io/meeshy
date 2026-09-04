import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La porte de l'ENTRÉE EXTERNE** — vue `2a`, « publier une pièce jointe »
/// (#5056).
///
/// > « Le format se choisit là où la pièce arrive. Un profil que la pièce ne
/// > peut pas tenir est montré désactivé avec sa raison, jamais masqué :
/// > l'utilisateur apprend la règle au lieu de la deviner. »
///
/// ## Ce que la porte fait, et ce qu'elle NE fait pas
///
/// Elle monte le meuble sur l'origine `.share`, dont le profil existait depuis
/// longtemps sans qu'aucun site ne le construise (mesuré : zéro
/// `ComposerIntent(origin: .share)` de production avant ce lot). Elle ne
/// redéfinit donc ni l'éventail — `[.story, .post]`, plus `.reel` quand la
/// composition qualifie — ni l'ouverture (`.mediaSeeded`), ni l'audience : tout
/// cela vit dans la table des portes, et le recopier ici en ferait une seconde
/// vérité.
///
/// **Elle ne compose pas non plus la graine.** `ShareComposeHandoffConsumer` la
/// matérialise depuis le conteneur App Group, par les MÊMES trois branches que
/// `ConversationMediaSeeding` — une vidéo reste un fichier, une image se décode
/// hors du main actor au plafond de 1080 px.
///
/// ## Le publieur
///
/// Une pièce partagée depuis l'extérieur n'a pas de source à citer : ce n'est
/// pas un repost. Le socle du document part donc par le publieur DURABLE, celui
/// qui ne demande pas de `FeedViewModel` — le même que la porte du tray, et pour
/// la même raison : hors-ligne, la ligne part en file d'attente au lieu d'être
/// perdue. C'est exactement ce qui manquait à un partage externe, dont l'auteur
/// vient souvent d'une app qu'il a quittée.
struct ShareComposeDoor: View {

    let pending: ShareComposeHandoffConsumer.PendingCompose
    @ObservedObject var storyViewModel: StoryViewModel
    /// Referme la porte ET solde la fiche. Appelée à la publication comme à
    /// l'abandon : dans les deux cas la pièce a été VUE, et la garder ferait
    /// rouvrir le composer au prochain réveil sur un contenu déjà traité.
    let onFinish: () -> Void

    var body: some View {
        MeeshyComposerHost(
            intent: ComposerIntent(origin: .share),
            // Aucune audience mémorisée à semer : `.share` n'a pas de clé de
            // mémoire (délibérément — sa graine vient de la porte), et le socle
            // lira ce que l'auteur choisit. `PostVisibility.friends` est le
            // défaut du SDK, écrit ici plutôt que laissé au hasard d'un défaut
            // de paramètre.
            initialVisibility: PostVisibility.friends.rawValue,
            onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, loadedStickerAnimations, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                storyViewModel.publishStoryInBackground(
                    targetType: targetType,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    // #3956 — un GIF collé dans le composer OUVERT DEPUIS LE
                    // PARTAGE part animé comme partout ailleurs. Cette porte
                    // est née après l'élargissement du canal et ne le portait
                    // pas : le compilateur l'a dit en dix décalages d'un cran,
                    // jamais en nommant l'argument manquant.
                    loadedStickerAnimations: loadedStickerAnimations,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    references: references,
                    composerMediaTexts: ComposerMediaTexts(alt: accessibility.mediaAlt ?? [:],
                                                           caption: accessibility.mediaCaption ?? [:]),
                    allowSoundExtraction: accessibility.allowSoundExtraction
                )
                onFinish()
                // La création accepte TOUJOURS : hors-ligne, la publication part
                // en file d'attente au lieu de rester dans le composer.
                return true
            },
            onPublishDocument: { draft in
                let accepte = await ComposerDocumentDurablePublisher.publish(draft)
                if accepte { onFinish() }
                return accepte
            },
            // Aucune humeur : une pièce jointe n'est pas un emoji.
            moodSeed: nil,
            // **La graine, et c'est tout l'objet de cette porte.**
            mediaSeed: pending.seed,
            // Pas d'aperçu : cette porte n'a pas d'hôte de lecture à monter, et
            // un `onPreview` vide armerait l'œil du socle sur rien — un contrôle
            // INERTE (loi 4). Le meuble ne peint l'œil que sur la scène, où la
            // fermeture est celle-ci ; la laisser vide serait le défaut que
            // #5053 a payé sur les deux portes de story.
            //
            // DETTE NOMMÉE : l'aperçu demanderait de monter `StoryViewerView`
            // ici, donc de remettre à cette porte les trois modèles
            // d'environnement du lecteur. Lot séparé.
            onPreview: { _, _, _, _, _ in },
            onDismiss: onFinish
        )
    }
}

extension View {
    /// Le cover de l'entrée externe, appliqué par une RACINE — comme
    /// `StoryComposerCover`. Deux racines l'appliquent (iPhone, iPad) et une
    /// seule est montée à la fois.
    ///
    /// `fullScreenCover(item:)` et non `isPresented:` : deux partages rapides
    /// se suivent, et un booléen ne saurait pas rouvrir le composer sur la
    /// SECONDE pièce sans démonter la première.
    func shareComposeCover(
        consumer: ShareComposeHandoffConsumer,
        storyViewModel: StoryViewModel
    ) -> some View {
        modifier(ShareComposeCover(consumer: consumer, storyViewModel: storyViewModel))
    }
}

private struct ShareComposeCover: ViewModifier {
    @ObservedObject var consumer: ShareComposeHandoffConsumer
    @ObservedObject var storyViewModel: StoryViewModel

    func body(content: Content) -> some View {
        content.fullScreenCover(
            item: Binding(
                get: { consumer.pending },
                // Le `set` ne SOLDE pas la fiche : un balayage à blanc (SwiftUI
                // repose l'item à `nil` au démontage) l'effacerait sans que
                // l'auteur ait rien fait. C'est `onFinish` qui solde, et lui
                // seul.
                set: { if $0 == nil { } }
            )
        ) { pending in
            ShareComposeDoor(
                pending: pending,
                storyViewModel: storyViewModel,
                onFinish: { consumer.finish(pending.shareId) }
            )
        }
    }
}
