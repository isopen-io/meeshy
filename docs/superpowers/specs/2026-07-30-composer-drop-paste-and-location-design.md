# Glisser-déposer, collage de fichiers, et le lieu qui n'arrive jamais

> Spec du 2026-07-30. Point de départ utilisateur : « Met à jour l'iPad et macOS
> pour qu'on puisse déplacer les fichiers dans la zone de saisie pour envoyer des
> images, audio, texte et autre document aisément ! Et que la sélection de
> location soit fonctionnelle. » Précisé en cours de cadrage : le dépôt doit vivre
> **dans `UniversalComposerBar`** (donc sur ses quatre surfaces d'un coup), et un
> **fichier collé doit produire une vraie pièce jointe**, pas du texte.

## Plateformes visées

Il n'existe pas de cible macOS : `apps/ios/project.yml` déclare
`TARGETED_DEVICE_FAMILY: "1,2"` (iPhone + iPad) et aucun `SUPPORTS_MACCATALYST`.
« macOS » désigne donc l'app iOS exécutée sur Mac en **« Designed for iPad »**
(`ProcessInfo.processInfo.isiOSAppOnMac == true`). Ce slice ne se lance pas depuis
la ligne de commande : la vérification manuelle se fait depuis Xcode (⌘R sur
« My Mac (Designed for iPad) »).

Aucune garde de plateforme n'est posée sur le dépôt : le glisser-déposer est une
capacité système simplement inatteignable sur iPhone (pas de Files en Split View).
Un `if isPad || isiOSAppOnMac` ajouterait une branche que les tests ne peuvent pas
exercer, et le dépôt a déjà montré que ce qu'une racine câble, l'autre l'oublie.
Le **collage**, lui, sert sur iPhone aussi.

## Constats, prouvés à la lecture du code

### Le composer n'a aucune ingestion par dépôt ni par collage de fichier

Le seul `onDrop` de l'app est `SectionDropDelegate`
(`ConversationListView.swift:27`, `:411`), qui déplace une conversation entre
sections via un `NSItemProvider` de `.text`. Aucun composer n'accepte de dépôt.

Le collage existe mais ne fait qu'une chose : `handleClipboardCheck`
(`UniversalComposerBar+Attachments.swift:388`) détecte un collage de plus de
2000 caractères et le transforme en tuile `ClipboardContent`. Une URL `file://`
collée reste du texte.

### Le lieu sélectionné n'est jamais envoyé depuis une conversation

`LocationPickerView` fonctionne et remplit `composerState.pendingPlace`
(`ConversationView+AttachmentHandlers.swift:593`), la tuile s'affiche
(`ConversationView+Composer.swift:1029`). Ensuite, plus rien :

- `SendMessageRequest` (`packages/MeeshySDK/…/Models/MessageModels.swift:547`)
  n'a **aucun** champ `location` ;
- `ConversationViewModel.sendMessage` (`:2252`) n'a pas de paramètre `location:` ;
- `OfflineQueueItem` (`packages/MeeshySDK/…/Persistence/OfflineQueue.swift:8`)
  non plus ;
- `sendViaSocketFallback` (`MessageSocketManager.swift:2090`) non plus ;
- le garde d'envoi du composer (`ConversationView+AttachmentHandlers.swift:75`)
  exige texte **ou** pièce jointe : un message « lieu seul » est bloqué net,
  et le garde du ViewModel (`:2255`) le rebloque ensuite.

Un message emprunte **trois** transports — socket-first `message:send`, POST REST,
outbox durable — et aucun des trois ne porte le lieu.

Le serveur, lui, l'accepte déjà partout : `routes/conversations/messages.ts:133`
(schéma de corps) et `:1797` (passage à `MessageProcessor.saveMessage`), et
`socketio/handlers/MessageHandler.ts:168` + `:289` pour le canal socket. La base a
sa colonne (`MessageDatabaseMigrations.swift:283`).

`OutboxDispatcher` transporte `location` pour les posts et les commentaires
(`:496-593`), pas pour les messages.

### Le lieu reçu ne s'affiche pas dans une bulle de conversation

La bulle n'affiche un lieu que depuis `message.attachments` où `type == .location`
(`BubbleAttachmentView.swift:110`, `BubbleContentBuilder.swift:165`,
`BubbleStandardLayout.swift:398`). Or `MessageAttachment` n'a aucun champ
géographique en Prisma et exige six champs de fichier — le serveur ne peut plus
jamais produire une telle pièce jointe.

Le lieu arrive pourtant bien et se persiste : `APIMessage` le décode
(`MessageModels.swift:497`), `MeeshyMessage.location` existe
(`CoreModels.swift:676`), `MessageRecord+ToMessage.swift:61` le restitue depuis
`locationJson`. `LocationMessageView(place:)` existe et est couverte par snapshot
(`MeeshyUITests/Location/LocationMessageViewSnapshotTests.swift`). **Rien ne relie
les deux.** La vue n'a pas de source, la donnée n'a pas de lecteur.

Corollaire connu et non traité : un message qui ne porte qu'un lieu a un `content`
vide, donc un aperçu de conversation vide. `media.summary.location` (« 📍 Position »)
existe à `ConversationViewModel.swift:2246` mais n'est atteint que par le type de
pièce jointe.

### Le picker de lieu, sur iPad et Mac (traité en dernier — voir Séquencement)

Six points de présentation, trois dimensionnements :
`FeedView.swift:1494` + `:1503` impose `.presentationDetents([.medium, .large])`
— le picker s'ouvre à mi-hauteur, carte écrasée ; `ConversationView+Composer.swift:223`,
`FeedView+Attachments.swift:947`, `PostDetailView.swift:2073`,
`FeedCommentsSheet.swift:1143`, `StoryViewerView+Canvas.swift:843` n'imposent
rien. Sur iPad les six tombent en form sheet étroite, alors que le dépôt possède
déjà le correctif : `adaptiveWideSheet()`
(`MeeshyUI/Compatibility/AdaptiveSheetSizing.swift`, `presentationSizing(.page)`
sur iOS 18+ et iPad seulement), utilisé par deux vues seulement.

Autres défauts lisibles :

- la recherche n'existe que sur `.onSubmit` (`LocationPickerView.swift:128`) —
  rien pendant la frappe, et sans clavier logiciel il n'y a pas de touche
  « Rechercher » ;
- l'épingle est en retard sur la carte : `annotationCoordinate = selectedCoordinate`
  ne bouge qu'à `.onMapCameraChange(frequency: .onEnd)`
  (`MeeshyUI/Compatibility/AdaptiveMap.swift:132`), donc pendant tout le
  déplacement l'épingle reste sur l'ancien point puis saute — au trackpad, avec
  des déplacements longs et continus, c'est franchement cassé ;
- « Ouvrir les Réglages » est un bouton mort sur Mac :
  `MediaPermissionCoordinator.openSettings()` ouvre
  `UIApplication.openSettingsURLString`, qui ne mène nulle part sous macOS ;
- doublon de contrôle : `MapUserLocationButton()` dans `.mapControls` et le bouton
  « Ma position » de la carte du bas font la même chose.

L'utilisateur constate un mauvais comportement qui n'est pas nécessairement dans
cette liste. La première étape de ce lot sera donc une **reproduction
instrumentée**, pas un correctif.

## Séquencement

Décidé avec l'utilisateur en cours de cadrage : **le picker passe en dernier.**

1. **Lot 1** — ingestion par dépôt et par collage dans `UniversalComposerBar`.
2. **Lot 2** — la chaîne d'écriture du lieu (les trois transports).
3. **Lot 3** — le rendu du lieu reçu (bulle + aperçu de conversation).
4. **Lot 4** — le picker sur iPad et Mac. Reproduction d'abord, correctifs ensuite.

Les lots 2 et 3 sont séparés parce qu'ils sont vérifiables indépendamment : le 2
se prouve sur le fil réseau, le 3 se prouve par snapshot sur une donnée fabriquée.
Le 3 ne dépend pas du 2 — un lieu envoyé depuis le web se rend déjà mal
aujourd'hui.

## Lot 1 — Ingestion par dépôt et par collage

### Frontière et responsabilités

La barre possède : la cible de dépôt, l'affordance visuelle, la résolution
`NSItemProvider → fichier dans notre conteneur`, et la détection du collage
`file://`. Elle ne possède **ni** la compression, **ni** la création de pièce
jointe, **ni** l'envoi. C'est la même règle que le reste de la barre : elle émet
des intentions, l'hôte orchestre.

Un seul rappel nouveau, calqué sur `onClipboardContent` / `onRecentMediaSelected` :

```swift
/// Émis quand l'utilisateur dépose ou colle du contenu dans la bande du
/// composer. Chaque `.file` pointe un fichier DÉJÀ copié dans notre conteneur :
/// l'hôte en devient propriétaire (il le déplace ou le supprime).
var onIngest: (([ComposerIngest]) -> Void)? = nil
```

```swift
enum ComposerIngest: Equatable, Sendable {
    case file(url: URL, name: String, mime: String)
    case text(String)
}
```

La résolution vit dans la barre et non chez les quatre hôtes parce que
`loadFileRepresentation` livre une URL temporaire qui doit être copiée **avant**
le retour de la closure. C'est le genre de subtilité qui divergerait à la
quatrième copie.

### Nouveaux fichiers

- `apps/ios/Meeshy/Features/Main/Components/UniversalComposerBar+Drop.swift` —
  le modificateur de dépôt, l'affordance, le branchement du collage.
  Fichier séparé : le fichier principal fait déjà 1468 lignes.
- `apps/ios/Meeshy/Features/Main/Components/ComposerDropResolver.swift` — la
  résolution des providers et les deux unités pures.

### Cible de dépôt et affordance

Un seul `.onDrop(of:isTargeted:perform:)` sur le conteneur externe de la barre,
donc toute la bande : champ de saisie, barre d'outils, bandeaux (édition /
réponse), tiroir d'attachements. `isTargeted` allume un contour teinté de
`accentColor` et un indice « Déposer ici ».

Pas de cible plein écran : la demande porte sur la zone de saisie, et une cible
plein écran entrerait en conflit avec les gestes de la liste de messages
(appui long + glissement).

Types déclarés, dans cet ordre :
`[.image, .movie, .audio, .pdf, .text, .url, .fileURL, .item]`. `.item` en
dernier pour que l'inconnu atterrisse quand même comme fichier.

`.onDrop` + `NSItemProvider` plutôt que `.dropDestination(for:)` : ce dernier
exige un `Transferable` concret, incapable d'exprimer « n'importe quel fichier ».

### Algorithme de résolution d'un provider

Par provider, dans l'ordre, premier succès gagnant :

1. **Représentation fichier** — pour le premier identifiant de type enregistré
   qui conforme à un type de fichier : `loadFileRepresentation(forTypeIdentifier:)`,
   puis copie **synchrone, dans la closure** vers
   `temporaryDirectory/drop_<uuid>_<nom>`. C'est la voie qui préserve les octets
   d'origine et le nom.
2. **Représentation données** — `loadDataRepresentation` pour une image sans
   fichier (capture, contenu d'une page web) : écriture en temporaire avec
   l'extension dérivée du type.
3. **Texte ou URL** — `loadObject(ofClass: NSString/NSURL)` → `.text`. Une URL web
   devient du texte inséré dans le champ.

Nom : `provider.suggestedName`, à défaut dérivé du type. MIME :
`MimeTypeResolver.mimeType(forURL:)` — la source unique de vérité déjà utilisée
par `mimeTypeForURL` (`ConversationView+AttachmentHandlers.swift:570`).

`startAccessingSecurityScopedResource` n'est **pas** requis pour un fichier livré
par un provider : le système accorde l'accès le temps du chargement, et la copie
se fait dans cette fenêtre.

N providers se résolvent en parallèle ; `onIngest` est appelé **une fois** avec
tous les éléments résolus, dans l'ordre du dépôt. Les échecs produisent un toast
nommant les fichiers concernés — jamais de tuile fantôme.

### Concurrence

L'app compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. Les complétions
de `NSItemProvider` arrivent hors du main. La résolution vit donc dans un
`nonisolated enum` à fonctions `static async` — **pas** une classe : aucune
instance, donc aucune `deinit` isolée implicite (SE-0466), donc aucun risque du
double-free rétro-déployé sur iOS < 26. L'appel de `onIngest` repasse
explicitement par le main.

### Collage d'une URL `file://`

Greffé sur `handleClipboardCheck(_ newText:)`, qui est déjà appelé à chaque
changement de texte.

`FileURLPasteDetector.detect(in:) -> (cleaned: String, urls: [URL])`, pure et
sans UIKit : extrait les occurrences `file://…`, décode le pourcentage, rend le
texte nettoyé. Déclenchée uniquement quand l'insertion qui vient de se produire
contient `file://` — un utilisateur qui tape « file:// » caractère par caractère
n'a jamais une insertion assez grande.

La règle des 2000 caractères de `ClipboardContent` **reste inchangée**, y compris
son expression de delta actuelle (`:390`), qui compte le double de la croissance
réelle. Corriger cette expression déplacerait le seuil de déclenchement de la
tuile presse-papier : hors périmètre, et ce serait un changement de comportement
déguisé en nettoyage. La détection `file://` calcule son propre delta honnête.

Résolution d'un chemin collé, dans l'ordre :

1. l'URL est lisible telle quelle — notre conteneur, App Group, ou fichier fourni
   par Files avec une extension sandbox encore active → pièce jointe ;
2. sinon, `UIPasteboard.general.itemProviders` est consulté et le provider
   correspondant est résolu par l'algorithme ci-dessus. C'est la **seule** voie
   qui porte l'autorisation sandbox, au prix de la bannière système « Coller ? »,
   une fois, et seulement sur cette branche ;
3. sinon **aucune pièce jointe** : un toast d'erreur nommant le fichier.

Jamais de `startAccessingSecurityScopedResource` sur une URL fabriquée depuis une
chaîne sans signet : elle renvoie `false` et il ne faut surtout pas continuer
comme si elle avait réussi. Un repli fabriqué rend une lecture morte invisible —
c'est exactement ce qui a fait survivre la panne de l'extension de partage à
trois audits, et c'est déjà la doctrine écrite dans `handleFileImport`
(`:534-548`).

### Câblage des quatre hôtes

Chaque hôte implémente `onIngest` en routant vers le pipeline qu'il utilise
**déjà**. La décision est portée par une énumération pure vivant à côté du
résolveur (`ComposerDropResolver.swift`), donc partagée par les quatre hôtes au
lieu d'être recopiée :

```swift
enum ComposerIngestPipeline: Equatable { case image, video, audio, file }
enum ComposerIngestRouter {
    static func route(mime: String) -> ComposerIngestPipeline
}
```

| Entrée | Destination |
|---|---|
| `image/*` | `AttachmentPreparationService.prepareImage` → tuile éditable + compression |
| `video/*` | `AttachmentPreparationService.prepareVideo` |
| `audio/*` | chemin fichier → tuile audio |
| autre, MIME vide, `application/octet-stream` | chemin fichier (même code que `handleFileImport`) |
| `.text` | inséré dans le champ de saisie |

Un `.text` est inséré **à la position du curseur**, ou à la fin si le champ n'a
pas le focus. Plusieurs `.text` dans un même dépôt sont concaténés par un saut de
ligne, dans l'ordre du dépôt, en une seule insertion — pas N insertions
successives, qui feraient N fois le tour de l'analyseur de langue et de la
détection de collage.

Réutiliser exactement ces fonctions est délibéré : toute nouvelle voie
d'ingestion contournerait l'amorçage du cache de vignettes, la bulle optimiste et
le magasin de brouillons durable — trois choses qui ne se voient pas casser.

Les quatre hôtes : `ConversationView` (messages), `FeedView` (post),
`PostDetailView` + `FeedCommentsSheet` (commentaires),
`StoryViewerView+Canvas` (réponse à une story).

### Cas d'erreur et limites

- Un **dossier** déposé est refusé avec un toast (vérification `isDirectory` via
  `resourceValues`), pas ingéré comme fichier vide.
- Un fichier de **0 octet** est refusé.
- Aucun plafond de taille n'est introduit : `handleFileImport` n'en a aucun
  aujourd'hui, et le chemin de dépôt hérite du même pipeline d'upload. En poser
  un serait un changement de politique produit — hors périmètre, consigné comme
  limite assumée.

### Tests du lot 1

Trois unités pures, sans simulateur :

- `ComposerIngestRouterTests` — table MIME → pipeline, y compris MIME vide et
  `application/octet-stream`.
- `FileURLPasteDetectorTests` — extraction et nettoyage ; chemins avec espaces et
  pourcentage-encodés ; plusieurs URLs dans un même collage ; faux positif d'une
  phrase tapée contenant « file:// ».
- `ComposerDropResolverTests` — résolution d'un `NSItemProvider` construit en
  mémoire depuis un fichier temporaire : vérifie que la copie existe **après** le
  retour, que le nom et le MIME sont corrects, et qu'un provider vide échoue sans
  produire d'élément.

Plus :

- un snapshot du contour de survol (clair et sombre) ;
- une garde de parité de câblage sur les quatre hôtes, dans l'esprit de
  `QueueHandlerWiringParityTests` — ancrée sur le comportement, pas sur un
  commentaire.

## Lot 2 — La chaîne d'écriture du lieu

Cinq ajouts, tous optionnels : aucun appelant existant ne change.

| Fichier | Changement |
|---|---|
| `MeeshySDK/…/Models/MessageModels.swift:547` | `SendMessageRequest.location: SharedPlace?`, clé `location` — celle que le schéma REST valide déjà |
| `MeeshySDK/…/Sockets/MessageSocketManager.swift:2090` | `sendViaSocketFallback(… location:)` — le handler socket l'accepte déjà (`MessageHandler.ts:168`, `:289`) |
| `MeeshySDK/…/Persistence/OfflineQueue.swift:8` | `OfflineQueueItem.location: SharedPlace?` en `decodeIfPresent` |
| `apps/ios/…/Services/OutboxDispatcher.swift` | rejouer `location` au renvoi d'un message, comme il le fait déjà pour un post (`:496-593`) |
| `apps/ios/…/ViewModels/ConversationViewModel.swift:2252` | paramètre `location:` ; le garde `:2255` devient `… \|\| location != nil` |

`decodeIfPresent` sur `OfflineQueueItem` n'est pas une précaution de style : des
lignes écrites avant ce champ sont déjà sur le disque des utilisateurs, et elles
doivent continuer à décoder sans migration — même convention que
`attachmentKinds` et `localAudioPaths`.

Côté composer (`ConversationView+AttachmentHandlers.swift`) :

- `sendMessageWithAttachments` capture `pendingPlace` **avant** de vider l'état ;
- son garde (`:75`) accepte un lieu seul ;
- le lieu est passé dans les **deux** branches — texte seul (`:124`) et avec
  pièces jointes ;
- `pendingPlace` n'est remis à `nil` qu'au succès, pour qu'un échec laisse
  l'utilisateur réessayer sans re-choisir son lieu.

La bulle optimiste écrit `locationJson` dans le `MessageRecord` inséré, pas
seulement dans le `Message` en mémoire : une écriture GRDB concurrente déclenche
`messagesDidChange` et effacerait une valeur qui ne vit qu'en mémoire.

Le socket-first **reste éligible** pour un message porteur de lieu, puisque le
serveur l'accepte sur ce canal : un message « lieu seul » part en ~200 ms au lieu
d'attendre le POST. Le lieu n'est donc pas ajouté à la liste d'inéligibilité de
`:2613`.

### Tests du lot 2

- Encodage : le JSON de `SendMessageRequest` porte `location` avec les cinq champs
  de `SharedPlace`, et l'omet quand il est `nil`.
- Décodage : une ligne `OfflineQueueItem` sérialisée **sans** `location` décode
  toujours.
- Éligibilité d'envoi : extraire une fonction pure
  `SendEligibility.canSend(text:attachmentIds:location:)` et la tester — une
  fonction pure vaut mieux qu'une garde de source, qui ne prouve que la présence
  d'un mot.
- Le renvoi outbox d'un message avec lieu produit un corps portant `location`.

## Lot 3 — Le rendu du lieu reçu

- `BubbleContentBuilder.swift:165` : nouvelle branche qui rend
  `LocationMessageView(place:)` depuis `message.location`. La branche par pièce
  jointe reste en place pour les anciennes lignes du cache local.
- `BubbleStandardLayout.swift:398` : le libellé d'accessibilité
  (`a11y.message.location`) doit aussi se déclencher sur `message.location`.
- Aperçu de conversation : composer « 📍 <nom, à défaut adresse, à défaut
  "Position"> » pour un message dont le `content` est vide et qui porte un lieu.
  La clé `media.summary.location` existe (`ConversationViewModel.swift:2246`) ;
  seule sa condition d'atteinte change. Ça ferme le « reste ouvert » de la passe
  du 2026-07-29.

### Tests du lot 3

- Snapshot de la bulle rendant un lieu depuis `message.location`, en clair et en
  sombre. Vérifier que l'enregistrement a **réellement écrit** les fichiers de
  référence : un script d'enregistrement silencieux a déjà masqué une référence
  absente dans ce dépôt.
- Le libellé d'accessibilité contient la mention de lieu.
- L'aperçu d'un message « lieu seul » n'est pas vide et porte le nom du lieu
  quand il existe.

## Lot 4 — Le picker sur iPad et Mac

Traité en dernier, sur décision de l'utilisateur.

**Étape 1, avant tout correctif : reproduire.** Simulateur iPad, puis Mac depuis
Xcode. Objectif : nommer le symptôme observé par l'utilisateur, qui n'est peut-être
aucun des cinq défauts listés plus haut. Un A/B « avec / sans mes changements »
sur simulateur ment quand l'état persistant du simulateur n'est pas réinitialisé
entre les deux passes — la reproduction se fait sur un état propre.

**Étape 2, les correctifs, chacun vérifiable séparément :**

1. Une extension `locationPickerSheet(…)` unique, appliquée aux six points de
   présentation, qui impose le même dimensionnement partout :
   `.presentationDetents([.large])` + `.adaptiveWideSheet()`. Retirer le
   `.medium` de `FeedView.swift:1503` change le comportement sur iPhone — c'est
   voulu et assumé : une carte à mi-hauteur n'est pas utilisable.
2. Recherche débattue (~350 ms) sur le texte saisi, `MKLocalSearch` déjà en
   place, `.onSubmit` conservé.
3. Réticule fixe au centre de la carte, en overlay ; l'annotation ne marque plus
   que le point confirmé. Supprime le décalage épingle / centre pendant un
   déplacement.
4. Sur `isiOSAppOnMac`, message d'autorisation adapté (Réglages Système ›
   Confidentialité › Service de localisation) sans bouton inerte.
5. Supprimer le doublon `MapUserLocationButton()` / « Ma position ».

**Note de séquencement (post-hoc) :** le gel MapKit décrit dans
`reference_mapkit_userlocation_fallback_reenters_and_freezes.md` — la carte
s'ouvrant en `.userLocation(fallback:)` se ré-entre et fige le main thread —
est un défaut bloquant déjà tracé séparément, distinct des cinq correctifs de
l'étape 2 ci-dessus. Il a été corrigé par les commits `c82c22007` puis
`90b39dc39`, qui touchent `LocationPickerView.swift` et `AdaptiveMap.swift`
**avant** le reste de l'étape 2 de ce lot. Ce n'est pas une entorse au
séquencement « reproduction d'abord » : chaque commit documente sa propre
reproduction instrumentée (preuve par échantillonnage de processus, deux
occurrences imbriquées du même sélecteur sur la pile, main thread à 60-99 %
CPU) dans son message, avant correctif. Les cinq correctifs listés en étape 2
(dimensionnement, recherche débattue, réticule, message Mac, doublon bouton)
restent, eux, à traiter après une reproduction instrumentée dédiée sur le
symptôme rapporté par l'utilisateur.

## Décisions et alternatives écartées

- **`.onDrop` + `NSItemProvider`** plutôt que `.dropDestination(for:)` :
  `dropDestination` exige un `Transferable` concret et ne sait pas dire
  « n'importe quel fichier ».
- **Un rappel `onIngest` unique** plutôt que réutiliser `onPhotoLibrary` /
  `onFilePicker` : ces derniers sont des intentions « ouvre un sélecteur », pas
  des livraisons de contenu.
- **La résolution dans la barre**, pas chez les hôtes : la fenêtre de copie de
  `loadFileRepresentation` est trop facile à rater, et quatre copies divergent.
- **Cible de dépôt limitée à la bande du composer**, pas plein écran : demande
  explicite, et évite le conflit avec l'appui long + glissement de la liste de
  messages.
- **Aucune garde de plateforme** : une branche intestable pour un gain nul.
- **Le socket-first garde le lieu** au lieu de basculer en REST : le serveur
  l'accepte sur ce canal, l'exclure coûterait dix secondes à chaque envoi de lieu
  pour rien.
- **Lots 2 et 3 séparés** : le rendu est cassé indépendamment de l'écriture, et
  se prouve indépendamment.

## Risques et limites assumées

- **La bannière « Coller ? »** apparaît sur la branche 2 du collage (lecture de
  `UIPasteboard.general.itemProviders`). Inévitable : c'est la seule voie qui
  porte l'autorisation sandbox. Elle n'est jamais atteinte quand l'URL collée est
  déjà lisible.
- **Le dépôt depuis le Finder n'est pas testable en CI.** Il exige une
  vérification manuelle depuis Xcode sur le slice « Designed for iPad ». Ce qui
  est automatisable, ce sont les trois unités pures et la garde de parité.
- **`OfflineQueue.swift` est modifié par une session concurrente** au moment
  d'écrire cette spec. Le lot 2 touche ce fichier : relire son état avant
  d'éditer, ne jamais `git checkout HEAD --` dessus, ne jamais `git add -A` sur
  `packages/`.
- **Aucun plafond de taille** n'est introduit sur les fichiers déposés
  (cf. Lot 1 → Cas d'erreur).
- Les tests iOS tournent sous le simulateur 18.2 du dépôt ; un build d'app vert ne
  prouve pas que le bundle de tests compile — lancer `./apps/ios/meeshy.sh test`,
  qui inclut la suite `MeeshySDK`.

## Critères de succès

1. Déposer une image, un fichier audio, un PDF et un texte depuis le Finder (Mac)
   ou Files (iPad) sur la bande du composer produit, respectivement : une tuile
   image éditable, une tuile audio, une tuile document, et du texte dans le champ.
   Sur les quatre surfaces.
2. Coller une URL `file://` d'un fichier accessible produit une pièce jointe dans
   le tiroir d'attachements — pas du texte, pas une tuile presse-papier. Un
   fichier inaccessible produit un toast d'erreur nommé et **aucune** tuile.
3. Un message « lieu seul » s'envoie depuis une conversation et arrive au serveur
   avec `location`, sur les trois transports — y compris après un envoi hors ligne
   rejoué par l'outbox.
4. Un lieu reçu s'affiche dans la bulle avec son nom et son adresse, et l'aperçu
   de la conversation n'est pas vide.
5. `./apps/ios/meeshy.sh test` est vert.
6. (Lot 4) Le symptôme iPad/Mac rapporté par l'utilisateur est nommé, reproduit,
   puis corrigé.
