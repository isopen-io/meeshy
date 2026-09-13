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
enum ComposerMediaSeeding {

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
    /// **La graine d'un PLAN** — média, description, ou les deux (#4025).
    ///
    /// Prend le plan et non la pièce, parce qu'un message texte n'en a pas : la
    /// signature précédente rendait le cas INEXPRIMABLE, et c'est ce qui tenait
    /// « Composer » hors des messages texte bien plus sûrement qu'un `if`.
    ///
    /// La description est portée telle quelle — aucun actif à matérialiser,
    /// donc aucun aller-retour réseau pour un geste qui n'en a pas besoin.
    @MainActor
    static func seed(
        for plan: ComposableAttachment.SeedPlan,
        resolver: MediaSaveSourceResolving
    ) async -> StoryComposerSeed? {
        guard let attachment = plan.media else {
            // Texte seul : la description EST le semis. La fabrique du SDK
            // refuse un texte vide, et ce `nil` remonte tel quel — la porte
            // n'ouvre alors rien, et le dit.
            return plan.description.flatMap(StoryComposerSeed.text)
        }
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
            origin: .transmitted,
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
            return StoryComposerSeed.video(copying: localFile,
                                           declaredMimeType: attachment.mimeType)
                .map { StoryComposerSeed(payload: $0.payload, description: plan.description, origin: $0.origin) }
        case .audio:
            // #4461 — le son reste un FICHIER, comme la vidéo, et la copie se
            // fait à la fabrique. Le décoder n'aurait aucun sens : il n'y a rien
            // à rendre, seulement à jouer.
            return StoryComposerSeed.audio(copying: localFile,
                                           declaredMimeType: attachment.mimeType)
                .map { StoryComposerSeed(payload: $0.payload, description: plan.description, origin: $0.origin) }
        case .image:
            guard let data = try? Data(contentsOf: localFile, options: .mappedIfSafe),
                  let bitmap = await StoryMediaLoader.shared.loadImage(data: data, maxDimension: 1080)
            else { return nil }
            // **Le bitmap est pour le CANVAS, le fichier pour la PUBLICATION**
            // (#5409). Ce site résolvait déjà `localFile` puis n'en gardait que
            // l'image décodée à 1080 px : la voie document n'avait alors rien à
            // téléverser, et le média semé ne quittait jamais l'appareil.
            return StoryComposerSeed(
                payload: .image(bitmap),
                description: plan.description,
                origin: StoryComposerSeed.Origin(fileURL: localFile,
                                                 mimeType: attachment.mimeType)
            )
        }
    }
}

// MARK: - Ce que la porte a besoin de savoir

/// **L'état de présentation de la porte, qui ne peut pas exister sans quelque
/// chose à semer.**
///
/// Porter un `Message` seul aurait laissé le montage résoudre lui-même « quelle
/// pièce ? » — donc laisser un cas où l'on présente un composer sur une pièce
/// introuvable, écran noir sans issue. Chaque `init?` LIT la règle d'offre
/// (`ComposableAttachment.seedPlan`), une fois, et rend `nil` sinon.
///
/// C'est le TROISIÈME verrou de la protection, et il vaut par ce qu'il survit :
/// un déclencheur de plus qui oublierait le gate d'offre ne pourrait toujours
/// pas construire de cible sur un média à vue unique, flouté ou chiffré.
/// Renommée de `ComposableMessageTarget` au #6085, après l'avoir déjà été au
/// #4025 quand la cible a cessé d'être nécessairement un MÉDIA : elle n'est plus
/// nécessairement un MESSAGE.
/// Garder l'ancien nom aurait fait dire au type l'inverse de ce qu'il porte —
/// c'est la raison exacte du premier renommage, rejouée un cran plus haut.
///
/// **L'ORIGINE voyage avec la cible, et pas dans la porte.** Trois surfaces
/// montent désormais le MÊME meuble ; une porte qui composerait l'origine
/// elle-même devrait demander « d'où viens-tu ? » à sa cible, c'est-à-dire
/// refaire le `switch` que ces trois fabriques viennent de trancher.
struct ComposerSeedTarget: Identifiable {

    /// L'identité pour `.fullScreenCover(item:)`. Préfixée par la surface : deux
    /// cibles de surfaces différentes peuvent partager l'identifiant d'un média
    /// (rien ne l'interdit côté serveur), et un `item:` qui ne change pas ne
    /// re-présente rien.
    let id: String

    /// Ce que le porteur sème : le canvas ET la description, ensemble.
    let plan: ComposableAttachment.SeedPlan

    /// D'où la porte est ouverte — le contexte que le meuble transporte, jamais
    /// une donnée de décision (cf. `ComposerOrigin`).
    let origin: ComposerOrigin

    /// La pièce à poser, pour les lecteurs qui n'ont besoin que d'elle.
    /// `nil` pour un porteur sans média composable.
    var attachment: MessageAttachment? { plan.media }

    /// Le seul assembleur, PRIVÉ : déclarer un `init` dans le corps de la
    /// structure supprime le membre à membre synthétisé, et les trois fabriques
    /// ci-dessous ont besoin d'un point de passage commun — c'est lui qui rend
    /// « une cible = un plan + une origine + une identité » indissociable.
    private init(id: String, plan: ComposableAttachment.SeedPlan, origin: ComposerOrigin) {
        self.id = id
        self.plan = plan
        self.origin = origin
    }

    init?(message: Message) {
        guard let plan = ComposableAttachment.seedPlan(in: message) else { return nil }
        self.init(id: "message/\(message.id)/\(plan.media?.id ?? "description")",
                  plan: plan,
                  origin: .conversationMedia(messageId: message.id, attachmentId: plan.media?.id))
    }

    /// **Le média d'un POST** (#6085). La règle d'offre est la MÊME : un post à
    /// deux photos n'ouvre pas d'atelier, parce qu'un lot mentirait sur ce qui
    /// part.
    init?(post: FeedPost) {
        guard let plan = ComposableAttachment.seedPlan(inPost: post) else { return nil }
        self.init(id: "post/\(post.id)/\(plan.media?.id ?? "description")",
                  plan: plan,
                  origin: .socialMedia(postId: post.id, mediaId: plan.media?.id))
    }

    /// **La slide d'une STORY** (#6085). `preferredLanguages` descend le Prisme
    /// du lecteur sur le texte qui pré-remplira la description.
    init?(story: StoryItem, preferredLanguages: [String]) {
        guard let plan = ComposableAttachment.seedPlan(inStory: story,
                                                       preferredLanguages: preferredLanguages)
        else { return nil }
        self.init(id: "story/\(story.id)/\(plan.media?.id ?? "description")",
                  plan: plan,
                  origin: .socialMedia(postId: story.id, mediaId: plan.media?.id))
    }
}

/// **Les trois modèles que l'APERÇU réclame, et rien d'autre.**
///
/// `StoryViewerView` les lit en `@EnvironmentObject`, et un cover ne recopie pas
/// l'environnement de son hôte — il faut donc les lui remettre. Toutes les
/// surfaces ne les ont pas sous la main : les grouper en un optionnel rend
/// l'aperçu CÂBLÉ ou ABSENT, jamais à moitié (loi 4 — un œil qui n'ouvre rien
/// est un contrôle inerte, et c'est précisément le défaut que #5053 a payé sur
/// les deux portes de story).
struct MediaComposerPreviewHosts {
    let router: Router
    let conversationListViewModel: ConversationListViewModel
    let statusViewModel: StatusViewModel
}

// MARK: - La PORTE

/// **LA porte du média DÉJÀ PUBLIÉ OU REÇU** (e9 / O13, généralisée au #6085) —
/// un seul montage pour les TROIS surfaces : le message d'une conversation, le
/// média d'un post, la slide d'une story.
///
/// `ComposerProfile` décrit `.conversationMedia` depuis C1 : format d'ouverture,
/// éventail, capture. Aucun site ne le construisait. Une porte définie et
/// branchée sur rien n'est pas « en attente » — c'est de l'UI morte, et elle
/// passe au vert dans toutes les gardes de la table, parce qu'une table se
/// mesure sans qu'on l'atteigne (loi 4).
///
/// ## Pourquoi UNE porte, et pas trois
///
/// Le montage porte l'envoi, la reprise et la sortie. Posé dans une feuille de
/// présentation, il aurait été recopié au premier second site — et ce second
/// site existait déjà au lot 5 : la feuille de forward, qui déclenche le MÊME
/// chemin. Le #6085 en apporte deux de plus (le fil social, le lecteur de
/// story) ; les servir par trois portes jumelles aurait donné trois publieurs à
/// tenir d'accord. `MeeshyComposerHostGuardTests` retient nommément cette
/// règle : seules des portes montent le meuble.
///
/// ## Ce que la porte fait, dans cet ordre
///
/// 1. **matérialise** — par `MediaSaveSourceResolving`, injecté par le PROTOCOLE
///    (seam de test), jamais par le type concret ;
/// 2. **décode** hors du main actor pour une image (`ComposerMediaSeeding`) ;
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
struct MediaComposerDoor: View {

    /// Ce que la surface a résolu : le plan, son identité, son origine. Un lot
    /// hétérogène mentirait sur ce qui partirait, et l'`init?` de la cible a
    /// déjà refusé ce cas — pour les trois surfaces, par la même règle.
    let target: ComposerSeedTarget

    /// **L'INTENTION naît de la CIBLE, et nulle part ailleurs.** La porte ne
    /// redemande pas « d'où viens-tu ? » : les trois fabriques de
    /// `ComposerSeedTarget` l'ont déjà tranché, et un `switch` ici en ferait un
    /// second site à tenir d'accord. C'est la table (`ComposerProfile`) qui
    /// décide ensuite du format d'ouverture et de la surface ; la porte ne les
    /// recopie pas.
    private var intent: ComposerIntent { ComposerIntent(origin: target.origin) }

    /// Le modèle des stories, **sans `@ObservedObject`** : la porte n'affiche
    /// rien qui en dépende, elle l'utilise pour publier. L'observer ferait
    /// re-rendre le composer entier à chaque `story:` reçue par la socket,
    /// pendant que l'auteur compose — la raison, mot pour mot, que portent déjà
    /// la porte du mood et celle du document.
    let storyViewModel: StoryViewModel

    /// Réinjectés à travers la frontière du cover d'APERÇU : `StoryViewerView`
    /// les lit en `@EnvironmentObject`, et un cover ne recopie pas
    /// l'environnement de son hôte.
    ///
    /// **`nil` ⇒ aucun aperçu** (loi 4). Les surfaces sociales de #6085 ne
    /// tiennent pas ces trois modèles sans les faire traverser un cover de plus,
    /// et un `onPreview` qui n'ouvre rien armerait l'œil du socle sur le vide —
    /// exactement le défaut que #5053 a payé sur les deux portes de story.
    /// DETTE NOMMÉE, identique à celle de `ShareComposeDoor` : lot séparé.
    var preview: MediaComposerPreviewHosts? = nil

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
                .accessibilityLabel(Text(MediaComposerCopy.preparing))
        }
        .overlay(alignment: .topLeading) {
            Button(action: onDismiss) {
                Text(MediaComposerCopy.cancel)
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
            onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, loadedStickerAnimations, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                storyViewModel.publishStoryInBackground(
                    targetType: targetType,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
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
                // La publication accepte TOUJOURS : hors-ligne, elle part en
                // file d'attente plutôt que de rester dans le composer.
                return true
            },
            // **La voie DOCUMENT publie pour de bon depuis #5409.** Cette
            // fermeture rendait `false` — un refus assumé, tant que
            // `.mediaSeeded` montait la scène et que le socle n'était jamais
            // peint. La porte monte désormais le meuble v3 comme sa jumelle
            // `ShareComposeDoor`, et publie par le MÊME publieur qu'elle : deux
            // portes qui composent le même brouillon ne peuvent pas l'envoyer
            // par deux chemins sans diverger.
            onPublishDocument: { draft in
                let accepte = await ComposerDocumentDurablePublisher.publish(draft)
                if accepte { onDismiss() }
                return accepte
            },
            // Aucun mood : un média reçu n'est pas une humeur, et la surface du
            // mood est sans scène — y router une graine la ferait disparaître.
            moodSeed: nil,
            mediaSeed: graine,
            // **L'œil n'arme QUE ce qui s'ouvre** (loi 4). Sans hôtes de
            // lecture, la fermeture ne pose rien : `previewAssets` reste `nil`,
            // donc le cover ci-dessous n'existe pas — au lieu d'un plein écran
            // vide que rien ne pourrait peindre.
            onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                guard preview != nil else { return }
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
    @ViewBuilder
    private func apercu(_ assets: StoryPreviewAssets) -> some View {
        if let preview {
            let items = assets.slides.map { $0.toPreviewStoryItem() }
            let group = StoryGroup(
                id: "preview",
                username: String(localized: "story.preview.username", defaultValue: "Aperçu", bundle: .main),
                avatarColor: MeeshyColors.brandPrimaryHex,
                stories: items
            )
            StoryViewerView(
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
            .environmentObject(preview.router)
            .environmentObject(preview.conversationListViewModel)
            .environmentObject(preview.statusViewModel)
        }
    }

    private func materialise() async {
        guard case .pending = materialisation else { return }
        guard let graine = await ComposerMediaSeeding.seed(for: target.plan, resolver: resolver) else {
            materialisation = .failed
            // `showError` porte DÉJÀ sa vibration d'erreur (`FeedbackToastManager`
            // la pose à chaque point d'entrée, parce qu'elle diffère par type de
            // toast). En rejouer une ici en donnerait deux pour un seul échec.
            FeedbackToastManager.shared.showError(MediaComposerCopy.unavailable)
            onDismiss()
            return
        }
        materialisation = .seeded(graine)
    }
}

/// Libellés de la porte, résolus par le catalogue `.main` — écrits ici plutôt
/// qu'en littéraux dans la vue : un libellé posé en ligne échappe au cliquet de
/// complétude et n'est jamais traduit.
nonisolated enum MediaComposerCopy {
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
