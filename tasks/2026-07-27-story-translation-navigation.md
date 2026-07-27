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

### 1. Déployer le translator — BLOQUANT pour tout le reste
Le correctif `969d11b8f` est côté Python : sans rebuild de l'image, les
`textObjects` continuent de n'avoir aucune traduction en production.
Vérification après déploiement :
```bash
ssh root@meeshy.me 'docker logs meeshy-translator --since 10m 2>&1 | grep -i story_text_object'
# attendu : plus aucun « Type de requête inconnu »
```
Puis demander une langue et contrôler que `storyEffects.textObjects[n].translations`
se remplit (story de test : `6a6673870677d29b325a1a83`, 3 textObjects en `en`,
`fr`, `fr`).

### 2. Recomposer le `content` depuis les textObjects
Directive user : « les textObject doivent avoir leur traduction et le texte
content est construit dynamiquement à partir des textObject ». Aujourd'hui le
gateway traduit les deux **séparément** — d'où leur divergence observée
(6 langues sur le `content`, 0 sur les textObjects). Le `content` doit devenir
un dérivé, pas une source traduite pour elle-même.

### 3. Entrée « Original » sélectionnable
Directive user : plusieurs bouts peuvent être dans des langues différentes ; il
faut pouvoir afficher l'original **quoi qu'il arrive**, sans aligner tous les
bouts sur une seule langue. Aujourd'hui « Original » n'est qu'un en-tête
d'aperçu dans `StoryLanguageDetailView`, pas une option choisissable.

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
