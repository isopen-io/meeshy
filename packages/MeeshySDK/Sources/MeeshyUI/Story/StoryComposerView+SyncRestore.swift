import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + SyncRestore

extension StoryComposerView {
    /// Évitement clavier du canvas en édition texte.
    ///
    /// Depuis le cardage clavier (2026-07-14), quand l'éditeur texte est actif le
    /// canvas est TOUJOURS cardé et `presentedSheetHeight = keyboardHeight + 132` :
    /// le solver `StoryCanvasFraming` scale le canvas pour qu'il tienne ENTIÈREMENT
    /// dans la région AU-DESSUS du clavier (directive user « tout présenter /
    /// entièrement visible »). Toute la story — pas seulement le texte édité —
    /// reste donc visible. La translation `canvasEditShift` (ancienne stratégie
    /// « garder grand + remonter le texte édité ») ferait alors une DOUBLE
    /// compensation qui rognerait le haut du canvas ; on la met à 0. Le call site
    /// est conservé (déclenché aux changements clavier / sélection de texte) pour
    /// rester un point d'accroche si une stratégie hybride redevenait nécessaire.
    func recomputeCanvasShift() {
        canvasEditShift = 0
    }

    func syncCurrentSlideEffects() {
        viewModel.currentEffects = buildEffects()
    }

    /// Resets every composer-local `@State` that feeds `buildEffects()` or
    /// otherwise mirrors slide content. Must be called immediately after
    /// `viewModel.reset()` (or any other operation that drops all slides)
    /// to prevent the `granularCanvasSync` sync modifiers from re-injecting
    /// orphaned local state into the fresh empty slide.
    ///
    /// Scope: covers every `@State` read by `buildEffects()` plus the
    /// transient picker / editor scratch state. Intentionally does NOT
    /// touch the in-flight loading indicators, the sheet-presentation
    /// booleans, ni les deux choix d'AUDIENCE et de LANGUE (`visibility`,
    /// `visibilityUserIds`, `storyLanguage`). Ces deux-là ne sont plus des
    /// préférences locales à l'instance : `visibility` est SEMÉE à l'init
    /// depuis un magasin persistant app-side (cf. `initialVisibility`) et
    /// peut être réécrite par `restoreDraft()`. Les remettre à zéro ici
    /// annulerait la chaîne de précédence documentée sur
    /// `StoryComposerView.visibility`.
    func resetLocalState() {
        // Canvas-local state (read by buildEffects via canvasSyncFingerprint)
        selectedFilter = nil
        selectedImage = nil

        // Transitions : état VM depuis it.70 — couvert par viewModel.reset(),
        // plus rien à nettoyer côté View.

        // Background audio panel (read by buildEffects)
        selectedAudioId = nil
        selectedAudioTitle = nil
        audioVolume = 0.7
        audioTrimStart = 0
        audioTrimEnd = 0

        // Picker / editor scratch state — would otherwise resurrect
        // half-finished media flows on the freshly reset canvas.
        fgMediaItem = nil
        editingBgImage = nil
        editingElementImage = nil
        editingElementVideo = nil
        confirmedMediaAudioURL = nil
        lostMediaCount = 0
        // Le cover caméra a DEUX écrivains légitimes (ce binding SDK et le
        // `dismiss()` de la vue app) : le remettre à plat ici garantit qu'il ne
        // survit pas à un reset, quel que soit celui qui a fermé en dernier.
        showCameraCapture = false
        // Porte différée des chips de la feuille recorder : un reset pendant
        // qu'un follow-up est en attente ne doit pas rouvrir une sheet fantôme
        // à la prochaine fermeture de la feuille.
        recorderFollowUp = nil
    }

    func restoreCanvas(from slide: StorySlide) {
        let e = slide.effects
        if let bg = e.background {
            // Gradient (C11) : pas de préfixe « # » — la valeur sérialisée
            // voyage telle quelle dans backgroundColor.
            viewModel.backgroundColor = bg.hasPrefix("gradient:") ? bg : "#\(bg)"
        } else { viewModel.backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())" }
        selectedImage = viewModel.slideImages[slide.id]
        viewModel.hasBackgroundImage = selectedImage != nil
        selectedFilter = e.filter.flatMap { StoryFilter(rawValue: $0) }
        viewModel.openingEffect = e.opening
        viewModel.closingEffect = e.closing
        selectedAudioId = e.backgroundAudioId
        selectedAudioTitle = selectedAudioId != nil ? "Audio" : nil
        audioVolume = e.backgroundAudioVolume ?? 0.7
        audioTrimStart = e.backgroundAudioStart ?? 0
        audioTrimEnd = e.backgroundAudioEnd ?? 0
        // Refonte dessin (2026-05-30) : le dessin est porté par `currentEffects`
        // (`drawingStrokes` moderne + `drawingData` legacy decode-only). Le composer
        // ne maintient plus de `PKCanvasView` local — la capture passe par
        // `StrokeCaptureLayer` et le rendu par `MeeshyStrokeCanvas` / `StoryRenderer`.
        viewModel.drawingData = e.drawingData
        if let bt = e.backgroundTransform {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                scale: bt.scale ?? 1.0, offsetX: bt.offsetX ?? 0,
                offsetY: bt.offsetY ?? 0, rotation: bt.rotation ?? 0,
                videoFitMode: bt.videoFitMode
            )
        } else {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform()
        }
    }

    /// Snapshot des champs de `StoryEffects` dont le CANVAS composer (View
    /// `@State` + props ViewModel dédiées) est l'auteur. Tout champ ABSENT
    /// d'ici est, par construction, conservé tel quel depuis `currentEffects`
    /// par `mergeEffects` — c'est le renversement qui ferme la classe de bug
    /// « champ autoritaire oublié par buildEffects » (voice 2026-05, filter
    /// 2026-06-03, drawingStrokes 2026-05-30, timelineDuration/clipTransitions
    /// E2 2026-07-03).
    struct CanvasAuthoredState {
        var backgroundHex: String?
        var drawingData: Data?
        var drawingStrokes: [StoryDrawingStroke] = []
        var backgroundAudioId: String?
        var audioVolume: Float = 1.0
        var audioTrimStart: TimeInterval = 0
        var audioTrimEnd: TimeInterval = 0
        var opening: StoryTransitionEffect?
        var closing: StoryTransitionEffect?
        var backgroundTransform: StoryBackgroundTransform?
    }

    /// Cœur PUR de `buildEffects()` : copie intégrale de `current` (aucun
    /// champ ne peut plus être perdu silencieusement) puis écrase UNIQUEMENT
    /// les champs pilotés par le canvas. Les champs pilotés ailleurs — filter
    /// (grid → `applyFilter`), voice (recorder/TTS), textObjects/mediaObjects/
    /// audioPlayerObjects (canvas objets), timelineDuration/clipTransitions
    /// (Timeline), thumbHash (publish) — traversent sans ré-émission manuelle.
    static func mergeEffects(current: StoryEffects, canvas: CanvasAuthoredState) -> StoryEffects {
        var effects = current
        effects.background = canvas.backgroundHex
        // C13 — stickers PASSTHROUGH : `currentEffects` est la source unique
        // (addSticker VM, deleteElement, duplicate, zOrder, gestes canvas via
        // le binding $viewModel.currentSlide). Le canvas n'authore plus ce
        // champ — l'ancien écrasement depuis un @State View rafraîchi
        // seulement au slide-switch REVERTAIT ces mutations au sync suivant.
        // Seule la projection legacy `stickers` (emojis, rétro-compat reader)
        // est dérivée ici, au choke point unique du sync.
        effects.stickers = (current.stickerObjects?.isEmpty == false)
            ? current.stickerObjects?.map(\.emoji) : nil
        effects.drawingData = canvas.drawingData
        effects.drawingStrokes = canvas.drawingStrokes.isEmpty ? nil : canvas.drawingStrokes
        effects.backgroundAudioId = canvas.backgroundAudioId
        effects.backgroundAudioVolume = canvas.backgroundAudioId != nil ? canvas.audioVolume : nil
        effects.backgroundAudioStart = canvas.backgroundAudioId != nil ? canvas.audioTrimStart : nil
        effects.backgroundAudioEnd = canvas.backgroundAudioId != nil && canvas.audioTrimEnd > 0
            ? canvas.audioTrimEnd : nil
        effects.opening = canvas.opening
        effects.closing = canvas.closing
        effects.backgroundTransform = canvas.backgroundTransform.flatMap { $0.isIdentity ? nil : $0 }
        // `slideDuration = nil` — la durée n'est plus stockée dans `effects`.
        // Le viewer la recalcule via `StorySlide.computedTotalDuration()`
        // (centralisation 2026-05-28) ; `timelineDuration` reste, lui, la
        // valeur AUTORITAIRE posée par la Timeline et traverse par copie.
        effects.slideDuration = nil
        return effects
    }

    func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")
        let bt = viewModel.backgroundTransform
        let bgTransform = StoryBackgroundTransform(
            scale: bt.scale != 1.0 ? bt.scale : nil,
            offsetX: bt.offsetX != 0 ? bt.offsetX : nil,
            offsetY: bt.offsetY != 0 ? bt.offsetY : nil,
            rotation: bt.rotation != 0 ? bt.rotation : nil,
            videoFitMode: bt.videoFitMode
        )
        return Self.mergeEffects(
            current: viewModel.currentEffects,
            canvas: CanvasAuthoredState(
                backgroundHex: bgHex,
                drawingData: viewModel.drawingData,
                drawingStrokes: viewModel.drawingStrokes,
                backgroundAudioId: selectedAudioId,
                audioVolume: audioVolume,
                audioTrimStart: audioTrimStart,
                audioTrimEnd: audioTrimEnd,
                opening: viewModel.openingEffect,
                closing: viewModel.closingEffect,
                backgroundTransform: bgTransform
            )
        )
    }

    /// Persiste le draft (GRDB + fichiers média) sans feedback haptique —
    /// utilisé par l'auto-save background (D1) où un haptic n'a pas de sens.
    /// E3 — flush de la timeline OUVERTE avant toute persistance : les
    /// éditions keyframes/clips en cours vivent dans `TimelineViewModel.project`
    /// tant que la sheet n'est pas fermée (commit au `onDismiss` seulement) ;
    /// sans ce flush, un save background/autosave pendant l'édition timeline
    /// persiste un draft SANS elles. Non-destructif pour l'édition en cours
    /// (copie locale → slide, le projet timeline reste intact) et gated sur
    /// `isTimelineVisible` — n'instancie jamais le `timelineViewModel` lazy.
    func flushOpenTimelineIntoSlide() {
        guard viewModel.isTimelineVisible else { return }
        viewModel.commitTimelineToCurrentSlide()
    }

    func persistDraft() {
        flushOpenTimelineIntoSlide()
        syncCurrentSlideEffects()
        StoryDraftStore.shared.save(draftId: viewModel.draftId,
                                    slides: slidesStampedWithThumbHash(),
                                    visibility: visibility,
                                    visibilityUserIds: visibilityUserIds,
                                    originalLanguage: storyLanguage,
                                    editingPostId: viewModel.editingPostId)
        persistCommandHistory()
        persistAccessibility()
        StoryDraftStore.shared.saveMedia(
            draftId: viewModel.draftId,
            images: viewModel.loadedImages,
            videoURLs: viewModel.loadedVideoURLs,
            audioURLs: viewModel.loadedAudioURLs
        )
    }

    /// Slides estampillées de leur `thumbHash` composite — fond, texte, média,
    /// dessin et stickers, exactement le même producteur qu'à la publication
    /// (`StorySlideRenderer.computeThumbHash`).
    ///
    /// Le hash n'était composé qu'au publish : un brouillon n'en avait donc
    /// aucun, et la carte de « Mes stories » n'avait littéralement rien à
    /// peindre. Le poser dès le PREMIER enregistrement donne au brouillon la
    /// même vignette que la story qu'il deviendra (directive user 2026-08-01).
    func slidesStampedWithThumbHash() -> [StorySlide] {
        viewModel.slides.map { slide in
            var stamped = slide
            stamped.effects.thumbHash = StorySlideRenderer.computeThumbHash(
                slide: slide,
                bgImage: viewModel.slideImages[slide.id],
                loadedImages: viewModel.loadedImages)
            return stamped
        }
    }

    /// E4 inc.2 — l'historique undo/redo accompagne chaque persistance du
    /// draft (blob opaque, purgé avec lui par `clear()`). Écrit même vide :
    /// le blob reflète toujours le DERNIER état, jamais un historique périmé.
    func persistCommandHistory() {
        guard let blob = viewModel.commandHistoryBlobForPersistence() else { return }
        StoryDraftStore.shared.saveCommandHistoryBlob(blob, draftId: viewModel.draftId)
    }

    /// F2 — la collecte d'accessibilité accompagne chaque persistance du
    /// brouillon. Sans elle, refermer le composer perdait le texte alternatif
    /// saisi : il ne vivait que dans le store de session.
    ///
    /// Écrite même vide : le brouillon reflète toujours la DERNIÈRE collecte,
    /// jamais une collecte périmée qu'une suppression de texte aurait dû
    /// effacer.
    func persistAccessibility() {
        StoryDraftStore.shared.saveAccessibility(accessibilityStore.draftSnapshot(),
                                                 draftId: viewModel.draftId)
    }

    func saveDraft() {
        persistDraft()
        HapticFeedback.light()
    }

    /// Gate UNIQUE de toute écriture SILENCIEUSE par-dessus le brouillon en
    /// magasin — partagé par l'autosave débouncé et l'autosave de passage en
    /// background, qui portaient jusqu'ici deux listes de gardes voisines mais
    /// pas identiques.
    ///
    /// Les quatre termes, et pourquoi chacun ferme le magasin (le terme
    /// « édition d'une story publiée » a été RETIRÉ le 2026-08-02 : le
    /// brouillon persiste désormais `editingPostId`, sa réouverture rouvre le
    /// mode édition — la prémisse « restauré comme une NOUVELLE story » ne
    /// tient plus, et une story mise en édition doit revenir en brouillon) :
    /// - **offre de reprise POSÉE** (`isBannerVisible`) : `StoryDraftStore` n'a
    ///   qu'UN slot et l'utilisateur a les slides proposées sous les yeux —
    ///   écrire ferait mentir « Reprendre ». Le bandeau RANGÉ, en revanche,
    ///   rend la main : c'est alors `composerHasContent` qui arbitre — rien de
    ///   créé, rien d'écrit (le brouillon revient intact à l'ouverture
    ///   suivante) ; du contenu réel créé, il supplante l'offre ignorée et
    ///   devient à son tour ce que le kill de l'app ne doit pas emporter (D1).
    ///   La première version de S5 gardait ici un bit « décision ouverte » qui
    ///   ne retombait que sur un bouton du bandeau : ranger coupait donc
    ///   l'autosave pour toute la session, sur le chemin devenu MAJORITAIRE ;
    /// - **autosave suspendu** : un debounce encore en vol ne doit pas
    ///   re-persister un brouillon explicitement jeté ou publié ;
    /// - **composer sans contenu** : aucun brouillon fantôme (le fond pastel
    ///   auto-appliqué ne compte pas, cf. `composerHasContent`) ;
    /// - **publication partie** : l'upload possède l'état.
    ///
    /// Les écritures EXPLICITES ne passent PAS par ce gate : l'utilisateur les
    /// demande, elles ont le droit d'écraser. Depuis M10 il n'en reste qu'une,
    /// et c'est la fermeture elle-même (`handleDismiss` → `saveDraftAndDismiss`).
    nonisolated static func mayOverwriteStoredDraft(
        draftResume: DraftResumeState,
        isAutosaveSuspended: Bool,
        composerHasContent: Bool,
        didHandOffPublish: Bool
    ) -> Bool {
        !draftResume.isBannerVisible
            && !isAutosaveSuspended
            && composerHasContent
            && !didHandOffPublish
    }

    /// Écriture silencieuse d'une session INTERROMPUE — deux entrées, un seul
    /// chemin :
    /// - **D1**, le passage en background : la story en cours survit au kill de
    ///   l'app. JAMAIS sur onDisappear — le discard fire onDisappear et
    ///   re-persisterait le brouillon que l'utilisateur vient de jeter ;
    /// - **C6b**, le 426 : le binaire est périmé, une porte bloquante va
    ///   recouvrir le composer. Perdre le travail parce que la version a
    ///   expiré serait une double peine.
    ///
    /// Les deux sont des interruptions SUBIES, pas des commandes : elles
    /// passent donc par le gate des écritures silencieuses, là où la fermeture
    /// par la croix (`handleDismiss`) écrit sans condition — l'utilisateur l'a
    /// demandé en fermant.
    func autoSaveDraftOnInterruption() {
        guard mayOverwriteStoredDraft else { return }
        persistDraft()
    }

    /// Application du gate à l'état vivant de la vue — un seul lieu de lecture
    /// des quatre termes, pour les deux autosaves. Le terme de contenu est élargi
    /// à l'audio : le store SAIT le retenir (rabattement `mergeEffects` à
    /// chaque sync) — sans lui, une session audio-seule n'écrivait jamais rien
    /// et un crash ou un passage en background perdait la composition.
    var mayOverwriteStoredDraft: Bool {
        Self.mayOverwriteStoredDraft(
            draftResume: draftResume,
            isAutosaveSuspended: draftAutosaveSuspended,
            composerHasContent: composerHasContent || composerCarriesAudio,
            didHandOffPublish: didHandOffPublish
        )
    }

    /// E1 — fingerprint pur des clés média chargées. Gate le `saveMedia`
    /// LOURD (copie des bitmaps) : une édition purement JSON (texte, filtre,
    /// durée) ne re-copie jamais les médias ; seul un ajout/retrait de média
    /// change l'ensemble des clés.
    static func mediaKeysFingerprint(images: [String: UIImage],
                                     videos: [String: URL],
                                     audios: [String: URL]) -> Set<String> {
        Set(images.keys).union(videos.keys).union(audios.keys)
    }

    /// Pure: renders the first slide's pixel-perfect cover and JPEG-encodes it, or `nil`
    /// if rendering fails. Extracted so the autosave hook's cache-write can be unit tested
    /// without a live `StoryComposerView`/`ViewModel` harness.
    @MainActor
    static func draftCoverJPEG(firstSlide: StorySlide,
                               loadedImages: [String: UIImage],
                               bgImage: UIImage?,
                               size: CGSize) -> Data? {
        StoryStaticSnapshot.render(slide: firstSlide, loadedImages: loadedImages,
                                   bgImage: bgImage, size: size)?
            .jpegData(compressionQuality: 0.85)
    }

    /// E1 — autosave débouncé post-mutation (`viewModel.autosaveTrigger`) :
    /// le travail d'édition survit désormais à un CRASH DUR (OOM, fatalError),
    /// pas seulement au passage en background. Le save JSON (GRDB) est léger
    /// et court à chaque accalmie de ~2,5 s ; les médias ne sont re-copiés
    /// que si l'ensemble des clés a changé. Mêmes guards que le save
    /// background + `draftAutosaveSuspended` (un debounce en vol ne doit pas
    /// re-persister un brouillon explicitement jeté/publié).
    func autosaveDraftAfterMutation() {
        // BUG-3 (user 2026-07-04) et sa suite S5 : le composer VIERGE sous le
        // bandeau de reprise (dont l'onAppear pose déjà le fond pastel =
        // mutation → debounce) ne doit JAMAIS écraser le draft qu'on propose
        // de reprendre — sinon « Reprendre » restaure du vide. Toutes les
        // gardes vivent dans `mayOverwriteStoredDraft`.
        guard mayOverwriteStoredDraft else { return }
        flushOpenTimelineIntoSlide()
        syncCurrentSlideEffects()
        let stampedSlides = slidesStampedWithThumbHash()
        StoryDraftStore.shared.save(draftId: viewModel.draftId,
                                    slides: stampedSlides,
                                    visibility: visibility,
                                    visibilityUserIds: visibilityUserIds,
                                    originalLanguage: storyLanguage,
                                    editingPostId: viewModel.editingPostId)
        persistCommandHistory()
        persistAccessibility()
        // Cover composite local-first (même pipeline pixel-parfait que la publication) —
        // « première slide dans l'ordre », même convention que l'ancienne heuristique
        // brute qu'elle remplace côté My Stories > Drafts.
        if let firstSlide = stampedSlides.first,
           let jpeg = Self.draftCoverJPEG(firstSlide: firstSlide,
                                          loadedImages: viewModel.loadedImages,
                                          bgImage: viewModel.slideImages[firstSlide.id],
                                          size: StoryCoverCacheKey.renderSize) {
            let draftId = viewModel.draftId
            Task {
                await CacheCoordinator.shared.thumbnails.store(
                    jpeg, for: StoryCoverCacheKey.key(for: draftId))
            }
        }
        let keys = Self.mediaKeysFingerprint(images: viewModel.loadedImages,
                                             videos: viewModel.loadedVideoURLs,
                                             audios: viewModel.loadedAudioURLs)
        guard keys != lastAutosavedMediaKeys else { return }
        lastAutosavedMediaKeys = keys
        StoryDraftStore.shared.saveMedia(
            draftId: viewModel.draftId,
            images: viewModel.loadedImages,
            videoURLs: viewModel.loadedVideoURLs,
            audioURLs: viewModel.loadedAudioURLs
        )
    }

    /// Gate de purge des brouillons fantômes — `composerHasContent` (Problème 1,
    /// `StoryComposerView+Publication.swift`) élargi de l'audio persisté :
    /// un brouillon dont le SEUL contenu est un fond (auto-appliqué à
    /// l'ouverture ou choisi explicitement dans le panneau Fond) ne mérite pas
    /// la carte de reprise, mais « fond + musique » est du travail — le juger
    /// fantôme le faisait purger par `clearPhantomDraftsOnly` à la première
    /// fermeture venue. Les 3 paramètres globaux de `composerHasContent`
    /// sont figés à `false` : ce gate évalue un draft encore désérialisé, pas
    /// l'état vivant d'un ViewModel — seuls les champs PAR SLIDE comptent ici.
    static func shouldOfferDraftResume(slides: [StorySlide], slideImageIds: Set<String>) -> Bool {
        composerHasContent(
            slides: slides,
            slideImageIds: slideImageIds,
            hasStickerObjects: false,
            hasDrawingData: false,
            hasDrawingStrokes: false
        ) || slidesCarryAudio(slides)
    }

    /// Câblage LÉGER de `slideImageIds` via `loadMediaReferences()` — PAS
    /// `loadMedia()` : ce dernier décode chaque bitmap (`Data(contentsOf:)` +
    /// `UIImage(data:)`) de façon SYNCHRONE, un coût disque+CPU non borné qui
    /// bloquerait le thread principal dans `.onAppear`, avant même l'affichage
    /// de la carte — violation du principe Cache-First (« No spinner when cache
    /// has data »). Un `fileExists` par ligne suffit à évaluer la PRÉSENCE d'une
    /// image ; le décodage réel du cover reste différé et async.
    static func storedSlideImageIds(_ slides: [StorySlide], store: StoryDraftStore, draftId: String) -> Set<String> {
        let imageRefs = store.loadMediaReferences(draftId: draftId).filter { $0.mediaType == "image" }
        let slideIds = slides.map(\.id)
        return Set(
            slideIds.filter { (id: String) -> Bool in
                imageRefs.contains { $0.elementId == id || $0.elementId == "slide-bg-\(id)" }
            }
        )
    }

    /// Le magasin porte-t-il un brouillon que la PROCHAINE ouverture
    /// proposerait ? C'est mot pour mot la question de `checkForDraft()`, posée
    /// depuis les chemins DESTRUCTIFS — et la seule façon de tenir la promesse
    /// écrite dans `DraftResumeState` : ranger n'est pas jeter, donc fermer
    /// n'est pas jeter non plus.
    ///
    /// Les deux magasins sont interrogés dans le même ordre que
    /// `checkForDraft()` : sans le repli legacy `UserDefaults`, la protection
    /// dépendrait de la version de l'app qui a écrit le brouillon.
    static func storedDraftIsRestorable(store: StoryDraftStore, defaults: UserDefaults) -> Bool {
        // Multi-brouillons : la question devient « au moins UN brouillon
        // serait-il proposé à la prochaine ouverture ? » — même prédicat que
        // `checkForDraft()`, appliqué à chaque brouillon du magasin.
        let anyRestorable = store.listDrafts().contains { summary in
            guard let stored = store.load(draftId: summary.id) else { return false }
            return shouldOfferDraftResume(
                slides: stored.slides,
                slideImageIds: storedSlideImageIds(stored.slides, store: store, draftId: summary.id)
            )
        }
        if anyRestorable { return true }
        guard let data = defaults.data(forKey: StoryComposerDraft.userDefaultsKey),
              let draft = try? JSONDecoder().decode(StoryComposerDraft.self, from: data) else {
            return false
        }
        return shouldOfferDraftResume(slides: draft.slides, slideImageIds: [])
    }

    /// Purge RÉSERVÉE aux brouillons fantômes — ceux qu'aucune réouverture ne
    /// proposerait (fond seul, blob legacy indécodable). Un brouillon
    /// restaurable, lui, survit : il n'a été supplanté par rien, et l'écran qui
    /// le proposait vient à peine de disparaître.
    ///
    /// Rend `true` quand la purge a eu lieu — le call site n'a pas à re-poser la
    /// question, et le test n'a pas à ré-implémenter la règle.
    @discardableResult
    static func clearPhantomDrafts(store: StoryDraftStore, defaults: UserDefaults) -> Bool {
        guard !storedDraftIsRestorable(store: store, defaults: defaults) else { return false }
        store.clear()
        defaults.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
        return true
    }

    /// Application aux magasins vivants. Les DEUX fermetures SANS TRAVAIL
    /// l'empruntent : la croix sur un composer vierge (`handleDismiss`) et la
    /// publication d'un composer sans contenu (`publishAllSlides`). Le discard
    /// EXPLICITE (« Recommencer ») passe, lui, par `clearCurrentDraft()` :
    /// l'utilisateur l'a demandé.
    func clearPhantomDraftsOnly() {
        Self.clearPhantomDrafts(store: .shared, defaults: .standard)
    }

    func checkForDraft() {
        if let stored = StoryDraftStore.shared.load(draftId: viewModel.draftId) {
            // Câblage LÉGER `slideImageIds` via `loadMediaReferences()` — PAS
            // `loadMedia()` : ce dernier décode chaque bitmap
            // (`Data(contentsOf:)` + `UIImage(data:)`) de façon SYNCHRONE, un
            // coût disque+CPU non borné qui bloquerait le thread principal
            // dans `.onAppear`, avant même l'affichage de la carte — violation
            // du principe Cache-First (« No spinner when cache has data »).
            // `loadMediaReferences()` ne fait qu'un `fileExists` par ligne :
            // suffisant pour évaluer PRÉSENCE d'image, le décodage réel du
            // cover restant dans la `Task` async ci-dessous, inchangée.
            let imageRefs = StoryDraftStore.shared.loadMediaReferences(draftId: viewModel.draftId)
                .filter { $0.mediaType == "image" }
            let slideImageIds = Set(
                stored.slides.map(\.id).filter { id in
                    imageRefs.contains { $0.elementId == id || $0.elementId == "slide-bg-\(id)" }
                }
            )

            guard Self.shouldOfferDraftResume(slides: stored.slides, slideImageIds: slideImageIds) else {
                // Brouillon fantôme (fond seul) : purge silencieuse, jamais
                // de carte — auto-migrant pour tout draft déjà sur disque.
                clearCurrentDraft()
                return
            }

            draftResumeSlideCount = max(1, stored.slides.count)
            draftResume.offer()
            // U4 inc.2 — cover composite du 1er slide, rendu APRÈS l'affichage
            // (la carte dégrade sans image) et SANS muter le ViewModel : le
            // draft ne s'applique qu'au « Reprendre ». Seul le rendu du
            // COVER (bitmap complet) reste ici, différé et async — la
            // décision d'affichage ci-dessus ne dépend elle que des
            // références légères.
            Task { @MainActor in
                guard let first = stored.slides.first else { return }
                let media = StoryDraftStore.shared.loadMedia(draftId: viewModel.draftId)
                let bg = media.images[first.id] ?? media.images["slide-bg-\(first.id)"]
                // La résolution vient du bandeau, seul à connaître son slot
                // (`DraftResumeCard.coverSize`, 40×68) : le composer rendait
                // 270×480 pour une carte 108×192 qui a disparu avec la modale.
                draftResumeCover = StorySlideRenderer.renderComposite(
                    slide: first,
                    bgImage: bg,
                    loadedImages: media.images,
                    size: DraftResumeCard.coverRenderSize
                )
            }
        } else if let data = UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey) {
            // Legacy UserDefaults : décoder AVANT de décider (comme le fait
            // déjà `restoreDraft()`) — avant ce fix, la simple PRÉSENCE de la
            // clé suffisait à afficher la carte, y compris pour un blob
            // indécodable dont le « Reprendre » échouait ensuite en silence.
            guard let draft = try? JSONDecoder().decode(StoryComposerDraft.self, from: data),
                  Self.shouldOfferDraftResume(slides: draft.slides, slideImageIds: []) else {
                UserDefaults.standard.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
                return
            }
            draftResume.offer()
        }
    }

    /// Reprendre un brouillon écrase la visibilité injectée à l'init (rang 2 de
    /// la chaîne de précédence, cf. `StoryComposerView.visibility`) — mais un
    /// mode qui exige une liste d'utilisateurs (« Seulement…/Sauf… ») ne
    /// survit QU'ACCOMPAGNÉ de sa liste persistée : sans elle, le restaurer
    /// rouvrirait un sélecteur vide et publierait vers personne, d'où le repli
    /// vers le défaut produit. Reprendre n'est pas publier, la préférence
    /// mémorisée n'est donc pas réécrite ici.
    static func restorableVisibility(_ stored: String, userIds: [String] = []) -> String {
        guard let mode = PostVisibility(rawValue: stored) else {
            return PostVisibility.friends.rawValue
        }
        guard !mode.requiresUserSelection || !userIds.isEmpty else {
            return PostVisibility.friends.rawValue
        }
        return stored
    }

    /// B1 (2026-08-02) — copies de SESSION des médias restaurés.
    ///
    /// Les URLs remises par `loadMedia` pointent DANS
    /// `meeshy_draft_media/<draftId>/`, le répertoire que `clearCurrentDraft()`
    /// supprime au hand-off de publication. Or le write-ahead de la file
    /// (app-side) court dans une `Task` qui ne démarre qu'APRÈS le retour
    /// synchrone de `publishAllSlides()` : publier un brouillon repris
    /// détruisait donc les fichiers AVANT leur copie — story amputée ET
    /// brouillon perdu. Le composer ne verse dans le ViewModel que des copies
    /// hors du magasin (clone APFS, quasi gratuit) : détruire le brouillon ne
    /// peut plus toucher ce que le hand-off a reçu. Une copie qui échoue
    /// retombe sur l'URL d'origine — pas pire qu'avant, et le média reste
    /// éditable dans la session.
    static func sessionSafeMediaURLs(_ urls: [String: URL],
                                     sessionDirectory: URL,
                                     fileManager: FileManager = .default) -> [String: URL] {
        guard !urls.isEmpty else { return urls }
        do {
            try fileManager.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)
        } catch {
            return urls
        }
        return urls.mapValues { source in
            let destination = sessionDirectory.appendingPathComponent(source.lastPathComponent)
            try? fileManager.removeItem(at: destination)
            do {
                try fileManager.copyItem(at: source, to: destination)
                return destination
            } catch {
                return source
            }
        }
    }

    /// Sous tmp/ : la durée de vie attendue est celle de la session de
    /// composition, l'OS fait le ménage — comme les fichiers temp des médias
    /// fraîchement importés.
    static func sessionMediaDirectory(for draftId: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy_draft_session", isDirectory: true)
            .appendingPathComponent(draftId, isDirectory: true)
    }

    func restoreDraft() {
        if let stored = StoryDraftStore.shared.load(draftId: viewModel.draftId) {
            viewModel.slides = stored.slides.isEmpty ? [StorySlide()] : stored.slides
            viewModel.currentSlideIndex = 0
            visibility = Self.restorableVisibility(stored.visibility, userIds: stored.visibilityUserIds)
            // L'audience et la langue revivent avec le brouillon. Les ids sont
            // posés même après un repli de mode : `publishAllSlides` ne les
            // transmet que pour un mode à sélection, et repasser sur
            // « Seulement… » retrouve la liste choisie à l'époque.
            visibilityUserIds = stored.visibilityUserIds
            if let storedLanguage = stored.originalLanguage {
                storyLanguage = storedLanguage
            }
            // E4 inc.2 — AVANT tout bootstrap timeline : l'undo/redo de
            // chaque slide revit avec le draft, même après un crash dur.
            viewModel.applyPersistedCommandHistory(StoryDraftStore.shared.loadCommandHistoryBlob(draftId: viewModel.draftId))
            // F2 — le texte alternatif et l'opt-in d'extraction de son
            // reviennent avec le brouillon : persistés sans être reposés, ils
            // seraient écrits puis relus par personne.
            accessibilityStore.restore(from: StoryDraftStore.shared.loadAccessibility(draftId: viewModel.draftId))
            let media = StoryDraftStore.shared.loadMedia(draftId: viewModel.draftId)
            let sessionDir = Self.sessionMediaDirectory(for: viewModel.draftId)
            viewModel.mergeRestoredMedia(
                images: media.images,
                videoURLs: Self.sessionSafeMediaURLs(media.videoURLs, sessionDirectory: sessionDir),
                audioURLs: Self.sessionSafeMediaURLs(media.audioURLs, sessionDirectory: sessionDir)
            )

            // Surface lost media (file purged by OS, deleted via Files app, etc.)
            // explicitly to the user via an alert. The DB rows are also purged
            // so the next restore doesn't repeat the warning.
            if !media.lostElementIds.isEmpty {
                StoryDraftStore.shared.purgeLostMedia(media.lostElementIds, draftId: viewModel.draftId)
                lostMediaCount = media.lostElementIds.count
            }
        } else if let data = UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey),
                  let draft = try? JSONDecoder().decode(StoryComposerDraft.self, from: data) {
            viewModel.slides = draft.slides.isEmpty ? [StorySlide()] : draft.slides
            viewModel.currentSlideIndex = 0
            visibility = Self.restorableVisibility(draft.visibilityPreference)
        }
        if let first = viewModel.slides.first {
            restoreCanvas(from: first)
        }
        // C9 — l'undo ne traverse pas la frontière de reprise : la
        // trajectoire repart de l'état restauré (revenir « avant » le
        // brouillon n'a pas de sens et exposerait le composer vierge).
        viewModel.seedHistory()
    }

    /// Efface le brouillon DE CETTE SESSION — publication réussie, abandon
    /// explicite, ou composer refermé vide.
    ///
    /// Appelait `StoryDraftStore.clear()`, qui vidait toute la table. Anodin
    /// tant qu'il n'existait qu'un brouillon ; depuis le multi-brouillon
    /// (spec 2026-08-01) publier UNE story effacerait TOUS les autres
    /// brouillons de l'utilisateur. `clear()` ne sert plus qu'à la déconnexion.
    func clearCurrentDraft() {
        StoryDraftStore.shared.delete(draftId: viewModel.draftId)
        UserDefaults.standard.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
    }

    /// Gel du brouillon au hand-off de publication (directive 2026-08-02) :
    /// la story ne QUITTE plus le brouillon au tap « Publier » — `accepted`
    /// signifie seulement « accepté en file ». Le brouillon est (re)persisté
    /// LÉGER (JSON seulement : slides estampillées + audience + langue + lien
    /// d'édition — jamais `saveMedia`, trop lourd pour le chemin synchrone C3 ;
    /// les copies de médias restent celles du dernier autosave, et l'échec
    /// permanent les réécrit de toute façon depuis l'item de file), puis
    /// marqué `pendingPublishAt` : gelé, il n'apparaît plus dans les reprises
    /// tant que la file travaille. Seul le SUCCÈS serveur confirmé le
    /// supprimera ; l'échec permanent le rendra éditable avec son erreur.
    /// Le slot legacy UserDefaults est absorbé au passage — même destin que
    /// dans l'ancien `clearCurrentDraft`, mais son contenu vit désormais dans
    /// le brouillon gelé.
    func freezeCurrentDraftForPublish() {
        StoryDraftStore.shared.save(draftId: viewModel.draftId,
                                    slides: slidesStampedWithThumbHash(),
                                    visibility: visibility,
                                    visibilityUserIds: visibilityUserIds,
                                    originalLanguage: storyLanguage,
                                    editingPostId: viewModel.editingPostId)
        persistCommandHistory()
        persistAccessibility()
        StoryDraftStore.shared.markPendingPublish(draftId: viewModel.draftId)
        UserDefaults.standard.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
    }

    /// Ce que l'ouverture du composer fait du système de brouillons — décision
    /// PURE, un seul lieu pour les trois modes de session.
    nonisolated enum ComposerOpeningDraftAction: Equatable, Sendable {
        /// Entrée en édition FRAÎCHE d'une story publiée : le canvas est
        /// hydraté depuis la story serveur. Le système de brouillons n'est
        /// plus éteint pour autant (2026-08-02) : les autosaves qui suivent
        /// portent `editingPostId`, et le brouillon d'édition ainsi semé
        /// rouvre le mode édition à la reprise (session ADOPTÉE).
        case hydratedByEditMode
        /// Brouillon CHOISI (`adoptDraft`) : restauration directe, jamais de
        /// bandeau — l'utilisateur vient de trancher, une double invite ferait
        /// douter du tap (et son « Recommencer » détruirait le brouillon
        /// qu'il venait précisément de désigner).
        case restoreAdoptedDraft
        /// Session vierge : découverte PASSIVE d'un brouillon éventuel, offre
        /// par bandeau (`checkForDraft`).
        case offerDraftResume
    }

    nonisolated static func openingDraftAction(
        isEditingExistingStory: Bool,
        isAdoptedDraftSession: Bool
    ) -> ComposerOpeningDraftAction {
        // L'ADOPTION prime (2026-08-02, point c) : un brouillon portant
        // `editingPostId` rouvre le mode édition en session adoptée — c'est
        // le brouillon choisi qui doit revivre, pas l'hydratation serveur
        // qui écraserait le travail repris. Une entrée en édition FRAÎCHE
        // (« Modifier », jamais adoptée) reste hydratée depuis la story.
        if isAdoptedDraftSession { return .restoreAdoptedDraft }
        return isEditingExistingStory ? .hydratedByEditMode : .offerDraftResume
    }

    /// Ce que « Recommencer » détruit — décision PURE. Une session ADOPTÉE ne
    /// possède pas le brouillon qu'elle a chargé : elle s'en détache (id neuf,
    /// le brouillon reste en magasin). Une session vierge jette le brouillon
    /// qu'elle proposait — le libellé « Recommencer » DIT cette destruction.
    nonisolated enum ComposerDraftDiscardAction: Equatable, Sendable {
        case detachFromAdoptedDraft
        case deleteCurrentDraft
    }

    nonisolated static func draftDiscardAction(isAdoptedDraftSession: Bool) -> ComposerDraftDiscardAction {
        isAdoptedDraftSession ? .detachFromAdoptedDraft : .deleteCurrentDraft
    }

    /// Applicateur unique de la décision « Recommencer » sur l'état vivant.
    func discardOfferedDraft() {
        switch Self.draftDiscardAction(isAdoptedDraftSession: viewModel.isAdoptedDraftSession) {
        case .detachFromAdoptedDraft:
            viewModel.detachFromAdoptedDraft()
        case .deleteCurrentDraft:
            clearCurrentDraft()
        }
    }
}
