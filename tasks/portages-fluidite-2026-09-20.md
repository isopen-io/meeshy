# Les cinq correctifs de fluidité qui existent déjà, portés aux sites restants

**Lot ouvert le 2026-09-20.** Issues : #6226 (les deux abonnements qui font
battre tout un écran), #7010 (la racine et le fil re-diffusés), #7158 (le
texte de recherche). Milestone #96 — « L'app iOS est fluide, sobre et
instantanée — mesurée ».

## La forme du lot

Aucun de ces cinq défauts ne demande d'invention. Pour chacun, la réponse
existe dans le dépôt : elle est écrite, mesurée sur appareil, documentée avec
sa raison, et adoptée ailleurs. Ce qui manque est le PORTAGE — et dans deux
cas, un seul mot.

| # | Site resté sur l'ancien montage | Le correctif, déjà écrit |
|---|---|---|
| 1 | `RootViewComponents.swift` (`ThemedFeedOverlay`), `FeedView.swift`, `PeopleDiscoveryView.swift` — `@State CGFloat headerScrollOffset` | `ScrollOffsetRelay`, adopté par `ConversationListView` et `ContactsHubView` |
| 2 | `RootViewComponents.swift` — `@StateObject reelAutoplay` | `FeedView.swift:58-60`, `@State` avec la raison écrite (#7010) |
| 3 | `ConversationView.swift` — `@StateObject pendingAudioPlayer` | `ConversationView.swift:273`, `@State audioRecorder`, deux lignes plus haut (#6226) |
| 4 | `ConversationListViewModel.swift` — `@Published searchText` sur le modèle partagé | `ConversationComposerTextModel` + `ComposerTextHost` |
| 5 | `MeeshyVideoPlayer+Renderers.swift` — `@ObservedObject manager` | `ReelFeedVideoSurface.swift:78-100`, miroirs `@State` + `.onReceive` cantonnés |

S'y ajoutent les trois `Equatable` écrites et jamais posées que #6226
énumère : `RiverBubbleView`, `CommentRowView`, `ProfilePostRow`.

## Ce qui est repéré AVANT d'écrire

`ScrollMotionGeneralizationTests.test_feedHeader_wiresBothHalvesOfTheLaw`
attend aujourd'hui l'expression `.scrollMotionActive(offset: headerScrollOffset)`
dans `FeedView.swift`. Porter le relais la fera ROUGIR : c'est la garde qui
EXEMPTAIT le défaut. Elle se met à jour dans le même commit que le portage
qu'elle juge — jamais après.

## Preuve

Un témoin de source par portage, sur le modèle de
`RootRerenderSourceGuardTests` (#7010) : l'invariant se tient sur la SOURCE,
parce qu'un abonnement inutile ne change aucun pixel — il coûte des images.
Chaque témoin garde AUSSI son pendant : ce que la racine cesse d'observer,
quelqu'un, plus bas, doit encore le lire. Un correctif dont la valeur
n'atteint aucun lecteur n'a corrigé personne.

## Source

Audit iOS du 2026-09-20, branche `fix/nouvelle-connexion-appareil-7035`,
§ « Cinq correctifs déjà écrits, qu'il reste à recopier ». Étape 02 du plan,
après la fermeture des deux caches qui franchissaient la déconnexion (#7146,
livrée par la PR #7147).

---

## Ce que le portage a trouvé — et que le relevé disait autrement

Quatre des cinq lignes du tableau ci-dessus tenaient ; **trois constats les
corrigent**, tous dans le même sens : le relevé lisait les DÉCLARATIONS et
concluait sur l'usage.

### 1. « Deux se corrigent en changeant un mot » — un seul le pouvait

`reelAutoplay` était bien un changement de mot : `ThemedFeedOverlay` ne lit
aucune valeur du coordinateur.

`pendingAudioPlayer`, non. La racine LIT `isPlaying` — dans
`audioTileFallback`, qui dessine « lecture » ou « pause ». Passer en `@State`
sans extraire la tuile aurait figé son icône à sa naissance. **Un défaut de
CORRECTION, pire que la lenteur qu'il corrige.** D'où `PendingAudioTile`.

### 2. Les quatre autres porteurs du vumètre ne sont pas dans ce cas

`PostDetailView`, `FeedCommentsSheet`, `StoryViewerView+CanvasComposerBar` et
`AudioPostComposerView` lisent tous `isRecording`, `duration` et
`audioLevels` dans une vue. Leur canton passe par le CONTRAT du composant qui
reçoit ces trois valeurs — un lot à lui seul : #7162.

### 3. Le volet « trois Equatable jamais posées » était déjà soldé

Remesuré : `RiverBubbleView` porte `.equatable()` à ses DEUX sites de
montage, `CommentRowView` à ses TROIS, et `ProfilePostRow` — comme tout
`UserProfileSheet*` — a quitté le dépôt. Le corps de #6226 n'avait pas été
remesuré depuis son écriture.

> **Une énumération de sites porte deux affirmations : « ces sites ont le
> défaut » et « ce sont les sites qui l'ont ».** La seconde vieillit sans
> prévenir — le dépôt avance, l'énoncé reste. Avant de porter un correctif
> d'après une liste, la remesurer ; c'est la leçon 261 appliquée à un relevé
> d'audit plutôt qu'à une règle.

### Ce que le relais a coûté de plus que prévu

`ScrollOffsetReader`, l'hôte générique, existait déjà — le portage est resté
mécanique. Mais le fil de l'iPhone gardait son en-tête dans une `private var`
de la racine : elle devient une FONCTION de l'offset, que le lecteur
alimente. Le relevé comptait « treize écrans sur quinze » ; le balayage en
trouve **neuf détenteurs de relais et trois retardataires**, soit une
adoption plus large et un reste plus petit que l'estimation.

### 4. Et la vérification a trouvé ce que le portage n'avait pas vu

`pendingAudioPlayer` n'est mis en lecture par **rien** : ses quatre usages dans
`apps/ios/` sont une déclaration, deux `stop()` et la lecture de `isPlaying`
par la tuile. Aucun `play()`. L'icône de la tuile est donc **décorative**
(#7171), et le canton écrit ici — correct, sans risque, et prêt pour le jour
où la lecture sera câblée — a un gain de performance **nul** : un lecteur qui
ne joue jamais ne publie jamais.

> La question « la valeur est-elle LUE ? » m'a évité un défaut de correction.
> Il en fallait une seconde : **« cette valeur CHANGE-t-elle jamais ? »** Une
> propriété lue mais constante ne coûte rien à observer — et le correctif qui
> retire cette observation ne gagne rien non plus.
