## Leçon 153 — Une fiche d'audit qui prescrit un SAC D'OPTIONS a déjà oublié une des options

Cycle 116 (`gwcontract-05`, `notification:read-bulk`).

La fiche prescrivait un payload `{ conversationId?, postId?, types?, all? }`. Le code réel marque en
masse sur **trois** clés de contexte — `conversationId`, `postId`, **`friendRequestId`**. La
troisième n'est pas dans le sac. Un client écrit d'après la fiche aurait ignoré ce scope **en
silence** : `data.conversationId` absent, `data.postId` absent, `data.types` absent → aucune branche,
aucun avertissement, et « X vous a envoyé une demande d'amitié » restant non lue sur les autres
appareils après y avoir répondu. Exactement le défaut que l'événement était censé fermer, rouvert par
la forme de son propre payload.

**Le symptôme à reconnaître** : un payload dont toutes les clés sont optionnelles. Sa cardinalité
réelle n'est écrite NULLE PART — ni dans le type, ni dans le code client, qui se contente de tester
les clés qu'il connaît. Rien ne peut donc signaler qu'il en manque une : ni le compilateur, ni un
test (on ne teste pas la branche qu'on n'a pas écrite), ni une relecture (le sac a l'air complet, il
a l'air complet quel que soit son contenu). Le sac admet en prime deux états absurdes que personne
n'a voulus : `{}` — « rien » ou « tout » ? — et `{all:true, conversationId:'x'}`.

**Le remède est une union discriminée, et le bénéfice n'est pas le typage : c'est que l'énumération
des cas devient une PHRASE que quelqu'un doit écrire.** `{kind:'context', contextKey, contextValue}`
oblige à répondre « quelles clés ? » une fois, à un endroit, et le `contextKey` transporté est
littéralement celui que la requête serveur interpole — les deux dérivent du même couple, un client ne
peut plus rejouer un prédicat que la base n'a pas appliqué. Corollaire de méthode : **avant d'écrire
le payload dicté par une fiche, énumérer sur le CODE les valeurs qu'il devra porter.** Ici, un grep
de trois secondes sur les appelants de `markContextNotificationsAsRead` rendait la troisième clé.
Quatrième fois qu'une fiche se trompe sur un mécanisme qu'elle décrit (cf. leçon 152 et ses
corollaires) — la fiche dit QUOI fermer, jamais COMMENT, et son « comment » se vérifie sur le code.

**Corollaire — un champ « pratique » dans un payload est une invitation à un bug qu'on a déjà
prévu.** La même fiche avertissait, deux étapes plus loin, du risque de double-décrément sur
l'appareil acteur. Mettre un `count` dans l'événement — évident, informatif, gratuit — c'était offrir
au client le décrément exact qu'il ne doit pas faire : son cache est PARTIEL, il matche moins de
lignes que le serveur n'en a marquées. Le champ est omis, et le compteur reste tenu par l'événement
absolu émis juste après. **Ne pas fournir la donnée est la seule garde qu'aucun appelant futur ne
peut contourner par distraction.**

---
