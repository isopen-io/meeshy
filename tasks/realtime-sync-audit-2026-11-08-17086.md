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
| room personnelle de l'expéditeur | **la promotion de sa bulle optimiste** — sa charge est la SEULE à porter `clientMessageId` |
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
