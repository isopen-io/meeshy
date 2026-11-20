## 2026-11-20 — Une clé d'idempotence appartient à son AUTEUR, et l'espace que l'index garde n'est pas celui où le client la tire (routine messagerie, cycle 189, #19960)

*2026-11-20, cycle 189, #19960.*

### La forme

Un client tire une clé d'idempotence dans **son** espace (`cid_<uuid v4>`, par
appareil). La base garde l'unicité sur un **autre** espace — ici
`(conversationId, clientMessageId)`, partagé par tous les participants. Tant
que personne ne les confronte, les deux passent pour le même.

Ils ne le sont pas, et l'écart se paie au moment où quelque chose APPARIE :

> un rejeu est un rejeu de **son auteur**. Une ligne qui porte la clé sous un
> autre expéditeur n'est pas un doublon — c'est une collision dans l'espace
> partagé, et la servir **détruit** le message de l'appelant en lui répondant
> « envoyé ».

### La question à poser

Devant toute clé d'idempotence, de déduplication ou de réconciliation :

1. **Dans quel espace le client la TIRE-t-il ?** (par appareil ? par compte ?)
2. **Sur quel espace la base garde-t-elle l'UNICITÉ ?**
3. S'ils diffèrent, **tout `where` qui l'apparie porte le discriminant
   manquant** — et le chemin d'échec sépare « un autre la tient » (nommable,
   définitif) d'une course (l'erreur d'origine remonte).

La troisième n'est pas une précaution : une condition suffisante pour **LIRE**
ne l'est jamais pour **ÉCRIRE** (leçon du cycle 187, qui l'a payée), et la même
ligne de `where` porte les deux.

### Le corollaire de SERVICE, qui est l'autre moitié

Un identifiant exposé n'est pas une fuite tant que personne ne s'en sert comme
d'une clé. **C'est un piège armé** — et la personne qui marche dessus est celle
qui écrira la prochaine porte qui l'apparie. Le dépôt en a la preuve : le lot du
cycle 187 a été retiré pour avoir posé exactement cette porte.

Donc, dans le même lot : **qui SERT cette clé, et à qui ?** Ici, le chemin
socket la retirait des pairs depuis #16689, avec sa raison écrite ; les deux
surfaces au repos la servaient à tout le monde, chacune sous un commentaire
juste — « réconcilier une bulle optimiste au chargement à froid » — et vrai de
SES propres bulles seulement.

> **Une raison écrite ne documente que l'exemplaire qu'elle touche**, et une
> raison qui dit vrai d'un cas se relit comme vraie de tous.

### Ce qui a failli manquer deux sites sur cinq

L'issue en énumérait deux ; le dépôt en portait cinq. Les trois autres se
trouvent en cessant de chercher par le NOM de la famille (« les chemins de
dédoublonnage ») et en cherchant par le GESTE :

- tout `where` qui cite la clé — `grep clientMessageId | grep where` ;
- tout `select` qui la CHARGE pour la servir — `grep 'clientMessageId: true'`.

Le second a rendu le delta `/sync`, qui n'avait **aucun commentaire et aucun
champ nommé** : la clé partait sur le fil par un `...message`, c'est-à-dire
parce que rien ne la retenait. Un site qui ne DIT rien n'apparaît dans aucune
recherche par intention.

**Et ce qui en garde la complétude est un balayage, pas une liste** : les deux
`grep` ci-dessus sont en cliquet, à inventaire vide, avec l'exemption des clés
dérivées côté serveur reconnue par son PRODUCTEUR — jamais par son fichier, un
site neuf du même fichier n'ayant aucune raison d'hériter d'une exemption.

### Et la mesure qui remet le défaut à sa place

Tous les clients tirent un UUID v4 : la collision ACCIDENTELLE est hors de
portée. Ce lot ne répare donc pas une panne observée — il désarme un piège, et
la distinction se dit à voix haute. Annoncer une panne qu'on n'a pas mesurée
coûte la confiance dans les cycles où il y en a une.

### Le cliquet qu'on écrit pour garder une propriété garde ce qu'il SAIT LIRE

Ce lot a posé un balayage pour garder la seconde affirmation d'une énumération
(« ce sont les sites où la règle s'applique »). Il filtrait **ligne par
ligne** : `grep clientMessageId | includes('where')`. Un `where:` écrit sur
plusieurs lignes met les deux mots sur deux lignes, et **aucune ne passe le
filtre** — une forme que le dépôt portait déjà. Un appariement de production
sans auteur, déposé sous ses yeux, le laissait VERT.

> **Un balayage qui mesure la popularité d'un IDIOME ne mesure pas une
> PROPRIÉTÉ.** Le prouver demande la sonde NÉGATIVE : déposer le défaut que le
> cliquet prétend attraper, et le voir tomber en le nommant. Sans cette
> mesure, un cliquet vert n'atteste que de lui-même — et il ment plus
> longtemps qu'un journal, parce qu'on cesse de regarder derrière.

### Un code d'erreur est une AFFIRMATION

Le même lot a servi un refus dont le texte dit « déjà pris par un **autre
expéditeur** » sur la foi d'une lecture en `select: { id: true }` — qui établit
« quelqu'un tient la clé », jamais « quelqu'un d'AUTRE ». L'écart est
atteignable par un appelant honnête : un secondaire en retard rend `null` pour
une ligne vivante, et le refus aurait alors dit à l'auteur que SA clé est prise
par autrui, **en lui prescrivant d'en tirer une neuve — donc en dupliquant son
message**.

> Un `code` se vérifie contre ce que la lecture a ÉTABLI, jamais contre ce
> qu'on s'attend à trouver là. Même famille que le tri, le compte et la
> contrainte écrite en commentaire : ce qui a la forme d'un constat et n'a pas
> été mesuré.

Et le remède d'un refus compte autant que le refus : **avant de prescrire une
conduite à l'appelant, mesurer ce que la conduite coûte s'il la suit sur un
verdict faux.**

### Mesurer ce que les CLIENTS font du statut qu'on invente

Le `409` neuf de ce lot n'atteint aucun lecteur : iOS l'exclut délibérément de
ses refus définitifs (« un conflit sur un clientMessageId dédoublonné peut
vouloir dire *déjà livré* »), Android le range en transitoire, le web jette la
bulle sans recours. La justification écrite — « sinon l'invité rejouerait
indéfiniment » — était donc **fausse à la mesure** : les deux clients natifs
traitent `409` et `500` à l'identique.

> Donner un sens NEUF à un statut dont la signification côté client est déjà
> FIGÉE n'est pas gratuit, et la question se pose dans le même lot : *qui lit
> ce code, et qu'en fait-il aujourd'hui ?* C'est la forme « qui AFFICHE ce que
> ton résolveur élit » (cycle 122) portée d'un texte à un code d'erreur.
