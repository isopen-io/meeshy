# Anneau de sauvegarde sur la ligne de story + menu de visibilité

Date : 2026-07-26
Surface : iOS — `MyStoriesView` (sheet « Mes stories », présentée depuis le tray « Moi »)

## Contexte

Deux demandes utilisateur sur la liste « Mes stories » :

1. Le glyphe `⋯` de chaque ligne doit se transformer en anneau de progression avec
   pourcentage pendant l'export/sauvegarde de la story dans la photothèque, et
   redevenir `⋯` une fois la vidéo écrite dans Photos.
2. L'entrée de menu « Éditer les vues » doit s'appeler « Listing des vues », et le
   menu doit gagner un sous-menu « Modifier la visibilité » proposant Privée,
   Public, Sauf, Uniquement, Communauté, Amis.

## État existant

| Élément | Emplacement | Constat |
| --- | --- | --- |
| Ligne + menu `⋯` | `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift:484` | `Menu` avec `Image(systemName: "ellipsis")`, `.accessibilityHidden(true)` |
| Ligne (a11y) | même fichier, `MyStoryRow.body` | `.accessibilityElement(children: .ignore)` + libellé composé |
| Sauvegarde Photos | `StoryExportShareSheet` mode `.saveToPhotos` + `StoryExportShareViewModel` | progression exposée en `@Published progress`, mais le VM est un `@StateObject` de `MyStoriesView` |
| Bake MP4 | `StoryVideoExportService.shared` (`@MainActor` singleton) | `beginBackgroundTask` déjà géré en interne par `StoryExporter` |
| « Éditer les vues » | clé `story.mine.viewers` | ouvre `StoryViewersSheet`, qui **est déjà** un listing de vues — seul le libellé ment |
| Modes de visibilité | `PostVisibility` (MeeshyUI) | contient déjà PUBLIC / COMMUNITY / FRIENDS / EXCEPT / ONLY / PRIVATE avec icônes et libellés localisés |
| Picker Sauf/Uniquement | `AudienceUserPickerView` (MeeshyUI) | réutilisable, prend `mode` + `initialSelection` |
| Route serveur | `PUT /posts/:postId` (`services/gateway/src/routes/posts/core.ts:223`) | `UpdatePostSchema` accepte déjà `visibility` **et** `visibilityUserIds` |

## Décisions d'arbitrage (validées avec l'utilisateur)

| Question | Décision |
| --- | --- |
| Sort de la sheet « Enregistrer » | **Supprimée** — le menu lance directement l'export, la langue gravée est résolue automatiquement |
| Portée de l'anneau | **Sauvegarde uniquement** — « Partager » garde sa sheet et sa barre linéaire, inchangées |
| Tap sur l'anneau | **Annule l'export** en cours, retour immédiat au `⋯` + toast |
| Picker Sauf/Uniquement | **Pré-rempli** avec la sélection courante (nécessite de décoder `visibilityUserIds` côté iOS) |
| Surfaces du sous-menu visibilité | **« Mes stories » seulement** — le viewer plein écran reste inchangé |

---

## Partie 1 — Anneau de progression sur la ligne

### Pourquoi un service et pas le ViewModel existant

`StoryExportShareViewModel` est un `@StateObject` de `MyStoriesView`, elle-même une
sheet. Fermer la sheet détruit le VM : le `Task` du bake garde `[weak self]`, donc le
résultat tardif est silencieusement jeté. Un anneau censé continuer pendant que
l'utilisateur navigue ailleurs ne peut pas s'appuyer sur un état à durée de vie de vue.

### `StoryPhotoSaveService`

Nouveau fichier : `apps/ios/Meeshy/Features/Main/Services/StoryPhotoSaveService.swift`.
Singleton `@MainActor`, `ObservableObject` — même patron que `StoryPublishService.shared`.

```swift
@MainActor
final class StoryPhotoSaveService: ObservableObject {
    static let shared = StoryPhotoSaveService()

    /// storyId → progression 0…1. Absence de clé = aucun job en vol.
    @Published private(set) var jobs: [String: Double] = [:]

    func progress(for storyId: String) -> Double?
    func save(story: StoryItem)
    func cancel(storyId: String)
}
```

Séquence de `save(story:)` :

| Étape | Effet sur `jobs[id]` |
| --- | --- |
| Garde anti-double-lancement (`jobs[id] == nil`), sinon retour immédiat | — |
| Résolution de la langue gravée | `0` |
| `StoryVideoExportService.shared.prepareExport(…, onProgress:)` | `0 → 0.90` (fraction × 0,9) |
| URL obtenue → `PhotoLibraryManager.shared.saveVideo(at:)` | `0.90 → 1.00` |
| `cleanupExport(at:)`, retrait du job, toast succès/échec, `HapticFeedback.medium()` | clé supprimée |

`cancel(storyId:)` annule le `Task`, nettoie le MP4 temporaire s'il existe déjà, retire
le job et pose un toast « Export annulé ».

Aucun `beginBackgroundTask` supplémentaire : `StoryExporter` en pose déjà un autour du
bake, et l'écriture Photos qui suit est courte.

### Résolution de la langue gravée

Le choix de langue disparaît avec la sheet. La règle appliquée est celle de
`StoryExportShareViewModel.prepare(story:)` : première langue de
`currentUser.preferredContentLanguages` **si** elle figure dans `story.translations`,
sinon `nil` (texte original).

Cette règle est extraite en fonction pure et testable :

```swift
enum StoryExportLanguageResolver {
    static func resolve(story: StoryItem, preferred: [String]) -> String?
}
```

`StoryExportShareViewModel.prepare` est réécrit pour l'appeler — une seule
implémentation partagée par les deux chemins (partage et sauvegarde).

### Rendu dans `MyStoryRow`

`MyStoryRow` observe `StoryPhotoSaveService.shared`. Le service est injecté via
paramètre (avec `.shared` en valeur par défaut) pour que la vue reste testable.

- `progress(for: story.id) == nil` → `Menu { menuContent() }` avec `Image(systemName: "ellipsis")` — comportement actuel, inchangé.
- Sinon → `Button` circulaire :
  - `Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 2.5)` en piste de fond ;
  - `Circle().trim(from: 0, to: progress).stroke(accentColor, lineWidth: 2.5).rotationEffect(.degrees(-90))` ;
  - `Text("\(Int(progress * 100))")` au centre, `MeeshyFont.relative(9, weight: .semibold)` avec `.minimumScaleFactor(0.6)` et `.lineLimit(1)` ;
  - cadre 28 × 28 pt, même `.padding(8)` que le glyphe actuel pour préserver la zone tappable ;
  - action : `HapticFeedback` + `StoryPhotoSaveService.shared.cancel(storyId:)`.

La transition entre les deux états passe par `adaptiveOnChange` / une animation implicite
sur la valeur de progression uniquement (jamais sur l'apparition/disparition du glyphe,
pour éviter un flash de layout dans la `List`).

### Accessibilité

La ligne est `.accessibilityElement(children: .ignore)` : un bouton enfant serait avalé
par le rotor. L'information passe donc par la ligne elle-même :

- `rowAccessibilityLabel` gagne un suffixe conditionnel « Enregistrement 43 % » quand un job est en vol ;
- une `.accessibilityAction(named: "Annuler l'enregistrement")` porte l'annulation, ajoutée uniquement pendant le job ;
- le glyphe `ellipsis` / l'anneau restent masqués du rotor comme aujourd'hui.

Nouvelles clés de catalogue : `story.mine.save.progress.a11y`, `story.mine.save.cancel.a11y`.

### Câblage du menu

`Button { saveStory = story }` devient `Button { StoryPhotoSaveService.shared.save(story: story) }`.

Conséquence : l'état `@State private var saveStory` et le `.sheet(item: $saveStory)`
n'ont plus d'appelant. Le mode `.saveToPhotos` de `StoryExportShareSheet` (enum `Mode`,
branche `adaptiveOnChange` de sauvegarde Photos, branches conditionnelles de titre /
sous-titre / CTA) est **supprimé** plutôt que laissé en code mort. `StoryExportShareSheet`
redevient une sheet de partage pure.

Le test `MyStoriesBulkDeleteGuardTests.test_resolveActivityURL_saveToPhotos_neverPresentsShareSheet`
disparaît avec le mode ; l'invariant qu'il protégeait (« la sauvegarde Photos ne présente
jamais la share sheet système ») est désormais structurel — le chemin de sauvegarde ne
touche plus `UIActivityViewController`. Il est remplacé par les tests du nouveau service.

### Tests

| Test | Nature |
| --- | --- |
| `StoryExportLanguageResolver` : préférée présente dans `translations` → retournée ; absente → `nil` ; `translations` vide → `nil` | pur |
| `StoryPhotoSaveService` : `save` pose un job à 0 puis publie une progression croissante (exporteur simulé) | service + faux exporteur |
| `StoryPhotoSaveService` : progression du bake mappée sur 0…0,9, jamais au-delà avant l'écriture Photos | service |
| `StoryPhotoSaveService` : succès Photos → job retiré + toast succès | service |
| `StoryPhotoSaveService` : échec Photos → job retiré + toast erreur, MP4 temporaire nettoyé | service |
| `StoryPhotoSaveService` : `save` sur un id déjà en vol → aucun second `Task` | service |
| `StoryPhotoSaveService` : `cancel` retire le job et nettoie le fichier | service |
| Libellé a11y de la ligne : suffixe présent pendant le job, absent sinon | pur (fonction de composition extraite) |

Les compteurs d'appels de l'exporteur simulé sont mesurés **en delta**, jamais en absolu
(l'app hôte tourne pendant la suite).

---

## Partie 2 — « Listing des vues » + sous-menu de visibilité

### Renommage

Clé `story.mine.viewers`, valeur mise à jour dans les 7 langues du catalogue
(`apps/ios/Meeshy/Localizable.xcstrings`) et dans le `defaultValue` en code :

| Langue | Valeur |
| --- | --- |
| fr | Listing des vues |
| en | Views list |
| es | Lista de vistas |
| de | Aufrufliste |
| it | Elenco delle visualizzazioni |
| pt-BR | Lista de visualizações |
| ar | قائمة المشاهدات |

Aucun changement de comportement : la clé ouvrait déjà `StoryViewersSheet`.

### Sous-menu

Inséré dans `actionMenu(for:)` juste après l'entrée « Listing des vues » :

```
🔒 Modifier la visibilité  ›
     ✓ Public          globe
       Communautés     person.3.fill
       Contacts        person.2.fill
       Sauf…           person.fill.xmark
       Seulement…      person.fill.checkmark
       Privé           lock.fill
```

Les entrées viennent de `PostVisibility.composerSelectableCases`. Le mode courant
(`story.visibility`) porte `systemImage: "checkmark"` à la place de son icône — choix
délibérément conservateur : les cases à cocher natives d'un `Picker` inline dans un `Menu`
sont sensibles au quirk iOS 26 où un `.tint(.clear)` fait disparaître toutes les icônes.

Nouvelle clé : `story.mine.visibility` (« Modifier la visibilité »). Les six libellés
d'options viennent de `PostVisibility.label`, déjà localisés dans le SDK.

**Choix de vocabulaire assumé** : la demande dit « Communauté » et « Amis » ; le SDK dit
« Communautés » et « Contacts », et ces libellés sont **déjà affichés dans le composer de
story et de statut**. On réutilise les libellés du SDK tels quels plutôt que d'en forger
des variantes : deux mots différents pour le même mode de visibilité selon l'écran serait
une régression de cohérence. Si le vocabulaire doit changer, c'est un renommage global de
`PostVisibility.label` (composers inclus), pas une exception locale à ce menu.

### Application du choix

- `!visibility.requiresUserSelection` (Public, Communautés, Contacts, Privé) → appel direct.
- `visibility.requiresUserSelection` (Sauf, Uniquement) → présentation de
  `AudienceUserPickerView(mode:initialSelection:)`, pré-cochée avec
  `story.visibilityUserIds ?? []`, puis appel avec les ids validés.

L'état de présentation est un unique `@State private var audienceTarget: (story: StoryItem, mode: PostVisibility)?`
enveloppé dans un type `Identifiable` (pas deux `@State` désynchronisables).

Appel serveur :

```swift
try await PostService.shared.update(
    postId: story.id,
    visibility: mode.rawValue,
    visibilityUserIds: ids
)
```

Mise à jour optimiste dans `StoryViewModel`, rollback sur échec, toast dans les deux cas.

### Plomberie SDK

Le gateway sait déjà tout faire (`UpdatePostSchema` accepte les deux champs, et
`getPostById` utilise `include: postInclude` — donc `visibilityUserIds` sort déjà dans le
payload). Ce qui manque est côté iOS :

| Fichier | Changement |
| --- | --- |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` | `PostServiceProtocol.update(...)` et son implémentation gagnent `visibilityUserIds: [String]? = nil` et le transmettent à `UpdatePostRequest`. Le champ **existe déjà** dans `UpdatePostRequest` (`ServiceModels.swift:133`) mais `update` ne le renseigne jamais — il part toujours à `nil`, ce qui fait rejeter EXCEPT/ONLY par le `refine` Zod du gateway |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift` | `APIPost.visibilityUserIds: [String]?` décodé (`decodeIfPresent`, ajouté aux `CodingKeys`) |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | `StoryItem.visibility` passe de `let` à `var` ; ajout de `visibilityUserIds: [String]?` (optionnel → migration GRDB douce, les rows antérieurs décodent en `nil`) ; propagation dans `toStoryGroups` et dans le `copy`/rebuild existant |
| `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` | `applyVisibility(storyId:visibility:userIds:) async -> Bool` — écrit en mémoire, appelle le SDK, restaure l'ancienne valeur si l'appel échoue |

Ajouter `visibilityUserIds` en optionnel partout garantit que les payloads et les rows
GRDB antérieurs continuent de décoder sans migration.

### Tests

| Test | Nature |
| --- | --- |
| Le sous-menu propose exactement les 6 cas de `composerSelectableCases`, dans l'ordre | pur |
| Le mode courant est le seul à porter `checkmark` ; `nil`/valeur inconnue → aucun checkmark | pur (résolveur extrait) |
| `requiresUserSelection` → présente le picker et n'appelle pas le SDK avant validation | ViewModel + faux `PostService` |
| `!requiresUserSelection` → appelle le SDK immédiatement avec `visibilityUserIds == nil` | ViewModel + faux `PostService` |
| `applyVisibility` succès → `StoryItem.visibility` reflète le nouveau mode | ViewModel |
| `applyVisibility` échec → l'ancienne valeur est restaurée, toast d'erreur | ViewModel |
| `APIPost` décode `visibilityUserIds` ; son absence donne `nil` (rétro-compatibilité) | décodage |
| `StoryItem` persisté sans le champ se relit en `nil` | décodage GRDB |
| Le picker s'ouvre avec `initialSelection == story.visibilityUserIds` | pur |

---

## Hors périmètre

- Le viewer plein écran (`StoryViewerView`) : ni anneau, ni sous-menu de visibilité.
- Le chemin « Partager » : sheet, barre linéaire et sélecteur de langue inchangés.
- `ActiveUploadRow` : garde son propre indicateur de publication.
- Aucun changement gateway ni schéma Prisma — tout est déjà en place côté serveur.
