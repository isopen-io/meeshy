# 2026-11-28 — Le spectateur de la room d'un post, séparé d'un compagnon (#20779)

**Date** : 2026-11-28 · **Branche** : `claude/exciting-planck-cpf8a3` · **Issue** : #20779

Suivi DIRECT du lot du 2026-11-28 (#20711), dont c'était le PREMIER des deux
coûts assumés — ouvert comme issue plutôt que laissé en commentaire, « parce
qu'une perte fonctionnelle instruite est une dette, jamais une ligne de
fichier ». Ce journal ne porte pas de numéro de cycle, pour la raison que les
deux précédents ont écrite : la date et l'issue sont déjà uniques, et un
identifiant qui ne s'alloue pas collisionne (#5102).

## Ce que l'issue exigeait, et pourquoi c'était l'essentiel du lot

Trois formes, et un critère de fin qui ne portait pas sur le code : **« le coût
de `fetchSockets` sur cette diffusion est MESURÉ, sur les deux adaptateurs, pas
estimé »**. L'issue le disait explicitement — « la forme 1 est la seule exacte ;
la question est son coût, et il se mesure, il ne se suppose pas ».

La mesure a été faite avant d'écrire une ligne de correctif, et c'est elle qui a
décidé. Banc réel : `socket.io` 4.8.4 + `@socket.io/redis-adapter` 8.3.0 (les
versions du dépôt), `redis-server` local, 200 appels par ligne, commandes Redis
comptées par un `Proxy` sur le client `pub`.

| adaptateur | sockets dans la room | latence moyenne | commandes Redis / appel |
|---|---|---|---|
| mémoire (défaut) | 1 / 5 / 25 | **2 / 2 / 6 µs** | 0 |
| Redis, **1 nœud** | 1 / 5 / 25 | **63 / 71 / 71 µs** | **1** |
| Redis, **2 nœuds** (global) | 2 / 10 / 50 | **477 / 313 / 464 µs** | 1 + publish + attente |
| Redis, 2 nœuds (`io.local`) | 1 / 5 / 25 | **3 µs** | 0 |

Deux faits que la mesure a rendus, et qu'aucune lecture de code seule n'aurait
donnés avec cette confiance :

1. **Une seule commande Redis, indépendante du nombre de sockets.**
   `fetchSockets()` fait sa lecture locale puis UN `serverCount()`
   (`PUBSUB NUMSUB`) ; à `numSub <= 1` il rend les sockets locaux et s'arrête
   (`dist/index.js:544-576`). Le compte le confirme : 1, que la room porte 1 ou
   25 sockets.
2. **La production attache bien l'adaptateur Redis.** `docker-compose.prod.yml`
   pose `REDIS_URL` sur la passerelle — donc le chemin de production n'est PAS
   celui de l'adaptateur mémoire, et c'est la ligne « Redis, 1 nœud » qui la
   décrit. Avec une réplique : ~70 µs.

Et le relevé des sites d'appel a réduit le périmètre une seconde fois : des
**huit** appels de `emitPostToAudience`, **un seul passe `postRoom`** —
`broadcastPostUpdated`. Les sept autres familles n'adressent pas la room du
post, donc n'ont aucun spectateur hors audience et ne paient rien.

> **Avant d'arbitrer entre « exact mais cher » et « gratuit mais faux »,
> mesurer ce que le chemin paie DÉJÀ.** Cette branche fait deux lectures Mongo
> (`pairsAround`) avant d'arriver là. 70 µs de Redis posés à côté ne sont pas un
> arbitrage, c'est du bruit — et l'arbitrage que l'issue annonçait a disparu une
> fois le chiffre obtenu. Même forme que #20277 et que #20711, sur une
> dépendance externe au lieu d'une projection Prisma.

La forme retenue, ses trois décisions de fond et les deux coûts assumés :
`services/gateway/decisions/2026-11-28-le-spectateur-de-la-room-d-un-post-recoit-sa-charge-a-sa-socket-20779.md`.

## Ce que les mutations ont mesuré, et c'est la moitié utile du lot

Dix mutations rejouées contre les témoins LIVRÉS. **Deux étaient VERTES à la
première rédaction**, et elles disent deux choses différentes.

### Le court-circuit de coût était écrit DEUX fois, et aucune couche n'était tenue

« Ne rien énumérer quand personne n'est séparé d'un compagnon » vivait dans le
module ET dans la condition d'appel (`apart.size === 0`). Mutée, chaque couche
était couverte par l'autre : **131 témoins verts**.

C'est « une défense en profondeur dont aucune couche n'est tenue perd une couche
en silence » — le constat de l'audit adversarial de #20711 — appliqué cette fois
à un COÛT et non à un secret. Ce qui le rend plus discret : un coût n'a pas de
symptôme. La couche survivante aurait pu disparaître sans que rien ne rougisse,
et on aurait payé un aller-retour Redis sur chaque `post:updated`.

**La redondance est RETIRÉE, pas doublée d'un témoin.** Le site d'appel ne
décide plus que de ce que lui seul sait — la room du post est-elle adressée ? —
et le module décide seul s'il y a quelque chose à énumérer.

**Et la phrase qui justifiait ce retrait était FAUSSE d'un spread.** « Les
ensembles ne se construisent qu'après le court-circuit, donc le cas nominal
n'alloue rien » était vraie du MODULE et fausse du CHEMIN : l'appelant passait
`alreadyServed: [...recipients, authorId]`, un tableau composé O(audience) AVANT
le court-circuit. Les entrées sont désormais celles que l'appelant TIENT DÉJÀ —
`audience: recipients`, et `authorId` nommé à part parce qu'il sort pour une
AUTRE raison : son écho part toujours sur sa feed room (exemption écrite de
#20430), et non parce qu'une boucle l'a servi. Cette seconde soustraction a
gagné au passage son propre témoin, qu'aucun n'exerçait.

> **Une affirmation de coût se vérifie sur le CHEMIN, pas sur l'unité qui la
> porte.** Celle-ci décrivait exactement ce que le module fait, et un appelant à
> quatre lignes de là la démentait. C'est la famille « un commentaire qui ÉNONCE
> une contrainte est une AFFIRMATION » (cycle 94) appliquée à une allocation —
> et le pire endroit pour la poser, puisqu'un coût n'a pas de symptôme.

> **Devant deux couches qui disent la même chose, la question n'est pas
> « laquelle tester ? » mais « laquelle est propriétaire ? ».** Tester les deux
> fige une duplication ; en retirer une laisse une règle avec un propriétaire,
> et un témoin qui peut tomber.

### Le fail-open de l'axe de l'AUTEUR n'était tenu par rien

Retirer `postRoom.separated === null` de la condition laissait **tous** les
témoins verts — et cette mutation-là n'est pas cosmétique : quand l'axe de
l'auteur n'a pas pu être lu, #20430 n'adresse pas la room du post, faute de
savoir qui l'auteur a bloqué. Énumérer malgré tout servirait le post à un
lecteur dont on ne sait RIEN, **sur la foi d'une panne**.

Réparé par un mode de panne CIBLÉ, sur les deux requêtes dont les sujets sont
exactement `[AUTEUR]`. Faire lever TOUTE lecture de blocage ferait tomber le
pré-filtre des feed rooms, dont le `catch` ne rend que l'auteur, et déplacerait
le défaut hors de l'audience où plus aucune assertion ne peut le voir — c'est le
constat C9 de #20430, qui frappe ici une **troisième** fois, sur une troisième
lecture. Le patron est désormais connu ; ce qui ne l'empêche pas de se reposer à
chaque lot qui écrit un double de blocages.

### Un témoin manquait, et seul un COMPTE pouvait le nommer

« Rendre tous les sockets de la room sans filtrer sur la séparation » laissait
tout vert. Or cette mutation fait recevoir au spectateur que rien ne sépare la
charge commune **ET** une charge à sa socket : deux `post:updated` pour une
édition — la forme exacte du défaut que `emitToUserFeedAndPostRoom` existe pour
empêcher (le `+2` de réaction).

> **Aucune assertion `toContain` ne peut voir un DOUBLON ; seul un COMPTE le
> voit.** Un témoin de confidentialité demande « ce texte est-il parti ? » ; un
> témoin de LIVRAISON demande « combien de fois ? ». Les deux ne se subsument
> pas, et quinze témoins de la première espèce ne valent pas un de la seconde.
> Toute boucle qui ajoute une adresse à une émission déjà dédoublonnée doit
> poser la seconde question.

### Une mutation est restée verte À JUSTE TITRE, et il faut le dire

Servir la charge par `withAudienceListFor(post, readerId)` au lieu de
`withoutAudienceList(post)` : **équivalent**. `mayReadAudienceList` exige
`post.authorId === viewerId`, et un spectateur n'est jamais l'auteur — il est
soustrait par `alreadyServed`. Les deux expressions rendent le même objet.

C'est une mutation ÉQUIVALENTE, pas une garde non tenue, et confondre les deux
ferait poser un témoin incapable de tomber — exactement ce que le dépôt refuse
d'appeler un témoin. **Un vert sous mutation a deux causes, et il faut les
séparer avant de conclure** : la garde n'est tenue par personne, ou la mutation
ne change rien.

## Une nature NEUVE au cliquet de la room du post

`post-room-separation-sweep.ts` est tombé dès le premier fichier écrit, et c'est
son travail : un fichier de production qui cite la room du post doit DÉCLARER sa
nature, « le silence n'est pas une cinquième valeur ».

Il n'en avait que quatre — émission gouvernée, fabrique de rooms, adhésion,
exemption motivée — et **aucune ne décrit ce module** : il LIT l'appartenance de
la room et n'émet rien. La cinquième (`lecture-de-room`) est ajoutée plutôt que
le site forcé dans une des quatre, parce que ce qu'elle ENGAGE lui est propre :
sa sortie DÉCIDE qui sera servi à part, donc c'est elle qui doit soustraire les
rooms fermées — un verdict pris en aval ne la rattraperait pas.

Et la raison déclarée de `socialEmissionCore.ts` a été mise à jour dans le même
mouvement : elle ÉNUMÉRAIT « les quatre primitives d'adresse ». **Une
énumération corrigée reste une énumération** — celle-ci nomme désormais la
cinquième et dit qu'elle n'adresse pas la room mais la LIT, ce qui est la seule
chose qui la distingue des quatre autres.

## Ce que le lot a aussi mesuré, et qui devient une issue

La carte `services/gateway/decisions.md` cite **186** fichiers pour **198**
présents sous `decisions/` : douze décisions écrites ne sont dans aucune carte,
dont celles de #20711 et #20430 — les deux parents directs de ce lot. L'entrée
de celui-ci est posée ; les onze autres sont **#20799**.

> Une carte qui s'ajoute à la main dérive par construction, et sa dérive ne
> ressemble à rien : chaque décision est là, lisible, et seule la façon de la
> TROUVER manque.

## Preuve

| étape | mesure |
|---|---|
| RED avant correction, sur le fichier d'intégration | **5 rouges** sur 15 |
| mutation « le rejet de l'énumération n'est plus gardé » | 16 rouges |
| mutation « le court-circuit du cas nominal est retiré » | 3 rouges |
| mutation « la charge du spectateur n'est plus réduite » | 3 rouges |
| mutation « le filtre de séparation est retiré » | 2 rouges |
| mutation « les rooms fermées par l'axe AUTEUR ne sont plus soustraites » | 2 rouges |
| mutation « les lecteurs déjà servis ne sont plus soustraits » | 2 rouges |
| mutation « la charge est amputée de TOUS les compagnons » | 1 rouge |
| mutation « la charge part à la feed room au lieu de la socket » | 1 rouge |
| mutation « la room est énumérée malgré l'axe AUTEUR illisible » (VERTE avant) | 1 rouge |
| mutation « liste d'audience servie au spectateur » | **équivalente** — 0, à juste titre |
| les quatre fichiers de témoins de séparation de post | **143 verts** |
| suites `src/socketio` + `src/services/posts` + garde des journaux | **276 suites, 4 350 verts** |
| `tsc --noEmit` (passerelle, production) | **0** |
| `tsc -p tsconfig.test.json`, erreurs hors codes muets | **76** — le plafond, pas au-dessus |
| suite COMPLÈTE de la passerelle | 3 084 suites, **45 826 verts**, 19 rouges |

**Les dix-neuf rouges de la suite complète, et ce qu'ils sont.** Deux étaient de
ce lot, et les deux sont réparés :

- `journal-one-file-per-entry-guard` — le fichier de leçon doit commencer par
  son titre `## ` et n'en porter qu'UN hors bloc de code. Le mien portait `# `
  et six sous-titres `## `.
- `tsc-never-loaded-tests-ratchet` — **77 contre un plafond de 76**, et la
  77ᵉ était bien la mienne : `TS2554` sur un double dont la signature déclarait
  zéro paramètre là où la production passe le nom de la room. **Réparé, pas
  gelé** — le doc-comment du cliquet dit pourquoi (« toute marge laissée
  au-dessus est une erreur de type que plus rien ne verrait »), `ts-jest`
  transpilant sans types depuis #10203. Un double dont la signature MENT passe
  donc l'exécution et ne rougit qu'ici.

Les dix-sept autres sont les six suites de conversion d'image (HEIF, AVIF,
EXIF/rotation JPEG) : **mesurées rouges sur l'arbre SANS ce lot** (`git stash`,
11 rouges sur les deux suites rejouées). Elles dépendent des codecs compilés
dans `sharp`, absents de ce conteneur — la CI compile les siens. Confronté à
l'ARBRE avant d'être attribué à quoi que ce soit, comme le `CLAUDE.md` racine le
prescrit pour cette classe de rouge.

**Deux des dix mutations étaient VERTES avant la seconde passe**, dont l'une est
un fail-open. C'est la mesure la plus utile du cycle, et c'est la deuxième fois
de suite qu'elle l'est : le lot avait prouvé son rouge, posé ses gardes, et deux
d'entre elles n'étaient tenues par rien.
