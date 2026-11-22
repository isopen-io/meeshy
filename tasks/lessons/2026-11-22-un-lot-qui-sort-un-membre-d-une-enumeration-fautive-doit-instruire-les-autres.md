# Un lot qui sort UN membre d'une énumération fautive doit instruire les AUTRES membres de la même phrase

Mesuré le 2026-11-22 (#20421, cycle 219 de la routine « amélioration continue du
temps réel »). Quatrième exemplaire en trois cycles d'une forme que deux lots
précédents avaient déjà nommée — et c'est **ce qui rend la leçon utile** : la
forme était connue, écrite, et commentée sur place.

## Ce qui s'est passé

Un témoin du web gelait DEUX exclusions dans une seule phrase, sous une seule
raison :

> « la case d'une conversation et une fenêtre ancrée ne sont pas touchées » —
> parce que « ni l'une ni l'autre n'est nourrie par `message:new` ».

Un premier lot (#18573) a instruit un TROISIÈME membre de cette même phrase (la
cloche), a mesuré que sa raison était fausse pour lui, l'a sorti, et a **écrit
au-dessus des deux restants** :

> « l'assertion gelait une lacune sous les apparences d'une décision ».

**Les deux autres membres sont restés sous la raison que ce commentaire venait
de déclarer insuffisante.** Et l'un des deux — la fiche d'une conversation —
avait exactement le même défaut : `message:new` ne la nourrit pas, mais **huit**
écrivains temps réel le font, dont le régime de chiffrement de bout en bout. Une
conversation passée en E2EE pendant la fenêtre laissait le client envoyer en
clair, ce que la passerelle refuse.

Le troisième membre, lui, était légitime : sa raison porte sur le PASSÉ, que
l'intervalle ne peut pas avoir modifié. **Un sur trois.**

## La règle

Quand un lot retire un membre d'une énumération parce que sa raison partagée est
fausse pour lui, **cette même raison devient suspecte pour tous les autres
membres**, et chacun se réinstruit séparément. Le lot qui ne le fait pas laisse
derrière lui des exclusions dont la justification a été publiquement démentie —
et le commentaire qui raconte la faute passée les rend **plus** crédibles, pas
moins : on lit « ceci a été instruit » là où il faut lire « ceci n'a pas été
regardé ».

À la fin d'un tel lot, se poser la question à voix haute :

> *Cette raison que je viens de déclarer insuffisante, qui d'autre vit dessous ?*

Et la réponse se cherche dans la PHRASE, pas dans le fichier : une énumération
fautive tient dans une liste, un `||`, un tableau de `test.each`, une
disjonction de prédicat. Elle ne se trouve pas par un mot-clé — par construction,
les autres membres ne portent aucune marque de leur problème.

## Le corollaire de forme : séparer les témoins

La réparation n'est pas d'élargir la raison pour qu'elle couvre les survivants.
C'est de **scinder** : un témoin par membre, chacun avec SA raison. Tant que
trois exclusions partagent une phrase, la prochaine personne qui en instruit une
héritera du même angle mort — et le dépôt a déjà payé trois fois pour le
vérifier.

## Famille

Même racine que la leçon 261 (« une énumération porte deux affirmations, et
c'est la seconde — *ce sont les seuls* — qui n'est presque jamais vérifiée »),
vue par l'autre bout : ici la seconde affirmation est *« et cette raison vaut
pour tous »*.

Voisines : `tasks/lessons/une-garde-de-source-qui-rougit-sur-son-cas-nominal-n-apprend-plus-rien.md`,
`tasks/lessons/une-enumeration-corrigee-reste-une-enumeration.md` (#18602 —
corriger une énumération ne lui donne aucun moyen de rester vraie).

## Preuve

#20421, PR #20424. Le témoin scindé en trois, chacun avec sa raison ; le ROUGE
prouvé par mutation pour chacun (l'ancienne portée fait tomber les deux témoins
de la fiche, et eux seuls — celui de la fenêtre ancrée reste vert, ce qui est la
mesure que son exclusion était la bonne).
