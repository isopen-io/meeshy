import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La matérialisation, isolée pour être ÉPROUVÉE

/// **Ce qu'un média reçu devient quand une porte le sème** — la seule règle de
/// ce lot qui touche un fichier, et donc la seule qu'il faille pouvoir exercer
/// sans monter une vue.
///
/// Elle répond à une question qui n'est PAS celle de `PublicationTargetRule` :
/// celle-là dit « où le PONT peut-il envoyer ces octets tels quels ? » (POST /
/// REEL / STORY, note vocale comprise) ; celle-ci dit « la GRAINE peut-elle
/// poser ceci sur un CANVAS ? ». Les fondre ferait offrir « Composer » sur un
/// audio que l'atelier ne sait pas placer — un objet sans actif chargé, que
/// `runStoryUpload` saute en journalisant « layer will be invisible to
/// viewers ». Le geste aurait l'air de marcher, et rien ne partirait.
enum ConversationMediaSeeding {

    /// `nil` quand le média n'est pas composable, ou quand sa matérialisation
    /// échoue. L'appelant n'ouvre alors RIEN : une scène sans son média serait
    /// pire qu'un refus — l'auteur croirait avoir mal visé et composerait
    /// par-dessus le vide.
    ///
    /// Le DÉCODAGE d'une image vit ici, et pas dans le SDK, pour une raison
    /// mesurée : la graine doit poser le fond SYNCHRONIQUEMENT (l'instantané de
    /// `restoreCanvas` ne relit jamais ce qui arrive après lui), et ce site est
    /// déjà dans un contexte asynchrone — il vient de matérialiser le fichier.
    /// `StoryMediaLoader.loadImage(data:maxDimension:)` décode hors du main
    /// actor (`Task.detached`), au plafond de 1080 px que le composer applique à
    /// ses captures. La LECTURE, elle, reste sur le main actor : `.mappedIfSafe`
    /// la rend paresseuse, et le dire évite qu'un lecteur croie tout le chemin
    /// détaché.
    ///
    /// C'est aussi le site où la COPIE de la vidéo est faite — une fois par
    /// ouverture, parce que `materialise()` est gardé par `guard case .pending`.
    /// La loger dans `init(seeding:)` la faisait rejouer à chaque construction
    /// du ViewModel, c'est-à-dire à chaque passe de rendu de la porte.
    @MainActor
    static func seed(
        for attachment: MessageAttachment,
        resolver: MediaSaveSourceResolving
    ) async -> StoryComposerSeed? {
        guard let forme = ComposableAttachment.form(mimeType: attachment.mimeType) else { return nil }

        // **Aucun repli sur la VIGNETTE.** Les sites « Enregistrer » l'écrivent,
        // et c'est bénin chez eux : ranger la vignette au lieu du film est un
        // moindre mal. Ici la graine alimente une PUBLICATION — pour une vidéo,
        // le JPEG serait posé par `insertForegroundVideo` comme piste vidéo (une
        // couche « vidéo » dont l'actif est une image fixe) ; pour une image, le
        // fil recevrait la vignette à la place de la photo, sans un mot. Un
        // `fileUrl` vide vaut donc `nil`, et la porte se referme en le DISANT.
        guard !attachment.fileUrl.isEmpty else { return nil }

        let request = MediaSaveRequest(
            kind: attachment.kind,
            remoteURLString: attachment.fileUrl,
            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
            attachmentId: attachment.id.isEmpty ? nil : attachment.id
        )
        guard let localFile = try? await resolver.resolveLocalFile(for: request) else { return nil }

        switch forme {
        case .video:
            // La vidéo reste un FICHIER, et la COPIE se fait ICI — une fois, à
            // la fabrique de la graine. La loger dans `init(seeding:)` la faisait
            // rejouer à chaque construction du ViewModel, donc à chaque passe de
            // rendu de cette porte. La décoder en bitmap perdrait le son et le
            // mouvement — c'est-à-dire la vidéo.
            return StoryComposerSeed.video(copying: localFile)
        case .image:
            guard let data = try? Data(contentsOf: localFile, options: .mappedIfSafe),
                  let bitmap = await StoryMediaLoader.shared.loadImage(data: data, maxDimension: 1080)
            else { return nil }
            return StoryComposerSeed(payload: .image(bitmap))
        }
    }
}

// MARK: - Ce que la porte a besoin de savoir

/// **L'état de présentation de la porte, qui ne peut pas exister sans sa pièce
/// jointe.**
///
/// Porter un `Message` seul aurait laissé le montage résoudre lui-même « quelle
/// pièce ? » — donc laisser un cas où l'on présente un composer sur une pièce
/// introuvable, écran noir sans issue. L'`init?` LIT la même règle que le menu
/// et la feuille (`ComposableAttachment.target`), une fois, et rend `nil` sinon.
///
/// C'est le TROISIÈME verrou de la protection, et il vaut par ce qu'il survit :
/// un quatrième déclencheur qui oublierait le gate d'offre ne pourrait toujours
/// pas construire de cible sur un média à vue unique, flouté ou chiffré.
struct ComposableMediaTarget: Identifiable {
    let messageId: String
    let attachment: MessageAttachment

    var id: String { "\(messageId)/\(attachment.id)" }

    init?(message: Message) {
        guard let seule = ComposableAttachment.target(in: message) else { return nil }
        self.messageId = message.id
        self.attachment = seule
    }
}

// MARK: - La PORTE

/// **La porte du média REÇU** (e9 / O13) — quatrième porte de production du
/// meuble, et la première dont le profil existait avant elle.
///
/// `ComposerProfile` décrit `.conversationMedia` depuis C1 : format d'ouverture,
/// éventail, capture. Aucun site ne le construisait. Une porte définie et
/// branchée sur rien n'est pas « en attente » — c'est de l'UI morte, et elle
/// passe au vert dans toutes les gardes de la table, parce qu'une table se
/// mesure sans qu'on l'atteigne (loi 4).
///
/// ## Pourquoi une PORTE, et pas un montage dans `ConversationView`
///
/// Le montage porte l'envoi, la reprise et la sortie. Posé dans une feuille de
/// présentation, il aurait été recopié au premier second site — et ce second
/// site existe déjà dans ce lot : la feuille de forward, qui déclenche le MÊME
/// chemin. `MeeshyComposerHostGuardTests` retient nommément cette règle : seules
/// des portes montent le meuble.
///
/// ## Ce que la porte fait, dans cet ordre
///
/// 1. **matérialise** — par `MediaSaveSourceResolving`, injecté par le PROTOCOLE
///    (seam de test), jamais par le type concret ;
/// 2. **décode** hors du main actor pour une image (`ConversationMediaSeeding`) ;
/// 3. **présente** le meuble avec sa graine ;
/// 4. **publie** par `StoryViewModel.publishStoryInBackground`, qui porte déjà
///    le format choisi dans l'éventail — jamais par un service, qui perdrait la
///    file durable et la réconciliation optimiste ;
/// 5. **échoue en le DISANT** : un échec de matérialisation affiche son message
///    et n'ouvre rien.
///
/// ## Ce qu'elle NE fait pas
///
/// Aucune référence vers l'expéditeur (clause O13), aucun badge d'attribution :
/// le média a été reçu EN PRIVÉ, et le créditer publiquement serait une
/// divulgation, pas une politesse. Ces deux refus vivent dans la GRAINE
/// (`StoryComposerViewModel(seeding:)`), qui est l'endroit où on pourrait être
/// tenté de les ajouter par symétrie avec le repost.
struct ConversationMediaComposerDoor: View {

    /// Le message et sa pièce jointe UNIQUE. Un lot hétérogène mentirait sur ce
    /// qui partirait, et l'`init?` de la cible a déjà refusé ce cas.
    let target: ComposableMediaTarget

    /// **L'INTENTION naît ICI, et nulle part ailleurs.** Une porte est le site
    /// qui construit son intention : la laisser à son hôte en ferait un second
    /// site à tenir d'accord — et ce lot livre justement DEUX déclencheurs pour
    /// une seule présentation. C'est la table (`ComposerProfile`) qui décide
    /// ensuite du format d'ouverture et de la surface ; la porte ne les recopie
    /// pas.
    private var intent: ComposerIntent {
        ComposerIntent(origin: .conversationMedia(
            messageId: target.messageId, attachmentId: target.attachment.id))
    }

    private var attachment: MessageAttachment { target.attachment }

    /// Le modèle des stories, **sans `@ObservedObject`** : la porte n'affiche
    /// rien qui en dépende, elle l'utilise pour publier. L'observer ferait
    /// re-rendre le composer entier à chaque `story:` reçue par la socket,
    /// pendant que l'auteur compose — la raison, mot pour mot, que portent déjà
    /// la porte du mood et celle du document.
    let storyViewModel: StoryViewModel

    /// Réinjectés à travers la frontière du cover d'APERÇU : `StoryViewerView`
    /// les lit en `@EnvironmentObject`, et un cover ne recopie pas
    /// l'environnement de son hôte.
    let router: Router
    let conversationListViewModel: ConversationListViewModel
    let statusViewModel: StatusViewModel

    /// Le seam. Défaut de PRODUCTION seulement — un test injecte le sien.
    var resolver: MediaSaveSourceResolving = AttachmentMediaSaveResolver()

    let onDismiss: () -> Void

    /// L'état de la matérialisation. Trois cas, et la porte ne monte le meuble
    /// que dans UN d'entre eux : le `@StateObject` du meuble naît à sa
    /// construction, donc le construire avant que la graine n'existe donnerait
    /// un atelier vide que rien ne pourrait plus semer.
    private enum Materialisation {
        case pending
        case seeded(StoryComposerSeed)
        case failed
    }

    @State private var materialisation: Materialisation = .pending
    @State private var previewAssets: StoryPreviewAssets?

    var body: some View {
        contenu
            .task { await materialise() }
    }

    @ViewBuilder
    private var contenu: some View {
        switch materialisation {
        case .pending:
            attente
        case .failed:
            // La sortie a déjà été demandée par `materialise()`. Rien à peindre
            // — surtout pas un écran d'erreur derrière un toast qui dit la même
            // chose deux fois.
            Color.black.ignoresSafeArea()
        case .seeded(let graine):
            meuble(graine)
        }
    }

    /// L'attente porte SA SORTIE, et ce n'est pas une politesse.
    ///
    /// Un `.fullScreenCover` ne se renvoie pas au geste, et
    /// `resolveLocalFile` TÉLÉCHARGE sur défaut de cache, sans plafond : sans ce
    /// bouton, une vidéo reçue non encore mise en cache enfermait l'auteur dans
    /// un plein écran noir pour une durée bornée par le seul réseau. Rendre la
    /// main démonte le cover, ce qui annule la `.task` de matérialisation —
    /// il n'y a donc rien d'autre à annuler à la main.
    private var attente: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            ProgressView()
                .tint(.white)
                .accessibilityLabel(Text(ConversationMediaComposerCopy.preparing))
        }
        .overlay(alignment: .topLeading) {
            Button(action: onDismiss) {
                Text(ConversationMediaComposerCopy.cancel)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .padding(.leading, 4)
        }
    }

    private func meuble(_ graine: StoryComposerSeed) -> some View {
        MeeshyComposerHost(
            intent: intent,
            // La mémoire d'audience du format STORY, relue par le modèle. Sans
            // elle, le SDK retombe sur `PostVisibility.friends` sans un mot, et
            // le dernier choix de l'auteur est perdu (loi 10).
            initialVisibility: storyViewModel.lastComposerVisibility,
            onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                storyViewModel.publishStoryInBackground(
                    targetType: targetType,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    references: references,
                    composerMediaAlt: accessibility.mediaAlt ?? [:],
                    allowSoundExtraction: accessibility.allowSoundExtraction
                )
                // La publication accepte TOUJOURS : hors-ligne, elle part en
                // file d'attente plutôt que de rester dans le composer.
                return true
            },
            onPublishDocument: { _ in
                // `.mediaSeeded` route TOUS les formats vers la SCÈNE — c'est
                // ce qui tient la loi 6 ici : `ComposerDocumentDraft` n'a ni
                // `mediaIds`, ni fichier, ni lieu, et y router « Post » ferait
                // disparaître le média semé de l'écran ET de la publication. Le
                // socle n'est donc jamais peint, et cette fermeture jamais
                // appelée. Elle REFUSE plutôt qu'elle n'accepte : un `true`
                // fermerait le composer sur une publication qui n'a pas eu lieu.
                false
            },
            // Aucun mood : cette porte n'atteint pas la surface du mood, pour
            // la raison ci-dessus. Écrit en toutes lettres — le paramètre n'a
            // pas de défaut.
            moodSeed: nil,
            mediaSeed: graine,
            onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                previewAssets = StoryPreviewAssets(
                    slides: slides,
                    backgroundImages: images,
                    loadedImages: loadedImgs,
                    videoURLs: videoURLs,
                    audioURLs: audioURLs
                )
            },
            onDismiss: onDismiss
        )
        .fullScreenCover(item: $previewAssets, onDismiss: {
            NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)
        }) { assets in
            apercu(assets)
        }
    }

    /// L'aperçu est rendu par le LECTEUR (`StoryViewerView`), pas par un
    /// composant maison — loi 6, tenue par le même registre de rendu que le
    /// composer. Un troisième chemin d'aperçu mentirait tôt ou tard.
    private func apercu(_ assets: StoryPreviewAssets) -> some View {
        let items = assets.slides.map { $0.toPreviewStoryItem() }
        let group = StoryGroup(
            id: "preview",
            username: String(localized: "story.preview.username", defaultValue: "Aperçu", bundle: .main),
            avatarColor: MeeshyColors.brandPrimaryHex,
            stories: items
        )
        return StoryViewerView(
            viewModel: storyViewModel,
            groups: [group],
            currentGroupIndex: 0,
            isPresented: Binding(
                get: { previewAssets != nil },
                set: { if !$0 { previewAssets = nil } }
            ),
            isPreviewMode: true,
            preloadedImages: assets.loadedImages.merging(assets.backgroundImages) { fg, _ in fg },
            preloadedVideoURLs: assets.videoURLs,
            preloadedAudioURLs: assets.audioURLs
        )
        .environmentObject(router)
        .environmentObject(conversationListViewModel)
        .environmentObject(statusViewModel)
    }

    private func materialise() async {
        guard case .pending = materialisation else { return }
        guard let graine = await ConversationMediaSeeding.seed(for: attachment, resolver: resolver) else {
            materialisation = .failed
            // `showError` porte DÉJÀ sa vibration d'erreur (`FeedbackToastManager`
            // la pose à chaque point d'entrée, parce qu'elle diffère par type de
            // toast). En rejouer une ici en donnerait deux pour un seul échec.
            FeedbackToastManager.shared.showError(ConversationMediaComposerCopy.unavailable)
            onDismiss()
            return
        }
        materialisation = .seeded(graine)
    }
}

/// Libellés de la porte, résolus par le catalogue `.main` — écrits ici plutôt
/// qu'en littéraux dans la vue : un libellé posé en ligne échappe au cliquet de
/// complétude et n'est jamais traduit.
nonisolated enum ConversationMediaComposerCopy {
    static var preparing: String {
        String(localized: "composer.media.preparing",
               defaultValue: "Préparation du média…", bundle: .main)
    }

    /// Réemployée du catalogue plutôt qu'ajoutée : `common.cancel` porte déjà
    /// « Annuler » dans les sept langues.
    static var cancel: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)
    }

    static var unavailable: String {
        String(localized: "composer.media.unavailable",
               defaultValue: "Ce média n'est pas disponible. Vérifiez votre connexion, puis réessayez.",
               bundle: .main)
    }
}
