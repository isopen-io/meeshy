import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le RETRAIT d'un média, en UN lieu** (#6577) — le meuble, parce qu'il est le
// seul à voir les DEUX porteurs. Le SDK n'a aucun accès au `@State` app-side :
// `deleteElement` et `removeSlide` ne peuvent, par construction, nettoyer que la
// moitié qui se VOIT. C'est ce qui a laissé le média supprimé partir à la
// publication pendant tout un lot — et le gateway le grave à `order: 0`,
// c'est-à-dire en COUVERTURE.
//
// Le précédent existait à une porte : `deleteEditedSound()`
// (`MeeshyComposerHost+Sound.swift`) fait les deux moitiés depuis #4696. La
// famille VISUELLE ne l'avait jamais reçu — les seuls retraits de
// `documentLocalMedia` du dépôt étaient des retraits de SON, plus le « Tout
// effacer », qui n'en est pas un mais un effacement.

@MainActor
extension MeeshyComposerHost {

    /// **Les huit porteurs, vus comme UNE valeur.**
    ///
    /// Ils ne sont pas un cache : ce sont les `@State` eux-mêmes, rassemblés le
    /// temps d'un calcul. Les rassembler est ce qui rend le retrait ATOMIQUE —
    /// `mediaRoleByURL` et `railPosedMediaURLs` portent chacun DEUX charges (la
    /// valeur ET une garde d'idempotence de re-pose), et les traiter séparément
    /// re-pose le média ou bloque en silence sa re-sélection.
    var mediaPorters: ComposerMediaPorters {
        ComposerMediaPorters(
            localMedia: documentLocalMedia,
            roleByURL: mediaRoleByURL,
            slideIdByMediaURL: slideIdByMediaURL,
            objectIdBySource: documentMediaObjectIdBySource,
            captions: documentMediaCaptions,
            altsByObjectId: documentMediaAlts,
            transcriptions: documentTranscriptions,
            railPosedURLs: railPosedMediaURLs)
    }

    /// **Le point d'entrée UNIQUE du retrait d'un média.**
    ///
    /// Les TROIS gestes de suppression y arrivent : le rail trailing de la scène
    /// (`handleTrailingRailAction(.delete)`), le menu d'appui long sur un fond
    /// (`applyBackgroundMenu(.delete)`, #5041) et la corbeille du rail de scènes
    /// (`retractScene(at:)`). Trois sites qui retirent sont trois inventaires à
    /// tenir d'accord, donc un oubli à venir — c'est exactement la forme du
    /// défaut qu'on ferme ici, et le troisième geste ne figurait déjà plus dans
    /// l'inventaire qu'on en avait fait.
    ///
    /// ## L'ordre est PORTEUR
    ///
    /// 1. **La pré-montée d'abord.** `ComposerPreUploadRegistry.forget(url:)`
    ///    n'avait, mesuré, AUCUN appelant de production : un fichier pré-monté
    ///    puis retiré laissait son `PostMedia` orphelin côté serveur, et le
    ///    registre continuait de le tenir pour prêt. L'oubli précède toute
    ///    relecture.
    /// 2. **Les porteurs ensuite, d'un bloc** (voir `mediaPorters`).
    /// 3. **Le SDK en DERNIER.** `.adaptiveOnChange(of: documentLocalMedia)`
    ///    déclenche `syncPostMediaIntoSlides()` : appeler le SDK avant ferait
    ///    courir la dérivation sur un modèle déjà amputé et sur des index encore
    ///    pleins.
    ///
    /// Un `objectId` qui ne désigne aucun fichier (un texte, une pastille) ne
    /// retire rien des porteurs et descend tel quel au SDK : c'est le cas
    /// nominal du rail trailing, qui supprime surtout des objets sans média.
    func retractMedia(objectIds: [String], slideId: String? = nil) {
        let retrait = ComposerMediaRetraction.retracting(
            mediaPorters, objectIds: objectIds, slideId: slideId)

        retrait.retiredURLs.forEach { preUploads.forget(url: $0) }

        documentLocalMedia = retrait.porteurs.localMedia
        mediaRoleByURL = retrait.porteurs.roleByURL
        slideIdByMediaURL = retrait.porteurs.slideIdByMediaURL
        documentMediaObjectIdBySource = retrait.porteurs.objectIdBySource
        documentMediaCaptions = retrait.porteurs.captions
        documentMediaAlts = retrait.porteurs.altsByObjectId
        documentTranscriptions = retrait.porteurs.transcriptions
        railPosedMediaURLs = retrait.porteurs.railPosedURLs

        if let slideId, let index = viewModel.slides.firstIndex(where: { $0.id == slideId }),
           viewModel.slides.count > 1 {
            // `removeSlide` emporte déjà tous les objets de la scène : rejouer
            // `deleteElement` derrière lui frapperait des identifiants que le
            // modèle ne connaît plus.
            viewModel.removeSlide(at: index)
        } else {
            // **`removeSlide` REFUSE de descendre sous une scène** (SDK) — et un
            // refus SILENCIEUX, ici, retournerait le défaut qu'on vient de
            // fermer : le fichier aurait quitté la charge pendant que ses objets
            // resteraient à l'écran. La condition ci-dessus REPRODUIT donc celle
            // du SDK plutôt que de lui faire confiance, et le repli supprime les
            // objets un à un. Ce qui reste est une scène vierge — exactement
            // l'état d'un post sans média.
            //
            // Aucune porte n'atteint ce cas aujourd'hui (le rail de scènes ne se
            // peint pas sous deux scènes, et `ComposerHeaderTiles.showsDelete`
            // l'exige une seconde fois) ; c'est une QUATRIÈME porte à venir qui
            // le rencontrerait, comme la troisième a hérité du défaut d'origine.
            retrait.retiredObjectIds.forEach { viewModel.deleteElement(id: $0) }
        }
    }

    /// **L'adaptateur de la corbeille du rail de scènes** — un INDEX y devient
    /// des identités.
    ///
    /// Le rail ne connaît que la position de la tuile ; le point d'entrée
    /// ci-dessus ne travaille que sur des identités, seule forme qui survive à
    /// l'élagage d'une scène voisine. La traduction vit donc ici, et une seule
    /// fois : la refaire dans la fermeture du rail en ferait un second retrait.
    ///
    /// Les objets de la scène sont nommés EN PLUS de la scène : l'index des
    /// fondations ne connaît que les FONDS, et une scène peut porter des médias
    /// de premier plan qu'aucun fond ne représente.
    func retractScene(at index: Int) {
        guard viewModel.slides.indices.contains(index) else { return }
        let scene = viewModel.slides[index]
        retractMedia(objectIds: (scene.effects.mediaObjects ?? []).map(\.id),
                     slideId: scene.id)
    }
}
