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

**Vérifié à l'écran** (simulateur, compte atabeth, story de Windie Nh) : la
ligne « Original » est bien la PREMIÈRE de la feuille, au-dessus de
« Français ». Séquence : texte par défaut « Senhor, eu não sei. » (traduction
portugaise servie par le Prisme) → tap « Français » → « Seigneurrrr 😂🙌🏽❤️. »
→ tap « Original » → « Seigneurrrr 😂🙌🏽❤️. ».

J'ai d'abord lu ce dernier pas comme un bug ; c'en est l'inverse. L'original de
cette story EST le français : « Original » a rendu le texte source, et c'est le
portugais du départ qui était la traduction. Le cas est même idéal — il montre
que la sentinelle ne se contente pas de « remettre la langue de l'auteur du
groupe », elle rend à chaque bout SON texte.

### 4. Cache des traductions — FAIT (précision user : « le cache est à gérer
### côté FRONTEND »)

**Ce qui existait déjà** et que j'ai vérifié plutôt que réécrit :
- Le payload `GET /posts/feed/stories` porte les traductions du contenu ET
  celles de chaque overlay — un rafraîchissement ne les perd pas.
- `StoryViewModel` fusionne les deux événements socket puis appelle
  `persistStoryCache()` : les traductions survivent au redémarrage.
- La feuille des langues n'appelle le réseau que pour une langue ABSENTE ; une
  langue déjà traduite s'affiche sans aller-retour.

**Le seul défaut réel : le TTL du conteneur.** `CachePolicy.stories` était à
24 h — au premier cold start du lendemain, `.expired` → spinner et refetch
complet, alors que le tray aurait pu s'afficher instantanément puis se
resynchroniser en delta. Passé à **72 h** (`153323a43`), fenêtre fraîche
inchangée à 5 min.

**Contre-intuition qui rend le changement non trivial** : les stories d'AUTRUI
sont purgées à l'expiration par `purgeDeadStories`, donc pour elles le TTL
importe peu. Mais `isDeadStory` garde délibérément les stories de
l'utilisateur lui-même au-delà de leur expiration (« c'est là que leur auteur
vient lire les réactions »). Ce sont précisément celles que le TTL de 24 h
faisait disparaître du cache.

**Ce que je n'ai PAS fait** : `StatusEntry` ne porte aucun champ de traduction —
le Prisme ne s'applique pas au cache des statuts. Aucun cache de traduction
dédié par `(postId, langue)` n'a été créé : il ferait doublon avec le payload
serveur, qui livre déjà les traductions avec la story.

**Côté translator** (fait avant la précision user, `0c7e0dfba`) :
`translate_with_structure` renvoie vers `translate()` sous 100 caractères sans
saut de paragraphe ni emoji — donc quasiment tous les overlays. Or `translate()`
ne consultait ni ne remplissait le cache Redis et codait `from_cache: False` en
dur : traduire trois fois le même overlay coûtait trois passes modèle.

### 5. Swipe horizontal vers le groupe précédent — VÉRIFIÉ, fonctionne
Le symptôme ne persiste pas après `16252b633`. Vérifié au simulateur avec DEUX
groupes réels dans la barre (« Ma story » index 0, « Windie Nh » index 1) :
- swipe DROITE depuis Windie Nh → en-tête « Profil de Andre Tabeth » ;
- swipe GAUCHE → retour « Profil de Windie Nh ».

**Piège de reproduction** : au premier essai la barre ne contenait qu'UN groupe
(l'entrée propre ouvrait le composer, pas un lecteur). Un swipe droite y était
donc un no-op LÉGITIME — `currentGroupIndex > 0` est faux. Vérifié au passage
qu'il ne ferme pas le lecteur : après le swipe, « Lecteur de stories » est
toujours monté, progression revenue à 0 %. La fermeture observée avant venait
de la fin naturelle de la story (1 seule slide, déjà à 28 %).

Le second groupe n'est apparu qu'APRÈS une reconnexion — la barre servait un
cache où la story propre de l'utilisateur n'était pas encore un groupe.

### 6. Feuille redimensionnable — VÉRIFIÉE à l'écran
Loi complète manipulée au simulateur, hauteurs mesurées via l'arbre
d'accessibilité (position du titre « Langues ») :
- tirage HAUT depuis le grabber → **720 pt**, soit exactement le plafond
  `min(0.85 × 874, 720)` ;
- tirage BAS → **320 pt** (`minHeight`) ;
- second tirage BAS → **fermeture**.

**Piège** : le geste est posé sur tout le panneau, mais le `ScrollView` de la
liste emporte les drags verticaux qui naissent dans la liste. Un tirage parti
de 15 pt sous le grabber a replié la feuille au lieu de la déployer — il faut
partir de la zone du grabber, au-dessus du `ScrollView`.

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
