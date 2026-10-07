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

**`EngagementPostPoints` n'a aucune relation** vers `Post` ni `User`. Sans relation, aucun `include` ne peut ramener les lignes des autres lecteurs avec un post. Le prix est que rien ne les retire tout seul : `purgePostPoints` le fait au retrait (`applyPostRemovalEffects`, best-effort) et au balayage du contenu éphémère (avant toute destruction, et il gouverne la passe), et la suppression d'un compte retire les siennes (`GAME_PURGED_MODELS`) — une ligne par post est la trace de ses gestes, de même nature que les quotas par cible déjà purgés. Le nom suit la famille `Engagement*` du barème : `PostEngagement` désigne déjà les sessions de visionnage.

**La ligne d'un (lecteur, post) a un identifiant DÉRIVÉ des deux** (`postPointsRowId`, sha256 tronqué à la taille d'un ObjectId). L'upsert de Prisma sur MongoDB lit puis écrit : deux premiers gestes simultanés lisent « aucune ligne » et créent. Avec un identifiant dérivé ils créent la même clé primaire, et l'index `_id` — le seul qui existe toujours — refuse la seconde ; le perdant retombe sur un incrément. L'unique (lecteur, post) de la migration reste, mais la justesse ne dépend plus de l'ordre entre le déploiement et la migration. La raison est précise : un doublon ne se contente pas d'exister, une mise à jour par (lecteur, post) incrémente alors les DEUX lignes et chaque geste suivant compte deux fois. Un conflit d'écriture (P2034) n'a rien écrit : l'incrément se rejoue.

**Le post se déclare à part de la cible.** `EngagementActivityOptions.postId` nomme le post où le geste a eu lieu ; `targetId` continue de porter les plafonds. Aimer un commentaire a pour cible le commentaire et pour post celui qui le porte. `creditPostEngagement` l'exige au typage : un geste du fil ne peut plus créditer sans dire à quel post.

### Ce qui est servi, et à qui

- `viewerPoints` sur les LECTURES, pour un lecteur connecté : les listes par `withViewerPostState` (accueil, réels, auteur, communauté, favoris, hashtag), les stories et la fiche d'un post par `withViewerPoints` à la route. Zéro est servi comme zéro.
- **Absent** — et non zéro — pour un lecteur sans compte, sur la projection `tray` des stories, quand le cumul ne se lit pas (la page ne tombe pas), et sur toute RÉPONSE D'ÉCRITURE. Absent veut dire « garde ce que tu sais ».
- **Une réponse d'écriture ne le porte pas, à dessein.** Le crédit d'un geste est fire-and-forget : la réponse part avant qu'il soit écrit. Servir la valeur dans la réponse d'un like la servirait périmée, et un client la poserait par-dessus celle de l'événement. C'est pourquoi le champ se pose à la route de lecture et non dans `getPostById`, qui nourrit aussi les écritures et leurs rejeux.
- **Après un geste** : `engagement:post-updated` (`PostEngagementSnapshot` = `{ postId, viewerPoints }`), émis par `PostPointsRecorder` vers la seule room `user:<id>` du crédité, avec la valeur ABSOLUE que `loadViewerPostPoints` servirait au même instant. Même voie que `engagement:conversation-updated`.
- **La valeur est MONOTONE, et c'est ce qui tranche le désordre.** Rien ne sérialise deux annonces : deux gestes rapprochés (ou une lecture de fil rendue après l'annonce d'un geste) peuvent livrer la valeur la plus ancienne en dernier. Tant que le post existe, ce qu'il a rapporté ne décroît jamais — la reprise n'a lieu qu'à son retrait. Un client garde donc la plus grande des deux : `keptViewerPoints` (`@meeshy/shared/types/engagement-scale`), la loi que le web consomme et qu'iOS reflète. Une file par (lecteur, post) dans le processus n'aurait couvert ni plusieurs instances de la passerelle, ni la lecture en vol. Les deux crédits d'une publication, seul couple SYSTÉMATIQUEMENT simultané, s'enchaînent désormais (`recordPublicationEngagement`).
- Un crédit que le barème paie zéro n'écrit ni n'annonce rien.
- **L'invité d'un lien n'est ni un lecteur ni un crédité.** Son `authContext.userId` est un `Participant.id`, qui nomme sa room et jamais un compte. Toute lecture de post tire le lecteur de `registeredUser?.id` : pour lui le champ est absent, et sa clé n'interroge jamais le cumul. Chaque porte d'un geste de post le refuse déjà (REST : `registeredUser` requis ; socket : « Only registered users can react » ; une vue sans compte est un comptage d'ouverture). L'écrivain ferme en dernier, sans dépendre d'elles : `EngagementService` n'inscrit de ligne et n'annonce que pour un identifiant qui EST un compte (`ElanInputs.isAccount`, lu sur la ligne `User` qu'il charge déjà — aucune lecture de plus).

### Par identifiant de post — et un geste passé par une republication simple crédite les DEUX, pour de vrai (#9584)

`viewerPoints` d'un post servi est ce que CET identifiant a rapporté ; la lecture ne redirige rien. Réagir ou commenter depuis une REPUBLICATION SIMPLE pose le geste sur son ORIGINAL (`resolveInteractionTarget`, règle existante). Dans la première version de ce lot, seul l'original était crédité : la carte que le lecteur regardait ne bougeait pas.

**Décision porteur du 2026-10-07 (#9584), corrigée le même jour.** Le geste génère de VRAIS points sur les deux posts : « il faut t'assurer que les réactions déposées génèrent les points associés ». Une première lecture — un seul crédit, attribué deux fois — a été rejetée : la somme des marques aurait dépassé les points gagnés.

- **Deux crédits réels.** Un sur l'original où le geste atterrit, un sur la republication traversée, chacun avec son barème, ses plafonds, ses quotas par cible (la portée par cible s'applique par identifiant de post) et son auteur. Le score monte des crédits accordés.
- **La somme des marques est la hausse réelle du score, toujours.** Chaque carte porte ce que SON crédit a rapporté ; chaque crédit accordé s'annonce sous son identifiant (`engagement:post-updated`). Un crédit refusé par un plafond ne marque que sa carte ; l'autre reste.
- **« Jamais sur son propre post » se lit sur chacun des deux, sur l'auteur de CHAQUE post.** Le republieur qui réagit par sa propre republication n'est crédité que sur l'original ; l'auteur de l'original qui réagit par la republication d'un autre n'est crédité que sur cette republication. On ne se crédite jamais deux fois pour un geste dont l'un des deux posts est le sien. Le commentaire, lui, ne porte aucun auteur dans son crédit — aujourd'hui déjà, commenter son propre post rapporte — et ses deux crédits suivent la même règle : deux crédits, y compris par la republication de son propre post.
- **La republication traversée vient de la résolution, jamais d'une seconde lecture.** `resolveRedirectTarget` la lit déjà pour décider la redirection ; il la rend désormais sur la cible (`redirectedFrom` : identifiant et auteur), son audience déjà vérifiée. Elle traverse `likePost` → `addReaction` (REST), `addReaction` (socket) et la route du commentaire. `postsCreditedBy` / `creditPostGesture` (`services/posts/postEngagementCredits.ts`) sont le site unique qui en fait des crédits.
- **Une citation garde sa propre vie sociale** : jamais redirigée, un seul crédit. Une republication d'une STORY ou d'un STATUS non plus : elle porte son instantané.
- **Republier une republication** : le geste fait depuis R2 (republication simple de R1, elle-même de O) est redirigé vers la RACINE O ; il crédite O et R2. R1 n'est pas sur le chemin du geste et ne reçoit rien.
- **Republier** (`social.repost`) : un seul crédit, sur le post republié. La republication produite est le post du republieur lui-même, et le barème ne crédite jamais un geste sur son propre post : lui donner une marque sans crédit réel rendrait la somme des marques fausse.
- **Ce que le barème ne fait pas, et que ce lot n'invente pas.** Il ne crédite pas l'AUTEUR d'un post qui reçoit une réaction (`targetOwnerId` ne sert qu'au refus de soi) — ni l'auteur de l'original, ni celui de la republication. Et retirer une réaction ne reprend aucun crédit, pour aucun post : le barème ne reprend que la publication d'un contenu lourd supprimé. Les deux crédits d'un geste par une republication se comportent donc exactement comme celui d'un geste ordinaire.

**Ce que la règle ne couvre pas encore** (à décider, non tranché ici) : les gestes qui ne sont PAS redirigés — signet, partage, réponse à un sondage — posés sur la carte d'une republication simple ne créditent que la republication ; un like de commentaire fait depuis cette carte ne crédite que le post du commentaire (la route ne résout pas le `:postId` du chemin).

### Ce qui n'est pas couvert

- Un post d'avant #8959, ou dont la publication n'était pas un contenu lourd avant ce lot : aucune mémoire n'existe, sa publication n'est pas retrouvable.
- `ConversationEngagement`, le calque par conversation, n'est pas retiré à la suppression d'un compte : c'est un suivi, pas une règle de ce lot.
- Les humeurs (`STATUS`) ne portent pas le champ dans leurs listes, qui ne servent aucun état de lecteur ; leur fiche le porte.
