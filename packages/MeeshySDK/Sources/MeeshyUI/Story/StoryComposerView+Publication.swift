import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Publication

/// Ce que la fermeture par la croix doit proposer. Deux questions distinctes,
/// que l'ancien `guard !composerHasContent` confondait en une : « y a-t-il du
/// travail à perdre ? » et « le brouillon sait-il le retenir ? ».
public nonisolated enum ComposerExitPrompt: Equatable, Sendable {
    /// Rien à perdre : la croix ferme, sans un mot.
    case leaveSilently
    /// Il y a du travail en cours. `offersSave` dit si la feuille a le droit de
    /// proposer « Sauvegarder » — le reste (« Quitter », « Annuler ») est
    /// toujours offert.
    case confirm(offersSave: Bool)

    public var offersSave: Bool {
        if case .confirm(let offersSave) = self { return offersSave }
        return false
    }
}

extension StoryComposerView {
    // MARK: - Pickers

    /// C7 — la sheet Transitions était un stub (`Text("Transitions")`).
    /// Elle pilote désormais le SEUL volet fonctionnel bout-en-bout :
    /// l'animation d'OUVERTURE du slide courant (`effects.opening`, rendue par
    /// `StoryRenderer.applyOpening` au passage edit→play et par l'export
    /// AVCompositor). `closing` est sérialisé mais rendu NULLE PART — pas d'UI
    /// tant qu'un `applyClosing` n'existe pas (une UI sans effet mentirait).
    /// Les transitions ENTRE clips vivent dans la timeline (TransitionInspector).
    var transitionPicker: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text(String(
                    localized: "story.composer.openingTitle",
                    defaultValue: "Ouverture du slide",
                    bundle: .module
                ))
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                Text(String(
                    localized: "story.composer.openingHint",
                    defaultValue: "Animation d'entrée du slide courant, visible en aperçu et en lecture.",
                    bundle: .module
                ))
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.55))
            }
            // Persistance via granularCanvasSync (openingEffect tracké) —
            // même chemin que le panneau Fond du band (C1, source unique VM).
            OpeningEffectChips(selection: viewModel.openingEffect) { effect in
                viewModel.openingEffect = effect
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// C3 — le tap « Publier » est ENTIÈREMENT synchrone : plus aucun `await`
    /// entre le geste et la fermeture du composer. Les thumbHashes, qui
    /// bloquaient jusqu'ici la main pendant l'extraction des frames vidéo, sont
    /// calculés EN AVAL par `StoryThumbHashEnricher` — après le hand-off, après
    /// l'écriture write-ahead, avant le premier octet réseau.
    ///
    /// Ordre des invariants strictement préservé : flush timeline → sync des
    /// effets → snapshot → haptic → hand-off → (si accepté) purge des
    /// brouillons + suspension d'autosave (E1) + loquet.
    func publishAllSlides() {
        guard !didHandOffPublish else { return }
        // Publier avec la sheet timeline OUVERTE ne doit pas perdre les
        // édits en vol — même flush que l'autosave de draft.
        flushOpenTimelineIntoSlide()
        syncCurrentSlideEffects()
        let slides = Self.handoffSlides(
            viewModel.slides,
            currentIndex: viewModel.currentSlideIndex,
            currentEffects: buildEffects()
        )
        HapticFeedback.success()
        // A11y-7 — le haptique n'a pas d'équivalent sonore : contrairement au
        // succès/échec final (déjà annoncé par `FeedbackToastManager.present`
        // pour chaque toast), rien n'existe encore à CE point précis du flux
        // (le hand-off n'a pas encore de toast). VoiceOver doit savoir que le
        // tap a été pris en compte, que la publication finisse en ligne ou
        // dans la file offline.
        AdaptiveAccessibility.announce(String(
            localized: "story.composer.a11y.publishStarted",
            defaultValue: "Publication de la story lancée",
            bundle: .module
        ))
        let mode = PostVisibility(rawValue: visibility) ?? .public
        let ids = mode.requiresUserSelection ? visibilityUserIds : []
        let accepted = onPublishAllInBackground(
            slides, viewModel.slideImages, viewModel.loadedImages,
            viewModel.loadedVideoURLs, viewModel.loadedAudioURLs,
            storyLanguage, visibility, ids
        )
        // Tout ce qui est DESTRUCTIF attend de savoir si le hand-off a été
        // accepté. Un refus (édition hors-ligne, surface inerte) laisse le
        // composer ouvert : jeter son brouillon et tuer son autosave le
        // priverait de son filet pour toute la session de composition. Le
        // loquet suit la même règle — posé sur un refus, il grise le bouton
        // Publier à vie. Aucun `await` ne sépare le hand-off de ces lignes :
        // le callback est synchrone, rien ne peut re-persister entre-temps.
        guard accepted else { return }
        // Le brouillon jeté ici est celui de la story qui vient de partir : il
        // lui appartient. La branche `else` n'est plus celle de la page blanche
        // (le bouton est gaté par `canPublish`) mais celle de la story
        // « fond + musique » : rien de VISUEL n'a été composé, donc rien ne
        // supplante ce que le bandeau venait de proposer. Même règle que la
        // fermeture par le X : on ne purge que les fantômes.
        if composerHasContent { clearAllDrafts() } else { clearPhantomDraftsOnly() }
        // E1 — un debounce d'autosave en vol ne doit pas re-persister le
        // brouillon d'une story qui vient de partir en publication.
        draftAutosaveSuspended = true
        // Le loquet n'existe QUE pour qu'un second tap pendant l'animation de
        // dismiss ne re-publie pas la même story.
        didHandOffPublish = true
    }

    /// Snapshot remis au callback : une COPIE de `slides` où les effets du
    /// canvas courant sont rabattus sur la slide courante. Pur et testable
    /// sans UI — c'est la seule partie décidable de `publishAllSlides()`.
    ///
    /// NB : on n'écrit plus `effects.slideDuration` à chaque publish
    /// depuis la centralisation 2026-05-28. La durée est entièrement
    /// dérivée from-scratch côté lecteur par
    /// `StorySlide.computedTotalDuration()` (bg media duration loop /
    /// texte long / défaut 6s). Le champ `effects.slideDuration` reste
    /// dans le schema pour compat backend mais le viewer ne le lit
    /// plus — il est ignoré. Si un jour on veut une vraie surcharge
    /// explicite par l'auteur, ce sera un champ dédié (ex:
    /// `effects.authorPinnedDuration`) lu en priorité dans
    /// `computedTotalDuration`.
    static func handoffSlides(
        _ slides: [StorySlide],
        currentIndex: Int,
        currentEffects: StoryEffects
    ) -> [StorySlide] {
        var copy = slides
        if currentIndex >= 0, currentIndex < copy.count {
            copy[currentIndex].effects = currentEffects
        }
        return copy
    }

    /// Seul l'APERÇU passe encore par un enrichissement synchrone au tap : il
    /// n'y a rien à rendre derrière, l'utilisateur attend explicitement un
    /// lecteur. Le chemin de publication, lui, ne l'attend plus (C3).
    func snapshotAllSlides() async -> (slides: [StorySlide], bgImages: [String: UIImage]) {
        let slides = Self.handoffSlides(
            viewModel.slides,
            currentIndex: viewModel.currentSlideIndex,
            currentEffects: buildEffects()
        )
        let enriched = await StoryThumbHashEnricher.enrich(
            slides: slides,
            bgImages: viewModel.slideImages,
            loadedImages: viewModel.loadedImages,
            videoURLs: viewModel.loadedVideoURLs
        )
        return (enriched, viewModel.slideImages)
    }

    /// Règle PURE « le composer porte du contenu » — SEULE source de vérité,
    /// partagée par l'alerte de sortie (`handleDismiss`), l'auto-save de
    /// draft au passage en background (D1), l'autosave débouncé (E1) et le
    /// gate de purge des brouillons fantômes (`shouldOfferDraftResume`,
    /// `StoryComposerView+SyncRestore.swift`). Un jumeau `isComposerEmpty`
    /// vivait dans `StoryComposerView+Canvas.swift` et divergeait sur trois
    /// points (fond compté ici mais pas là, stickers scannés seulement sur le
    /// slide courant, dessin legacy absent) ; il a été supprimé, sa portée
    /// slide-scoped reprise par `currentSlideIsEmpty` (négation de
    /// `slideHasContent`, plus bas dans ce fichier).
    ///
    /// Le FOND (auto-appliqué à l'ouverture ou choisi explicitement dans le
    /// panneau Fond) ne compte JAMAIS seul comme contenu — décision produit
    /// tranchée (arbitrage S2) : une couleur/dégradé n'a de valeur narrative
    /// que combiné à du texte, un média, un dessin, un sticker ou un lieu.
    /// Aucun leader SOTA (Snapchat/Instagram/TikTok/WhatsApp) ne permet de
    /// publier un rectangle coloré vide comme story.
    ///
    /// Testable sans UI. Scanne TOUS les slides pour CHAQUE champ (y compris
    /// stickers et dessin legacy, auparavant limités au slide courant via les
    /// 3 paramètres globaux ci-dessous). Ces paramètres restent dans la
    /// signature comme filets de sécurité redondants pour le slide COURANT —
    /// NE PAS les supprimer en pensant nettoyer du code mort : ils gardent
    /// 3 tests qui les exercent isolément verts sans rupture d'API.
    static func composerHasContent(
        slides: [StorySlide],
        slideImageIds: Set<String>,
        hasStickerObjects: Bool,
        hasDrawingData: Bool,
        hasDrawingStrokes: Bool
    ) -> Bool {
        slides.contains { slide in
            slideHasContent(
                slide,
                hasSlideImage: slideImageIds.contains(slide.id),
                hasStickerObjects: false,
                hasDrawingData: false,
                hasDrawingStrokes: false
            )
        } || hasStickerObjects || hasDrawingData || hasDrawingStrokes
    }

    /// Même liste de champs, portée d'UNE slide (S5). `composerHasContent`
    /// répond « y a-t-il de quoi publier » ; la page blanche d'auteur pose
    /// l'autre question — « la slide que je REGARDE est-elle vierge » — et les
    /// deux réponses divergent dès la 2ᵉ slide. Une seule primitive porte les
    /// deux : la liste des champs de contenu ne peut plus dériver entre elles.
    ///
    /// Les trois drapeaux globaux (stickers/dessin legacy du slide courant)
    /// restent des paramètres : le scan multi-slide les neutralise (ils sont
    /// déjà agrégés par `composerHasContent`), la lecture slide-scoped les
    /// renseigne.
    static func slideHasContent(
        _ slide: StorySlide,
        hasSlideImage: Bool,
        hasStickerObjects: Bool,
        hasDrawingData: Bool,
        hasDrawingStrokes: Bool
    ) -> Bool {
        slide.content != nil
            || hasSlideImage
            || slide.effects.textObjects.contains(where: Self.carriesRealText)
            || !(slide.effects.mediaObjects ?? []).isEmpty
            || !(slide.effects.stickerObjects ?? []).isEmpty
            || slide.effects.drawingData != nil
            || !(slide.effects.drawingStrokes ?? []).isEmpty
            || !slide.effects.locationObjects.isEmpty
            || hasStickerObjects || hasDrawingData || hasDrawingStrokes
    }

    /// Un `StoryTextObject` au texte VIDE n'est pas du contenu — c'est la
    /// coquille que `addText()` pose pour donner une cible à l'éditeur, et le
    /// tap sur la page blanche en crée une AVANT la première frappe. La compter
    /// rendait la slide « remplie » sans la moindre intention, ce qui ouvrait
    /// `mayOverwriteStoredDraft` : l'autosave débouncé écrasait alors le slot
    /// unique de `StoryDraftStore` — le brouillon proposé quelques secondes plus
    /// tôt — puis `exitTextEditingMode` supprimait le fantôme, ne laissant même
    /// pas trace de ce qui l'avait remplacé.
    ///
    /// Même trim que `exitTextEditingMode`, qui fait le ménage à la sortie : les
    /// deux règles doivent voir la même chose, sinon la fenêtre se rouvre entre
    /// la saisie d'un espace et la fermeture de l'éditeur. Seule l'intention
    /// RÉELLE compte — même arbitrage que le fond auto-appliqué (S2).
    nonisolated static func carriesRealText(_ text: StoryTextObject) -> Bool {
        !text.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var composerHasContent: Bool {
        Self.composerHasContent(
            slides: viewModel.slides,
            slideImageIds: Set(viewModel.slideImages.keys),
            hasStickerObjects: !(viewModel.currentEffects.stickerObjects ?? []).isEmpty,
            hasDrawingData: viewModel.drawingData != nil,
            hasDrawingStrokes: !viewModel.drawingStrokes.isEmpty
        )
    }

    /// Gate du bouton Publier — et de LUI SEUL.
    ///
    /// `composerHasContent` sert QUATRE autres consommateurs (alerte de sortie,
    /// auto-save au passage en background, autosave débouncé, purge des
    /// brouillons fantômes) dont l'arbitrage S2 est tranché : l'élargir ici les
    /// élargirait tous, et rendrait au fond auto-appliqué le statut de contenu
    /// qu'on venait de lui retirer. Un prédicat DÉDIÉ laisse passer le seul cas
    /// que le contenu VISUEL ne décrit pas — la story « fond + musique », dont
    /// l'audio est la matière narrative — sans rouvrir cette porte.
    nonisolated static func canPublish(hasContent: Bool, carriesAudio: Bool) -> Bool {
        hasContent || carriesAudio
    }

    /// L'audio du composer vit à DEUX endroits, et le fond sonore à deux stades :
    /// `selectedAudioId` tant que la sélection est vivante (elle n'est rabattue
    /// sur `effects.backgroundAudioId` qu'au hand-off de publication), et les
    /// lecteurs posés sur le canvas (`audioPlayerObjects`, sons empruntés). Lire
    /// les slides seules manquerait le cas le plus courant : l'auteur vient de
    /// choisir sa musique et tape Publier.
    nonisolated static func composerCarriesAudio(
        slides: [StorySlide],
        currentEffects: StoryEffects,
        backgroundAudioId: String?
    ) -> Bool {
        backgroundAudioId != nil
            || !(currentEffects.audioPlayerObjects ?? []).isEmpty
            || slides.contains { slide in
                slide.effects.backgroundAudioId != nil
                    || !(slide.effects.audioPlayerObjects ?? []).isEmpty
            }
    }

    var composerCarriesAudio: Bool {
        Self.composerCarriesAudio(
            slides: viewModel.slides,
            currentEffects: viewModel.currentEffects,
            backgroundAudioId: selectedAudioId
        )
    }

    var canPublish: Bool {
        Self.canPublish(hasContent: composerHasContent, carriesAudio: composerCarriesAudio)
    }

    /// Protection de sortie — règle DÉDIÉE, distincte du gate du bouton Publier.
    ///
    /// L'alerte s'arme sur tout ce que le bouton Publier accepterait, audio
    /// compris : une story « fond + musique » est du travail, et la croix la
    /// jetait sans un mot — `composerHasContent` ne voit que le VISUEL.
    ///
    /// « Sauvegarder », lui, reste gaté sur le contenu visuel SEUL, parce que
    /// c'est tout ce que le brouillon sait retenir : `StoryDraftStore` persiste
    /// les slides et leurs médias, jamais `selectedAudioId` (un `@State` de la
    /// vue, rabattu sur `effects.backgroundAudioId` au seul hand-off de
    /// publication). Offrir de sauvegarder une composition purement sonore
    /// rendrait un brouillon muet à la reprise — un mensonge d'un tap.
    ///
    /// Le formuler ici plutôt que d'appeler `canPublish` garde les deux règles
    /// libres d'évoluer : le jour où le bouton acceptera un cas de plus, la
    /// feuille n'offrira pas automatiquement de le sauvegarder.
    nonisolated static func exitPrompt(hasContent: Bool, carriesAudio: Bool) -> ComposerExitPrompt {
        guard hasContent || carriesAudio else { return .leaveSilently }
        return .confirm(offersSave: hasContent)
    }

    var exitPrompt: ComposerExitPrompt {
        Self.exitPrompt(hasContent: composerHasContent, carriesAudio: composerCarriesAudio)
    }

    /// La slide REGARDÉE ne porte aucun contenu d'authoring. Le dessin legacy
    /// (global au composer) et les stickers du slide courant y entrent : ils
    /// s'affichent bien sur cette slide-là.
    var currentSlideIsEmpty: Bool {
        let slide = viewModel.currentSlide
        return !Self.slideHasContent(
            slide,
            hasSlideImage: viewModel.slideImages[slide.id] != nil,
            hasStickerObjects: !(viewModel.currentEffects.stickerObjects ?? []).isEmpty,
            hasDrawingData: viewModel.drawingData != nil,
            hasDrawingStrokes: !viewModel.drawingStrokes.isEmpty
        )
    }

    /// Fermer le composer n'est PAS un discard : c'est la sortie par défaut, sur
    /// un bouton toujours visible. Elle purgeait pourtant le magasin entier dès
    /// que le composer était vierge — ce qui, depuis la dé-modalisation du
    /// bandeau de reprise (S5), détruisait en silence le brouillon qu'on venait
    /// de proposer : le X est désormais atteignable AVANT toute décision, là où
    /// le voile plein écran de l'ancienne carte l'interdisait.
    ///
    /// Seuls les fantômes tombent (`clearPhantomDraftsOnly`, même règle que
    /// `checkForDraft()` à l'ouverture). Les discards EXPLICITES restent
    /// destructifs : « Quitter » (`cancelAndDismiss`) et « Recommencer ».
    ///
    /// La condition d'alerte vient d'`exitPrompt`, pas de `composerHasContent` :
    /// la story « fond + musique » n'a rien de visuel et partait donc en silence.
    func handleDismiss() {
        guard case .leaveSilently = exitPrompt else { showDiscardAlert = true; return }
        clearPhantomDraftsOnly()
        onDismiss()
    }

    func saveDraftAndDismiss() {
        saveDraft()
        onDismiss()
    }

    func cancelAndDismiss() {
        clearAllDrafts()
        // E1 — le « Quitter » jette le brouillon : suspendre l'autosave pour
        // qu'un debounce en vol ne le re-persiste pas pendant le démontage.
        draftAutosaveSuspended = true
        onDismiss()
    }

    // DEPRECATED: Replaced by StoryMediaLoader.shared.videoThumbnail(url:) — async, cached, off main thread.
    // Kept for backward compatibility with external callers.
    static func generateVideoThumbnail(url: URL) -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 400, height: 400)
        return try? UIImage(cgImage: generator.copyCGImage(at: .zero, actualTime: nil))
    }
}
