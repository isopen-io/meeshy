## 2026-08-08 (10) — Un ÉNUMÉRATEUR d'audience ne répond pas à la question qu'un test d'ADMISSION pose

**Contexte** — Cycle 28. Les deux lots de notification de mention poussaient un extrait du contenu
à tout utilisateur nommé, sans regarder la visibilité du post. Toutes leurs voisines filtraient
déjà (`createStoryCommentNotificationsBatch`, `createFriendContentNotificationsBatch`,
`getVisibilityFilteredRecipients`, `resolveBroadcastRecipients`) — la leçon « un contrôle unanime
chez tous les voisins rend son absence invisible chez le dernier » (2026-08-08 (3)) s'applique
telle quelle, et c'est bien elle qui a fait trouver le trou.

**Ce que celle-ci ajoute** — le réflexe naturel, une fois le trou vu, est de RÉUTILISER la garde du
voisin. Ç'aurait été faux ici, et faux d'une manière qui ne se voit pas en lisant le code appelé.

Les gardes existantes sont des **énumérateurs** : « auteur → à qui pousser ? », par dépliage de son
graphe. Une mention pose la question **inverse** : l'ensemble à juger est ARBITRAIRE (n'importe
quel `@handle` du texte, ami ou non), donc il faut un test d'**admission**, « celui-là a-t-il le
droit ? ». Les deux se ressemblent — même table `visibility`, mêmes six modes — et diffèrent
exactement là où ça compte : pour `PUBLIC`, un énumérateur rend `friendIds`, parce qu'on ne pousse
une publication qu'aux contacts. C'est un choix de **ciblage**, pas une règle de droit — un post
public se LIT par n'importe qui. Réutiliser cette réponse aurait privé de sa notification un
inconnu légitimement nommé dans un post public : le cas le PLUS courant, cassé par un correctif de
sécurité, sans qu'aucun test existant ne le signale.

**Règle** — Avant de réutiliser une garde voisine, identifier la QUESTION qu'elle répond, pas la
table qu'elle consulte. « Qui sont mes destinataires ? » et « celui-ci a-t-il le droit ? » se
partagent les données et divergent sur les cas permissifs. Deux indices qu'on est en face d'un
énumérateur et non d'un test d'admission : il ne prend pas l'utilisateur à juger en paramètre, et
son cas le plus ouvert rend quand même une liste FINIE.

**Corollaire — une garde optionnelle-avec-défaut-permissif n'est pas une garde.** Le voisin le plus
proche prenait `visibility?` avec défaut `PUBLIC` : l'oublier rouvre le trou en silence, et rien ne
le signale. Rendre le paramètre REQUIS déplace la faute au build et la rend impossible à commettre.
Le prix est visible et se paie une fois (9 harnais ont dû déclarer leur audience) ; le prix de
l'optionnel est invisible et se paie à chaque nouvel appelant.

**Corollaire — séparer le FAIT de la LIVRAISON avant de choisir ce qu'on filtre.** La tentation était
de filtrer aussi les lignes `PostMention`. Mais une ligne consigne un fait sur le texte (« ce post
nomme Carol »), vrai quelle que soit l'audience, et elle ne se reconstruit pas — personne ne relit
le texte après coup. La notification, elle, est une livraison à quelqu'un. Conditionner le fait sur
l'audience du moment aurait perdu la mention dès que l'auteur élargit sa visibilité. Vérifier
plutôt que le CONSOMMATEUR du fait filtre déjà (ici `getMentionsByPost` ne classe que des candidats
sortis d'un feed déjà filtré) : c'est ce qui permet de restreindre le correctif à la livraison.
