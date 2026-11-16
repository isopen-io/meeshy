# Cycle 172 — ce qu'un chemin bavard ne dit pas, et les deux jumelles qu'on ne cherchait pas

*2026-11-16. Branche `claude/exciting-planck-k2qr42`. Nom de fichier suffixé par
son issue : `cycle171` a déjà été pris deux fois le même jour, et un nom de
fichier partagé FUSIONNE en silence (leçon du 2026-11-15, #18632).*

**Livré** : #18733 — l'éviction au plafond de la file de remise se nomme.

---

## Le relevé avant de choisir

La directive de la branche poussée tôt se LIT, elle ne s'émet pas seulement
(leçon du cycle 170). Les trois candidats de l'arriéré temps réel ont donc été
passés à `git log --all --oneline --grep="#n"` avant d'écrire une ligne :

| issue | ce que le relevé a rendu |
|---|---|
| #18731 (curseur de livraison, préfixe contigu) | cité par le lot de #18701, non pris |
| #18733 (le plafond évince sans trace) | **libre** |
| #18760 (`dev` s'annule ses runs CI) | documenté par deux commits, non corrigé — et c'est de l'infrastructure CI, pas du temps réel |

#18733 a été choisi devant #18731 pour une raison de dépendance : #18731 propose
trois pistes dont la première coûte une requête de plus **sur le chemin de
reconnexion, le plus chaud du produit**, et aucune ne peut s'arbitrer sans savoir
à quelle fréquence le déclencheur se produit. Or c'est exactement ce que personne
ne pouvait savoir. On mesure avant de payer.

---

## Le défaut

`DELIVERY_QUEUE_MAX_PER_USER` (500) et `MEMORY_QUEUE_MAX_PER_USER` (50) bornent
la file hors ligne par destinataire. Au-delà, les arrivées les plus anciennes
sont **détruites**, et leur rejeu n'aura jamais lieu.

Trois issues nomment ce plafond comme la cause d'un défaut VISIBLE — #18614
(« rien à diagnostiquer — pas d'exception, pas de log, juste une coche qui dit
remis »), #18701, #18707 — en insistant chacune sur le fait qu'il **n'exige
aucune panne**. Et le chemin d'enfilage journalise tout le reste :

| événement | trace |
|---|---|
| dédoublonnage | `debug` |
| supplantation d'un événement mutable | `debug` |
| échec Redis → repli mémoire | `warn` |
| map mémoire pleine → éviction d'un USAGER entier | `warn` |
| entrée informe | `error` |
| **éviction au plafond, par destinataire** | **rien** |

L'asymétrie est le constat : celle qui n'affecte que le REPLI avertissait ; celle
qui vit sur le chemin de PRODUCTION et détruit du rejeu se taisait — **avec la
valeur déjà sous la main** (`RPUSH` rend la longueur ; côté mémoire `evictCount`
était calculé, servait à trancher, et était jeté).

### Pourquoi un chemin instrumenté partout peut l'être partout sauf là

Une trace se pose avec le CAS qu'elle décrit, et chacun de ces cas est une
BRANCHE — quelqu'un l'a écrite, et s'est demandé ce qu'elle devait dire.
L'éviction n'est pas une branche : c'est l'**effet de bord d'une commande du
chemin nominal** (`LTRIM` après `RPUSH`, `slice(-N)` après un `concat`). Il n'y a
aucun `if` où poser la phrase. Le silence n'est donc pas un manque de discipline,
c'est la conséquence de l'endroit où vit la destruction. Règle et corollaires :
`tasks/lessons/2026-11-16-un-chemin-bavard-peut-se-taire-exactement-la-ou-il-detruit.md`.

---

## La forme, et pourquoi pas les autres

| ce qui a été écarté | pourquoi |
|---|---|
| une quatrième valeur de code (« poussée AVEC éviction ») | `1` doit continuer de vouloir dire « poussée » : sinon chaque lecteur apprend deux façons de dire la même chose |
| un `LLEN` après la poussée | une commande de plus sur le chemin le plus chaud du produit, pour une valeur que `RPUSH` rend déjà |
| l'arithmétique en Lua | le dépôt n'a **aucun** double capable d'exécuter du Lua : tout calcul laissé là est non testé par construction |
| un compteur / une métrique | aucun collecteur ; et ce n'est pas ce que l'issue demande |

Retenu : les deux scripts rendent `{code, lengthAfterPush}` — la longueur que
`RPUSH` / `LPUSH` rendent déjà —, `services/deliveryQueueBound.ts` porte la
décision (`readBoundedPushReply`, `destroyedAtBound`), et
`RedisDeliveryQueue.noteBoundEviction` est le site UNIQUE qui nomme. Décision
complète : `services/gateway/decisions/2026-11-16-l-eviction-au-plafond-de-la-file-de-remise-se-nomme-18733.md`.

**`lengthAfterPush === 0` dit « je n'ai pas mesuré », jamais « la file est
vide ».** Les deux branches sans `LTRIM` rendent 0 (le dédoublonnage ne pousse
rien ; la supplantation retire une entrée et en pousse une, la longueur ne bouge
pas), et **tout** retour qui ne porte pas la longueur — l'entier nu d'avant ce
lot, que rendent TOUS les doubles du dépôt — rend 0 aussi. Un chiffre de perte
qui servira un jour à instruire la valeur 500 ne doit jamais être inventé.

---

## Les deux jumelles, et la seconde n'était nommée nulle part

L'issue scopait « les DEUX chemins, Redis et mémoire » : les deux moitiés de
l'enfilage. La question posée au moment du correctif — *ce `LTRIM` est-il le seul
du fichier ?* — en a rendu deux de plus. La REMISE (#12822, M3) borne de la même
façon les entrées scellées qu'un drain n'a pas pu rouvrir : même destruction de
rejeu, même silence, et son `LPUSH` rend déjà la longueur. Quatre chemins, un
seul site qui nomme.

**Et le pire des quatre ne s'atteint par aucune lecture de l'enfilage :** Redis
DRAINE puis sa remise ÉCHOUE. Le repli mémoire reçoit alors jusqu'à 500 entrées
scellées — la borne de la tranche Redis — dans une tranche qui en garde 50 :
jusqu'à **450 entrées détruites en silence**, à l'instant précis où le drain
venait de les retirer de Redis. Et `slice(-50)` garde les DERNIÈRES, donc ce qui
part est pris en tête : **la remise détruit exactement ce qu'elle remet.** Ce cas
naît de la RENCONTRE de deux bornes différentes sur le chemin de panne de la
première — il n'appartient à aucune des deux moitiés que l'issue énumérait.

---

## Mutation, une garde à la fois

| mutation | témoin tombé |
|---|---|
| la remise mémoire ne nomme plus | remise MÉMOIRE |
| la trace part même à zéro détruite | les trois silences (plafond pile atteint, dédoublonnage/supplantation, entier nu) |
| le script d'enfilage ne rend plus la longueur | le texte des deux scripts |
| un entier nu est lu comme une longueur | l'entier NU (behavioral) **et** le lecteur (unitaire) |
| l'enfilage mémoire ne nomme plus | enfilage MÉMOIRE |
| la remise Redis ne nomme plus | remise REDIS |

Le témoin de l'entier nu ne pouvait d'abord **pas tomber** : il n'exerçait que
`1`, qui est sous tous les plafonds. Il porte désormais aussi
`DELIVERY_QUEUE_MAX_PER_USER + 1` — la valeur confusable, la seule qui fasse la
différence entre « lu comme un code » et « lu comme une longueur ».

---

## Preuve

- `src/__tests__/unit/services/deliveryQueueBoundEviction.test.ts` : 14 témoins
  verts, 5 prouvés rouges avant implémentation, 6 mutations rouges après ;
- suites voisines de la file (`RedisDeliveryQueue`, purge, les trois `atRest`,
  la marque personnelle) : **141 verts** ;
- `src/services`, `src/socketio`, `src/__tests__/unit/{services,socketio}` +
  cliquet de budget des témoins : **21 206 verts**, 1 316 suites ;
- `tsc --noEmit` EXIT=0 (lu comme code de sortie, jamais à travers un pipe).

**16 échecs PRÉEXISTANTS, hors périmètre** : les suites HEIC / AVIF / HDR
(`ExifStrip`, `avif-variants`, `heif-upload-conversion`, `UploadProcessor.heif`).
Vérifié par `git stash` : elles échouent à l'identique sans ce lot — le conteneur
n'a pas le support codec de `sharp`. Ce n'est pas une régression, et ce n'est pas
une excuse : c'est une mesure, faite parce qu'un échec non attribué se raconte
toujours en faveur de celui qui le rapporte.

---

## Suivis

- **#18731 reste ouvert, et il est désormais instruisable.** La trace de ce lot
  est la donnée qui manquait pour arbitrer ses trois pistes : la première coûte
  une requête sur le chemin de reconnexion, et on sait maintenant comment compter
  ce qu'elle achèterait.
- **Aucune agrégation.** La trace est un `warn` structuré (`scope`, `slice`,
  `userId`, `destroyed`, `cap`). Un compteur exige un collecteur ; c'est un autre
  lot, qui n'a de sens qu'avec lui.
- **La valeur 500 n'est pas touchée** (ni la politique d'éviction) : l'issue ne
  le demande pas, et personne n'a encore la mesure qui le permettrait.
