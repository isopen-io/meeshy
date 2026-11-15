## Leçon 354 — Un champ EXISTE ne veut pas dire qu'il est ÉCRIT : une branche peut naître inatteignable

**2026-08-31, vue `3h` (#4098).** En écrivant le bandeau de la citation de
story, j'ai composé deux formes :

```swift
reply.isMe ? "réponse à votre story" : "réponse à sa story"
```

Le raisonnement était juste et le champ était le bon : `ReplyReference.isMe`
signifie **exactement** « le contenu cité est le mien ». Le cas visé est réel,
et c'est même le plus fréquent côté reçu — quelqu'un répond à MA story, je lis
la conversation.

**La branche « votre story » ne pouvait jamais s'afficher.** Les quatre
producteurs d'une citation de story sont unanimes, et l'un d'eux l'écrit
littéralement :

| producteur | ce qu'il pose |
|---|---|
| `MessageModels.swift:845` | `authorName: "Story"`, `isMe` non passé ⇒ `false` |
| `MessageModels.swift:860` | idem, repli « identifiant seul » |
| `MessagePersistenceActor.swift:1716` | **`isMe: false`** en dur |
| `ReplyContext.toReplyReference` | `isMe` jamais passé |

J'avais lu la DÉCLARATION du champ — son type, son doc-comment, son sens
produit — et pas une seule de ses ÉCRITURES.

> **La déclaration d'un champ prouve qu'il peut être LU. Elle ne prouve jamais
> qu'il est ÉCRIT.** Avant de brancher un rendu sur un champ, `grep` ses
> PRODUCTEURS ; la liste obtenue dit si la branche existe pour de vrai.

C'est la loi 4 du dépôt (« un contrôle existe s'il a un effet ») prise par
l'autre bout : ici l'effet ne manquait pas au contrôle, c'est la CAUSE qui
manquait à la branche. Une branche qu'aucune donnée ne peut atteindre ressemble
à une fonctionnalité et n'en est pas — et son libellé serait resté dans le
catalogue, traduit en sept langues, jamais affiché. (`test_everyAppCatalog
IdentifierKeyIsReferencedInCode` l'aurait vue une fois la clé orpheline ; la
branche VIVANTE avec sa clé RÉFÉRENCÉE, elle, ne fait rougir personne.)

**Ce qui est parti dans le commit, et pourquoi la garde a deux faces.** La
variante retirée, sa clé retirée du catalogue, et un témoin qui épingle
**les deux moitiés** : le libellé unique côté carte, ET le fait producteur
(`authorName: "Story"`) côté SDK. Sans la seconde moitié, la garde interdirait
pour toujours une variante que la donnée pourrait un jour permettre — elle
deviendrait un obstacle au lieu d'une garde. Le manque est SUIVI (#4517).

### Le corollaire, trouvé dans le même lot

La phrase de doctrine à livrer était « la citation **survit à son expiration** ».
Le réflexe est de la lire comme la description d'un WIDGET : la carte se
rend-elle encore quand la story a expiré ? Réponse : oui, la donnée est gravée,
et `MessageModels` le dit noir sur blanc depuis longtemps. Rien à faire.

Lue comme une QUESTION SUR LA CHAÎNE — « et quand elle a expiré, que se
passe-t-il si je la touche ? » — elle a rendu le vrai défaut, **deux fichiers
plus loin** :

```swift
if let groupIdx = storyViewModel.groupIndex(forStoryId: storyId) { … }
// pas de `else`
```

Story expirée, purgée ou jamais chargée : le tap ne faisait **rien**. Pas
d'erreur, pas d'explication. Le chemin voisin — un MESSAGE cité introuvable —
faisait déjà la bonne chose douze lignes plus haut ; la story n'avait jamais
reçu son pendant.

> Une phrase de doctrine décrit une CHAÎNE, pas un composant. « X survit à Y »
> se vérifie sur l'affichage **et** sur tout ce qu'on peut faire de X une fois
> Y arrivé.

Et le refus qui va avec : ne PAS préjuger de l'expiration côté client.
`storyPublishedAt + StoryItem.defaultExpiryInterval` était une règle pure,
testable, à portée de main — et fausse, parce que le droit d'ouvrir une story
périmée est **déclaré par le serveur** (`referenceAccess`, « never recomputed
from `expiresAt` here ») pour qui y est nommé. Une carte qui s'annoncerait
« expirée » sur une story que le tap aurait ouverte serait un mensonge pire que
le silence qu'on corrige. **La carte se rend toujours, le tap tente toujours,
et c'est l'ÉCHEC qui parle** — chez le seul site qui peut le constater.

### Deux corollaires d'outillage, payés dans le même lot

**Une racine dérivée de `#filePath` en COMPTANT les crans casse au premier
appelant d'une autre profondeur.** `MyStoriesSourceCorpus.appRoot(file:)`
retirait quatre composants — juste pour les vingt gardes rangées à
`MeeshyTests/Unit/Views/`, faux pour la première rangée à
`MeeshyTests/Unit/Views/Bubble/`, qui a obtenu `apps/ios/MeeshyTests` et dix
« no such file » sur des fichiers bien présents. `file` valant `#filePath` par
DÉFAUT, c'est l'appelant qui décide, et rien dans la signature ne le dit.

Le bruit était le cas HEUREUX : si la mauvaise racine avait contenu un fichier
de même nom, la garde aurait lu le MAUVAIS fichier et serait passée au vert.
**Une racine se REMONTE jusqu'à un repère nommé, elle ne se compte pas.**

**Et une garde de source ne doit jamais accuser un site innocent.**
`RiverTypingIndicatorTests` extrayait les listes d'arguments par
`firstIndex(of: "(")` sur tout le reste du fichier. Sur
`@State private var fingerprint: RiverConversationMapping.Fingerprint` — une
ANNOTATION DE TYPE, pas un appel — il attrapait la parenthèse d'un appel
quatre-vingt-dix lignes plus bas et avalait le `body` entier, où
`typingParticipants:` est passé à `RiverStreamHost`, à qui il est destiné. Le
message imprimé citait une « liste d'arguments » VIDE : le symptôme d'un
extracteur qui a balayé autre chose que ce qu'il croyait. **Une garde qui
accuse à tort se fait désactiver plutôt que corriger** — c'est le mode de
panne le plus cher d'une garde, parce qu'il coûte la protection ET la
confiance.

Voir aussi la leçon 352 (une extraction franchit deux frontières muettes) —
appliquée ici en amont : `BubbleBodyFooterLayout` a quitté un hôte hors budget
AVANT que la carte n'y soit montée, et la suite entière a servi de parade.
