import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une section de l'écran des réglages** : son titre en capitales, teinté,
/// au-dessus d'une carte qui porte ses rangées. La teinte de la section colore
/// à la fois le titre, le fond et le contour de la carte.
struct SettingsSectionCard<Content: View>: View {
    let title: String
    let icon: String
    let color: String
    var sentence: String? = nil
    let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundStyle(Color(hex: color))
                    /* L'ICÔNE EST DÉCORATIVE — relevé en revue
                       d'accessibilité : sans ce masque, VoiceOver
                       annonce le NOM DU SYMBOLE avant le titre, « waveform and
                       mic, PROFIL VOCAL », « externaldrive fill, DONNÉES ».
                       Une `Image(systemName:)` sans libellé prend le nom de
                       l'asset comme libellé par défaut ; le titre à côté dit
                       déjà tout ce que l'icône illustre. */
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, MeeshySpacing.xs)

            if let sentence {
                SettingsSentence(text: sentence)
            }

            VStack(spacing: 0) {
                content
            }
            .background(SettingsSectionBackground(tint: color))
        }
    }
}

/// **Une rangée de réglage** : la pastille d'icône teintée, le titre, puis ce
/// que la rangée porte à droite (bascule, valeur, chevron). VoiceOver lit la
/// rangée comme UN élément, sous son titre.
struct SettingsRowLabel<Trailing: View>: View {
    let icon: String
    let title: String
    let color: String
    var note: MeeshyInfoNote? = nil
    var openNoteID: Binding<String?> = .constant(nil)
    let trailing: Trailing

    private var theme: ThemeManager { ThemeManager.shared }

    @ViewBuilder
    var body: some View {
        if note != nil {
            rowContent
        } else {
            rowContent
                .accessibilityElement(children: .combine)
                .accessibilityLabel(title)
        }
    }

    private var rowContent: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                .foregroundStyle(Color(hex: color))
                .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color(hex: color).opacity(MeeshyOpacity.light))
                )
                .accessibilityHidden(true)

            MeeshyInfoNoted(note: note, openNoteID: openNoteID, tint: theme.textMuted) {
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
            }

            Spacer()

            trailing
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.vertical, MeeshySpacing.sm + 2)
    }
}

/// **La phrase d'une rangée**, lisible au repos sous elle : ce qu'un nom propre
/// à Meeshy veut dire (règle 7 de l'épure). VoiceOver la lit à la suite de la
/// rangée, sans `accessibilityHint` qui la répéterait.
struct SettingsRowSentence: View {
    let text: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
            .foregroundStyle(theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.bottom, MeeshySpacing.sm + 2)
    }
}

/// **Les phrases d'orientation des réglages** : une par bloc ou par rangée
/// propre à Meeshy. Une seule source, que les écrans citent et que les témoins
/// parcourent par `all`.
enum SettingsOrientation {
    static var voice: String {
        String(localized: "settings.voice.orientation", defaultValue: "Gardez votre voix dans vos messages traduits.", bundle: .main)
    }

    static var transcription: String {
        String(localized: "settings.transcription.orientation", defaultValue: "La transcription d'un vocal s'affiche dans votre langue.", bundle: .main)
    }

    static var packs: String {
        String(localized: "settings.packs.hint", defaultValue: "Stickers et cadres du jeu : installez ou retirez des packs.", bundle: .main)
    }

    static var progression: String {
        String(localized: "settings.tools.progression.hint", defaultValue: "Vos médailles, votre niveau et votre Flamme", bundle: .main)
    }

    static var affiliate: String {
        String(localized: "settings.tools.affiliate.hint", defaultValue: "Inviter des amis et gagner des récompenses", bundle: .main)
    }

    static var lentilleList: String {
        String(localized: "settings.interface.lentille_list.hint", defaultValue: "Chaque conversation de la liste se lit dans votre langue, d'un coup d'œil.", bundle: .main)
    }

    static var riviereMode: String {
        String(localized: "settings.interface.riviere_mode.summary", defaultValue: "Dans les groupes actifs, la conversation se lit en couloirs, un par voix.", bundle: .main)
    }

    static var riviereUnavailable: String {
        String(localized: "settings.interface.riviere_mode.hint", defaultValue: "Disponible quand le mode de lecture est activé.", bundle: .main)
    }

    static var encryption: String {
        String(localized: "settings.privacy.encryption.summary", defaultValue: "Le chiffrement de bout en bout se choisit par conversation et ne se défait pas.", bundle: .main)
    }

    static var readingModes: String {
        String(localized: "settings.interface.reading_modes.orientation", defaultValue: "Lisez une conversation en Bulles, Script, Résumé, Focal ou Rivière.", bundle: .main)
    }

    static var all: [String] {
        [voice, transcription, packs, progression, affiliate, lentilleList, readingModes, riviereMode, riviereUnavailable, encryption]
    }
}

/// **Une phrase d'orientation**, lisible au repos sous le titre d'un bloc :
/// ce que le bloc est, en une ligne. Les repères propres à Meeshy restent
/// visibles (règle 7 de l'épure) ; seul le détail passe
/// derrière un (i).
struct SettingsSentence: View {
    let text: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
            .foregroundStyle(theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, MeeshySpacing.xs)
    }
}

/// **Les notes derrière un (i) des réglages** (épure #17584). Le nom
/// accessible du (i) est la QUESTION à laquelle la note répond ; la note reste
/// lue par le lecteur d'écran, repliée ou dépliée. Une seule source : les
/// écrans les citent, les témoins les parcourent par `all`.
enum SettingsInfoNotes {
    static var galleryAutosave: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.media.autosave.note.question", defaultValue: "Quels médias sont enregistrés ?", bundle: .main),
            text: String(localized: "settings.media.autosave.subtitle", defaultValue: "Les images et vidéos reçues rejoignent l'album Meeshy, une seule fois. Jamais un média éphémère, flouté ou à vue unique.", bundle: .main)
        )
    }

    static var renderedCapture: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.media.capture.rendered.note.question", defaultValue: "Quand la version avec effets est-elle enregistrée ?", bundle: .main),
            text: String(localized: "settings.media.capture.rendered.subtitle", defaultValue: "Automatiquement en validant la retouche. Sinon, la flèche de la retouche l'enregistre à la demande.", bundle: .main)
        )
    }

    static var cameraArming: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.media.opening.camera.note.question", defaultValue: "Que fait « Armer la caméra » ?", bundle: .main),
            text: String(localized: "settings.media.opening.camera.note", defaultValue: "La caméra s'ouvre derrière la scène dès l'ouverture du composer. Maintenez la scène pour filmer.", bundle: .main)
        )
    }

    static var captureOriginal: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.media.capture.original.note.question", defaultValue: "Que contient l'original ?", bundle: .main),
            text: String(localized: "settings.media.capture.original.subtitle", defaultValue: "La photo ou la vidéo brute, sans effet ni cadre, rejoint Photos à chaque prise.", bundle: .main)
        )
    }

    static var libraryOpening: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.media.opening.library.note.question", defaultValue: "Que fait « Ouvrir la photothèque » ?", bundle: .main),
            text: String(localized: "settings.media.opening.library.note", defaultValue: "Vos photos s'ouvrent à mi-hauteur, la caméra visible derrière.", bundle: .main)
        )
    }

    static var readingModes: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.interface.reading_modes.note.question", defaultValue: "Que change le mode de lecture ?", bundle: .main),
            text: String(localized: "settings.interface.reading_modes.subtitle", defaultValue: "Désactivé, les conversations s'ouvrent en Script.", bundle: .main)
        )
    }

    static var compression: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.media.outgoing.compress.note.question", defaultValue: "Que change la compression ?", bundle: .main),
            text: String(localized: "settings.media.outgoing.compress.note", defaultValue: "Économise des données en réduisant chaque photo et chaque vidéo (720p). Sinon, elles partent en haute définition (vidéos en 1080p), compressées sans perte visible.", bundle: .main)
        )
    }

    static var transcriptionAuto: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.transcription.auto.question", defaultValue: "Quand transcrit-on ?", bundle: .main),
            text: String(localized: "settings.transcription.auto.note", defaultValue: "Activé, les vocaux reçus sont transcrits à leur arrivée ; sinon, à la demande.", bundle: .main)
        )
    }

    static var encryption: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.encryption.question", defaultValue: "Qu'est-ce qui change quand une conversation est chiffrée ?", bundle: .main),
            text: String(localized: "settings.privacy.encryption.note", defaultValue: "Le serveur ne voit jamais le clair : la traduction se fait sur votre appareil, et les fonctions qui exigent de lire le message sont absentes. Un message en clair y est refusé.", bundle: .main)
        )
    }

    static var onlineStatus: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.online_status.question", defaultValue: "Qui voit que je suis en ligne ?", bundle: .main),
            text: String(localized: "settings.privacy.online_status.note", defaultValue: "Désactivée, personne ne voit ce point. Écrire reste une preuve d'activité.", bundle: .main)
        )
    }

    static var returnAnnouncement: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.notify_contacts_on_return.question", defaultValue: "Qui est prévenu de mon retour ?", bundle: .main),
            text: String(localized: "settings.privacy.notify_contacts_on_return.note", defaultValue: "Vos amis et les porteurs de votre numéro ou e-mail. Jamais si votre statut en ligne est masqué.", bundle: .main)
        )
    }

    static var readReceipts: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.read_receipts.question", defaultValue: "Pourquoi est-ce réciproque ?", bundle: .main),
            text: String(localized: "settings.privacy.read_receipts.info", defaultValue: "Réciproque : si vous ne renvoyez pas d'accusé de lecture, vous ne verrez pas non plus si vos messages ont été lus.", bundle: .main)
        )
    }

    static var contactSearch: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.hide_from_contact_search.question", defaultValue: "Qui peut me trouver par mon numéro ?", bundle: .main),
            text: String(localized: "settings.privacy.hide_from_contact_search.info", defaultValue: "Activé, votre profil ne ressort plus d'une recherche par numéro ou par e-mail, et vos contacts ne sont pas prévenus de votre arrivée sur Meeshy.", bundle: .main)
        )
    }

    static var callsFromNonContacts: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.calls_non_contacts.question", defaultValue: "Qui peut m'appeler ?", bundle: .main),
            text: String(localized: "settings.privacy.calls_non_contacts.info", defaultValue: "Désactivé, seuls vos amis peuvent vous faire sonner. Les autres voient que vous n'acceptez que les appels de vos contacts.", bundle: .main)
        )
    }

    static var analytics: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.analytics.question", defaultValue: "Que mesure l'analytique ?", bundle: .main),
            text: String(localized: "settings.privacy.analytics.info", defaultValue: "Mesure d'usage anonyme : écrans ouverts, fonctionnalités utilisées, plantages. Jamais le contenu de vos messages, ni vos contacts. Le réglage prend effet immédiatement.", bundle: .main)
        )
    }

    static var hiddenCallAddress: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "settings.privacy.calls.hide_ip.question", defaultValue: "Que fait « Masquer mon adresse IP » ?", bundle: .main),
            text: String(localized: "settings.privacy.calls.hide_ip.info", defaultValue: "Vos appels passent par un relais Meeshy : votre correspondant ne voit pas votre adresse IP. La connexion peut être un peu plus lente. Ce réglage vaut pour cet appareil.", bundle: .main)
        )
    }

    static var all: [MeeshyInfoNote] {
        [galleryAutosave, renderedCapture, captureOriginal, cameraArming, libraryOpening, readingModes, compression, transcriptionAuto, encryption,
         onlineStatus, returnAnnouncement, readReceipts, contactSearch, callsFromNonContacts, analytics, hiddenCallAddress]
    }
}
