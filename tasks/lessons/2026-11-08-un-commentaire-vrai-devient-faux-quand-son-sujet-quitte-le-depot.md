## Un commentaire VRAI devient faux quand son sujet quitte le dépôt — et il se recopie avant de se mesurer

*2026-11-08 — #17066*

### Ce qui s'est passé

`MessageHandler.handleMessageEdit` était décrit par deux doc-comments comme
« le transport d'édition **PRIMAIRE**, celui qu'emploie le web », l'un citant à
l'appui `messaging.service.ts`, qui émet bien `message:edit`.

C'était **vrai**. Ça ne l'est plus depuis le 2026-09-24 : ce fichier vivait dans
le legacy web, parti du dépôt avec #7668, et il n'existe plus que sous le tag
`legacy-web-final`.

Mesuré le 2026-11-08 — **aucun client du dépôt n'émet `message:edit`** :

| client | transport réel |
|---|---|
| `apps/web` | `PUT` REST (`performMessageEdit`), aucun retry |
| iOS / SDK | `MessageService.edit` ⇒ `PUT /messages/:messageId` |
| Android | `EditMessageHandler` ⇒ `messageApi.edit` (REST, outbox) |

L'écoute socket reste enregistrée, validée et rate-limitée : elle est appelable
par toute socket **authentifiée**, et par personne d'autre.

### Pourquoi ça coûte

Trois lots de la journée ont raisonné sur cette phrase. Le mien l'a **recopiée**
dans `editedAudience.ts` — « le transport socket, que deux doc-comments du dépôt
nomment "primaire" » — en la citant au lieu de la vérifier. La citation donne la
sensation de sourcer : j'ai attribué la phrase à deux doc-comments plutôt que de
l'affirmer moi-même, et cette précaution de forme a servi à ne pas la mesurer.

Et elle n'était pas inoffensive : elle hiérarchisait les chemins. « Primaire »
justifiait de poser une garde ICI en premier — alors que la bonne raison est
l'inverse, et plus forte : ce chemin n'est fréquenté par personne **et** reste
ouvert à toute socket authentifiée. Une garde posée sur le chemin le plus
fréquenté se lit comme posée sur le SUJET et ne l'est que sur son CHEMIN
(cycle 127) ; une garde posée sur un chemin DÉSERT mais ATTEIGNABLE est la même
règle vue de l'autre bout.

### La règle

Le dépôt a déjà la famille : « un commentaire d'impossibilité ne rougit jamais,
il survit à ce qui l'a périmé » (cycle 107 bis). Celle-ci en est la variante la
plus discrète — **le sujet du commentaire a quitté le dépôt, et le commentaire
est resté.** Un retrait d'application, de service ou de module périme toutes les
phrases qui le CITAIENT, et aucune ne rougira.

Deux gestes, et le second est celui qui manque le plus souvent :

1. **Un commentaire qui NOMME un fichier se vérifie par son existence.** Un
   chemin cité est la seule partie d'un commentaire qu'une commande peut
   réfuter — `test -e`, ou `git log --diff-filter=D` pour savoir *quand* il est
   parti. C'est gratuit, et ça datait le défaut ici en une ligne.
2. **Un lot qui RETIRE une application relit les commentaires qui la citaient.**
   Symétrique de « le lot qui rend une chose possible doit relire les
   commentaires qui la déclaraient impossible ».

### Et le corollaire sur la citation

**Citer une affirmation n'est pas la sourcer.** « Deux doc-comments du dépôt
disent X » est vrai de ce que disent les doc-comments, et ne dit RIEN de X. La
forme est séduisante parce qu'elle a l'air plus rigoureuse qu'une affirmation
nue — elle est en fait une affirmation nue avec un alibi. Devant sa propre
phrase de cette forme, demander : *et X, c'est vrai ?*
