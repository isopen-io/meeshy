import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Publication

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
        clearAllDrafts()
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
    /// `StoryComposerView+SyncRestore.swift`). `isComposerEmpty`
    /// (`StoryComposerView+Canvas.swift`) en est la simple négation — deux
    /// calculs frères divergents ont longtemps coexisté (fond compté ici mais
    /// pas là, stickers scannés seulement sur le slide courant, dessin legacy
    /// absent) ; unifiés ici pour de bon.
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
            slide.content != nil
                || slideImageIds.contains(slide.id)
                || !slide.effects.textObjects.isEmpty
                || !(slide.effects.mediaObjects ?? []).isEmpty
                || !(slide.effects.stickerObjects ?? []).isEmpty
                || slide.effects.drawingData != nil
                || !(slide.effects.drawingStrokes ?? []).isEmpty
                || !slide.effects.locationObjects.isEmpty
        } || hasStickerObjects || hasDrawingData || hasDrawingStrokes
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

    func handleDismiss() {
        if composerHasContent { showDiscardAlert = true }
        else { clearAllDrafts(); onDismiss() }
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
