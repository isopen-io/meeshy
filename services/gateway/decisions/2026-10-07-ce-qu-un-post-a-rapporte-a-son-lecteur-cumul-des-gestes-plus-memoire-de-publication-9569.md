## 2026-10-07 : Ce qu'un post a rapporté à son lecteur — le cumul de ses gestes, plus la mémoire de publication (#9569)

Directive porteur du 2026-10-07 : « Trouve un moyen d'indiquer discrètement les points apportés par un post. » Les clients posent une marque « +99 » ; la passerelle leur sert `viewerPoints` sur le post, et la nouvelle valeur après un geste.

### Ce qui existait

- `ConversationEngagement` : ce qu'une CONVERSATION a rapporté à un utilisateur, écrit par `EngagementService` au crédit d'un geste qui nomme sa conversation.
- Rien d'équivalent pour un post. Deux morceaux seulement : les gestes du fil passent par `creditPostEngagement`, et la publication d'un contenu lourd est gardée par contenu (`EngagementQuota`, seau `content:<postId>`, champ `points`) pour être reprise à la suppression.

### Décision

**Un crédit de post vit à UN endroit, jamais à deux.**

| crédit | où il vit | qui l'écrit |
|---|---|---|
| publication d'un contenu lourd (`content.post` / `content.story` / `content.reel` que `remember` a gardée) | la mémoire de publication, `EngagementQuota` `content:<postId>` | `EngagementQuotas.remember`, remise à zéro par `reclaim` |
| tout le reste : réaction, commentaire, republication, signet, partage, vue de story, sondage, like de commentaire, axes outil de la publication, et une publication que la mémoire n'a PAS gardée (visibilité amis : 49 points, sous le seuil des contenus lourds) | le cumul, `EngagementPostPoints` (lecteur, post) | `PostPointsRecorder`, seul écrivain |

`creditLivesInPublicationMemory` est le seul prédicat qui tranche, à l'écriture. `loadViewerPostPoints` est la seule lecture : elle additionne les deux, bornée au lecteur.

**Pourquoi ne pas recopier la publication dans le cumul.** Trois raisons, mesurées en l'écrivant :

1. *La reprise.* `reclaim` remet la mémoire à zéro. Une copie dans le cumul demanderait une seconde écriture à chaque reprise, non atomique avec la première.
2. *Les posts d'avant ce lot.* Leur publication n'est QUE dans la mémoire. Avec une copie, il faudrait savoir, ligne par ligne, si le cumul la contient déjà : un marqueur, et une course entre le crédit de publication et celui de l'axe outil qui part en même temps (les deux ouvrent la ligne). Sans copie, il n'y a rien à distinguer : un post ancien et un post neuf se lisent pareil, et la publication ne peut pas compter deux fois.
3. *Aucune reprise de données.* Pas de backfill, pas de migration de données : seulement deux index sur une collection neuve.

Le prix : une page qui porte des posts du lecteur coûte une lecture du cumul ET une lecture de la mémoire, en parallèle, toutes deux groupées sur la page. Une page sans post du lecteur n'en coûte qu'une.

**`EngagementPostPoints` n'a aucune relation** vers `Post` ni `User`. Sans relation, aucun `include` ne peut ramener les lignes des autres lecteurs avec un post. Le prix est que rien ne les retire tout seul : `purgePostPoints` le fait au retrait (`applyPostRemovalEffects`, best-effort) et au balayage du contenu éphémère (avant toute destruction, et il gouverne la passe). Le nom suit la famille `Engagement*` du barème : `PostEngagement` désigne déjà les sessions de visionnage.

**Le post se déclare à part de la cible.** `EngagementActivityOptions.postId` nomme le post où le geste a eu lieu ; `targetId` continue de porter les plafonds. Aimer un commentaire a pour cible le commentaire et pour post celui qui le porte. `creditPostEngagement` l'exige au typage : un geste du fil ne peut plus créditer sans dire à quel post.

### Ce qui est servi, et à qui

- `viewerPoints` sur les LECTURES, pour un lecteur connecté : les listes par `withViewerPostState` (accueil, réels, auteur, communauté, favoris, hashtag), les stories et la fiche d'un post par `withViewerPoints` à la route. Zéro est servi comme zéro.
- **Absent** — et non zéro — pour un lecteur sans compte, sur la projection `tray` des stories, quand le cumul ne se lit pas (la page ne tombe pas), et sur toute RÉPONSE D'ÉCRITURE. Absent veut dire « garde ce que tu sais ».
- **Une réponse d'écriture ne le porte pas, à dessein.** Le crédit d'un geste est fire-and-forget : la réponse part avant qu'il soit écrit. Servir la valeur dans la réponse d'un like la servirait périmée, et un client la poserait par-dessus celle de l'événement. C'est pourquoi le champ se pose à la route de lecture et non dans `getPostById`, qui nourrit aussi les écritures et leurs rejeux.
- **Après un geste** : `engagement:post-updated` (`PostEngagementSnapshot` = `{ postId, viewerPoints }`), émis par `PostPointsRecorder` vers la seule room `user:<id>` du crédité, avec la valeur ABSOLUE que `loadViewerPostPoints` servirait au même instant. Même voie que `engagement:conversation-updated`.

### Par identifiant de post, sans redirection

`viewerPoints` d'un post servi est ce que CET identifiant a rapporté. Réagir ou commenter depuis une republication simple crédite son ORIGINAL (`resolveInteractionTarget`, règle existante) : l'événement nomme l'original, et la carte de la republication ne bouge pas. Servir sur la republication la valeur de son original aurait demandé aux clients de rejouer la règle de redirection pour appliquer un événement — et un signet posé sur la republication (crédité sur elle) aurait alors écrasé la valeur de l'original. Par identifiant, ce que la route sert et ce que l'événement annonce ne peuvent pas se contredire.

### Ce qui n'est pas couvert

- Un post d'avant #8959, ou dont la publication n'était pas un contenu lourd avant ce lot : aucune mémoire n'existe, sa publication n'est pas retrouvable.
- Une suppression de compte ne retire pas ses lignes de cumul — pas plus que celles de `ConversationEngagement`.
- Les humeurs (`STATUS`) ne portent pas le champ dans leurs listes, qui ne servent aucun état de lecteur ; leur fiche le porte.
