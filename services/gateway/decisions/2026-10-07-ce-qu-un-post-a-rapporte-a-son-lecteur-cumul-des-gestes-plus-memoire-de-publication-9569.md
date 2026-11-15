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
- **Après un geste — ou sa reprise** : `engagement:post-updated` (`PostEngagementSnapshot` = `{ postId, viewerPoints, at }`), émis par `PostPointsRecorder` vers la seule room `user:<id>` du crédité, avec la valeur ABSOLUE que `loadViewerPostPoints` servirait au même instant et l'instant serveur `at` (ms). Même voie que `engagement:conversation-updated`.
- **La valeur peut BAISSER (#9584 : retirer un contenu reprend ses points), donc l'annonce la plus RÉCENTE gagne.** Rien ne sérialise deux annonces : deux gestes rapprochés, ou une lecture de fil rendue après une annonce, peuvent arriver dans le désordre. `keptViewerPoints` (`@meeshy/shared/types/engagement-scale`) tranche : une annonce plus ancienne que la dernière connue est ignorée, une lecture (sans `at`) s'applique et garde l'instant de la dernière annonce. La version première de ce lot gardait la plus GRANDE des deux, loi juste tant que rien ne se reprenait. Les deux crédits d'une publication, seul couple SYSTÉMATIQUEMENT simultané, s'enchaînent (`recordPublicationEngagement`).
- Un crédit que le barème paie zéro n'écrit ni n'annonce rien.
- **L'invité d'un lien n'est ni un lecteur ni un crédité.** Son `authContext.userId` est un `Participant.id`, qui nomme sa room et jamais un compte. Toute lecture de post tire le lecteur de `registeredUser?.id` : pour lui le champ est absent, et sa clé n'interroge jamais le cumul. Chaque porte d'un geste de post le refuse déjà (REST : `registeredUser` requis ; socket : « Only registered users can react » ; une vue sans compte est un comptage d'ouverture). L'écrivain ferme en dernier, sans dépendre d'elles : `EngagementService` n'inscrit de ligne et n'annonce que pour un identifiant qui EST un compte (`ElanInputs.isAccount`, lu sur la ligne `User` qu'il charge déjà — aucune lecture de plus).

### Par identifiant de post — et un geste passé par une republication simple crédite les DEUX, pour de vrai (#9584)

`viewerPoints` d'un post servi est ce que CET identifiant a rapporté ; la lecture ne redirige rien. Réagir ou commenter depuis une REPUBLICATION SIMPLE pose le geste sur son ORIGINAL (`resolveInteractionTarget`, règle existante). Dans la première version de ce lot, seul l'original était crédité : la carte que le lecteur regardait ne bougeait pas.

**Décision porteur du 2026-10-07 (#9584), corrigée le même jour.** Le geste génère de VRAIS points sur les deux posts : « il faut t'assurer que les réactions déposées génèrent les points associés ». Une première lecture — un seul crédit, attribué deux fois — a été rejetée : la somme des marques aurait dépassé les points gagnés.

- **Deux crédits réels.** Un sur l'original où le geste atterrit, un sur la republication traversée, chacun avec son barème, ses plafonds, ses quotas par cible (la portée par cible s'applique par identifiant de post) et son auteur. Le score monte des crédits accordés.
- **La somme des marques est la hausse réelle du score, toujours.** Chaque carte porte ce que SON crédit a rapporté ; chaque crédit accordé s'annonce sous son identifiant (`engagement:post-updated`). Un crédit refusé par un plafond ne marque que sa carte ; l'autre reste.
- **« Jamais sur son propre post » se lit sur chacun des deux, sur l'auteur de CHAQUE post.** Le republieur qui réagit par sa propre republication n'est crédité que sur l'original ; l'auteur de l'original qui réagit par la republication d'un autre n'est crédité que sur cette republication. On ne se crédite jamais deux fois pour un geste dont l'un des deux posts est le sien.
- **Réagir par plusieurs republications** (porteur, 2026-10-07) : l'original n'est crédité qu'à la pose de la réaction ; la reconfirmer depuis une AUTRE republication crédite cette republication seule, une fois (le reçu de la réaction pour ce post le garde).
- **La republication traversée vient de la résolution, jamais d'une seconde lecture.** `resolveRedirectTarget` la lit déjà pour décider la redirection ; il la rend sur la cible (`redirectedFrom` : identifiant, auteur, et ses commentaires fermés ou non), son audience déjà vérifiée. Elle traverse `likePost` → `addReaction` (REST) et `addReaction` (socket). `postsCreditedBy` / `creditPostGesture` (`services/posts/postEngagementCredits.ts`) sont le site unique qui en fait des crédits.
- **Une citation garde sa propre vie sociale** : jamais redirigée, un seul crédit. Une republication d'une STORY ou d'un STATUS non plus : elle porte son instantané.
- **Republier une republication** : le geste fait depuis R2 (republication simple de R1, elle-même de O) est redirigé vers la RACINE O ; il crédite O et R2. R1 n'est pas sur le chemin du geste et ne reçoit rien.
- **Republier** (`social.repost`) : un seul crédit, sur le post republié. La republication produite est le post du republieur lui-même, et le barème ne crédite jamais un geste sur son propre post : lui donner une marque sans crédit réel rendrait la somme des marques fausse.
- **Ce que le barème ne fait pas, et que ce lot n'invente pas.** Il ne crédite pas l'AUTEUR d'un post qui reçoit une réaction (`targetOwnerId` ne sert qu'au refus de soi) — ni l'auteur de l'original, ni celui de la republication.

**Ce que la règle ne couvre pas encore** (à décider, non tranché ici) : les gestes qui ne sont PAS redirigés — signet, partage, réponse à un sondage — posés sur la carte d'une republication simple ne créditent que la republication.

### Un commentaire écrit sous une republication est à ELLE — « fil propre » (#9584, porteur 2026-10-07)

Un commentaire écrit depuis une republication simple est RANGÉ sous elle : il compte dans SON `commentCount`, prévient SON auteur, la crédite elle seule, et `GET /posts/<republication>/comments` rend SON fil — la lecture d'un fil ne redirige plus. Site unique : `services/posts/commentHome.ts` (`commentHomeOf`, `commentThreadOf`, `admitCommentHome`). Ce qui ne bouge pas :

- les réactions et les likes gardent la redirection vers l'original et la duplication réelle de leurs crédits — `resolveInteractionTarget` est inchangé ;
- les citations, les posts ordinaires et les republications d'éphémères gardent leur propre fil ;
- aucune donnée n'est migrée : les commentaires déjà écrits via des republications restent sur l'original, et **une réponse suit son parent** — répondre depuis la republication à un commentaire resté sur l'original la range avec lui, ce qui garde un ancien client fonctionnel ;
- écrire sous une republication exige le droit d'interagir sur elle ET sur l'original (la résolution vérifie les deux), et que ni l'un ni l'autre n'ait fermé ses commentaires ;
- **un blocage, dans un sens ou l'autre, avec l'auteur du post — original ou republication traversée — refuse le commentaire ET la réaction PARTOUT**, sur un post ordinaire aussi, comme un post introuvable (`isBlockedWithAny`, fermé sur l'échec de lecture) ;
- **tout ce qu'un commentaire rangé sous une republication fait partir vers des tiers a pour audience l'INTERSECTION** : mentions (persistées et notifiées), notification à l'auteur du parent et du post passent par `threadAudience` — qui lit la republication ET l'original (`resolveConsumptionTarget`), sans blocage avec l'un des auteurs ni le commentateur, fermé sur l'échec ; l'éventail des stories ne part pas ; la diffusion temps réel (`comment:added|updated|deleted`) ne part que vers la room du post et son auteur (`commentEventAudience`) ;
- le fil d'une republication se ferme avec son original, sur TOUTES ses portes : réponses, like de commentaire, traduction, socket (`canUserConsumeThread`, `canUserInteractWithThread`) — la règle des republications, celle de `resolveConsumptionTarget` ;
- `post:join` rejoint la room de l'original (ses réactions) ET celle de la republication (ses `comment:*`).

Rétrocompatible : mêmes routes, mêmes identifiants, aucun champ servi ne change de forme. Un ancien client qui affiche le compteur de l'original sur la carte d'une republication ne voit pas les nouveaux commentaires qui y sont rangés tant qu'il ne lit pas le `commentCount` de la republication — c'est l'ajustement que #9570 et #9571 portent.

### Retirer un contenu reprend ce qu'il a rapporté — une fois (#9584, porteur 2026-10-07)

Chaque crédit accordé pour un CONTENU garde un reçu (`EngagementReceipts`, seau `receipt:<source>|<post>` d'`EngagementQuota`) : sa source — l'identifiant de la LIGNE (`post-reaction:`, `comment:`, `comment-reaction:`, `post:`) —, le post crédité, les points. Retirer le contenu reprend chaque crédit qu'il a produit : score, compteur, cumul du post (annoncé), sur l'original ET la republication. Le reçu est remis à zéro par une écriture CONDITIONNELLE avant toute reprise : une suppression rejouée ne reprend rien. Couverts : réactions de post, commentaires (et les réponses supprimées avec eux, chacune à son auteur), likes de commentaire, posts, stories, reels, republications — la publication dans la fenêtre `abuse.clawbackHours` du barème, comme sa mémoire par contenu. Les MESSAGES sont hors de ce lot : ils devraient créditer avec `receipt: message:<id>` et reprendre par `EngagementService.reclaimSource(expéditeur, 'message:<id>')`.

**Qui perd ses points** (`removalReclaimsAuthorCredits`, choix soumis au porteur) : l'auteur, quand il retire lui-même son contenu ou quand la modération le retire ; jamais pour la décision d'un tiers — supprimer son commentaire emporte les réponses des autres, qui gardent leurs points. La reprise ne vise jamais que le compte crédité POUR ce contenu, jamais celui qui retire.

### Les limites quotidiennes de gestes (#9584, porteur 2026-10-07)

Par personne et par jour civil du COMPTE (son fuseau, comme le jour du jeu) : **10 commentaires sous des republications, 50 sur des originaux ; 50 réactions sous des republications, 100 sur des originaux.** Ce sont les défauts du barème (`pathCaps`), réglables par l'administration, **sans « sans limite »** : chaque valeur est un entier de 0 à `DAILY_GESTURE_LIMIT_CEILING` (1 000) ; une valeur `null`, négative, fractionnaire, au-delà du plafond ou absente fait refuser le barème (la passerelle sert alors les défauts), et `dailyGestureLimit` retombe sur le défaut du code pour tout barème forgé. Une limite borne le GESTE et ses POINTS, avec un seul compteur (`DailyGestureGate`, seau `gesture:<famille>` / `<chemin>:day:<jour>`) : les opérations qu'elles gouvernent n'ont plus d'autre plafond quotidien (`tool.post_reaction` perd son 30/jour), si bien que gestes et points ne peuvent pas diverger.

- Au-delà, le geste est REFUSÉ AVANT toute écriture, jusqu'à minuit local : `429`, `code` `DAILY_COMMENT_LIMIT` ou `DAILY_REACTION_LIMIT`, avec `resetAt` (ISO), `retryAfter` (secondes, aussi en en-tête `Retry-After`), `limit` et `path` — sur REST ; le même `code`, `resetAt`, `retryAfter` et `limit` dans l'accusé du socket.
- La place se prend par une écriture conditionnelle (`count < limite`) : deux gestes simultanés ne passent jamais tous deux le bord, un refus n'incrémente rien. Un geste admis qui ne s'écrit pas rend sa place ; un geste RETIRÉ ne la rend pas.
- Un commentaire prend sa place DANS l'op du journal d'idempotence : un rejeu n'en prend pas, un refus laisse le `clientMutationId` libre.
- Reconfirmer une réaction par une autre republication est un geste sous les republications quand il crédite quelque chose ; sinon ce n'est pas un geste.
- Un compteur illisible laisse passer le geste — on ne bloque pas quelqu'un pour une panne — mais sans place et **sans aucun point** (`mayCredit`).

### Un rejeu d'idempotence ne crédite ni n'annonce une seconde fois (#9603)

`withMutationVerdict` dit, d'après le journal, si la mutation vient d'être exécutée. Rejouée, la création d'un commentaire ou d'une publication est resservie à l'identique, et rien ne repart. Les appelants restants de `withMutationLog`, et ce que leur rejeu refait, sont figés par `security/mutation-log-replay-guard.test.ts` (suivi #9623).

### Ce qui n'est pas couvert

- Un post d'avant #8959, ou dont la publication n'était pas un contenu lourd avant ce lot : aucune mémoire n'existe, sa publication n'est pas retrouvable.
- `ConversationEngagement`, le calque par conversation, n'est pas retiré à la suppression d'un compte : c'est un suivi, pas une règle de ce lot.
- Les humeurs (`STATUS`) ne portent pas le champ dans leurs listes, qui ne servent aucun état de lecteur ; leur fiche le porte.
