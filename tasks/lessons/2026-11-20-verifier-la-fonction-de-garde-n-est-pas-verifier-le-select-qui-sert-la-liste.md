## Vérifier la FONCTION de garde n'est pas vérifier le `select` qui SERT la liste — et derrière une égalité exacte, l'écart devient une panne (2026-11-20, cycle 194, #20091, #20093)

### Le fait

J'ai resserré `E2EEEnvelopeRelay.directoryOf` — l'annuaire des appareils qui
reçoivent l'enveloppe chiffrée — de `isActive` nu vers la participation
VIVANTE. C'est une AUDIENCE, la loi #16690 s'y applique, le témoin tombait sous
la mutation inverse (9 sur 11), `tsc` était vert. Le doc-comment affirmait,
pour justifier que le resserrement FASSE CONVERGER les deux côtés : « le client
compose son envoi depuis la participation que les portes lui servent, et toutes
ces portes épellent `PARTICIPATION_VIVANTE` ».

**L'audit adversarial a mesuré la phrase. Elle est fausse.** Les quatre lectures
qui décident ce que le client adresse sont toutes en `isActive` NU :
`conversationDetailInclude.participants`, le `select` de la liste de
conversations, `GET …/participants`, et `mayReadKeysOf` — qui autorise la
lecture des clés de l'appareil visé.

J'avais vérifié `access-control.ts`, c'est-à-dire la FONCTION qui garde l'entrée.
Je n'ai pas ouvert le `select` qui SERT la liste.

### La règle

> Le dépôt écrit déjà « **CHARGER n'est pas SERVIR**, et un témoin de `select`
> n'atteste pas la réponse » (cycle 83). Voici sa troisième face : **GARDER
> n'est pas SERVIR.** La fonction d'admission et la projection qui sert la liste
> sont deux sites, et rien ne les tient ensemble. Lire la première et conclure
> sur la seconde est exactement l'erreur que la règle du cycle 84 décrit, dans
> l'autre sens.

La question à poser avant de resserrer une audience n'est donc pas « quelle est
la loi de ce domaine ? » mais **« qui compose la liste d'en face, et sous quelle
clause ? »** — et elle se répond en ouvrant le `select`, jamais la fonction de
garde qui porte le nom le plus rassurant.

### Pourquoi l'erreur a coûté plus qu'un cran de dégradation

`compareDeviceSets` exige une correspondance **EXACTE**. Resserrer un côté ne
rétrécit donc pas l'audience : il fait DIVERGER les deux, et la divergence sort
en `409 DEVICES_MISMATCH` sur **chaque** envoi — que la boucle de résolution
Sesame du client ne répare pas, puisqu'elle rescelle depuis la même liste
servie.

Et l'E2EE est réservé aux PAIRES. Dans une paire, **le banni-mais-actif EST le
seul pair** : ce que le resserrement « protégeait » était la remise du chiffré à
la seule personne à qui le message était destiné, et ce qu'il coûtait était
l'impossibilité DÉFINITIVE d'écrire, dans une conversation que rien ne ramène en
clair (#12949), derrière une étiquette qui dit « Chiffrement indisponible » et
invite à réessayer sans fin.

> **Une audience trop large derrière une égalité exacte devient une panne ou une
> fuite — et il faut mesurer LAQUELLE, et QUI PAIE, avant de choisir son bord.**
> J'avais écrit cette phrase dans la leçon du même cycle, en la croyant un
> argument POUR le resserrement. Elle était l'argument contre : la fuite n'avait
> aucun tiers, la panne frappait le membre légitime.

### Ce qui aurait dû m'alerter, et que j'avais sous les yeux

Mon propre inventaire rangeait `participants-reads.ts#0` — l'une des lectures
nues qui servent la liste — en dette mesurée, dans le même lot où j'affirmais
que « les portes épellent la loi ». **Le lot se contredisait dans deux de ses
fichiers**, et aucun témoin ne confronte une entrée d'inventaire à une phrase de
doc-comment.

> Quand un lot pose un inventaire de dette ET une affirmation d'absolu, relire
> l'inventaire CONTRE l'affirmation : la dette est la liste des contre-exemples
> qu'on vient d'écrire soi-même.

### Ce qui reste du lot, et comment on le rend sûr

La clause est redevenue nue, avec la mesure écrite en entier sur le site, et un
témoin GÈLE le comportement large — un piège armé qui tombera le jour où
quelqu'un resserre cette clause seule. Le resserrement juste est un lot de
convergence (#20093) : les quatre lectures ensemble, puis un refus NOMMÉ que le
client sait rediriger.

Et une mesure manque, en lecture seule, qui déciderait les deux moitiés du
dossier : **combien de lignes `isActive: true, bannedAt ≠ null` existent en
production ?** Si l'état n'existe pas, le resserrement ne corrigeait rien ; s'il
existe, il aurait briqué ces conversations. Un lot ne peut pas tenir les deux
affirmations à la fois — et c'est le genre de question qu'on pose AVANT d'écrire
le correctif, pas après l'audit.
