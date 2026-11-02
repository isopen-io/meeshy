import SwiftUI
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Ce que le meuble garde du DOCUMENT** depuis qu'un post et un réel se
// composent sur la scène (#13864, R1) : la feuille caméra, le gate du réel, le
// rail des scènes, la porte Texte et la projection du média vers la scène. La
// surface document elle-même n'est plus montée — `ComposerMountedView.mounted`
// rend la scène pour toute porte qui compose.

extension MeeshyComposerHost {

    /// La capture caméra du document : le viseur du composeur, servi
    /// SEUL en plein écran — un statut n'a pas de scène où l'armer.
    /// C'est le même viseur que la page blanche emprunte par environnement.
    var documentCameraSheet: some View {
        ComposerViewfinder(initialMode: pendingCameraMode) { result in
            Task { await ingestCameraCapture(result) }
        }
    }

    /// **Le gate de l'interrupteur (T2.4).** Même prédicat SDK que
    /// `PublishIntent.document` juge en aval (`ReelComposition.defaultType`
    /// via `qualifiesAsReel`) — jamais un seuil recopié ici. Sans lui,
    /// l'interrupteur resterait peint sur une composition qui n'a rien à
    /// offrir (loi 4) : une image seule ou un texte seul ne qualifient pas.
    var documentComposesReel: Bool {
        ReelComposition.qualifiesAsReel(
            mimeTypes: documentLocalMedia.map(\.mimeType),
            durationsMs: documentLocalMedia.map(\.durationMs)
        )
    }

    /// **Le média du document, traduit pour la scène.** Ne porte
    /// que l'IMAGE et la VIDÉO : un son ou un document joint n'a pas de place de
    /// fond sur un canvas. `applyContentMedia` est idempotent (clé = `sourceURL`),
    /// donc câbler cette liste à chaque bascule ne duplique rien. Le média VISUEL
    /// est aussi, par construction, ce qui fait qu'une composition qualifie comme
    /// scène — le texte, lui, suit par `applyContentText`.
    ///
    /// **Le classement image/vidéo passe par `ComposerIngestRouter.route(mime:)`**,
    /// le SEUL classeur MIME du dépôt (six sites de production) — jamais un
    /// `hasPrefix` recopié, qui divergerait de la casse et des repli qu'il gère.
    /// **Ce que la rangée haute montre — les FONDS, et rien d'autre.**
    ///
    /// Les deux barres hautes ne reçoivent pas `documentLocalMedia`, la liste
    /// ENTIÈRE : une tuile paraîtrait pour tout ce qui entre — une image posée SUR
    /// la scène, un vocal qui a déjà sa carte sous le texte, un PDF qui n'est
    /// aucune page. Le carrousel grossirait sans qu'on ait ajouté de page, et
    /// taper la tuile ne mènerait nulle part — l'hôte ne sait naviguer que vers une
    /// slide, et ces médias n'en fondent aucune.
    ///
    /// La règle lit l'index des FONDATIONS, jamais une seconde vérité :
    /// `slideIdByMediaURL` dit déjà « ce média a fondé cette slide », ce qui est
    /// exactement l'ensemble des fonds.
    /// **Le rail des scènes, monté UNE fois pour les deux surfaces.**
    ///
    /// Il montre une mini-preview par SCÈNE — y compris celle qui n'a aucun
    /// média, née d'un fond coloré : une rangée qui compterait les médias
    /// fondateurs ne produirait aucun retour à la création d'une scène, tant
    /// qu'on ne lui a pas donné de photo.
    ///
    /// Chaque tuile EST la vignette de sa scène ; le rail se
    /// monte dès qu'une scène existe et est montée (`showsRail`) — une scène
    /// neuve y paraît donc tout de suite, noire parce qu'elle est vide.
    var slideRailSlot: AnyView? {
        let scenes = ComposerHeaderTiles.tiles(for: viewModel.slides)
        guard ComposerHeaderTiles.showsRail(sceneCount: scenes.count, scenePresent: sceneIsPresent) else {
            return nil
        }
        return AnyView(ComposerSlideRail(
            slides: scenes,
            currentIndex: viewModel.currentSlideIndex,
            slideImages: viewModel.slideImages,
            loadedImages: viewModel.loadedImages,
            onSelect: { viewModel.selectSlide(at: $0) },
            onDelete: { retractScene(at: $0) }))
    }

    /// **L'outil Texte du document : la scène, le texte posé, le clavier — un
    /// seul geste**. Le fond suit le chemin de la palette, la saisie
    /// celui de la porte Texte de la scène (`handleRailDoor(.text)`).
    func openTextScene() {
        guard let fond = ComposerTextSceneDoor.background(
            chosen: documentBackground, palette: StoryBackgroundPalette.colors
        ) else { return }
        HapticFeedback.light()
        textSceneImplicitBackground = ComposerTextSceneDoor.implicitBackground(
            chosen: documentBackground, posed: fond)
        documentBackground = fond
        viewModel.applyBackground(hex: fond)
        // Le texte se pose au tour suivant : la scène vient d'être montée, et un
        // canvas sans taille ni fenêtre ouvrirait une saisie invisible, sans
        // clavier — mesuré au simulateur.
        DispatchQueue.main.async {
            guard documentBackground == fond, let objet = viewModel.addText() else { return }
            beginSceneTextEditing(objet.id)
        }
    }

    /// La saisie se ferme : une scène restée nue rend le document — le texte
    /// vide est déjà retiré par `exitTextEditingMode`, le fond implicite part.
    func settleTextSceneAfterEditing() {
        guard let implicite = textSceneImplicitBackground else { return }
        textSceneImplicitBackground = nil
        guard ComposerTextSceneDoor.returnsToDocument(
            implicitBackground: implicite,
            currentBackground: documentBackground,
            foundedSlides: slideIdByMediaURL.count,
            sceneObjectCount: viewModel.currentSlide.sceneObjects.count,
            slideCount: viewModel.slides.count
        ) else { return }
        documentBackground = nil
        viewModel.clearBackground()
        selectedSceneItemId = nil
        selectedSceneItemKind = nil
    }

    var documentContentMedia: [ComposerContentMedia] {
        documentLocalMedia.compactMap { media in
            switch ComposerIngestRouter.route(mime: media.mimeType) {
            // **Le mime DÉCLARÉ voyage avec le média** — jamais
            // re-dérivé du nom du fichier. La pose COPIE la source sous
            // `{objectId}.{ext}`, et c'est ce nom que l'aval relit pour
            // étiqueter le téléversement : sans le mime, une URL sans extension
            // partait sous un repli codé en dur (« jpg » / « mov »).
            case .image:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .image, mimeType: media.mimeType)
            case .video:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .video,
                    durationMs: media.durationMs, mimeType: media.mimeType)
            // **Le son rejoint la scène.** Il ne devient PAS une slide
            // (voir `syncPostMediaIntoSlides`) : le modèle § 4 lui donne un
            // TROISIÈME emplacement, la bande-son de la scène — pas une page du
            // carrousel.
            case .audio:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .audio,
                    durationMs: media.durationMs, mimeType: media.mimeType)
            // Un DOCUMENT reste hors scène, et ce n'est pas un oubli : il n'a de
            // place ni visuelle ni sonore. Il part comme pièce jointe du post.
            case .file:
                return nil
            }
        }
    }

    /// **La COUCHE D'ÉCRITURE.**
    ///
    /// Ce que l'auteur écrit ici part comme `slide.content` (via
    /// `applyContentText`, le même canal que B1) et le reader l'affiche
    /// par-dessus le canvas composé — la légende `content` des viewers
    /// existants. C'est la surface d'ÉDITION, côté scène, du contenu que B1
    /// préserve entre les modes ; jamais un second champ.
    ///
    /// ## Une couche, pas une barre
    ///
    /// Une **barre repliable à chevron** serait trois éléments de chrome pour dire
    /// ce que le lecteur verrait, et qui ne le montreraient pas. Un **calque de
    /// lecture** le montrerait — mais depuis le bas de l'écran, en permanence,
    /// alors que la scène est CENTRÉE et marginée : cette place permanente est
    /// précisément celle qu'il faut lui rendre.
    ///
    /// Elle est donc une **couche**, ouverte par l'icône de la rangée haute. Le
    /// calque de lecture est ce que la couche contient — même composant, mêmes
    /// mentions, même rendu par le renderer du lecteur.
    ///
    /// ## Le flou vient du MATÉRIAU, jamais d'un `.blur()`
    ///
    /// `.ultraThinMaterial` floute ce qui est derrière lui par composition, sans
    /// toucher à la vue floutée. Un `.blur(radius:)` sur l'atelier aurait
    /// re-rendu le canvas — `StoryCanvasUIView` reconstruit ses layers à chaque
    /// `layoutSubviews` — pour un effet que le système sait produire à coût nul.
    /// La hauteur que la couche laisse à l'en-tête. Le chrome de l'atelier est
    /// FLOTTANT — il ne prélève aucune hauteur —, donc cette réserve est ce qui
    /// le garde net. Même valeur que celle dont le canvas cardé se décale, pour
    /// que les deux bords tombent à la même ligne.
    /// 44 pt de cible + 32 pt d'air. À 52 pt la rangée serait
    /// coupée en deux par le bord du matériau — la réserve doit couvrir la
    /// CIBLE tactile entière, pas la seule pastille visible (36 pt).
}
