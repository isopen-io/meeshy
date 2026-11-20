## Une règle écrite au bon endroit ne documente que la branche qui la porte (cycle 187, #19917)

*2026-11-20. Le dépôt avait la règle, le raisonnement complet, et la bonne
décision — à vingt lignes du défaut, dans le même `try/catch`.*

**Le fait.** `MessageProcessor.handleAttachments` a deux branches. La COPIE
(`copyAttachmentsFromMessageId`) est **volontairement hors** du `try/catch`
englobant, et son commentaire énonce exactement pourquoi :

> « Laisser l'erreur remonter sans nettoyer laisserait une bulle orpheline
> […] **qu'un rejeu au même `clientMessageId` rendrait ensuite `success: true`
> en dédup** […]. Supprimer la ligne avant de propager l'erreur fait échouer
> l'envoi ET libère le `clientMessageId`. »

La branche voisine — la liaison des pièces **pré-téléversées**, qui est le
chemin NOMINAL de tout envoi avec média — vit sous ce `catch` et n'a jamais
reçu le raisonnement. Le symptôme prédit par le commentaire est donc arrivé,
mot pour mot, sur l'autre branche.

> **Un commentaire ne documente que l'exemplaire qu'il touche** — c'est déjà
> dans `CLAUDE.md` pour deux FICHIERS jumeaux. La forme coûteuse est plus
> proche que ça : **deux BRANCHES de la même fonction, sous le même `try`.**
> Rien n'est plus facile à lire comme « c'est traité » qu'une raison écrite à
> vingt lignes, dans le bloc où l'on travaille.

La question qui l'attrape se pose en lisant un `catch` : *de quoi cette portée
a-t-elle grandi depuis que son étiquette a été écrite, et la raison voisine
vaut-elle pour ce que j'y ai ajouté ?* C'est la leçon « une étiquette de
`catch` ne qualifie que ce que son auteur avait en tête » (cycle 116) prise par
l'autre bout : là, c'est la portée qui avait grandi ; ici, c'est l'exemption
qui n'a pas suivi.

### Le corollaire qui décide du PÉRIMÈTRE du lot

Aligner les deux branches aurait été le geste naturel. Il est FAUX, et la
mesure le dit : elles ne lèvent pas pour les mêmes raisons.

| ce qui lève | supprimer la ligne et propager est |
|---|---|
| la LIAISON elle-même | juste — rien n'est attaché, la bulle est vide |
| le SCELLEMENT au repos, APRÈS une liaison réussie | **faux** — les pièces SONT liées ; supprimer le message les rend orphelines |

> **Deux branches qui méritent la même règle ne méritent pas forcément le même
> geste.** Une jumelle se reprend « en entier » (cycle 85) ; elle ne se recopie
> pas. Le lot a donc fermé le chemin par lequel la pièce se PERDAIT (#19917) et
> renvoyé la cause racine à son issue (#19956), au lieu de faire les deux à
> moitié.

### Et la garde qu'on pose pour ne pas AGGRAVER vaut un témoin

Le dédoublonnage n'a aucun filtre sur `deletedAt` : mesuré, il rend un message
supprimé avec `success: true`. Le correctif — lier les pièces admises à la
ligne trouvée — y aurait attaché des pièces vivantes à un message mort, les
rendant **invisibles et immortelles** : le balayage des orphelines ne ramasse
que les lignes dont `messageId` est vide.

> Quand un lot ouvre un chemin, la question n'est pas seulement « que
> répare-t-il ? » mais **« sur quels états ce chemin s'exécute-t-il ? »** — et
> un état qu'on refuse de traiter se refuse par une GARDE avec son témoin, pas
> par un silence. Le verdict de fond (que doit voir celui qui rejoue un message
> supprimé ?) reste une décision du porteur, #19957 : une garde qui empêche
> d'aggraver n'autorise personne à trancher le reste en passant.
