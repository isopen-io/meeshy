# #17086 — le chemin NOMINAL de `message:new` : quatre audiences, un seul enrobage

**2026-11-08** · lot K · branche `claude/exciting-planck-qj0mxr`

Journal nommé par son ISSUE et non par un numéro de cycle : trois sessions
écrivaient des lots de temps réel le même jour, et le compteur de cycle est un
espace de noms partagé que personne n'alloue (#5102). Un identifiant qui ne
s'alloue pas ne collisionne pas.

## 1. La prémisse, instruite AVANT d'implémenter

L'issue le demandait explicitement : son constat repose sur l'hypothèse qu'un
défaut d'encodeur ou d'adaptateur peut échouer **par charge** et non
globalement, et « c'est elle qui décide si l'issue vaut son code ». Mesuré sur
le paquet installé :

```
socket.io 4.8.4
room   <- BigInt => THROW TypeError: Do not know how to serialize a BigInt
sender <- sain   => OK
room   <- cycle  => THROW RangeError: Maximum call stack size exceeded
hidden <- sain   => OK
```

**L'hypothèse est vraie, et la mesure la CORRIGE sur une moitié.** `emit` lève
synchronement et par CHARGE — l'émission suivante d'une charge saine vers une
autre room passe. Mais ce n'est pas « l'adaptateur ou l'encodeur » : c'est
l'ENCODEUR seul. L'adaptateur Redis tire ses commandes sans `await` et les
observe (`redis-adapter.ts`, #11468) — une panne Redis arrive en rejet de
promesse journalisé, jamais en `throw` depuis `emit`.

Les quatre audiences de ce chemin portent des charges DIFFÉRENTES
(`senderPayload` seule porte `clientMessageId`, chaque masqué a sa variante,
chaque groupe de langue sa copie élaguée). L'échec par charge n'est donc pas
une hypothèse de confort : c'est le cas nominal d'un encodeur en défaut.

> Une prémisse instruite peut être vraie et mal attribuée. La conclusion
> complète n'est pas « l'issue tient » mais « l'issue tient, ET voilà lequel de
> ses deux mécanismes la porte » — parce que le second (l'adaptateur) aurait
> fait chercher la panne dans Redis, où elle n'arrive pas.

## 2. Ce qui était perdu

Le régime de ROOM — `readerSigned === null`, la quasi-totalité des messages —
portait quatre émissions indépendantes sous l'unique `safeBroadcast` de
`emitMessageNewBestEffort`. Avec un adaptateur qui ne lève que sur
`conversation:<id>`, l'auditeur avait mesuré `servis = []`.

| audience | ce que sa perte coûte |
|---|---|
| room de conversation, sauf l'expéditeur | le message, pour les présents |
| room personnelle de l'expéditeur | la promotion de la bulle optimiste sur ses AUTRES appareils, et sur la voie REST |
| boucle sur `hiddenKeys` | **tout** : un masqué n'a QUE sa room personnelle, la diffusion de room l'exclut par construction (#8562), et la file hors ligne saute les CONNECTÉS |
| `_emitMessageNewByLanguage` | la diffusion inter-nœuds **et** tous les groupes de langue |

## 3. Le correctif, et ce qu'il a obligé à extraire

**K1 — `messageNewEmission.ts`** : un enrobage par AUDIENCE, label nommant
l'étape et la room. `payloadForKey` est DANS la fermeture, pour la raison que
le second passage de l'audit avait exigée sur le chemin par lecteur : la
variante d'un masqué se CALCULE, et un calcul qui lève pour un lecteur privait
tous les suivants.

**K2 — `messageNewByLanguage.ts`, module NEUF.** L'émission par langue vivait
DEUX fois, et les deux copies avaient déjà divergé : la jumelle REST/ZMQ
ignorait `excludeSocketId` — donc ne savait pas exclure un expéditeur ANONYME
de son propre élagage — et prenait `Record<string, any>`, c'est-à-dire aucune
charge gouvernée. La version retenue est la plus riche ; l'appelant REST/ZMQ ne
perd rien et gagne les deux.

Ce n'était pas un choix d'élégance : **les deux porteurs sont hors budget**
(`MessageHandler.ts` 2256/2269, `MeeshySocketIOManager.ts` 3708/3816), et
« ajouter à un fichier déjà hors budget est interdit ». L'enrobage par étape
AJOUTE des lignes. La seule porte ouverte était l'extraction — et elle rend
46 lignes à l'un, 44 à l'autre.

> Un cliquet de budget avait déjà posé cette question au cycle 147 (« ton lot
> est-il à sa PLACE ? »). Ici il la pose en AMONT : il a interdit la forme
> paresseuse du correctif avant qu'elle soit écrite, et la forme qu'il laissait
> est celle qui solde une jumelle divergente.

## 4. Les témoins

Le double lève **par ROOM**, jamais sur tout : un double qui lève partout ne
prouverait que la survie à un harnais mort (patron
`message-new-producer-parity.test.ts`).

RED mesuré sur l'arbre d'avant : **7 témoins tombent, 1 passe** — et celui qui
passe est le cas NOMINAL, exactement comme l'issue l'annonçait (« le cas
nominal ne peut pas distinguer les deux granularités »). C'est la forme d'un
lot de granularité : le témoin qui ne tombe pas est celui qui prouve qu'on n'a
rien changé pour les 99,99 % des messages.

Un témoin de plus, et il garde une propriété que l'issue ne demandait pas : la
panne est **NOMMÉE à l'appelant, une fois par audience perdue**. Sans
`onEmissionError` descendu dans l'unité, l'enrobage par étape aurait rendu
muet, chez l'appelant qui journalise, tout ce que l'enrobage unique lui disait.
Une granularité qui gagne en remise et perd en observabilité n'est pas un gain.

## 5. Ce que le lot ne fait pas

`SOCKET_LANG_FILTER` est OFF par défaut : K2 est, aujourd'hui, un correctif sur
un chemin dormant. Il est fait dans le même geste **pour ne pas laisser une
moitié**, et parce que l'extraction était de toute façon la condition de K1.
Dire qu'il corrige une panne vécue serait faux — c'est un piège armé, et la
distinction se mesure, elle ne se suppose pas.

## 6. Ce que l'audit adversarial a cassé — et il a cassé la moitié dont je me félicitais

Verdict : **non bloquant sur la moitié qui REMET, bloquant sur la moitié que le
lot déclarait livrer en plus.** La granularité de remise a été prouvée par
COMPTAGE (quatre sockets locaux dont deux appareils de l'expéditeur, un
destinataire sur un autre nœud, un appareil distant de l'expéditeur : exactement
un `message:new` chacun, la bonne charge, les locaux élagués, le distant
entier). L'extraction a été confrontée ligne à ligne aux deux anciens corps :
composition et ORDRE d'`exceptForRemote`, retour anticipé, repli `|| 'fr'`,
passage d'`excludeSocketIds`, chaînage `.to(sid)` — identiques.

**Ce qui ne marchait pas, et c'est exactement ce que le §4 ci-dessus
revendiquait** :

`safeBroadcast(label, emit, onError)` faisait `if (onError) onError(error); else
logger.error(\`[broadcast] ${label}\`, error)`. **Le label n'atteignait jamais
l'appelant.** Les deux appelants de production passent un `onError` : mes onze
étiquettes étaient donc mortes en production, et quatre audiences perdues
rendaient quatre journaux IDENTIQUES et anonymes — un opérateur ne pouvait pas
distinguer « un masqué perdu » de « personne n'a rien reçu ».

Pire : le chemin PAR LECTEUR (#17026) passait `safeBroadcast(label, fn)` SANS
`onError`, donc tombait dans le `else` et publiait `[broadcast] message:new
(per reader user:<id>)`. **Lui donner un `onError` a supprimé la seule
information que ce chemin publiait.** Le lot qui prétendait ne rien perdre en
observabilité faisait régresser le lot d'avant.

Et les deux témoins qui gardaient cette propriété **ne pouvaient pas tomber** :
leur TITRE disait « NOMMÉE … avec sa room », leur assertion était
`toHaveBeenCalledTimes(2)`. Mesuré par mutation : remplacer les onze étiquettes
par la constante `'MUTANT'` laissait **46/46 témoins verts**. Et la ligne que ce
lot AJOUTAIT à `emitPerReader` (`input.onEmissionError`) n'était couverte par
rien — la retirer laissait **1072/1072 verts sur 29 suites**.

> **« NOMMÉE » est un mot jusqu'à ce qu'une assertion porte sur l'ARGUMENT.**
> Un témoin dont le titre énonce la propriété et dont l'assertion compte les
> appels est la forme la plus crédible d'un témoin qui n'atteste rien : le titre
> fait le travail de conviction, et personne ne relit l'assertion. C'est la
> famille « un commentaire qui ÉNONCE une contrainte est une AFFIRMATION »
> (cycle 94), appliquée à l'intitulé d'un `it(...)`.

Réparé, et les deux mutations tombent maintenant : `'MUTANT'` fait tomber 4
témoins, et retirer `input.onEmissionError` d'`emitPerReader` en fait tomber 1.
`safeBroadcast` remet le label en SECOND argument — élargir un callback est sans
risque pour ses ~24 appelants, une fonction à un paramètre acceptant d'être
appelée avec deux.

Trois autres constats réparés dans le même geste :

- **le chemin par langue était devenu muet pour le site qui tient le
  `messageId`** : chaque délégation posait SON `onEmissionError`, qui ne connaît
  que la `room`. Un seul rapporteur désormais, celui de l'appelant, pour les deux
  chemins ;
- **deux `payload as never`** — dont un parfaitement inutile (`SocketIOMessage`
  EST `ServerEventPayload<'message:new'>`) et l'autre évitable. Mesuré : les deux
  compilent sans cast. Un `as never` n'affaiblit pas un contrat, il l'ANNULE, et
  aucun balayage du dépôt ne connaît cette forme — le lot avait fermé la porte en
  remplaçant `Record<string, any>` par un contrat dérivé, puis l'avait rouverte
  deux lignes plus bas ;
- **un témoin qui gelait une verrue** (`except: ['s1','s2','s1']`) assert
  désormais l'INTENTION, pour ne pas tomber le jour où quelqu'un dédoublonne.

Et deux dits plutôt que corrigés, parce que les corriger n'appartient pas à ce
module : la garde de groupe vide est inatteignable (propriété du GROUPEUR, pas
de ce site) et `measureFilterGain` ne peut pas surseoir à son calcul faute
d'`isLevelEnabled` sur le logger enfant.

> **Ce que l'audit a mesuré de plus utile n'est pas un défaut, c'est une
> asymétrie de confiance.** La moitié difficile — quatre audiences disjointes,
> fidélité d'une extraction entre deux jumelles divergentes — était juste. La
> moitié facile, celle ajoutée « en plus » et dont le journal se félicitait,
> était fausse de bout en bout : une étiquette jetée, une régression, deux
> témoins inertes. **Le code qu'on écrit en bonus n'est pas relu comme le code
> qu'on écrit sous contrainte.**
