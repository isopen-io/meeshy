import SwiftUI
import MeeshyUI

/// Les DEUX surfaces du meuble (V2).
///
/// Le composer unifié n'a jamais eu qu'une surface : l'atelier de scène du SDK
/// (`StoryComposerView`). C'est ce qui interdisait de recâbler `.feedComposer`,
/// la porte la plus utilisée de l'app — elle ouvre un DOCUMENT (un texte, des
/// pièces jointes), pas une scène, et la router vers l'atelier aurait été une
/// régression sèche. La spec v1 le pose mot pour mot : « le host n'a pas de
/// surface document sans scène, et recâbler la porte la plus utilisée sans elle
/// serait une régression ».
nonisolated enum ComposerSurfaceKind: Equatable {
    /// L'atelier : un canvas, des diapositives, une timeline.
    case scene
    /// Le document : un texte, des pièces jointes, aucune scène.
    case document
}

/// Quelle surface le meuble monte — et c'est une fonction PURE de ce que la
/// porte a décidé (`opensWith`) et du format COURANT (loi 9 : le format est un
/// champ, pas une identité).
///
/// Trois règles, et l'ordre entre elles est le fond de l'affaire :
///
/// 1. **Une porte qui a ouvert une CAPTURE a une scène, quel que soit le
///    format.** Basculer une story en post ne détruit pas le canvas déjà
///    composé : la loi 9 autorise à changer de format, jamais à jeter ce qui
///    est composé. Faire décider le format seul aurait vidé l'écran de
///    quiconque tape « Post » depuis le tray.
/// 2. **Une REPRISE monte la surface où la composition reprise vit
///    RÉELLEMENT.** Le seul mécanisme de reprise du meuble est
///    `StoryComposerViewModel.adoptDraft`, qui repeuple l'ATELIER. Laisser le
///    format décider ici aurait été la mine posée pour V3 :
///    `.draft`/`.share` sont les deux seules portes `routesToLegacy: nil` qui
///    ouvrent en `.resume`, et leur `initialFormat` est le `.post` TRANSITOIRE
///    de la rév. 3 — rouvrir un brouillon aurait donc affiché un éditeur de
///    texte VIDE pendant que le brouillon adopté attendait dans l'atelier,
///    juste derrière. **Condition de levée nommée** : le jour où le meuble sait
///    adopter un brouillon de DOCUMENT (et non plus seulement de scène),
///    `.resume` redescend sous la règle 3.
/// 3. **Sinon le format décide.** Une story et un réel SONT des scènes (des
///    pages, une prise continue) ; un post et un mood sont des documents — du
///    texte et des pièces, sans canvas.
///
/// La conséquence que V3 attend : `.feedComposer` (clavier sur contenu, format
/// `.post`) monte le DOCUMENT, et bascule sur la scène le jour où son auteur
/// choisit « Story » dans l'éventail. C'est la seconde condition de levée de la
/// garde négative de l'éventail.
nonisolated enum ComposerSurfaceRouting {

    static func surface(opening: ComposerOpening, format: ComposerFormat) -> ComposerSurfaceKind {
        switch opening {
        case .cameraReady, .videoCameraReady, .resume:
            return .scene
        case .keyboardOnContent, .moodGrid:
            switch format {
            case .story, .reel: return .scene
            case .post, .status: return .document
            }
        }
    }

    /// Le clavier ne se lève QUE là où la porte a promis qu'on écrirait
    /// d'emblée. Une reprise de brouillon ne le lève pas : le clavier
    /// recouvrirait le document qu'on vient de rouvrir pour le relire.
    static func focusesContentOnAppear(opening: ComposerOpening) -> Bool {
        switch opening {
        case .keyboardOnContent: return true
        case .cameraReady, .videoCameraReady, .moodGrid, .resume: return false
        }
    }
}

/// La rangée d'outils du document — **des données, pas une vue**.
///
/// Elle miroite celle de `FeedComposerSheet` (`FeedView+Attachments.swift`),
/// dans son ORDRE : photo · caméra · emoji · document · lieu · micro. L'ordre
/// n'est pas décoratif — c'est la position que les doigts connaissent depuis
/// des mois sur la porte la plus utilisée de l'app.
nonisolated enum ComposerDocumentTool: String, CaseIterable, Equatable {
    case photo
    case camera
    case emoji
    case document
    case place
    case microphone

    /// L'ordre de la feuille historique. `allCases` suit l'ordre de
    /// déclaration, mais rien ne garantit qu'il ne bougera pas : la rangée est
    /// écrite ici en toutes lettres, et `ComposerDocumentSurfaceTests` vérifie
    /// qu'aucun outil n'en manque.
    static let canonicalRow: [ComposerDocumentTool] = [
        .photo, .camera, .emoji, .document, .place, .microphone
    ]

    var symbolName: String {
        switch self {
        case .photo: return "photo.fill"
        case .camera: return "camera.fill"
        case .emoji: return "face.smiling.fill"
        case .document: return "doc.fill"
        case .place: return "location.fill"
        case .microphone: return "mic.fill"
        }
    }
}

/// Ce que la rangée montre — et la loi 4 y tient en une phrase : **un outil non
/// servi est ABSENT, jamais grisé.**
nonisolated enum ComposerDocumentToolPolicy {

    /// - Parameters:
    ///   - served: les outils que le SITE de montage sait réellement servir.
    ///     C'est lui qui possède le chemin d'ingestion ; peindre un outil qu'il
    ///     ne sert pas ouvrirait un sélecteur dont le résultat n'aurait nulle
    ///     part où aller.
    ///   - allowsCapture: `ComposerProfile.allowsCapture`. Une porte qui
    ///     reprend un contenu déjà publié (repost, édition) refuse la caméra ;
    ///     l'outil disparaît alors de la rangée au lieu d'y rester inerte.
    static func visibleTools(
        served: [ComposerDocumentTool],
        allowsCapture: Bool
    ) -> [ComposerDocumentTool] {
        guard !allowsCapture else { return served }
        return served.filter { $0 != .camera }
    }
}

/// Par où part un document — la troisième capacité que la spec nomme, et la
/// seule dont l'oubli PERD du contenu.
///
/// Mesuré sur `FeedComposerSheet` le 2026-08-23, chemin par chemin :
/// - texte seul → `FeedViewModel.createPost`, qui enfile un post durable quand
///   le réseau manque (« survives offline + app kill ») ;
/// - média + hors ligne → `createOfflineMediaPost`, la file durable, avec sa
///   preview locale et son flush à la reconnexion ;
/// - média + en ligne → l'upload tus puis `createPost` ;
/// - citation → `repostPost`, un appel réseau DIRECT.
///
/// Les deux premiers sont durables, le quatrième ne l'est pas — et c'est
/// consigné ici pour que personne ne le découvre au moment de recâbler la
/// porte.
nonisolated enum ComposerDocumentSendPath: Equatable {
    /// La citation : `POST /posts/:id/repost`. Pas de file durable.
    case quotedRepost
    /// Texte (ou lieu) seul : déjà durable, en ligne comme hors ligne.
    case textOnly
    /// La file durable — le seul chemin qui survit à un hors-ligne ET à un kill.
    case durableOutbox
    /// L'upload tus, puis la création. Ne vaut qu'en ligne : hors ligne il jette.
    case upload

    /// Ce qui survit à un hors-ligne suivi d'un kill de l'app.
    var isDurable: Bool {
        switch self {
        case .textOnly, .durableOutbox: return true
        case .quotedRepost, .upload: return false
        }
    }
}

/// **Sans appelant, et ASSUMÉ tel quel** — pas un oubli de câblage.
///
/// Le meuble ne publie pas : l'unique publieur est la barre du SDK
/// (`publishAllSlides()`), et le socle NOMME la publication sans la piloter.
/// Brancher cette table aujourd'hui exigerait d'écrire le second chemin d'envoi
/// que la doctrine, C2 et le lot V7 interdisent tous les trois.
///
/// Ce qu'elle vaut donc en attendant : une MESURE consignée, chemin par chemin,
/// de ce que la feuille historique fait réellement — c'est la seule chose que
/// V7 ne pourra pas redécouvrir sans relire `FeedComposerSheet` ligne à ligne.
///
/// **Condition de levée nommée** : le jour où le meuble possède son envoi (V7,
/// file de publication unifiée), `test_leRoutageDEnvoi_nEstMonteNullePart` se
/// RETOURNE — il ne se supprime pas.
nonisolated enum ComposerDocumentSendRouting {

    /// L'ordre des trois questions EST la règle, et l'inverser perd du contenu :
    /// tester le hors-ligne après avoir choisi l'upload enverrait une
    /// composition média dans un tus qui jette dès la première requête.
    ///
    /// - Parameter hasLocalMedia: une pièce jointe portée par un fichier LOCAL
    ///   — image, vidéo, document ou **son enregistré**. La feuille historique
    ///   n'y range pas son audio (`publishAudioFromSheet` monte droit sur tus,
    ///   commentaire à l'appui : « Audio offline posts aren't queued through
    ///   this composer path yet ») ; un enregistrement composé hors ligne y est
    ///   donc perdu. La surface document ne reconduit pas cette exception : un
    ///   fichier local est un fichier local.
    static func path(
        isQuote: Bool,
        hasLocalMedia: Bool,
        isOffline: Bool
    ) -> ComposerDocumentSendPath {
        if isQuote { return .quotedRepost }
        guard hasLocalMedia else { return .textOnly }
        return isOffline ? .durableOutbox : .upload
    }
}

/// Libellés de la surface document, résolus par le catalogue `.main` — même
/// idiome que `ComposerFormatCopy`. Un libellé posé en littéral dans la vue
/// échappe au cliquet de complétude et n'est jamais traduit.
nonisolated enum ComposerDocumentCopy {

    /// Le placeholder n'a pas de clé neuve : c'est CELLE de la feuille
    /// historique. Deux clés pour la même phrase, c'est deux traductions à
    /// faire diverger, et la surface est censée l'absorber, pas la doubler.
    static var placeholder: String {
        String(localized: "feed.post.composer.placeholder",
               defaultValue: "Qu'avez-vous en tête ?", bundle: .main)
    }

    static var toolRow: String {
        String(localized: "composer.document.a11y.tools",
               defaultValue: "Outils du document", bundle: .main)
    }

    /// La SORTIE n'a pas de clé neuve : `common.close` existe et est traduite
    /// dans les sept langues du catalogue. Le cliquet de complétude de ce dépôt
    /// est épinglé à un plafond, et une clé de plus pour un mot déjà traduit
    /// l'en rapproche pour rien.
    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
    }

    /// **Aucune clé neuve pour les six outils** — la famille `composer.attach.*`
    /// existe, elle est traduite dans les sept langues du catalogue, et c'est
    /// déjà le vocabulaire d'attache du composer (`UniversalComposerBar`).
    ///
    /// La rév. précédente en avait écrit six (`composer.document.tool.*`) qui
    /// répliquaient mot pour mot les libellés que `FeedView+Attachments.swift`
    /// pose en LITTÉRAL. Deux raisons de les retirer plutôt que de les faire
    /// traduire :
    ///
    /// - le cliquet français est à ZÉRO tolérance
    ///   (`FrenchDefaultValueRatchetTests`) : six clés françaises hors
    ///   catalogue le font rougir tel quel, et six entrées de plus le
    ///   rapprochent de son plafond pour un vocabulaire déjà écrit ;
    /// - deux clés pour la même phrase, ce sont deux traductions à faire
    ///   diverger — le raisonnement que `placeholder` tenait déjà juste
    ///   au-dessus, et qui vaut identiquement ici.
    ///
    /// Ce que cela ne règle PAS, et qui est consigné comme dette : les douze
    /// sites littéraux de `FeedView+Attachments.swift` et `FeedView.swift`
    /// écrivent le français EN GUISE DE CLÉ (`String(localized: "Ajouter une
    /// photo", …)`). Ces clés-là échappent au cliquet — son motif exclut
    /// l'espace — et ne sont traduites nulle part. Leur migration vers
    /// `composer.attach.*` appartient au lot qui absorbera la feuille.
    static func label(_ tool: ComposerDocumentTool) -> String {
        switch tool {
        case .photo:
            return String(localized: "composer.attach.photo",
                          defaultValue: "Photos", bundle: .main)
        case .camera:
            return String(localized: "composer.attach.camera",
                          defaultValue: "Caméra", bundle: .main)
        case .emoji:
            return String(localized: "composer.attach.emoji",
                          defaultValue: "Emoji", bundle: .main)
        case .document:
            return String(localized: "composer.attach.file",
                          defaultValue: "Fichier", bundle: .main)
        case .place:
            return String(localized: "composer.attach.location",
                          defaultValue: "Position", bundle: .main)
        case .microphone:
            return String(localized: "composer.attach.voice",
                          defaultValue: "Vocal", bundle: .main)
        }
    }
}

/// **La surface « document sans scène »** (V2, I6) — absorbée depuis
/// `FeedComposerSheet`.
///
/// Ce qu'elle est : une PRÉSENTATION. Des valeurs immuables entrent, des
/// événements sortent. Elle ne possède ni pièces jointes, ni sélecteurs, ni
/// chemin d'envoi — ces trois-là appartiennent au site qui la monte, et les
/// dupliquer ici ferait deux pipelines d'ingestion pour un seul composer, quand
/// celui de `ComposerDropResolver`/`ComposerIngestRouter` tourne déjà sur six
/// sites de production.
///
/// Ce qu'elle n'est PAS : un second chemin de publication. Le socle du meuble
/// nomme la publication, le SDK la déclenche, et V7 unifiera la file. Une
/// surface qui publierait elle-même serait exactement la dette que ce chantier
/// défait ailleurs.
///
/// **Aucun outil monté sans destination.** `tools` est ce que le site sert, et
/// une rangée vide ne se peint pas du tout (loi 4). C'est ce qui permet à cette
/// surface d'exister AVANT que l'ingestion du meuble soit branchée sans devenir
/// l'affordance sans effet que la doctrine interdit.
struct ComposerDocumentSurface: View {

    @Binding var text: String

    /// Les outils que le site de montage sait servir, déjà filtrés par
    /// `ComposerDocumentToolPolicy`. Vide ⇒ aucune rangée.
    let tools: [ComposerDocumentTool]

    /// `ComposerSurfaceRouting.focusesContentOnAppear(opening:)`. Passé plutôt
    /// que déduit : la surface ne connaît pas la porte, et aller la chercher
    /// ferait d'elle une seconde lectrice de la table de C1.
    let focusesOnAppear: Bool

    /// **La SORTIE**, et c'est un paramètre OBLIGATOIRE — non optionnel, sans
    /// valeur par défaut.
    ///
    /// La scène tient la sienne de l'atelier du SDK (`StoryComposerView` reçoit
    /// `onDismiss` et peint la croix) ; le document n'a pas d'atelier. Une
    /// surface montée sans issue est un écran dont on ne sort pas — et comme
    /// V3 devait la brancher sur `.feedComposer`, la porte la plus utilisée de
    /// l'app, on aurait livré le cul-de-sac à l'endroit le plus fréquenté.
    ///
    /// Elle n'est pas optionnelle à dessein : un `nil` par défaut n'aurait
    /// cassé aucune compilation au site de montage suivant, et la sortie aurait
    /// disparu sans un mot — exactement le silence que `initialVisibility`
    /// avait déjà coûté un cran plus haut.
    let onClose: () -> Void

    var onTool: ((ComposerDocumentTool) -> Void)? = nil

    @FocusState private var isContentFocused: Bool

    /// Le même délai que la feuille historique. Une prise de focus posée dans
    /// le tour de boucle de la présentation est avalée par l'animation de
    /// montée : le clavier ne se lève pas, et rien ne le signale.
    private static let focusDelay: TimeInterval = 0.3

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            exitAffordance
            content
            Spacer(minLength: 0)
            toolRow
        }
        .onAppear { raiseKeyboardIfPromised() }
    }

    /// L'issue, en haut à gauche — la position qu'occupe déjà la croix de
    /// l'atelier, pour que les deux surfaces du meuble se quittent du même
    /// geste. Elle n'est PAS dans le socle : le socle a trois zones et ne bouge
    /// jamais (loi 5), y ajouter une quatrième pour la seule surface document
    /// l'aurait fait dépendre de la porte.
    private var exitAffordance: some View {
        HStack(spacing: 0) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            }
            .accessibilityLabel(Text(ComposerDocumentCopy.close))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    /// Le placeholder n'est PAS peint en `textMuted`, qui serait le réflexe.
    /// Ce jeton mesure 4,41:1 sur le violet profond du plateau — sous AA texte
    /// normal, constat déjà consigné par `ComposerPlateauTests` avec un témoin
    /// négatif. `textSecondary` est le seul premier plan mesuré au-dessus du
    /// seuil sur les TROIS teintes, et le plateau se choisit.
    private var content: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(ComposerDocumentCopy.placeholder)
                    .font(.body)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .focused($isContentFocused)
                .scrollContentBackground(.hidden)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .font(.body)
                .frame(minHeight: 120)
                .padding(.horizontal, 12)
                .padding(.top, 4)
                .accessibilityLabel(Text(ComposerDocumentCopy.placeholder))
        }
    }

    /// Une seule teinte pour les six outils, là où la feuille historique en
    /// portait six. Ce n'est pas un appauvrissement : ces couleurs vives
    /// avaient été mesurées sur un fond CLAIR, et le plateau du meuble est
    /// sombre par construction (`PlateauTint`, trois teintes toutes sombres).
    /// Les y recopier aurait posé six contrastes non mesurés d'un coup.
    @ViewBuilder
    private var toolRow: some View {
        if !tools.isEmpty {
            HStack(spacing: 16) {
                ForEach(tools, id: \.rawValue) { tool in
                    Button {
                        onTool?(tool)
                    } label: {
                        Image(systemName: tool.symbolName)
                            .font(.title3)
                            .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    }
                    .accessibilityLabel(Text(ComposerDocumentCopy.label(tool)))
                }
                Spacer()
            }
            .padding(16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerDocumentCopy.toolRow))
        }
    }

    private func raiseKeyboardIfPromised() {
        guard focusesOnAppear else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.focusDelay) {
            isContentFocused = true
        }
    }
}
