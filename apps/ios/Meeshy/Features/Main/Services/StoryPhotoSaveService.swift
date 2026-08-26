import Foundation
import os
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - StorySaveProgressMapper

/// Découpage de l'anneau affiché sur la ligne « Mes stories ».
///
/// Le bake MP4 occupe 0…90 %, l'écriture dans la photothèque les 10 %
/// restants. Sans ce découpage, l'anneau atteindrait 100 % à la fin du
/// bake — soit avant que la vidéo n'existe dans Photos — et l'utilisateur
/// croirait à tort que l'enregistrement est terminé.
enum StorySaveProgressMapper {

    /// Part de l'anneau attribuée au bake.
    static let bakeShare: Double = 0.9

    /// Mappe une fraction de bake `0…1` (bornée) sur `0…bakeShare`.
    static func bake(_ fraction: Double) -> Double {
        min(max(fraction, 0), 1) * bakeShare
    }
}

// MARK: - StoryPhotoSaveService

/// Sauvegardes de stories vers la photothèque actuellement en vol.
///
/// Singleton et NON `@StateObject` d'une vue : `MyStoriesView` est une sheet,
/// et sa fermeture détruirait un état de vue — le `Task` du bake garde
/// `[weak self]`, donc le résultat tardif partirait à la poubelle en silence.
/// L'anneau doit survivre à la fermeture de la sheet et à la navigation, donc
/// l'état vit ici. Même patron que `StoryPublishService.shared`.
///
/// Orchestration app-side (SDK purity) : le SDK bake, ce service décide de
/// l'enchaînement bake → Photos → toast et de ce qui s'affiche.
@MainActor
final class StoryPhotoSaveService: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = StoryPhotoSaveService()

    /// `storyId → progression 0…1`. L'absence de clé signifie « aucune
    /// sauvegarde en vol pour cette story » : c'est ce que la ligne lit pour
    /// choisir entre le glyphe `⋯` et l'anneau.
    @Published private(set) var jobs: [String: Double] = [:]

    /// Stories dont l'écriture dans la photothèque a COMMENCÉ — donc plus
    /// annulables (voir `isCancellable(storyId:)`). `@Published` parce que
    /// c'est ce qui rend l'anneau non tappable sur les deux surfaces : sans
    /// republication, la ligne et le rail ne réévalueraient pas leur `.disabled`.
    @Published private(set) var uncancellableJobs: Set<String> = []

    private var tasks: [String: Task<Void, Never>] = [:]

    private let exporter: StoryVideoExportServiceProviding
    private let photoSaver: PhotoLibrarySaving
    private let toasts: FeedbackToastSurfacing
    private let preferredLanguages: @MainActor () -> [String]
    private let intro: @MainActor @Sendable () async -> StoryExportIntroContent?
    /// Borne dure sur `BoundedAsyncResolution.resolve(_:timeout:)` — voir sa doc pour le pourquoi.
    private let introTimeout: Duration

    /// Tentative courante par story : incrémentée à chaque `save()` ET à
    /// chaque `cancel()` — c'est la SEULE source de vérité sur « quelle
    /// tentative est la bonne », jamais dérivée de `jobs`/`tasks`. Une
    /// tentative annulée continue de baker en tâche de fond (`AVAssetWriter`
    /// ignore `Task.isCancelled`) ; sans ce jeton intrinsèque, ses écritures
    /// post-suspension (progression, `jobs`/`tasks`) pourraient s'appliquer
    /// PENDANT ou APRÈS qu'une tentative relancée pour la même story soit en
    /// cours — voir `isCurrent(_:for:)`.
    private var generations: [String: Int] = [:]

    init(
        exporter: StoryVideoExportServiceProviding? = nil,
        photoSaver: PhotoLibrarySaving = PhotoLibraryManagerAdapter(),
        toasts: FeedbackToastSurfacing? = nil,
        preferredLanguages: (@MainActor () -> [String])? = nil,
        introTimeout: Duration = BoundedAsyncResolution.defaultTimeout,
        intro: (@MainActor @Sendable () async -> StoryExportIntroContent?)? = nil
    ) {
        // `StoryVideoExportService.shared` et `FeedbackToastManager.shared`
        // sont `@MainActor`-isolés : impossible en expression de valeur par
        // défaut, résolus ici.
        self.exporter = exporter ?? StoryVideoExportService.shared
        self.photoSaver = photoSaver
        self.toasts = toasts ?? FeedbackToastManager.shared
        self.preferredLanguages = preferredLanguages
            ?? { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
        self.introTimeout = introTimeout
        self.intro = intro ?? StoryExportIntroFactory.currentUser
    }

    // MARK: - Lecture

    /// Progression `0…1` de la sauvegarde en vol, `nil` si aucune.
    func progress(for storyId: String) -> Double? { jobs[storyId] }

    /// Vrai tant que taper l'anneau peut RÉELLEMENT annuler quelque chose.
    ///
    /// Faux dès que `PHPhotoLibrary.performChanges` a démarré : cette écriture
    /// n'est pas annulable. Auparavant l'anneau restait tappable pendant tout
    /// le palier à 90 %, et taper affichait « Export annulé » alors que la
    /// vidéo finissait quand même d'atterrir dans la photothèque — puis la
    /// garde `isCurrent` faisait retourner la méthode en silence, sans toast
    /// de succès. L'utilisateur croyait avoir annulé et se retrouvait avec un
    /// doublon invisible.
    ///
    /// Choix retenu : rendre l'annulation IMPOSSIBLE sur cette dernière étape
    /// plutôt que d'inventer un troisième message. On ne peut pas rendre vrai
    /// le mot « annulé » — l'écriture est irréversible — et un message honnête
    /// (« trop tard pour annuler ») décrirait un état sur lequel l'utilisateur
    /// n'a de toute façon aucune prise. Le contrat « taper l'anneau annule »
    /// reste tenu sur TOUT le bake, c'est-à-dire sur `0…bakeShare` (90 %) de
    /// l'anneau, là où passe l'essentiel du temps.
    func isCancellable(storyId: String) -> Bool {
        jobs[storyId] != nil && !uncancellableJobs.contains(storyId)
    }

    // MARK: - Actions

    /// Bake la story en MP4 puis l'écrit dans la photothèque, en publiant la
    /// progression sur `jobs[story.id]`. Idempotent : un second appel pendant
    /// qu'un job tourne pour la même story est ignoré (le menu reste
    /// atteignable via le long-press pendant l'export).
    func save(story: StoryItem) {
        guard jobs[story.id] == nil else { return }

        let available = StoryExportLanguageResolver.availableLanguages(story: story)
        let language = StoryExportLanguageResolver.defaultLanguage(
            available: available,
            preferred: preferredLanguages()
        )
        let languages: [String] = language.map { [$0] } ?? []
        let slide = story.toRenderableSlide(preferredLanguages: languages)
        let watermark = MeeshyExportWatermark.make(username: AuthManager.shared.currentUser?.username)
        let storyId = story.id
        // Nouvelle tentative pour cette story : voir la doc de `generations`.
        let generation = (generations[storyId] ?? 0) + 1
        generations[storyId] = generation

        jobs[storyId] = 0

        let task = Task { [weak self] in
            guard let self else { return }
            // Résolu DANS le Task (async), BORNÉ dans le temps : l'identité
            // (avatar / fond / mood) se charge depuis le cache, réseau si
            // absent — voir `BoundedAsyncResolution.resolve`. `intro` est la
            // closure injectée à l'init, pas le singleton — l'injection en
            // test reste honorée.
            let introContent = await BoundedAsyncResolution.resolve(self.intro, timeout: self.introTimeout)
            // Tentative déjà périmée AVANT même que le bake ne démarre.
            // Sur une installation fraîche, la résolution d'identité court
            // jusqu'à `introTimeout` (4 s) : l'anneau affiche 0 %, et
            // l'utilisateur qui le tape immédiatement obtenait bien
            // « Export annulé »… puis un bake complet de 10 à 60 s partait
            // quand même, chauffait l'appareil, et son MP4 finissait jeté par
            // la garde `isCurrent` d'après-bake. Les trois chemins d'export
            // coupent désormais au même endroit (cf.
            // `StoryExportShareViewModel.startExport` et
            // `TimelineExportController.start`).
            //
            // Garde ancrée sur le JETON DE GÉNÉRATION, pas sur
            // `Task.isCancelled` : c'est le mécanisme d'annulation RÉEL de ce
            // chemin — `cancel(storyId:)` avance `generations[storyId]`, et
            // c'est cette valeur que consultent déjà tous les autres points de
            // contrôle de cette méthode. Elle est aussi strictement plus
            // forte : elle est fausse dès que la tentative est périmée pour
            // N'IMPORTE QUELLE raison (annulée OU remplacée par un `save()`
            // relancé), là où `Task.isCancelled` ne couvre que l'annulation
            // explicite. Rien à nettoyer ici : aucun MP4 n'existe encore, et
            // `cancel()` a déjà posé son toast.
            guard self.isCurrent(generation, for: storyId) else { return }
            let url = await self.exporter.prepareExport(
                slide: slide,
                languages: languages,
                watermark: watermark,
                intro: introContent,
                onProgress: { [weak self] fraction in
                    guard let self, self.isCurrent(generation, for: storyId) else { return }
                    self.jobs[storyId] = StorySaveProgressMapper.bake(fraction)
                },
                onPhaseChange: nil
            )

            // Tentative périmée : annulée (`cancel(storyId:)` a déjà avancé
            // la génération et posé son toast) OU remplacée par un `save()`
            // relancé pour la même story pendant que CE bake tournait encore
            // (`AVAssetWriter` n'observe pas `Task.isCancelled`, le MP4 peut
            // arriver bien après). Dans les deux cas on nettoie le MP4 sans
            // toucher à `jobs`/`tasks` — qui appartiennent à la tentative
            // courante — et sans second toast. Aucune suspension entre cette
            // vérification et le `guard let url else` suivant : la valeur
            // reste valide pour ce dernier sans nouvelle vérification.
            guard self.isCurrent(generation, for: storyId) else {
                if let url { self.exporter.cleanupExport(at: url) }
                return
            }

            guard let url else {
                self.finish(storyId: storyId)
                self.toasts.showError(String(
                    localized: "story.mine.save.failed",
                    defaultValue: "L'export de la story a échoué. Réessayez."
                ))
                return
            }

            self.jobs[storyId] = StorySaveProgressMapper.bakeShare
            // Point de non-retour : `PHPhotoLibrary.performChanges` n'est pas
            // annulable — voir `isCancellable(storyId:)`. Posé AVANT le
            // `await`, sinon la fenêtre qu'on ferme resterait ouverte.
            self.uncancellableJobs.insert(storyId)

            do {
                try await self.photoSaver.saveVideo(at: url)
                // Nouvelle suspension au-dessus (`await saveVideo`) : la
                // tentative a pu être annulée-puis-relancée PENDANT
                // l'écriture Photos (la fenêtre que le round précédent de
                // cette correction laissait passer). Le fichier temporaire
                // est nettoyé dans tous les cas ; `jobs`/`tasks` et le toast
                // n'appartiennent qu'à la tentative encore courante.
                self.exporter.cleanupExport(at: url)
                guard self.isCurrent(generation, for: storyId) else { return }
                self.jobs[storyId] = 1
                self.finish(storyId: storyId)
                HapticFeedback.medium()
                self.toasts.showSuccess(String(
                    localized: "story.mine.save.success",
                    defaultValue: "Vidéo enregistrée dans Photos"
                ))
            } catch {
                Logger.stories.error(
                    "story save to photos failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                self.exporter.cleanupExport(at: url)
                guard self.isCurrent(generation, for: storyId) else { return }
                self.finish(storyId: storyId)
                self.toasts.showError(String(
                    localized: "story.mine.save.photosDenied",
                    defaultValue: "Impossible d'enregistrer dans Photos. Vérifie l'autorisation Photos de Meeshy dans Réglages."
                ))
            }
        }
        tasks[storyId] = task
    }

    /// Annule la sauvegarde en vol : la ligne retrouve son `⋯` immédiatement.
    /// Le MP4 déjà baké (s'il arrive après coup) est nettoyé par le `Task`.
    ///
    /// Sans effet une fois l'écriture photothèque commencée — voir
    /// `isCancellable(storyId:)`. Les deux surfaces désactivent alors leur
    /// anneau, donc ce chemin n'est atteignable que par une course (tap
    /// exactement au moment du basculement) : il retourne en silence plutôt
    /// que d'afficher « Export annulé » sur une écriture qui aboutira.
    func cancel(storyId: String) {
        guard isCancellable(storyId: storyId) else { return }
        tasks[storyId]?.cancel()
        // Avance la génération AVANT `finish` : c'est ce qui invalide
        // intrinsèquement et DÉFINITIVEMENT la tentative annulée — que
        // l'utilisateur relance ou non ensuite. `jobs[storyId]` seul ne
        // suffit pas comme marqueur (voir `isCurrent`) : n'importe quelle
        // tentative peut le repeupler via un `save()` relancé.
        generations[storyId] = (generations[storyId] ?? 0) + 1
        finish(storyId: storyId)
        toasts.showSuccess(String(
            localized: "story.mine.save.cancelled",
            defaultValue: "Export annulé"
        ))
    }

    // MARK: - Privé

    private func finish(storyId: String) {
        jobs[storyId] = nil
        tasks[storyId] = nil
        uncancellableJobs.remove(storyId)
    }

    /// Vrai si `generation` est toujours la tentative courante pour `storyId`.
    ///
    /// Comparaison **intrinsèque**, contre `generations[storyId]` UNIQUEMENT
    /// — jamais contre `jobs[storyId] != nil`. `jobs`/`tasks` sont un état
    /// PARTAGÉ que `finish(storyId:)` efface sans discernement ; une
    /// tentative périmée qui s'en servirait comme marqueur d'identité
    /// pourrait voir une tentative B, fraîchement relancée, repeupler
    /// `jobs[storyId]` et se faire passer — à tort — pour périmée dès que A
    /// appelle `finish` après elle (régression du round précédent : A
    /// ressort de `saveVideo` après le relancement de B, écrit
    /// `jobs[storyId] = 1` puis `finish()`, qui efface la RÉFÉRENCE DE B —
    /// B se croit alors périmé et jette son propre MP4 sans jamais écrire
    /// dans Photos, en silence).
    ///
    /// `generations[storyId]` n'est JAMAIS réinitialisé, seulement avancé —
    /// par `save()` (nouvelle tentative) ET par `cancel()` (invalide
    /// intrinsèquement et définitivement la tentative annulée, que
    /// l'utilisateur relance ou non ensuite). Le token qu'une tentative
    /// capture à son lancement ne peut donc plus jamais redevenir courant
    /// une fois dépassé, indépendamment de ce que d'autres tentatives font
    /// de `jobs`/`tasks` entre-temps.
    private func isCurrent(_ generation: Int, for storyId: String) -> Bool {
        generations[storyId] == generation
    }
}
