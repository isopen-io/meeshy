import SwiftUI
import MeeshySDK
import MeeshyUI

/// Result of an edit: the body plus the two structural fields the gateway lets
/// an author change. `language`/`type` are non-nil ONLY when actually changed,
/// so an unchanged edit never triggers a re-translation or a type switch.
struct EditPostDraft {
    let content: String
    /// Non-nil only when the source language changed → re-runs the Prisme
    /// translation pipeline server-side.
    let language: String?
    /// Non-nil only when the author switched between "POST" and "REEL".
    let type: String?
    /// Ids of attached media the author chose to remove. Empty when none.
    let removeMediaIds: [String]
    /// Non-nil UNIQUEMENT quand l'auteur a touché à la position : `.set` la
    /// remplace, `.remove` la retire. `nil` = inchangée (clé absente du PATCH).
    var location: PostLocationUpdate? = nil
    /// Non-nil UNIQUEMENT quand l'auteur a changé d'audience. Recopier la
    /// visibilité courante à chaque édition écraserait un resserrement fait
    /// entre-temps depuis une autre surface (le menu du lecteur, le web).
    var visibility: String? = nil
    /// Accompagne `visibility` quand celle-ci exige une liste nommée
    /// (EXCEPT/ONLY) ; vide dès que l'auteur quitte ces deux modes.
    var visibilityUserIds: [String]? = nil
    /// **Ce que la feuille a su RENDRE** — la déclaration qui gouverne le
    /// corps du PUT (`PostEditPayload.build`). Un champ absent d'ici est OMIS,
    /// et le serveur préserve alors ce qu'il tient : c'est la seule lecture
    /// juste pour une surface qui n'a jamais peint ce champ.
    ///
    /// Elle voyage AVEC le brouillon plutôt que d'être devinée en aval : un
    /// `nil` reçu par un ViewModel ne dit pas si le champ est INCHANGÉ ou
    /// JAMAIS AFFICHÉ, et seule la feuille connaît la différence.
    var known: Set<PostEditField> = EditPostDraft.documentFields

    /// Le plus large que cette feuille puisse déclarer. `save()` la RESSERRE
    /// selon ce qui a réellement été peint : le sélecteur de type n'existe pas
    /// sur un repost, la bande de médias n'existe pas sans média.
    ///
    /// Six champs du corps n'y figurent JAMAIS — `moodEmoji`, `storyEffects`,
    /// `mediaIds`, `mentions`, `allowSoundExtraction`, `mediaAlt` — parce que
    /// cette feuille ne les a jamais rendus. Les déclarer les rendrait
    /// écrasables par une surface qui ne les a jamais montrés à l'auteur.
    static let documentFields: Set<PostEditField> = [
        .content, .visibility, .visibilityUserIds, .originalLanguage,
        .type, .removeMediaIds, .location
    ]
}

/// Règles PURES de l'audience en édition — extraites de la vue pour être
/// jugées directement (`FeedViewModelTests`), et partagées mot pour mot avec
/// la loi du composer : `PostVisibility.requiresUserSelection`.
enum EditPostAudienceRule {
    /// La visibilité à envoyer. Deux garde-fous se croisent ici :
    ///
    /// - `touched == false` ⇒ toujours `nil`. Ouvrir puis fermer la sheet ne
    ///   doit RIEN dire sur l'audience, sinon un post dont la visibilité n'a
    ///   pas pu être hydratée (cache antérieur au champ) repartirait
    ///   silencieusement en « Public ».
    /// - une fois le sélecteur posé, un original INCONNU ne peut plus servir
    ///   de comparaison : le choix explicite fait foi, sinon choisir « Privé »
    ///   sur ce même post ne partirait jamais.
    static func draftVisibility(selected: PostVisibility, original: String?, touched: Bool) -> String? {
        guard touched else { return nil }
        guard let original, let originalMode = PostVisibility(rawValue: original.uppercased()) else {
            return selected.rawValue
        }
        return selected == originalMode ? nil : selected.rawValue
    }

    /// La liste nommée n'a de sens que sous EXCEPT/ONLY : quitter ces modes la
    /// vide explicitement plutôt que de laisser traîner des destinataires que
    /// plus rien ne gouverne.
    static func draftAudience(selected: PostVisibility, ids: [String]) -> [String] {
        selected.requiresUserSelection ? ids : []
    }

    /// EXCEPT sans exclus = privé fantôme ; ONLY sans inclus = invisible pour
    /// tous. Dans les deux cas l'enregistrement doit rester bloqué.
    static func isComplete(visibility: PostVisibility, audienceCount: Int) -> Bool {
        !visibility.requiresUserSelection || audienceCount > 0
    }
}

/// Lightweight, presentation-only view of an attached media item for the edit
/// sheet — maps from the SDK `FeedMedia` to just what the thumbnail strip needs.
struct EditablePostMedia: Identifiable, Equatable {
    enum Kind { case image, video, audio, document }
    let id: String
    let kind: Kind
    let previewURL: URL?
    /// Durée serveur-autoritaire (ms), quand connue — alimente le plancher de
    /// 3s de `ReelComposition` pour les vidéos/audios. `nil` pour les images
    /// et documents (jamais soumis à cette condition).
    let durationMs: Int?

    /// Pont vers le moteur de classification SDK (`ReelComposition`), pour que
    /// la sheet évalue la règle produit (video >=3s || audio >=3s || >= 2
    /// images) sur la même échelle de types que les composers.
    var feedMediaType: FeedMediaType {
        switch kind {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .document: return .document
        }
    }

    init(id: String, kind: Kind, previewURL: URL?, durationMs: Int? = nil) {
        self.id = id
        self.kind = kind
        self.previewURL = previewURL
        self.durationMs = durationMs
    }

    init(_ media: FeedMedia) {
        self.id = media.id
        switch media.type {
        case .image: self.kind = .image
        case .video: self.kind = .video
        case .audio: self.kind = .audio
        case .document: self.kind = .document
        }
        let raw = media.thumbnailUrl ?? media.url
        self.previewURL = raw.flatMap { MeeshyConfig.resolveMediaURL($0) }
        self.durationMs = media.duration
    }
}

/// Sheet for editing an authored post: body text, source language (with
/// re-translation), and POST <-> REEL type. The parent owns persistence
/// (`ViewModel.updatePost`) so this sheet stays presentation-only and reusable.
struct EditPostSheet: View {
    let originalContent: String
    var originalLanguage: String? = nil
    var originalType: String? = nil
    /// Attached media shown with a remove control. Removing here sends the ids
    /// in `removeMediaIds`; the gateway detaches them. C'est aussi la source de
    /// la règle de composition REEL (`remainingQualifiesAsReel`).
    var media: [EditablePostMedia] = []
    /// Position actuellement attachée au post (`FeedPost.location`) — affichée
    /// dans la sheet avec « retirer » / « changer » (picker).
    var originalLocation: SharedPlace? = nil
    /// Audience actuelle du post (`FeedPost.visibility`) et sa liste nommée.
    /// Rouvrir SANS elles renverrait une liste vide au gateway : les
    /// destinataires d'un post en ONLY disparaîtraient en silence.
    var originalVisibility: String? = nil
    var originalVisibilityUserIds: [String] = []
    /// A repost mirrors its source; its type is not editable.
    var isRepost: Bool = false
    var maxLength: Int = 5000
    let onSave: (EditPostDraft) async -> Void
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    @State private var draftContent: String = ""
    @State private var selectedLanguage: String = ""
    @State private var selectedType: String = "POST"
    @State private var showLanguagePicker = false
    @FocusState private var isFocused: Bool
    @State private var isSaving: Bool = false
    @State private var removedMediaIds: Set<String> = []
    /// Modification de la position pendant l'édition — `nil` tant que
    /// l'auteur n'y a pas touché (la clé ne part pas au PATCH).
    @State private var locationEdit: PostLocationUpdate? = nil
    @State private var showEditLocationPicker = false
    @State private var selectedVisibility: PostVisibility = .public
    @State private var selectedAudience: [String] = []
    @State private var audiencePickerMode: PostVisibility? = nil
    /// L'auteur a-t-il POSÉ un choix d'audience dans cette session d'édition ?
    /// Sans ce drapeau, l'état initial de la sheet parlerait à sa place.
    @State private var audienceTouched: Bool = false

    private var trimmedContent: String {
        draftContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedOriginalType: String { (originalType ?? "POST").uppercased() }

    /// Règle produit 2026-08-02 + directive durée minimale, évaluée sur la
    /// composition APRÈS retraits : un REEL exige une vidéo (>=3s), un audio
    /// (>=3s), ou au moins deux images.
    private var remainingQualifiesAsReel: Bool {
        ReelComposition.qualifiesAsReel(
            mediaKinds: media.filter { !removedMediaIds.contains($0.id) }
                .map { (kind: $0.feedMediaType, durationMs: $0.durationMs) }
        )
    }

    /// Only meaningful when not a repost and either the remaining composition
    /// qualifies as a reel, or the post already IS one (the picker then shows
    /// the imposed switch back to POST when media removal de-qualifies it).
    private var showTypePicker: Bool {
        !isRepost && (remainingQualifiesAsReel || normalizedOriginalType == "REEL")
    }

    private var contentChanged: Bool {
        trimmedContent != originalContent.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var languageChanged: Bool { selectedLanguage != (originalLanguage ?? "") }
    private var typeChanged: Bool { showTypePicker && selectedType != normalizedOriginalType }
    private var mediaChanged: Bool { !removedMediaIds.isEmpty }
    private var locationChanged: Bool { locationEdit != nil }
    private var draftVisibility: String? {
        EditPostAudienceRule.draftVisibility(
            selected: selectedVisibility, original: originalVisibility, touched: audienceTouched
        )
    }
    private var draftAudience: [String] {
        EditPostAudienceRule.draftAudience(selected: selectedVisibility, ids: selectedAudience)
    }
    private var audienceChanged: Bool {
        audienceTouched && (draftVisibility != nil || draftAudience != originalVisibilityUserIds)
    }
    private var hasChanges: Bool {
        contentChanged || languageChanged || typeChanged || mediaChanged || locationChanged || audienceChanged
    }

    /// Position telle qu'elle sera après sauvegarde : l'édition locale prime,
    /// sinon la position d'origine.
    private var displayedLocation: SharedPlace? {
        switch locationEdit {
        case .set(let place): return place
        case .remove: return nil
        case nil: return originalLocation
        }
    }

    private var remainingMediaCount: Int { media.count - removedMediaIds.count }

    private var isValid: Bool {
        guard trimmedContent.count <= maxLength else { return false }
        // La garde ne mord que sur un choix ACTIF : un post déjà en ONLY dont
        // la liste n'a pas pu être hydratée ne doit pas interdire de corriger
        // son texte — rien ne partira sur l'audience dans ce cas.
        guard !audienceChanged
            || EditPostAudienceRule.isComplete(visibility: selectedVisibility, audienceCount: selectedAudience.count)
        else { return false }
        // A media-only post (no text) stays valid as long as media remains.
        return !trimmedContent.isEmpty || remainingMediaCount > 0
    }

    private var remainingChars: Int {
        max(0, maxLength - draftContent.count)
    }

    private var selectedLanguageInfo: LanguageInfo? {
        LanguageData.allLanguages.first { $0.code == selectedLanguage }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 12) {
                    TextEditor(text: $draftContent)
                        .focused($isFocused)
                        .font(MeeshyFont.relative(17))
                        .foregroundColor(theme.textPrimary)
                        .accessibilityLabel(String(localized: "feed.post.edit.body.a11y", defaultValue: "Contenu du post", bundle: .main))
                        .scrollContentBackground(.hidden)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(theme.inputBorder, lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 16)
                        .frame(maxHeight: .infinity)

                    mediaSection

                    locationSection

                    audienceSection

                    metadataSection

                    HStack {
                        Spacer()
                        Text("\(remainingChars)")
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(remainingChars < 100 ? MeeshyColors.warning : theme.textMuted)
                            .accessibilityLabel(String(format: String(localized: "feed.post.edit.remaining.a11y", defaultValue: "%d caractères restants", bundle: .main), remainingChars))
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                }
            }
            .navigationTitle(String(localized: "feed.post.edit.title", defaultValue: "Modifier le post", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
                        onDismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.85)
                        } else {
                            Text(String(localized: "feed.post.edit.publish", defaultValue: "Publier", bundle: .main))
                                .font(MeeshyFont.relative(16, weight: .semibold))
                        }
                    }
                    .disabled(!isValid || !hasChanges || isSaving)
                }
            }
            .sheet(item: $audiencePickerMode) { mode in
                AudienceUserPickerView(mode: mode, initialSelection: selectedAudience) { ids in
                    selectedAudience = ids
                    audienceTouched = true
                }
            }
            .sheet(isPresented: $showLanguagePicker) {
                ProfileLanguagePickerSheet(
                    title: String(localized: "feed.post.edit.language", defaultValue: "Langue du contenu", bundle: .main),
                    languages: LanguageData.allLanguages,
                    selectedCode: selectedLanguage,
                    allowClear: false,
                    onSelect: { code in
                        selectedLanguage = code
                        showLanguagePicker = false
                    }
                )
            }
        }
        .onAppear {
            draftContent = originalContent
            selectedLanguage = originalLanguage ?? ""
            selectedVisibility = originalVisibility
                .flatMap { PostVisibility(rawValue: $0.uppercased()) } ?? .public
            selectedAudience = originalVisibilityUserIds
            // Corpus hérité (E11) : un REEL existant dont la composition ne
            // qualifie plus (ex. une seule image) est rebasculé sur POST dès
            // l'ouverture — le picker l'affiche, et la sauvegarde envoie le
            // changement de type (le gateway refuse un REEL non qualifiant).
            selectedType = (normalizedOriginalType == "REEL" && !remainingQualifiesAsReel)
                ? "POST"
                : normalizedOriginalType
            // Defer focus slightly so the keyboard rises after the sheet
            // present animation settles — otherwise the appearance jolts.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                isFocused = true
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    // MARK: - Audience

    /// Les SIX audiences du modèle, offertes ici comme au composer : une
    /// publication naît publique et son auteur la resserre — ou la rouvre — à
    /// tout moment. EXCEPT/ONLY ouvrent le même sélecteur de personnes que le
    /// composer story ; tant qu'il reste vide, `isValid` bloque « Publier ».
    @ViewBuilder
    private var audienceSection: some View {
        VStack(spacing: 8) {
            Menu {
                ForEach(PostVisibility.allCases) { mode in
                    Button {
                        selectedVisibility = mode
                        audienceTouched = true
                        if mode.requiresUserSelection {
                            isFocused = false
                            audiencePickerMode = mode
                        } else {
                            selectedAudience = []
                        }
                    } label: {
                        Label(mode.label, systemImage: mode.icon)
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: selectedVisibility.icon)
                        .foregroundColor(theme.textSecondary)
                        .accessibilityHidden(true)
                    Text(String(localized: "feed.post.edit.audience", defaultValue: "Audience", bundle: .main))
                        .font(MeeshyFont.relative(15))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    Text(selectedVisibility.label)
                        .font(MeeshyFont.relative(15, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(RoundedRectangle(cornerRadius: 12).fill(theme.inputBackground))
            }
            .disabled(isSaving)

            if selectedVisibility.requiresUserSelection {
                Button {
                    isFocused = false
                    audiencePickerMode = selectedVisibility
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "person.2.badge.gearshape")
                            .accessibilityHidden(true)
                        Text(
                            selectedAudience.isEmpty
                                ? String(localized: "feed.post.edit.audience.choose", defaultValue: "Choisir les personnes", bundle: .main)
                                : String(
                                    format: String(localized: "feed.post.edit.audience.count", defaultValue: "%d personne(s) sélectionnée(s)", bundle: .main),
                                    selectedAudience.count
                                )
                        )
                        .font(MeeshyFont.relative(13))
                        Spacer()
                    }
                    .foregroundColor(selectedAudience.isEmpty ? MeeshyColors.warning : theme.textSecondary)
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Language + type controls

    @ViewBuilder
    private var metadataSection: some View {
        VStack(spacing: 10) {
            Button {
                isFocused = false
                showLanguagePicker = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "globe")
                        .foregroundColor(theme.textSecondary)
                        .accessibilityHidden(true)
                    Text(String(localized: "feed.post.edit.language", defaultValue: "Langue du contenu", bundle: .main))
                        .font(MeeshyFont.relative(15))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    if let info = selectedLanguageInfo {
                        Text("\(info.flag) \(info.name)")
                            .font(MeeshyFont.relative(15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    } else {
                        Text(String(localized: "feed.post.edit.language.auto", defaultValue: "Auto", bundle: .main))
                            .font(MeeshyFont.relative(15))
                            .foregroundColor(theme.textMuted)
                    }
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12).fill(theme.inputBackground)
                )
            }
            .buttonStyle(.plain)
            .disabled(isSaving)

            if showTypePicker {
                Picker(String(localized: "feed.post.edit.type", defaultValue: "Type", bundle: .main), selection: $selectedType) {
                    Text(String(localized: "feed.post.edit.type.post", defaultValue: "Post", bundle: .main)).tag("POST")
                    // L'option Réel n'est offerte que si la composition
                    // restante qualifie — `toggleRemove` a déjà rebasculé la
                    // sélection sur POST quand un retrait dé-qualifie, donc la
                    // sélection ne pointe jamais sur un tag absent.
                    if remainingQualifiesAsReel {
                        Text(String(localized: "feed.post.edit.type.reel", defaultValue: "Réel", bundle: .main)).tag("REEL")
                    }
                }
                .pickerStyle(.segmented)
                .disabled(isSaving)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Position

    /// Sticker de la position + « changer »/« retirer », ou bouton d'ajout
    /// quand le post n'en porte pas. Le tap du sticker ouvre le picker (en
    /// édition, « ouvrir la carte » serait un détour — on est là pour changer).
    @ViewBuilder
    private var locationSection: some View {
        HStack(spacing: 10) {
            if let place = displayedLocation {
                FeedPostLocationSticker(place: place) {
                    showEditLocationPicker = true
                }
                Button {
                    HapticFeedback.light()
                    // Retirer une position ajoutée pendant CETTE édition =
                    // simple retour à l'état d'origine (clé absente du PATCH).
                    locationEdit = originalLocation == nil ? nil : .remove
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.body)
                        .foregroundColor(theme.textMuted)
                }
                .disabled(isSaving)
                .accessibilityLabel(String(localized: "feed.post.edit.location.remove", defaultValue: "Retirer la position", bundle: .main))
            } else {
                Button {
                    HapticFeedback.light()
                    showEditLocationPicker = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.footnote.weight(.semibold))
                        Text(String(localized: "feed.post.edit.location.add", defaultValue: "Ajouter une position", bundle: .main))
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundColor(MeeshyColors.indigo400)
                }
                .disabled(isSaving)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .sheet(isPresented: $showEditLocationPicker) {
            LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { place in
                locationEdit = .set(place)
                showEditLocationPicker = false
            }
        }
    }

    // MARK: - Attached media

    @ViewBuilder
    private var mediaSection: some View {
        if !media.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(media) { item in
                        mediaThumbnail(item)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 2)
            }
        }
    }

    @ViewBuilder
    private func mediaThumbnail(_ item: EditablePostMedia) -> some View {
        let removed = removedMediaIds.contains(item.id)
        ZStack(alignment: .topTrailing) {
            Group {
                if let url = item.previewURL, item.kind == .image || item.kind == .video {
                    // CachedAsyncImage : la vignette d'un média distant existant
                    // réutilise le DiskCacheStore déjà peuplé par le feed (et
                    // gère aussi les URLs file:// des brouillons locaux).
                    CachedAsyncImage(url: url.absoluteString) {
                        mediaIcon(item.kind)
                    }
                    .scaledToFill()
                } else {
                    mediaIcon(item.kind)
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.inputBorder, lineWidth: 1))
            .opacity(removed ? 0.35 : 1)
            // Sans label, la bande de vignettes se lit comme une série de boutons
            // « Retirer le média » identiques : VoiceOver n'annonce ni le TYPE du
            // média ni son état « retiré » (transmis par la seule opacité 0.35,
            // violation WCAG 1.4.1). On décrit chaque vignette comme UN élément
            // (kind + état) ; le bouton retirer/restaurer reste un frère atteignable.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(mediaKindLabel(item.kind))
            .accessibilityValue(removed
                ? String(localized: "feed.post.edit.media.removed.a11y", defaultValue: "Retiré", bundle: .main)
                : "")

            Button {
                toggleRemove(item.id)
            } label: {
                // Glyphe de contrôle épinglé au coin d'une vignette 64×64 fixe :
                // gardé à taille fixe (doctrine — un glyphe dans un cadre rigide
                // crève sa frame s'il scale), mais doté d'un label VoiceOver
                // (auparavant absent) pour l'action retirer / restaurer.
                Image(systemName: removed ? "arrow.uturn.backward.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(removed ? MeeshyColors.indigo300 : .white)
                    .shadow(radius: 1)
            }
            .buttonStyle(.plain)
            .offset(x: 6, y: -6)
            .disabled(isSaving)
            .accessibilityLabel(removed
                ? String(localized: "feed.post.edit.media.restore.a11y", defaultValue: "Restaurer le média", bundle: .main)
                : String(localized: "feed.post.edit.media.remove.a11y", defaultValue: "Retirer le média", bundle: .main))
        }
    }

    @ViewBuilder
    private func mediaIcon(_ kind: EditablePostMedia.Kind) -> some View {
        ZStack {
            theme.inputBackground
            Image(systemName: mediaSymbol(kind))
                .font(.system(size: 22))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
        }
    }

    private func mediaSymbol(_ kind: EditablePostMedia.Kind) -> String {
        switch kind {
        case .video: return "film"
        case .audio: return "music.note"
        case .image: return "photo"
        case .document: return "doc"
        }
    }

    /// Noms courts localisés du type de média, pour l'annonce VoiceOver de chaque
    /// vignette (les glyphes SF Symbols étant décoratifs / masqués).
    private func mediaKindLabel(_ kind: EditablePostMedia.Kind) -> String {
        switch kind {
        case .image: return String(localized: "feed.post.edit.media.kind.image", defaultValue: "Image", bundle: .main)
        case .video: return String(localized: "feed.post.edit.media.kind.video", defaultValue: "Vidéo", bundle: .main)
        case .audio: return String(localized: "feed.post.edit.media.kind.audio", defaultValue: "Audio", bundle: .main)
        case .document: return String(localized: "feed.post.edit.media.kind.document", defaultValue: "Document", bundle: .main)
        }
    }

    private func toggleRemove(_ id: String) {
        if removedMediaIds.contains(id) {
            removedMediaIds.remove(id)
            // Restaurer un média peut re-qualifier la composition : l'option
            // Réel réapparaît, mais on n'y rebascule PAS automatiquement —
            // repasser en REEL reste un choix explicite de l'auteur.
        } else {
            removedMediaIds.insert(id)
            // Règle produit 2026-08-02 : on PEUT retirer un média d'un REEL
            // tant que la composition reste qualifiante (video || audio ||
            // >= 2 images). Sinon le retrait est permis mais IMPOSE le passage
            // en POST — le gateway rejette (422) un REEL non qualifiant.
            if selectedType == "REEL" && !remainingQualifiesAsReel {
                selectedType = "POST"
            }
        }
    }

    private func save() async {
        guard isValid, !isSaving else { return }
        isSaving = true
        // La déclaration suit ce que l'écran a MONTRÉ, pas ce que le
        // brouillon porte : le sélecteur POST/RÉEL n'est pas peint sur un
        // repost (`showTypePicker`), et la bande de retrait n'existe pas sans
        // média (`mediaSection`). Sans médias rendus, un `removeMediaIds`
        // déclaré connu autoriserait un vidage que l'auteur n'a pas pu voir.
        var known = EditPostDraft.documentFields
        if !showTypePicker { known.remove(.type) }
        if media.isEmpty { known.remove(.removeMediaIds) }
        let draft = EditPostDraft(
            content: trimmedContent,
            language: languageChanged ? selectedLanguage : nil,
            type: typeChanged ? selectedType : nil,
            removeMediaIds: Array(removedMediaIds),
            location: locationEdit,
            visibility: audienceChanged ? selectedVisibility.rawValue : nil,
            visibilityUserIds: audienceChanged ? draftAudience : nil,
            known: known
        )
        await onSave(draft)
        isSaving = false
        onDismiss()
    }
}
