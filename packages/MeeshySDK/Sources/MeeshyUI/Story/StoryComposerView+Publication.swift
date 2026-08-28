import SwiftUI
import Combine
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Publication

/// Ce que la fermeture par la croix trouve à protéger. Deux questions
/// distinctes, que l'ancien `guard !composerHasContent` confondait en une :
/// « y a-t-il du travail à perdre ? » et « le brouillon sait-il le retenir ? ».
///
/// M10 (zéro question à la sortie) a changé l'ACTE, jamais la règle : le cas
/// `confirm` ne fait plus apparaître de feuille d'action, il commande
/// l'enregistrement silencieux. Son nom survit parce qu'il est PUBLIC — le
/// renommer casserait les intégrations hors du dépôt ; sa seule lecture est
/// `offersSave`, qui se lit désormais « il y a de quoi écrire ».
public nonisolated enum ComposerExitPrompt: Equatable, Sendable {
    /// Rien à perdre : la croix ferme, sans un mot et sans rien écrire.
    case leaveSilently
    /// Il y a du travail en cours. `offersSave` dit si le brouillon sait le
    /// retenir — donc si la fermeture doit l'écrire.
    case confirm(offersSave: Bool)

    public var offersSave: Bool {
        if case .confirm(let offersSave) = self { return offersSave }
        return false
    }
}

/// Ce que la fermeture FAIT du magasin, une fois la règle lue. Un aiguillage
/// PUR, pour que la loi M10 s'éprouve sans hôte SwiftUI — `StoryComposerView`
/// n'est pas « hostable » en XCTest, et une règle qui ne vit que dans le corps
/// d'une vue ne se teste que par analyse de source.
public nonisolated enum ComposerExitAction: Equatable, Sendable {
    /// Rien à retenir : seuls les fantômes tombent.
    case purgePhantoms
    /// Il y a du travail : le brouillon est écrit, sans un mot et sans
    /// question. C'est la promesse M10 — fermer, c'est enregistrer.
    case saveDraft
}

/// Ce que la collecte d'accessibilité du composer remet à la publication
/// (V3-4) : le texte alternatif par média et l'opt-in d'extraction de son.
///
/// Les deux voyagent ENSEMBLE dans un seul paramètre de hand-off parce qu'ils
/// se saisissent dans le même panneau et partent dans la même requête ; les
/// séparer aurait porté la fermeture de publication à douze paramètres
/// positionnels, où l'ordre devient la seule chose qui distingue deux
/// dictionnaires.
///
/// `mediaAlt` est keyé par ID D'ÉLÉMENT DU COMPOSER, jamais par id de
/// `PostMedia` : au moment du hand-off les médias ne sont pas encore uploadés.
/// Le site qui connaît la correspondance la traduit avant l'envoi
/// (`StoryMediaAltMapping.serverKeyed`), faute de quoi le gateway filtre les
/// clés inconnues sans rien dire.
public nonisolated struct ComposerMediaAccessibility: Equatable, Sendable {

    public let mediaAlt: [String: String]?

    /// La LÉGENDE par média (`PostMedia.caption`, #4055) — même clé, même
    /// borne et même règle d'ignorance que `mediaAlt` (cf. `PostMediaText`),
    /// donc même traduction d'ids à la publication.
    public let mediaCaption: [String: String]?

    public let allowSoundExtraction: Bool?

    public init(mediaAlt: [String: String]?,
                mediaCaption: [String: String]? = nil,
                allowSoundExtraction: Bool?) {
        self.mediaAlt = mediaAlt
        self.mediaCaption = mediaCaption
        self.allowSoundExtraction = allowSoundExtraction
    }

    /// L'auteur n'a rien saisi ni rien basculé. Distinct d'un dictionnaire vide
    /// et d'un `false` explicite : le gateway lit l'absence « n'y touche pas ».
    public static let empty = ComposerMediaAccessibility(mediaAlt: nil, mediaCaption: nil, allowSoundExtraction: nil)
}

/// Le déclenchement de publication, rendu atteignable de l'EXTÉRIEUR (V3-1) —
/// une télécommande, jamais un second chemin d'envoi.
///
/// Forme retenue parce qu'elle est la seule qui garde `publishAllSlides()` pour
/// CORPS du déclenchement : l'atelier arme la télécommande avec sa propre
/// méthode, le meuble ne fait que presser. Il n'a donc rien à recomposer — ni
/// le rabattement des effets du canvas sur la diapositive courante, ni la
/// visibilité, ni la langue, qui vivent dans l'état privé de la vue — et
/// `isArmed` lui répond AVANT qu'il ne peigne sa commande, ce qu'un jeton
/// observé ne saurait pas dire.
///
/// Le loquet anti-double-tap n'est PAS ici : il vit dans `publishAllSlides()`
/// (`didHandOffPublish`), qui ne le pose que sur un hand-off ACCEPTÉ. Une
/// télécommande à un coup condamnerait pour la session les surfaces qui
/// refusent le hand-off (édition hors-ligne, surface qui ne ferme rien).
public final class ComposerPublishTrigger: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Ce que le meuble lit pour savoir s'il a le droit de peindre une commande
    /// de publication — loi 4 : non offert = absent de l'interface.
    @Published public private(set) var isArmed = false

    /// Le format que la DERNIÈRE pression a apporté (V3-3). `nil` tant que
    /// personne n'a pressé, ou après désarmement.
    ///
    /// Il vit ici, sur un objet de RÉFÉRENCE, parce que le corps armé est
    /// capturé au montage de l'atelier : une propriété de la vue lue depuis ce
    /// corps serait celle du montage, et le meuble publierait le format qu'il
    /// offrait à l'ouverture. La télécommande, elle, est le même objet à
    /// l'armement et à la pression.
    public private(set) var requestedTargetType: PostType?

    private var handler: (() -> Void)?

    public init() {}

    /// Armée par l'atelier, avec `publishAllSlides` et rien d'autre.
    public func arm(_ handler: @escaping () -> Void) {
        self.handler = handler
        isArmed = true
    }

    /// Au démontage de l'atelier : une télécommande qui lui survit publierait
    /// l'état d'un composer disparu.
    public func disarm() {
        handler = nil
        isArmed = false
        requestedTargetType = nil
    }

    /// Pressée par le meuble, qui apporte le format choisi AU MOMENT DU GESTE.
    ///
    /// `nil` (défaut) = le presseur n'a pas d'éventail à lui : l'atelier publie
    /// alors sous son propre `publishTargetType`. Passer `nil` n'efface donc
    /// rien d'utile — il rend la main au seul autre porteur du fait.
    public func requestPublish(as targetType: PostType? = nil) {
        requestedTargetType = targetType
        handler?()
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

    /// Ce que la publication emporte de la collecte d'accessibilité.
    ///
    /// Extrait en règle PURE parce que `StoryComposerView` n'est pas hostable
    /// en XCTest : sans elle, « le texte que l'auteur a saisi atteint le
    /// hand-off » ne se prouverait que par lecture de source — le même genre de
    /// preuve qui laissait `mediaAltPayload()` sans aucun appelant.
    static func accessibilityHandoff(from store: MediaAccessibilityStore) -> ComposerMediaAccessibility {
        ComposerMediaAccessibility(
            mediaAlt: store.mediaAltPayload(),
            mediaCaption: store.mediaCaptionPayload(),
            allowSoundExtraction: store.allowSoundExtractionPayload()
        )
    }

    /// C3 — le tap « Publier » est ENTIÈREMENT synchrone : plus aucun `await`
    /// entre le geste et la fermeture du composer. Les thumbHashes, qui
    /// bloquaient jusqu'ici la main pendant l'extraction des frames vidéo, sont
    /// calculés EN AVAL par `StoryThumbHashEnricher` — après le hand-off, après
    /// l'écriture write-ahead, avant le premier octet réseau.
    ///
    /// Ordre des invariants strictement préservé : flush timeline → sync des
    /// effets → snapshot → haptic → hand-off → (si accepté) GEL du brouillon
    /// (directive 2026-08-02 : il survit, marqué `pendingPublishAt`) +
    /// suspension d'autosave (E1) + loquet.
    func publishAllSlides() {
        guard Self.acceptsPublishRequest(didHandOffPublish: didHandOffPublish) else { return }
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
            storyLanguage, visibility, ids, viewModel.draftId, viewModel.references,
            Self.accessibilityHandoff(from: accessibilityStore),
            Self.publishedType(requested: publishTrigger?.requestedTargetType,
                               atelier: publishTargetType)
        )
        // Tout ce qui engage le brouillon attend de savoir si le hand-off a
        // été accepté. Un refus (édition hors-ligne, surface inerte) laisse le
        // composer ouvert : geler son brouillon et tuer son autosave le
        // priverait de son filet pour toute la session de composition. Le
        // loquet suit la même règle — posé sur un refus, il grise le bouton
        // Publier à vie. Aucun `await` ne sépare le hand-off de ces lignes :
        // le callback est synchrone, rien ne peut re-persister entre-temps.
        guard accepted else { return }
        // Directive 2026-08-02 : `accepted` = « accepté en file », jamais
        // « publié ». Le brouillon de CETTE session SURVIT donc au hand-off —
        // gelé (`pendingPublishAt`) pour ne pas rouvrir une double publication
        // pendant que la file travaille. Seul le succès serveur confirmé le
        // supprimera ; l'échec permanent le ramènera éditable avec son erreur.
        // La branche `else` (page blanche intégrale) est inatteignable par le
        // bouton (gaté `canPublish`) et ne purge que les fantômes.
        if composerHasContent || composerCarriesAudio { freezeCurrentDraftForPublish() } else { clearPhantomDraftsOnly() }
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
        // Le `content` n'est PAS touché. Les mentions du canevas voyagent dans le
        // champ `mentions` de `POST /posts` (`StoryViewModel.runStoryUpload` les
        // dérive des `textObjects`) — pas déguisées en légende. Le détour par le
        // texte a existé le temps que le gateway n'ait pas de canal déclaré ; il
        // inventait une phrase d'auteur, visible de tous et traduite par le
        // Prisme, pour satisfaire un extracteur.
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

    /// Le loquet anti-double-tap, en règle PURE. Depuis qu'un déclencheur
    /// EXTERNE peut entrer dans `publishAllSlides()` (V3-1), « deux
    /// déclenchements ne publient qu'une fois » doit pouvoir se prouver
    /// autrement que par lecture de source : la vue n'est pas hostable en
    /// XCTest, la règle, elle, l'est.
    nonisolated static func acceptsPublishRequest(didHandOffPublish: Bool) -> Bool {
        !didHandOffPublish
    }

    /// Sous quel type la publication part (V3-3), depuis les DEUX porteurs
    /// possibles du même fait — et c'est le geste qui tranche.
    ///
    /// La pression du meuble apporte le format MESURÉ AU MOMENT DU GESTE ; la
    /// propriété de l'atelier est celui avec lequel il a été construit, relu à
    /// chaque rendu du corps. La pression prime parce que le corps armé est
    /// capturé au montage : une propriété lue depuis lui serait celle du
    /// montage. Sans pression (l'atelier publie par sa flèche), la propriété
    /// est le seul porteur, et elle est fraîche.
    nonisolated static func publishedType(requested: PostType?, atelier: PostType) -> PostType {
        requested ?? atelier
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
            || slidesCarryAudio(slides)
    }

    /// La moitié PERSISTÉE de `composerCarriesAudio` : ce qu'un brouillon
    /// désérialisé sait dire de son audio (le rabattement `mergeEffects` écrit
    /// `backgroundAudioId` dans la slide à chaque sync, les lecteurs empruntés
    /// vivent dans `audioPlayerObjects`). C'est le terme que la purge des
    /// fantômes et l'offre de reprise doivent lire — un brouillon
    /// « fond + musique » est du travail, pas un fantôme.
    nonisolated static func slidesCarryAudio(_ slides: [StorySlide]) -> Bool {
        slides.contains { slide in
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

    /// De la matière ET un publieur. Le second terme ne change rien pour
    /// `.atelier`, dont la flèche existe toujours ; il n'existe que pour que le
    /// chrome délégué SANS déclencheur armé se dise non publiable, au lieu de
    /// rester silencieusement inerte.
    var canPublish: Bool {
        Self.canPublish(hasContent: composerHasContent, carriesAudio: composerCarriesAudio)
            && chromeOwner.hasPublisher(triggerIsArmed: publishTrigger?.isArmed == true)
    }

    /// Protection de sortie — règle DÉDIÉE, distincte du gate du bouton Publier.
    ///
    /// La protection s'arme sur tout ce que le bouton Publier accepterait,
    /// audio compris : une story « fond + musique » est du travail, et la croix
    /// la jetait sans un mot — `composerHasContent` ne voit que le VISUEL.
    ///
    /// `offersSave` couvre le même périmètre : la prémisse historique (« le
    /// brouillon ne retient pas l'audio, rabattu au seul hand-off de
    /// publication ») est caduque — `persistDraft()` passe par
    /// `syncCurrentSlideEffects()` → `mergeEffects` qui écrit
    /// `backgroundAudioId` dans la slide via le proxy `currentEffects`, et
    /// `restoreCanvas` re-sème `selectedAudioId` depuis les effets restaurés.
    /// Une session audio-seule est donc du travail que le magasin SAIT tenir.
    ///
    /// Le formuler ici plutôt que d'appeler `canPublish` garde les deux règles
    /// libres d'évoluer : le jour où le bouton acceptera un cas de plus, la
    /// fermeture n'écrira pas automatiquement ce que le brouillon ne sait pas
    /// retenir.
    nonisolated static func exitPrompt(hasContent: Bool, carriesAudio: Bool) -> ComposerExitPrompt {
        guard hasContent || carriesAudio else { return .leaveSilently }
        return .confirm(offersSave: hasContent || carriesAudio)
    }

    /// M10 — la règle de sortie ne pose plus de question, elle commande. Ce que
    /// la feuille d'action offrait de sauvegarder est exactement ce que la
    /// fermeture écrit ; ce qu'elle laissait partir sans un mot part toujours
    /// sans un mot, en n'emportant que les fantômes.
    nonisolated static func exitAction(_ prompt: ComposerExitPrompt) -> ComposerExitAction {
        guard case .leaveSilently = prompt else { return .saveDraft }
        return .purgePhantoms
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
    /// `checkForDraft()` à l'ouverture). Le seul discard EXPLICITE restant est
    /// « Recommencer », dans le bandeau de reprise.
    ///
    /// M10 — zéro question à la sortie : la feuille « Sauvegarder / Quitter /
    /// Annuler » a disparu, et avec elle la seule issue destructive de la
    /// croix. Ce que la feuille offrait d'enregistrer, la fermeture
    /// l'enregistre. C'est une écriture DEMANDÉE (l'utilisateur ferme), donc
    /// elle emprunte le chemin explicite `saveDraft()` et non le gate des
    /// écritures silencieuses (`mayOverwriteStoredDraft`).
    ///
    /// Le terme lu reste `exitPrompt`, pas `composerHasContent` : la story
    /// « fond + musique » n'a rien de visuel et partait sinon en silence.
    func handleDismiss() {
        switch Self.exitAction(exitPrompt) {
        case .saveDraft:
            saveDraftAndDismiss()
        case .purgePhantoms:
            clearPhantomDraftsOnly()
            onDismiss()
        }
    }

    func saveDraftAndDismiss() {
        saveDraft()
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
