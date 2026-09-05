// MARK: - Conversation-level fullscreen media gallery
import SwiftUI
import Combine
import AVKit
import MeeshySDK
import MeeshyUI

/// Fullscreen gallery that allows swiping through ALL visual media in the conversation.
/// Opened when tapping any image/video in a message bubble.
///
/// ## Budget de rendu (2026-08-25)
///
/// La galerie freezait au défilement pour trois raisons cumulées, toutes du
/// même genre : **de l'état à la racine que seule UNE page consomme**.
///
/// 1. `scale` / `offset` vivaient sur la racine. Un pincement ou un glissement
///    les réécrit à la fréquence d'affichage — chaque écriture invalidait le
///    `body` racine, donc le pager, donc TOUTES les pages réalisées.
/// 2. `currentIndex` était un `@State` mis à jour par un `firstIndex(where:)`
///    linéaire à chaque changement de page ; il est désormais DÉRIVÉ d'une
///    carte `id → index` construite une fois (O(1), aucune écriture d'état).
/// 3. Le `LazyHStack` réalise les pages paresseusement mais ne les libère
///    JAMAIS : après vingt swipes, vingt images plein format restaient
///    décodées en mémoire, chaque page vidéo gardait ses trois abonnements
///    Combine et sa résolution de disponibilité — et déclenchait même son
///    auto-téléchargement. Le coût grandissait donc avec la distance parcourue,
///    ce qui est exactement le symptôme rapporté (« plus je défile, plus ça
///    rame »).
///
/// La réponse tient en trois règles, appliquées ici :
/// - **L'état de transformation appartient à la page** (`GalleryImagePage`,
///   `GalleryVideoPage` portent leur propre zoom/offset).
/// - **Chaque page est `Equatable` et montée en `.equatable()`** : une
///   réévaluation de la racine ne re-rend que les pages dont la position
///   relative a réellement changé (au plus quatre), jamais les autres.
/// - **Une fenêtre de rendu bornée** (`GalleryRenderWindow`) : hors de ±1 page, on ne
///   rend qu'un aperçu léger (thumbHash / vignette sous-échantillonnée) au lieu
///   du média plein format. Le nombre d'images décodées vivantes est donc
///   constant, quel que soit le nombre de médias de la conversation.
struct ConversationMediaGalleryView: View {
    let allAttachments: [MessageAttachment]
    let startAttachmentId: String
    let accentColor: String
    /// Maps attachment.id → caption text (message content or attachment caption)
    var captionMap: [String: String] = [:]
    /// **Ce que la légende POURRAIT dire, langue par langue** (#4934).
    ///
    /// `captionMap` reste le chemin simple — une légende, sans alternative — et
    /// tous ses appelants continuent de fonctionner tels quels. `captionServings`
    /// est le chemin RICHE : il porte le texte servi ET ses langues, donc il
    /// permet la bascule que la carte du fil offrait déjà et que le plein écran
    /// perdait.
    ///
    /// Vide, ou avec des `alternatives` vides, ⇒ aucun contrôle n'est peint
    /// (loi 4 : un contrôle sans effet est ABSENT, jamais grisé).
    var captionServings: [String: SocialMediaCaptionServing] = [:]

    /// **Le repli de la légende est un état d'ÉCRAN, pas de média** (#4768) —
    /// mais il se REMET à chaque page. Feuilleter vers un autre média présente
    /// une autre légende : la garder dépliée ferait s'ouvrir en grand un texte
    /// que l'utilisateur n'a pas demandé à lire, et masquerait le média qu'il
    /// vient d'atteindre.
    @State private var captionExpanded = false
    /// La langue choisie PAR MÉDIA. Par média et non globale : deux pièces d'un
    /// même lot peuvent porter des légendes de provenances différentes, et une
    /// langue choisie sur l'une ne dit rien de l'autre.
    @State private var captionLanguage: [String: String] = [:]
    /// Maps attachment.id → sender info (name, avatar, color, date)
    var senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] = [:]

    /// **Créer une story, un réel ou un post avec CE média** (#4014).
    ///
    /// Une CLOSURE, et pas un chemin que la galerie prendrait elle-même : elle
    /// ne connaît que des pièces jointes — jamais le `Message` ni le
    /// `Comment` qui les porte. Résoudre le porteur est l'affaire de l'hôte,
    /// qui seul tient la liste.
    ///
    /// `nil` ⇒ **aucun bouton**. C'est la loi 4 : un contrôle existe s'il a un
    /// effet. Un hôte qui ne sait pas résoudre le porteur n'affiche pas une
    /// action inerte — il n'en affiche pas du tout.
    var onComposeWithMedia: ((MessageAttachment) -> Void)?

    /// **Répondre au média** (#4013) — c'est-à-dire au MESSAGE (conversation) ou
    /// au COMMENTAIRE (post, story, réel) qui le porte.
    ///
    /// Même forme que ci-dessus, et pour la même raison : la galerie ne connaît
    /// pas le porteur. `nil` ⇒ aucun bouton.
    var onReplyToMedia: ((MessageAttachment) -> Void)?

    /// `id → position`, construite une fois à la présentation. Remplace les
    /// `firstIndex(where:)` linéaires qui tournaient à chaque changement de page
    /// ET à chaque fermeture (`stopActiveVideoAudio`).
    private let indexByID: [String: Int]

    @Environment(\.dismiss) private var dismiss
    @State private var currentPageID: String?
    @State private var showControls = true
    @StateObject private var saveCoordinator = MediaSaveCoordinator()
    // Plain reference (NOT @ObservedObject): only `activeURL`/`player` identity
    // drive this root's rendering (`videoTransportLayer`) — the manager also
    // publishes `currentTime` at 5-10Hz, which used to re-render the WHOLE
    // gallery root continuously. Scoped via onReceive($activeURL/$player).
    private let videoManager = SharedAVPlayerManager.shared
    @State private var videoManagerActiveURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var videoManagerPlayer: AVPlayer?

    init(
        allAttachments: [MessageAttachment],
        startAttachmentId: String,
        accentColor: String,
        captionServings: [String: SocialMediaCaptionServing] = [:],
        captionMap: [String: String] = [:],
        senderInfoMap: [String: ConversationViewModel.MediaSenderInfo] = [:],
        onComposeWithMedia: ((MessageAttachment) -> Void)? = nil,
        onReplyToMedia: ((MessageAttachment) -> Void)? = nil
    ) {
        self.allAttachments = allAttachments
        self.startAttachmentId = startAttachmentId
        self.accentColor = accentColor
        self.captionServings = captionServings
        self.captionMap = captionMap
        self.senderInfoMap = senderInfoMap
        self.onComposeWithMedia = onComposeWithMedia
        self.onReplyToMedia = onReplyToMedia
        let positions = Dictionary(
            allAttachments.enumerated().map { ($0.element.id, $0.offset) },
            uniquingKeysWith: { first, _ in first }
        )
        self.indexByID = positions
        _currentPageID = State(
            initialValue: positions[startAttachmentId] != nil
                ? startAttachmentId
                : allAttachments.first?.id
        )
    }

    /// Position courante, DÉRIVÉE de `currentPageID` — plus de `@State`
    /// miroir à tenir synchronisé (et donc plus d'écriture d'état, donc plus
    /// d'invalidation racine, à chaque page traversée).
    private var currentIndex: Int {
        guard let currentPageID, let index = indexByID[currentPageID] else { return 0 }
        return index
    }

    /// Annonce VoiceOver de l'état du bouton d'enregistrement. Vide au repos.
    private var saveStateAccessibilityValue: String {
        saveCoordinator.isProcessing
            ? String(localized: "common.saving", defaultValue: "Enregistrement…", bundle: .main)
            : ""
    }

    /// Position lisible du média courant pour VoiceOver — la capsule « n / N »
    /// serait sinon lue « n barre oblique N » (position portée par le seul texte).
    private var galleryPositionAccessibilityLabel: String {
        String(
            format: String(localized: "gallery.position", defaultValue: "Média %1$d sur %2$d", bundle: .main),
            currentIndex + 1,
            allAttachments.count
        )
    }

    /// **Le texte de la légende, dans la langue courante** — source UNIQUE pour
    /// l'affichage ET pour VoiceOver (#4934).
    ///
    /// Les deux la partagent parce qu'un lecteur d'écran qui énoncerait une
    /// autre langue que celle affichée serait pire qu'un lecteur muet : il
    /// affirmerait quelque chose de faux. C'est la leçon de
    /// `reference_one_string_for_sight_and_for_voiceover_serves_one_of_them`,
    /// prise par l'autre bout.
    private func servedCaption(_ id: String) -> String? {
        if let serving = captionServings[id] {
            if let chosen = captionLanguage[id], let texte = serving.alternatives[chosen] {
                return texte.isEmpty ? nil : texte
            }
            return serving.text.isEmpty ? nil : serving.text
        }
        guard let simple = captionMap[id], !simple.isEmpty else { return nil }
        return simple
    }

    /// Les langues offertes pour CE média — vides quand il n'y a rien à
    /// basculer. Ordonnées pour que la rangée ne danse pas d'un rendu à l'autre :
    /// un dictionnaire n'a pas d'ordre, et une rangée de drapeaux qui se
    /// réarrange à chaque redessin serait illisible.
    private func captionLanguages(_ id: String) -> [String] {
        guard let serving = captionServings[id], serving.alternatives.count > 1 else { return [] }
        return serving.alternatives.keys.sorted()
    }

    /// La langue ACTIVE : celle que le lecteur a choisie, sinon celle dont le
    /// texte est servi. Déduire l'active du TEXTE plutôt que de la supposer
    /// évite qu'un drapeau se dise actif au-dessus d'une autre langue.
    private func activeCaptionLanguage(_ id: String) -> String? {
        if let chosen = captionLanguage[id] { return chosen }
        guard let serving = captionServings[id] else { return nil }
        return serving.alternatives.first(where: { $0.value == serving.text })?.key
    }

    /// Libellé VoiceOver d'une image plein écran : la légende si le call site en
    /// fournit une, sinon un libellé générique (l'image ne doit jamais être muette).
    private func imageAccessibilityLabel(_ attachment: MessageAttachment) -> String {
        if let caption = servedCaption(attachment.id) {
            return caption
        }
        return String(localized: "gallery.image", defaultValue: "Image", bundle: .main)
    }

    /// Résumé VoiceOver de la rangée métadonnées (dimensions + poids), joint de
    /// façon locale-aware. Chaîne vide si aucune métadonnée n'est disponible.
    private func mediaMetadataAccessibilityLabel(_ att: MessageAttachment) -> String {
        var parts: [String] = []
        if let w = att.width, let h = att.height, w > 0, h > 0 {
            parts.append(String(
                format: String(localized: "gallery.dimensions", defaultValue: "%1$d par %2$d", bundle: .main),
                w, h
            ))
        }
        if att.fileSize > 0 {
            parts.append(att.fileSizeFormatted)
        }
        return ListFormatter.localizedString(byJoining: parts)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            galleryPager

            overlayLayer
        }
        .statusBar(hidden: true)
        .onAppear {
            // Filet de sécurité : `scrollPosition(id:)` honore la valeur initiale
            // posée en `init`, mais une présentation qui recycle un état
            // précédent doit revenir sur le média réellement tapé.
            if currentPageID != startAttachmentId, indexByID[startAttachmentId] != nil {
                currentPageID = startAttachmentId
            }
            prefetchNeighbors(around: currentIndex)
        }
        .onReceive(videoManager.$activeURL) { videoManagerActiveURL = $0 }
        .onReceive(videoManager.$player) { videoManagerPlayer = $0 }
    }

    /// L'animation de `showControls` est portée ICI et non sur la racine :
    /// posée sur le `ZStack` racine, elle installait une transaction animée sur
    /// TOUT l'arbre — pager compris — à chaque bascule des contrôles.
    private var overlayLayer: some View {
        ZStack {
            if showControls {
                controlsOverlay
                    .transition(.opacity)
                // Contrôles de transport vidéo (play/pause/scrub/skip/speed/mute/pip)
                // pour la vidéo en cours de lecture. Avant : la galerie rendait une
                // couche AVPlayerLayer brute SANS aucun contrôle ("AUCUN CONTROLEUR").
                // Composant SDK partagé `VideoTransportControls` piloté par le même
                // `SharedAVPlayerManager`. Posé au-dessus des métadonnées (z-order).
                videoTransportLayer
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
    }

    // MARK: - Pager

    private var galleryPager: some View {
        AdaptiveHorizontalPager(
            items: allAttachments,
            currentPageID: $currentPageID,
            fillVertical: true
        ) { index, attachment in
            galleryPage(attachment, index: index)
        }
        .ignoresSafeArea()
        .adaptiveOnChange(of: currentPageID) { oldID, newID in
            handlePageChange(from: oldID, to: newID)
        }
    }

    private func handlePageChange(from oldID: String?, to newID: String?) {
        guard let newID, let newIndex = indexByID[newID] else { return }

        // **Le repli se REMET à chaque média** (#4768). Feuilleter présente une
        // AUTRE légende ; la garder dépliée ouvrirait en grand un texte que
        // personne n'a demandé à lire, par-dessus le média qu'on vient
        // d'atteindre. C'est l'inverse du volet de description du composer, qui
        // est une préférence d'écran parce qu'il commente TOUTE la publication.
        if oldID != newID, captionExpanded { captionExpanded = false }

        if let oldID, oldID != newID, let oldIndex = indexByID[oldID] {
            let oldAtt = allAttachments[oldIndex]
            if oldAtt.type == .video && videoManager.activeURL == oldAtt.fileUrl {
                // BUG B (round 4) — `release(urlString:)` (URL-gated) clears
                // `activeURL` so the underlying conversation bubble's footer
                // reappears once the gallery closes. Bare `pause()` left
                // `activeURL` set → `hasPlayingInlineVideo` stayed true.
                videoManager.release(urlString: oldAtt.fileUrl)
            }
            HapticFeedback.light()
        }

        prefetchNeighbors(around: newIndex)
    }

    // MARK: - Gallery Page

    /// Chaque page est montée en `.equatable()` : la réévaluation du `body`
    /// racine (changement de page, bascule des contrôles) reconstruit les
    /// `struct` de page mais SwiftUI n'en re-rend que celles dont la position
    /// relative a bougé. Les autres — potentiellement des dizaines — sont
    /// comparées égales et sautées.
    @ViewBuilder
    private func galleryPage(_ attachment: MessageAttachment, index: Int) -> some View {
        let distance = abs(index - currentIndex)

        switch attachment.type {
        case .image:
            GalleryImagePage(
                attachment: attachment,
                isActive: distance == 0,
                rendersFullPixels: GalleryRenderWindow.rendersFullPixels(distance: distance),
                accessibilityLabel: imageAccessibilityLabel(attachment),
                onToggleControls: { toggleControls() },
                onDismiss: { dismissGallery() }
            )
            .equatable()

        case .video:
            GalleryVideoPage(
                attachment: attachment,
                accentColor: accentColor,
                isActive: distance == 0,
                isWindowed: GalleryRenderWindow.rendersFullPixels(distance: distance),
                onToggleControls: { toggleControls() },
                onCacheActivation: { cacheAttachment(attachment) },
                onDismiss: { dismiss() }
            )
            .equatable()

        default:
            Color.black
        }
    }

    private func toggleControls() {
        showControls.toggle()
    }

    private func dismissGallery() {
        stopActiveVideoAudio()
        dismiss()
    }

    // MARK: - Caption Overlay

    /// **La légende du plein écran rejoint la couche PARTAGÉE** (#4768).
    ///
    /// Elle était la TROISIÈME façon de replier la même chose : `Text` brut,
    /// `lineLimit(4)`, aucune bascule — exactement la forme INERTE que la story
    /// portait avant #4474 et le lecteur de réel avant #4484. Une légende de
    /// cinq lignes s'y arrêtait au milieu d'une phrase, sans que rien n'indique
    /// qu'il en restait, ni ne permette de la lire.
    ///
    /// > Deux surfaces converties sur trois, c'est une règle qui a l'air
    /// > partagée. La troisième ne rougit pas : elle affiche un texte, tronqué
    /// > proprement, et seule la comparaison avec ses sœurs le révèle.
    ///
    /// Ce qui passe au composant est la RÈGLE — 15 mots de tête au-delà de 30,
    /// l'invite, l'ancrage bas-gauche déplié. Le retrait reste 16 pt, celui de
    /// `bottomMetadataOverlay` juste au-dessus : la légende s'aligne sur sa
    /// colonne, comme en réel (directive porteur 2026-09-01).
    /// **La rangée de langues de la légende** (#4934) — au-DESSUS du bandeau,
    /// jamais dedans.
    ///
    /// Deux raisons, et la seconde est celle qui décide : le bandeau se DÉPLIE
    /// au tap (`captionExpanded`), donc y loger des boutons ferait cohabiter
    /// deux gestes sur la même surface — taper pour lire plus, taper pour
    /// changer de langue. La rangée vit donc au-dessus, comme la rangée méta
    /// d'un réel, et emprunte ses métriques (`.overlay`, 32 pt) pour la même
    /// raison qu'elle : au-dessus d'un média, une bande de 44 pt volerait le tap
    /// qui pilote la lecture.
    ///
    /// **Absente dès qu'il n'y a rien à basculer** — pas grisée, pas vide : le
    /// cas nominal d'un post à plusieurs médias n'offre aucune traduction de
    /// légende (#4904), et une rangée fantôme y occuperait la place pour rien.
    @ViewBuilder
    private func captionLanguageRow(_ id: String) -> some View {
        let langues = captionLanguages(id)
        if !langues.isEmpty {
            let active = activeCaptionLanguage(id)
            HStack(spacing: 6) {
                ForEach(langues, id: \.self) { code in
                    LanguageFlagChip(code: code,
                                     isActive: active == code,
                                     metrics: .overlay) {
                        // L'écriture est la SEULE ; le texte affiché et le
                        // libellé VoiceOver la relisent tous deux par
                        // `servedCaption`. Deux états parallèles auraient permis
                        // à l'un de dire une langue que l'autre ne sert pas.
                        captionLanguage[id] = code
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 2)
            .accessibilityLabel(String(localized: "gallery.caption.languages",
                                       defaultValue: "Langue de la légende",
                                       bundle: .main))
        }
    }

    private func captionOverlay(_ text: String) -> some View {
        MediaCaptionOverlay(caption: text,
                            isExpanded: captionExpanded,
                            horizontalInset: 16,
                            // **« JUSTE afficher le texte déplié avec effet
                            // ombre »** — donc pas de voile en plus. Le
                            // dégradé noir du composant sert les hôtes qui
                            // n'ont rien d'autre pour détacher le texte ; ici
                            // l'ombre suffit, et le voile masquait le média
                            // que l'utilisateur est venu regarder.
                            dimsBackgroundWhenExpanded: false,
                            onToggle: {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    captionExpanded.toggle()
                                }
                            })
            .padding(.vertical, 8)
    }

    // MARK: - Controls Overlay

    private var controlsOverlay: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    dismissGallery()
                } label: {
                    // Chrome : glyphe `xmark` figé dans un cercle glass 40pt
                    // (doctrine 82i) — ne pas scaler. Glass APRÈS le sizing.
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
                        .padding()
                }
                .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))

                Spacer()

                if allAttachments.count > 1 {
                    Text("\(currentIndex + 1) / \(allAttachments.count)")
                        .font(MeeshyFont.relative(13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .adaptiveGlass(in: Capsule())
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3), value: currentIndex)
                        .accessibilityLabel(galleryPositionAccessibilityLabel)
                }

                Spacer()

                if currentIndex < allAttachments.count {
                    Button { requestSaveCurrent() } label: {
                        Group {
                            if saveCoordinator.isProcessing {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: "arrow.down.to.line")
                            }
                        }
                        // Chrome : glyphe d'état figé dans un cadre tap fixe
                        // 40×40 (doctrine 82i) — ne pas scaler.
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
                        .padding(.trailing, 12)
                        .padding(.top, 8)
                    }
                    .disabled(saveCoordinator.isProcessing)
                    .accessibilityLabel(String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main))
                    .accessibilityValue(saveStateAccessibilityValue)
                    // Composant UNIFIÉ « Enregistrer » : même sheet de
                    // destinations pour image et vidéo (Photos / Fichiers /
                    // Partager), issue via toast + haptics.
                    .mediaSaveFlow(saveCoordinator)
                } else {
                    Color.clear.frame(width: 52, height: 40).padding(.trailing, 12)
                }
            }

            Spacer(minLength: 0)

            bottomOverlay
        }
    }

    /// Bas de l'écran : auteur du média, légende, puis — sur TOUTE la rangée,
    /// par-dessous — la pellicule de toute la conversation.
    @ViewBuilder
    private var bottomOverlay: some View {
        if currentIndex < allAttachments.count {
            let att = allAttachments[currentIndex]
            VStack(alignment: .leading, spacing: 0) {
                // **Déplier la légende EFFACE l'auteur** (directive porteur
                // 2026-09-02) : « quand on affiche / déplie pour tout voir, les
                // détails d'auteur se cachent pour afficher le contenu ».
                //
                // Le bas de l'écran est une ressource FINIE. Une légende
                // dépliée et une carte d'auteur s'y disputent la place ; la
                // seule des deux que l'utilisateur vient de demander est la
                // légende. L'auteur revient au repli — rien n'est perdu, tout
                // est rendu à son tour.
                //
                // C'est la règle du POST. La story fait l'inverse et c'est
                // voulu : là, rien ne se cache, la scène se FLOUTE
                // (`StoryViewerView+Canvas`). Deux surfaces, deux réponses à la
                // même question — « où trouver la place ? » — parce qu'elles
                // n'ont pas le même voisinage.
                // **L'auteur ne s'efface plus : il est POUSSÉ vers le haut**
                // (directive porteur 2026-09-05).
                //
                // > « le "voir plus" de la légende doit juste afficher le texte
                // > déplié avec effet ombre, en repoussant le détail de
                // > l'auteur vers le haut »
                //
                // Le fondu et son gate viennent de la directive du 2026-09-02,
                // qui demandait l'inverse. Ils sont retirés, pas commentés :
                // c'est la pile ancrée en bas qui fait le travail — la légende
                // grandit, ses voisins montent — et la lisibilité est portée
                // par l'ombre de `MediaCaptionOverlay`, jamais par la place
                // qu'on prendrait à quelqu'un d'autre.
                bottomMetadataOverlay(att)
                if let caption = servedCaption(att.id) {
                    captionLanguageRow(att.id)
                    captionOverlay(caption)
                }
                if allAttachments.count > 1 {
                    ConversationMediaFilmstrip(
                        attachments: allAttachments,
                        currentPageID: $currentPageID,
                        accentColor: accentColor
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .top, endPoint: .bottom)
            )
        }
    }

    // MARK: - Video Transport Controls (for the currently playing video)

    /// Marge basse du transport vidéo : il doit rester au-dessus du bloc bas,
    /// dont la hauteur change selon que la pellicule est montée ou non.
    private var videoTransportBottomInset: CGFloat {
        allAttachments.count > 1 ? 132 + ConversationMediaFilmstrip.reservedHeight : 132
    }

    @ViewBuilder
    private var videoTransportLayer: some View {
        if currentIndex < allAttachments.count {
            let att = allAttachments[currentIndex]
            if att.type == .video,
               videoManagerActiveURL == att.fileUrl,
               videoManagerPlayer != nil {
                VideoTransportControls(
                    manager: videoManager,
                    accentColor: accentColor,
                    controls: [.playPause, .scrubber, .duration, .speed, .mute, .pip]
                )
                // Ancré entre la top bar (close/save) et les métadonnées bas.
                .padding(.top, 64)
                .padding(.bottom, videoTransportBottomInset)
            }
        }
    }

    /// **La barre d'actions du média, à DROITE des informations de l'auteur**
    /// (#4014) — la place que les deux issues du plein écran lui donnent.
    ///
    /// Verticale par destination : chaque action y entre par sa propre closure
    /// optionnelle, si bien qu'un hôte n'en câble que ce qu'il sait servir.
    /// Aucune action câblée ⇒ la barre ne rend RIEN, pas même son espace.
    @ViewBuilder
    private func mediaActionBar(_ att: MessageAttachment) -> some View {
        if let onReplyToMedia, !ComposableAttachment.isProtected(att) {
            // **Un média PROTÉGÉ ne se cite pas** (#4013) : la bannière de
            // citation porte la vignette du média, ce qui ferait sortir de la
            // conversation ce qu'une vue unique, un flou ou un chiffrement y
            // retiennent. Le prédicat est celui que le menu d'appui long lit
            // déjà — `ComposableAttachment.isProtected` — plutôt qu'une seconde
            // écriture des trois mêmes drapeaux.
            Button {
                HapticFeedback.light()
                onReplyToMedia(att)
            } label: {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .adaptiveGlass(in: Circle(), interactive: true)
            }
            .accessibilityLabel(String(localized: "media.reply.title",
                                       defaultValue: "Répondre", bundle: .main))
            .accessibilityHint(String(localized: "media.reply.hint",
                                      defaultValue: "Cite le message qui porte ce média et revient au composer.",
                                      bundle: .main))
        }
        if let onComposeWithMedia {
            Button {
                HapticFeedback.light()
                onComposeWithMedia(att)
            } label: {
                // Chrome : glyphe figé dans un cercle glass 40 pt (doctrine
                // 82i) — ne pas scaler. Le glass APRÈS le sizing.
                Image(systemName: "wand.and.stars")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .adaptiveGlass(in: Circle(), interactive: true)
            }
            .accessibilityLabel(String(localized: "media.compose.title",
                                       defaultValue: "Créer avec ce média", bundle: .main))
            .accessibilityHint(String(localized: "media.compose.hint",
                                      defaultValue: "Ouvre le composer avec ce média posé.",
                                      bundle: .main))
        }
    }

    private func bottomMetadataOverlay(_ att: MessageAttachment) -> some View {
        let info = senderInfoMap[att.id]
        return VStack(alignment: .leading, spacing: 6) {
            // Rangée auteur : affichée seulement si l'info est fournie par le call
            // site — sinon on masque (pas d'avatar « ? » vide au-dessus des dimensions).
            if let info {
                HStack(spacing: 10) {
                    MeeshyAvatar(
                        name: info.senderName,
                        context: .messageBubble,
                        accentColor: info.senderColor,
                        avatarURL: info.senderAvatarURL
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(info.senderName)
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(.white)
                        Text(info.sentAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                    }
                    Spacer()
                    mediaActionBar(att)
                }
                .accessibilityElement(children: .contain)
            }
            HStack(spacing: 8) {
                // Glyphe de type média décoratif (apparié aux dimensions) —
                // scale avec le texte mais masqué de VoiceOver.
                Image(systemName: att.type == .video ? "video.fill" : "photo")
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(.white.opacity(0.6))
                    .accessibilityHidden(true)
                if let w = att.width, let h = att.height, w > 0, h > 0 {
                    Text("\(w) \u{00D7} \(h)")
                        .font(MeeshyFont.relative(11, weight: .medium, design: .monospaced))
                        .foregroundColor(.white.opacity(0.6))
                }
                if att.fileSize > 0 {
                    Text(att.fileSizeFormatted)
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }
                Spacer()
            }
            // Regroupe dimensions + poids en un seul arrêt VoiceOver et remplace
            // le « × » (lu « multiplication ») par un « par » localisé.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(mediaMetadataAccessibilityLabel(att))
            .accessibilityHidden(mediaMetadataAccessibilityLabel(att).isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Actions

    /// Stops the gallery's video audio when the gallery is dismissed via a path
    /// that is NOT the swipe-down-to-PIP gesture (X button, image vertical
    /// dismiss). `SharedAVPlayerManager` is process-wide, so without this the
    /// AVPlayer keeps emitting audio with no visible player after the gallery is
    /// gone. The PIP swipe path deliberately calls `startPip()` instead and must
    /// never reach here — keeping the player alive for picture-in-picture.
    private func stopActiveVideoAudio() {
        guard currentIndex < allAttachments.count else { return }
        let att = allAttachments[currentIndex]
        guard att.type == .video, videoManager.activeURL == att.fileUrl else { return }
        // BUG B (round 4) — `release(urlString:)` (URL-gated, safe no-op if
        // another bubble took over) clears `activeURL` so the conversation
        // bubble's footer (timestamp/delivery) reappears after the gallery
        // closes via X-close or image vertical-dismiss. Bare `pause()` left
        // `activeURL` set, keeping `hasPlayingInlineVideo` true and the footer
        // hidden until re-mount. The swipe-down PIP path is unaffected: it
        // calls `startPip()` and never reaches here.
        videoManager.release(urlString: att.fileUrl)
    }

    private func cacheAttachment(_ attachment: MessageAttachment?) {
        guard let attachment else { return }
        GalleryPrewarm.warm(attachment)
    }

    /// Préchauffe STRICTEMENT la fenêtre de rendu. L'ancienne valeur (±2)
    /// décodait cinq images plein format par page traversée alors que trois
    /// seulement peuvent s'afficher. Règle et bornes : `GalleryRenderWindow`.
    private func prefetchNeighbors(around index: Int) {
        guard let range = GalleryRenderWindow.prefetchRange(around: index, count: allAttachments.count)
        else { return }
        range.forEach { cacheAttachment(allAttachments[$0]) }
    }

    private func requestSaveCurrent() {
        guard currentIndex < allAttachments.count else { return }
        let att = allAttachments[currentIndex]
        let urlStr = att.fileUrl.isEmpty ? (att.thumbnailUrl ?? "") : att.fileUrl
        guard !urlStr.isEmpty else { return }
        HapticFeedback.light()
        saveCoordinator.requestSave(MediaSaveRequest(
            kind: att.type == .video ? .video : .image,
            remoteURLString: urlStr,
            suggestedFileName: att.originalName.isEmpty ? nil : att.originalName,
            attachmentId: att.id.isEmpty ? nil : att.id
        ))
    }
}
