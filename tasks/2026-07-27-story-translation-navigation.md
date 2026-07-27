# Traduction des stories + navigation du lecteur — reprise 2026-07-27

Tous les commits de la session sont **sur `origin/main`** (HEAD = remote =
`969d11b8f`). Worktree propre. Rien à pousser.

## Ce qui est fait et vérifié à l'écran

| Sujet | Commit | Preuve |
|---|---|---|
| Rangée haute à rotation de l'éditeur texte | `8ae80a80a` | captures : rien de coupé, tap = cran suivant, appui long = panneau |
| Traduction auto des REEL/STATUS à la publication | `99b3f0cdf` | REEL de test → 4 langues en < 40 s |
| Calques du lecteur bornés au viewport | `d02cb7913` | feuille des langues : titre + boutons « Traduire » entiers |
| `/translate` acceptait plus les stories FRIENDS | `d015819e1` | « Post not found » → 200, traduction reçue |
| Le lecteur ignorait `post:translation-updated` | `95c97ff4b` | l'aperçu allemand s'affiche au lieu du spinner infini |
| Feuille des langues redimensionnable au grabber | `7b4bbf973` | **compilé, PAS manipulé à l'écran** |
| Taps latéraux mangés par le hold (200 ms) | `16252b633` | tap posé 250 ms : droite → suivante, gauche → groupe précédent |
| Routage ZMQ `story_text_object_translation` | `969d11b8f` | logs prod + contrôle positif des tests |

## La cause racine (à garder en tête)

Le translator a **deux niveaux** qui portent tous deux une table de dispatch :

- `ZMQTranslationServer` (`zmq_server_core.py`) — possède les sockets (PULL 5555,
  PUB 5558), boucle de réception, instancie les handlers. Sa méthode
  `_handle_translation_request_multipart` **aiguille** par `type` vers le bon
  handler en tâche asyncio trackée. C'est le seul point d'entrée du process.
- `TranslationHandler` (`zmq_translation_handler.py`) — implémente les
  traitements. Il porte une méthode **du même nom**
  (`_handle_translation_request_multipart`) et un dispatch interne
  (`_handle_translation_request`, ligne ~228) qui teste lui aussi `message_type`.

Le serveur ne délègue à cette méthode homonyme que pour `ping` et `translation` ;
pour les autres types il appelle directement les méthodes spécialisées. La
branche `story_text_object_translation` du dispatch interne (ligne ~283) était
donc **inatteignable** — du code mort — pendant que le serveur répondait « Type
de requête inconnu ». Cette homonymie est un piège : toute nouvelle capacité
doit être déclarée dans `zmq_server_core.py`, pas seulement dans le handler.

## Reste à faire

### 1. Déployer le translator — FAIT, puis un SECOND bug est tombé
L'image `isopen/meeshy-translator:latest` portant `969d11b8f` est en production
depuis 16:21 UTC. Plus aucun « Type de requête inconnu ».

Mais la première demande réelle a révélé un bug caché **derrière** le premier :
`_create_tracked_task` incrémentait `task_counters[task_type]` sur un dict
littéral qui ne connaissait que cinq types. Chaque
`story_text_object_translation` levait donc un `KeyError` avalé par le
`except Exception` de la boucle de réception — **routage correct, requête
perdue, symptôme visible identique**. Corrigé par `4cb82fce5` (le compteur
s'auto-enregistre ; un compteur d'observabilité n'est plus un point de panne).

Leçon : les trois tests de routage mockaient `_create_tracked_task`. Ils
prouvaient l'aiguillage et rien d'autre. Le nouveau test exerce le vrai
créateur de tâches.

Reste : contrôler après déploiement de `4cb82fce5` que
`storyEffects.textObjects[n].translations` se remplit (story de test :
`6a6673870677d29b325a1a83`, 3 textObjects en `en`, `fr`, `fr`).

### 2. Recomposer le `content` depuis les textObjects — FAIT côté gateway
Directive user : « les textObject doivent avoir leur traduction et le texte
content est construit dynamiquement à partir des textObject ».

Livré :
- `services/gateway/src/services/posts/storyContentComposition.ts` — module pur :
  `storyTextObjectText`, `composeStoryContent`, `composeStoryContentForLanguage`,
  `isContentDerivedFromTextObjects` (17 tests).
- `StoryTextObjectTranslationService` recompose `translations.<langue>` du post
  à partir des overlays, **dans la même écriture** que les traductions qui
  viennent d'arriver.
- `PostTranslationService.translateOnDemand` n'envoie plus le `content` au
  traducteur quand il n'est que l'index des overlays.
- `PostService` délègue au module : une seule règle de lecture/assemblage.

Distinction structurelle, sans drapeau en base : le `content` dérivé EST, par
construction, la concaténation des overlays. Une **vraie légende** d'auteur
garde son pipeline propre.

Un overlay sans traduction dans la langue demandée garde son texte original
dans l'assemblage — une story est multilingue par nature (cf. §3).

**Vérifié en production** (gateway `d9c579462` déployée, story de test, langue
neuve `ko`) :
```
[GWY] StoryTextObject: sending ZMQ request  index=0,1,2
[GWY] PostTranslation: content is the text-objects index — derived, not translated
```
puis `content.ko` == assemblage exact des 3 traductions d'overlays, et
`translationModel: "story-text-objects"` (les 7 langues antérieures restent en
`basic`, l'ancien pipeline).

La démonstration du bug d'origine tient dans la comparaison `ru` : le `content`
est la concaténation EXACTE des overlays (205 caractères de part et d'autre) et
pourtant les deux traductions divergent — le blob complet rend « о Меши »
(translittéré) et laisse une queue française **non traduite**, là où les trois
overlays, plus courts, sont correctement traduits. L'index dérivé est donc
meilleur par construction.

**Reste ouvert — les langues antérieures.** La recomposition ne se déclenche
qu'à l'arrivée d'une traduction d'overlay. Les stories qui portent déjà des
`translations` issues de l'ancien pipeline gardent leur blob divergent tant que
personne ne redemande la langue. Backfill à arbitrer (script one-shot qui
redemande chaque langue existante, ou laisser converger à l'usage).

### 2 bis. Temps réel + « Retraduire » — FAIT et vérifié en production
Directive user : « les traductions réalisées doivent remonter en TEMPS RÉEL et
la feuille mise à jour », et « pouvoir refaire la traduction à partir des
langues traduites ».

Deux manques que la recomposition avait rendus visibles :
- **L'index recomposé n'était écrit qu'en base.** La feuille lit
  `story.translations` en mémoire, alimenté par `post:translation-updated` :
  sans diffusion, l'aperçu restait sur l'ancien texte jusqu'à un rechargement.
  Il part désormais par le même canal, vers la même audience filtrée par
  visibilité que l'événement overlay (`25ef2fc45`).
- **« Retraduire » ne faisait rien.** Il appelait la même route que
  « Traduire », qui sortait sur ses gardes de cache — légende (« translation
  already cached ») comme overlays (langue déjà couverte). `force` fait tomber
  les gardes de CACHE ; les gardes de SENS restent (langue source identique,
  index dérivé, post fait d'une seule URL).

Côté iOS (`6b8ddb689`) : le bouton transmet le forçage, et donne enfin signe de
vie. L'attente ne pouvait pas se déduire de « pas encore de traduction »
puisque la langue en a déjà une — elle se dérive du TEXTE : on mémorise celui
affiché à la demande, l'anneau tourne tant qu'il n'a pas bougé, et s'éteint
seul à l'arrivée du socket. Un délai coupe le cas où la retraduction rend un
texte identique.

**Preuve production** (story de test PRIVATE créée puis supprimée, 2 overlays
en `fr` et `en`, forçage `pt`) — écoute socket réelle :
```
OVERLAY   index=0 langues=['pt']
CONTENT   langue=pt modele=story-text-objects  "Bom dia ao mundo. Good evening everyone"
OVERLAY   index=1 langues=['pt']
CONTENT   langue=pt modele=story-text-objects  "Bom dia ao mundo. Boa noite a todos ."
```
Le premier overlay traduit recompose l'index IMMÉDIATEMENT en laissant le
second dans son anglais d'origine ; le second complète. Convergence
incrémentale, chaque bout dans sa langue tant qu'il n'est pas traduit.

Forçage vérifié séparément : sans `force`, 0 job ZMQ (tout est en cache) ; avec
`force`, les 3 overlays repartent et l'index reste dérivé.

**Réserve** : un run d'écoute antérieur est resté silencieux alors que la
gateway journalisait sa diffusion. Le run contrôlé final reçoit bien les 2×2
événements (compteurs à l'appui). Je n'ai pas pu attribuer ce silence —
possible course au join de room à la connexion, à surveiller.

### 3. Entrée « Original » sélectionnable — FAIT (`6b8ddb689`)
Directive user : plusieurs bouts peuvent être dans des langues différentes ; il
faut pouvoir afficher l'original **quoi qu'il arrive**, sans aligner tous les
bouts sur une seule langue.

« Original » ne pouvait pas être un code langue : un overlay rédigé en français
dans une story marquée `en` possède une traduction `en`, qui serait servie à la
place de son texte réel. `StoryTextObject.resolvedText` rend déjà le texte
source dès que la chaîne préférée est VIDE — « Original » est donc une chaîne
vide, portée par une sentinelle (`StoryViewerView.originalLanguageOverride`)
qui ne peut pas entrer en collision avec un code BCP-47 et se ramène au code
vide côté affichage (sans quoi la feuille montrait « __MEESHY.ORIGINAL__ »).

Reste : **non manipulé à l'écran**. La ligne compile et sa logique est testée
(9 + 8 tests), mais personne n'a tapé dessus dans le simulateur.

### 4. Cache local des traductions (translator + iOS)
Directive user : sauvegarder les traductions en cache côté translator comme en
base côté gateway ; sur iPhone, **préférer le cache tant que le statut est
actif** et **invalider au bout de 72 heures**. Non commencé — le cache SDK
(`CacheCoordinator`, `CachePolicy` avec TTL/staleTTL) est le point d'entrée.

### 5. Swipe horizontal vers le groupe précédent
Les **taps** sont réparés et vérifiés. Le **swipe** passe par un autre chemin
(`unifiedDragGesture`, au niveau de `StoryViewerView`) que je n'ai pas analysé.
À reprendre si le symptôme persiste après `16252b633`.

### 6. Vérifier la feuille redimensionnable à l'écran
`7b4bbf973` compile mais n'a pas été manipulé : tirer le grabber vers le haut
(déploiement à 85 %) et vers le bas (repli puis fermeture).

## Pièges rencontrés (ne pas refaire)

- `gesture.py --long-press` du skill ios-simulator **envoie un tap**, pas un
  maintien. Pour un vrai appui long : `/tmp/hid_longpress.py <x> <y> <durée>`
  (client python fb-idb, `down` + `HIDDelay` + `up`). C'est aussi ce qui permet
  de simuler un tap « posé » de 250 ms.
- La carte « Reprendre votre story ? » n'est pas exposée à l'accessibilité :
  `navigator.py` ne la voit pas, il faut taper aux coordonnées.
- `GET /posts/feed` ignore `type` et `offset` (toujours les mêmes 40 REEL).
- Tests translator : utiliser `services/translator/.venv/bin/python -m pytest`
  (le python système n'a pas `pytest-asyncio`), avec `-o addopts=""`.
- `project.pbxproj` d'`origin/main` est périmé (fichiers de test manquants) —
  `xcodegen generate` avant tout build local, et ne pas committer le churn.
