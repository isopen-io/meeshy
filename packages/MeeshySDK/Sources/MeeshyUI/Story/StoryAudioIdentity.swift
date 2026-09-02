import Foundation
import MeeshySDK

/// **Ce qu'une piste MONTRE d'elle-même** (directive porteur 2026-09-01).
///
/// > « Il ne faut plus mettre un chip mais juste la note musicale et l'onde si
/// > c'est un enregistrement, ou alors le titre si disponible et le crédit
/// > (sans onde) si ça vient de la bibliothèque. »
///
/// ## Pourquoi l'ONDE distingue les deux
///
/// Une onde dessine ce que la piste CONTIENT — c'est une information sur un son
/// qu'on a soi-même capté, et le seul repère qu'on en ait. Un morceau de
/// bibliothèque, lui, a un NOM : son onde n'apprend rien que son titre ne dise
/// mieux, et elle occupe la place où le crédit doit tenir. Les deux formes ne
/// sont donc pas deux styles du même objet — ce sont deux choses différentes à
/// dire.
///
/// ## Ce que le modèle savait déjà
///
/// `soundId` distingue les deux depuis toujours : non nul ⇒ la piste est
/// EMPRUNTÉE à la bibliothèque, et `soundAuthorUsername` porte alors le crédit
/// gravé au moment du choix (le reader lit un `StorySlide` hors-ligne et ne
/// peut pas le re-résoudre). Aucun champ n'est à ajouter — il manquait la
/// RÈGLE qui les lit ensemble, et chaque surface la réinventait.
///
/// Atome pur : une valeur entre, une forme sort. Aucune vue, aucun singleton —
/// c'est ce qui permet de l'éprouver sans monter d'écran, et à la pastille de
/// l'avatar comme à la puce du canvas de la partager sans diverger.
public nonisolated enum StoryAudioIdentity {

    /// La forme à peindre.
    ///
    /// **La somme ne porte que ce qui DIFFÈRE.** La durée se lit sur les deux
    /// formes — un extrait emprunté dure autant qu'un vocal — donc elle
    /// n'appartient à aucune : la porter sur `.recording` seule faisait dire à
    /// la somme qu'un emprunt n'en a pas, ce que la pastille dément à l'écran.
    /// Elle se lit sur le modèle, et se MET EN FORME chez l'appelant, à qui
    /// seul la locale du lecteur est connue.
    public enum Form: Equatable, Sendable {
        /// Un son CAPTÉ : la note, l'onde. Rien d'autre à dire — il n'a ni
        /// titre ni auteur à créditer.
        case recording
        /// Un son EMPRUNTÉ : la note, son titre quand il en a un, son crédit.
        /// **Sans onde** — le titre dit mieux, et le crédit a besoin de la
        /// place.
        case borrowed(title: String?, credit: String?)
    }

    /// La forme de `audio`.
    ///
    /// **`soundId` décide, jamais la présence d'un titre.** Un enregistrement
    /// peut porter un `name` (l'auteur l'a nommé) sans devenir un emprunt pour
    /// autant ; et un emprunt sans titre reste un emprunt, qui doit son crédit.
    /// Lire le titre pour trancher aurait fait dépendre l'attribution d'un
    /// champ facultatif.
    public static func form(of audio: StoryAudioPlayerObject) -> Form {
        guard let soundId = audio.soundId, !soundId.isEmpty else {
            return .recording
        }
        return .borrowed(title: nonEmpty(audio.name),
                         credit: nonEmpty(audio.soundAuthorUsername))
    }

    /// **Le prédicat NU, pour les questions qui ne sont pas d'affichage.**
    ///
    /// `ComposerSoundColumn.opensEditor` pose la même lecture pour une raison
    /// tout autre : rouvrir un emprunt par « Création audio » rendrait un
    /// FICHIER, donc le détacherait de son `soundId` et du crédit de son
    /// auteur. Les deux conclusions coïncident aujourd'hui et peuvent diverger
    /// demain — rogner un emprunt DÉJÀ POSÉ est un chemin qui a son issue.
    ///
    /// > Ce que deux questions partagent est la LECTURE du modèle, jamais leur
    /// > conclusion. Les fondre en une seule fonction parce qu'elles rendent le
    /// > même booléen les ferait diverger ensemble le jour où l'une bouge.
    public static func isRecording(_ audio: StoryAudioPlayerObject) -> Bool {
        form(of: audio) == .recording
    }

    /// **L'ATTRIBUTION — le titre et le crédit, joints comme les deux surfaces
    /// les écrivent.**
    ///
    /// Vide pour un enregistrement, et c'est la moitié de la règle qui vivait
    /// ailleurs : `ComposerSoundCredit.attribution` lisait `name` et
    /// `soundAuthorUsername` en direct, sans consulter la forme. Un vocal
    /// NOMMÉ — « Mémo du mardi », que l'auteur a intitulé lui-même —
    /// s'annonçait donc comme un morceau de l'étagère, pendant que `form(of:)`
    /// le classait, à raison, enregistrement.
    ///
    /// > Deux règles pour une question ne sont pas une redondance : ce sont
    /// > deux réponses, et rien dans le code ne dit laquelle fait foi.
    ///
    /// Le `@` et le séparateur vivent ICI plutôt que chez chaque hôte : ce sont
    /// eux qui rendent deux pastilles visiblement jumelles, et il suffit qu'un
    /// site écrive « par belva » quand l'autre écrit « @belva » pour qu'un
    /// lecteur croie voir deux choses différentes.
    ///
    /// **Cette règle gouverne le COMPOSER, pas le lecteur.**
    /// `AudioChipDisplay.creditMarqueeText` compose la même phrase pour la puce
    /// d'une story PUBLIÉE, et n'est pas absorbée ici : elle part d'une
    /// `BackgroundAudioAnnouncement` — pas d'un `StoryAudioPlayerObject` — et
    /// tranche un cas que le composer ne connaît pas, celui du CACHE FROID, où
    /// la piste est un emprunt dont les métadonnées ne sont pas encore
    /// arrivées. Elle y rend « ♫ — » plutôt que l'onde, qui mentirait sur la
    /// provenance ; ici, une piste posée porte toujours ce que l'auteur vient
    /// de choisir.
    ///
    /// > Deux sites qui composent la même phrase ne répondent pas forcément à
    /// > la même question. Les fusionner sur la ressemblance du RENDU perdrait
    /// > le cas que l'un des deux est seul à connaître.
    ///
    /// **Sans la durée** (#4676) : servies en une chaîne, la troncature en
    /// queue mangeait la durée, dernier morceau d'une phrase dont le titre est
    /// le sujet. La vue leur donne deux `Text` — celui-ci ne compose que la
    /// moitié qui a le droit de céder sa largeur.
    public static func attribution(of audio: StoryAudioPlayerObject) -> String {
        guard case .borrowed(let title, let credit) = form(of: audio) else { return "" }
        return [title, credit.map { "@\($0)" }]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    /// **L'onde ne se peint que pour un enregistrement.** Exposé à part de
    /// `form` : une vue qui ne veut que cette question ne doit pas avoir à
    /// filtrer une somme, et c'est la formulation que les gardes épinglent.
    public static func showsWaveform(for audio: StoryAudioPlayerObject) -> Bool {
        isRecording(audio)
    }

    /// **La NOTE se peint TOUJOURS** (même directive) : « toujours afficher la
    /// note et le crédit pour pouvoir éditer ».
    ///
    /// Elle n'est pas décorative — c'est elle qui porte le toucher qui ouvre
    /// l'édition. Une forme qui la retirerait dans un cas quelconque
    /// retirerait, avec elle, le seul chemin vers la vue de création audio.
    /// Écrit comme une CONSTANTE plutôt que laissé implicite : une vérité que
    /// personne n'énonce est une vérité qu'un correctif peut retirer sans le
    /// savoir.
    public static let alwaysShowsNote = true

    // MARK: - Comment le son se DONNE À VOIR, selon la surface

    /// La surface qui rend le son. **Ce n'est pas un style, c'est ce que le
    /// lecteur y fait.**
    public enum Surface: Equatable, Sendable {
        /// Une publication qu'on LIT. Le son y est le propos ; sa transcription
        /// est ce qu'on parcourt des yeux pendant qu'il joue.
        case post
        /// Une scène 9:16 qu'on REGARDE. Le son y est un objet parmi d'autres,
        /// posé sur une composition — un texte défilant la recouvrirait.
        case story
    }

    /// **La transcription se sert au POST, jamais à la story** (directive
    /// porteur 2026-09-01).
    ///
    /// > « avoir une vue avec transcription pour le mode poste et une autre
    /// > vue sans transcription pour le mode story »
    ///
    /// La raison n'est pas la place disponible — c'est ce que la surface
    /// PROMET. Un post se lit : le texte y a sa place de plein droit. Une story
    /// se regarde : l'auteur y a composé une image, et un bloc de texte
    /// défilant posé par-dessus détruirait ce qu'il vient de cadrer.
    ///
    /// Écrit comme une RÈGLE plutôt que laissé aux appelants : `MeeshySceneObject`
    /// dit ce qu'un objet EST, cette fonction dit ce que la surface en MONTRE.
    /// Deux questions, et la seconde changeait de réponse à chaque site qui la
    /// réinventait.
    public static func showsTranscript(on surface: Surface) -> Bool {
        switch surface {
        case .post:  return true
        case .story: return false
        }
    }

    /// La surface d'un objet de scène — `nil` pour tout ce qui n'est pas un
    /// son, la question n'ayant alors pas d'objet.
    ///
    /// Prend l'objet ET la surface : un son ne décide pas seul de sa
    /// présentation, c'est l'écran qui l'accueille qui tranche. Passer l'objet
    /// permet à un appelant de poser la question sur une somme sans la
    /// dépiauter lui-même.
    public static func showsTranscript(for object: MeeshySceneObject,
                                       on surface: Surface) -> Bool? {
        guard case .audio = object else { return nil }
        return showsTranscript(on: surface)
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value
    }
}
