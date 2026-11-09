## 2026-11-09 — Une affirmation d'UNICITÉ se garde par un balayage, jamais par une phrase : « X est l'unique producteur du dépôt » était faux le jour où je l'ai écrit, dans trois doc-comments et un journal à la fois (#17177)

Mon second verrou compare une clé servie à une constante, et je l'ai argumenté
sûr par une phrase : *« `protectedPreview` est l'unique producteur de
`notificationLocKey` dans tout le dépôt, donc sa valeur est une DÉCLARATION,
jamais un indice. »*

Elle était fausse à l'instant où je l'ai écrite. `messageMentions.ts` compose un
second masque, avec le littéral écrit à la main — **dans le fichier même qui
gouverne le chemin d'édition**, celui dont mon lot disait par ailleurs qu'il est
le plus pauvre. Un `grep` de quatre secondes le montrait ; je ne l'ai pas lancé,
parce que la phrase venait d'un doc-comment EXISTANT (celui du cycle 125) que
j'ai recopié en élargissant sa portée de « cette clé » à « tout le dépôt ».

Deux hasards l'ont sauvée : ce littéral n'atteint pas le verrou (le chemin
d'édition ne transmet pas la clé), et sa valeur est de toute façon une clé
CONNUE et retenante. Le correctif évident du premier point la routerait dans le
verrou, où une divergence d'un caractère la rendrait INCONNUE — direction sûre
pour le secret, mais le placeholder du client perdrait sa localisation, **sans
qu'aucun témoin ne rougisse.**

> Une affirmation d'unicité est la plus chère des affirmations de code : elle
> autorise à ne pas chercher. Et c'est précisément le genre d'énoncé qu'un lot
> RECOPIE en l'élargissant — « unique producteur de ce champ » devient « unique
> producteur du dépôt » sans que personne relance la mesure. **Quand on
> s'appuie sur une unicité, on l'outille dans le même lot** : c'est un balayage
> d'une vingtaine de lignes, et il tourne à chaque suite.

Ce qui remplace la phrase, et qui est vrai *et* vérifiable : **les quatre clés
ont un site de DÉFINITION unique, et tout producteur les en importe.** Le
nombre de producteurs n'a jamais été ce qui tenait la garde.

Cliquet : `services/gateway/src/__tests__/protection-loc-key-literal-sweep.test.ts`
— inventaire VIDE, qui prouve d'abord qu'il lit le fichier dont il exempte le
contenu (une garde négative dont le balayage rend `[]` reste verte), et qui
tombe quand on remet le littéral retiré.
