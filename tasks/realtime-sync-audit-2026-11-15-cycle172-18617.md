# Cycle 172 — la surface qui s'exemptait de l'idempotence, par un mécanisme qui n'existe pas

*2026-11-15. Branche `claude/exciting-planck-jgv7lx`, repartie de la tête de
`dev` (`46c533d7d`) après la fusion du cycle 171.*

**Livré** : #18617 — `POST /links/:identifier/messages` rejoint le contrat de
déduplication ; un renvoi rend le message, plus 500.

> *Nom de fichier suffixé par l'issue, comme au cycle 171 : 170, 171 et 173
> étaient pris par des cycles sœurs au moment d'écrire, et un identifiant qu'on
> relève n'est alloué à personne.*

---

## Comment le cycle a été ouvert, et les deux lots CÉDÉS

Le relevé est parti des six suivis laissés par les cycles 169 et 171. **Deux
candidates ont été cédées avant toute écriture :**

| # | pourquoi |
|---|---|
| #18619 | livrée entre-temps par la PR #18696 (session sœur) |
| #18614 | la PR #18732, ouverte et non fusionnée, écrit déjà `MessageReadStatusService.ts` — le site d'appel exact de `freezeMessageStatus` que l'issue met en cause. Règle de tranchage : celui qui n'a rien écrit cède |

**Le cycle adopte la primitive posée par la session sœur sur #18619** :
*commenter l'issue avant d'écrire*. Son argument est juste et chiffré — deux
collisions ont coûté un lot complet chacune le même jour, dont #18616, le mien.
Un numéro d'issue est un espace de noms que personne n'alloue ; le relevé
`git log --all --grep` réduit la fenêtre, un commentaire la ferme. Le lot a donc
commencé par une allocation publique, puis par la vérification du constat.

## Le constat

Tout l'édifice d'idempotence de l'envoi converge sur
`MessageProcessor.saveMessage` : lecture précoce par contenu, `INSERT` + `catch
P2002` → relecture, et un drapeau `isDuplicate` que les trois appelants lisent
pour sauter la re-diffusion. **Une surface y échappait** — l'envoi par lien de
partage, le seul transport dont dispose un invité anonyme — et elle en était
dispensée par ceci :

```ts
// Pas de catch-P2002 ici (chemin anonyme simple) — un retry serveur
// produit le même cid donc Prisma renvoie une 409 que la couche
// Fastify mappe en réponse 409 Conflict côté client.
```

Vérifié ligne à ligne sur la tête de `dev` :

| la phrase affirme | mesuré |
|---|---|
| Prisma « renvoie une 409 » | le `create` vit dans le `try` du gestionnaire |
| « la couche Fastify mappe » | la branche terminale est `sendInternalError` — aucun mappeur atteint |
| le client reçoit « 409 Conflict » | le bloc `response:` déclare `201, 400, 401, 403, 404, 500`. **Pas de 409** |

Et le `clientMessageId` est **obligatoire** ici (son doc-comment dit
« mandatory … so the gateway dedup contract holds across the REST and
Socket.IO surfaces ») : l'insertion dupliquée touche l'index unique partiel à
coup sûr. **Le 500 n'était pas un cas limite, c'était le verdict garanti d'un
renvoi.**

## Ce que ça coûtait, et pourquoi un 409 n'aurait pas suffi

| client | 500 est-il terminal ? | état final de la bulle |
|---|---|---|
| iOS | non, et réessayable | 5 tentatives (2/4/8/16/30 s) puis `.exhausted` — échec **à vie** |
| web | `neverReachedServer` faux ⇒ aucun rejeu auto | bloquée sur « Réessayer », et chaque appui refait un 500 |

…pour un message que **tous les autres participants ont reçu**. C'est le seul
scénario que l'édifice d'idempotence existe pour absorber, et cette surface y
répondait par une erreur serveur.

Déclarer un 409 aurait rendu la réponse honnête sans débloquer personne : aucun
des deux clients ne range un conflit comme un succès. **Rendre la ligne
existante est la seule réponse qui débloque les deux sans changer un contrat
client** — et c'est ce que le chemin canonique rend déjà.

## Le correctif

`routes/links/messageIdempotency.ts` — `writeLinkMessageIdempotently` : `create`,
`catch P2002`, relecture par `(conversationId, clientMessageId)`, et
`{ row, isDuplicate }`. Trois points de forme :

1. **La projection est NOMMÉE et partagée** (`LINK_MESSAGE_WRITE_INCLUDE`), donc
   les deux chemins servent la même forme par construction. Relire par la
   projection partagée du dépôt (`findExistingMessage`) aurait été le réflexe —
   et aurait servi un expéditeur **sans `language`** au seul chemin du renvoi,
   ce champ étant dans l'`include` de la route et pas dans celle-là. Une
   divergence qu'aucun témoin n'aurait vue.
2. **`findFirst` et non `findUnique`**, pour la raison que le chemin canonique
   écrit déjà : la contrainte vit dans un index partiel MongoDB géré par
   migration manuelle, pas dans une directive `@@unique` — le type composite
   n'est pas généré.
3. **Sur un doublon, tout ce qui a un EFFET est sauté** : mentions, effets
   post-sauvegarde, notification, diffusion. Seul ce qui COMPOSE la réponse
   tourne. Rediffuser afficherait le message **deux fois** chez tous les
   participants ; c'est la garde `!isDuplicate` du chemin canonique.

**La garde d'obsolescence (#14643) reste en AMONT de la branche, délibérément** :
elle ne décrit pas ce que le renvoi refait mais l'état de la conversation
MAINTENANT. Sans quoi le renvoi serait la seule porte par laquelle un message
ressort d'une conversation close.

## Preuves

| preuve | résultat |
|---|---|
| mutation par mutation (6 mutations) | voir ci-dessous |
| les 6 suites de la route | **92 témoins** verts |
| `tsc --noEmit` gateway | **EXIT=0**, lu hors pipe |
| `check-any-debt.sh` | **EXIT=0** |

### Le ROUGE, UNE MUTATION À LA FOIS

| mutation de production | témoins qui tombent |
|---|---|
| le `catch P2002` retiré (le défaut d'avant) | **2** |
| la branche `isDuplicate` retirée (le doublon rediffuse) | **1** |
| la relecture ignore le `clientMessageId` | **1** |
| le doublon RECALCULE ses mentions | **1** |
| la garde « ligne introuvable » retirée | **0 — nommée** |
| la projection perd `sender.language` | **0 — rien à diverger** |

**Les deux dernières ne font tomber personne, et pour deux raisons
différentes.** La garde « ligne introuvable » dégrade vers le MÊME observable :
sans elle, un `TypeError` sur `stored.id` rend aussi 500. Ce qu'elle préserve
est le diagnostic, pas la réponse — elle reste posée et son inobservabilité est
écrite à côté d'elle. La projection, elle, n'a **rien à diverger** : c'est le
point de la constante partagée, et une mutation qui l'appauvrit appauvrit les
deux chemins à la fois, donc ne révèle aucun écart. Un cliquet qui voudrait la
tenir devrait comparer la forme SERVIE par les deux chemins — ce qui vaudrait un
lot à soi.

### Trois témoins étaient verts AVANT le correctif, et pour la mauvaise raison

« ne rediffuse pas », « un P2002 introuvable reste une erreur », « une erreur
autre que P2002 reste une erreur » : la route rendant 500 sur **tout**, les trois
passaient trivialement. Ce ne sont pas des preuves du défaut, ce sont des gardes
**du correctif** — et c'est la mutation qui le dit : « ne rediffuse pas » tombe
dès que la branche `isDuplicate` disparaît.

> **Un témoin vert avant le correctif et vert après ne prouve rien tant qu'une
> mutation ne l'a pas fait tomber.** Il faut le dire dans le compte : annoncer
> « 6 témoins verts » ferait passer trois gardes de non-régression pour trois
> démonstrations.

## Ce que les cliquets du dépôt ont attrapé, et que je n'avais pas vu

La suite complète a rendu **deux rouges** qui ne venaient pas des témoins du
lot. Les deux sont instructifs, et le premier est un vrai défaut.

### 1. La projection locale avait laissé derrière une PROTECTION

`orphaned-sender-repair-surface-guard` (#6516) dénombre les fichiers qui lisent
`Message` en chargeant `sender`. Mon `findFirst` en est un NOUVEAU — un `create`
n'est pas une lecture, donc la surface n'existait pas avant ce lot.

`Message.sender` est une relation **REQUISE** : une lecture qui la charge et
rencontre un seul message dont le `Participant` expéditeur a disparu ne filtre
pas la ligne, elle fait **rejeter toute la lecture** par Prisma (#6501). Un
renvoi retombait donc en 500 pour une raison étrangère au renvoi — sur le seul
chemin dont dispose un invité anonyme, et précisément ce que le lot corrige.

Ce qui l'a produit est le choix que j'avais pourtant instruit : relire par la
projection PARTAGÉE (`findExistingMessage`) aurait apporté
`withOrphanedSenderRepair` **gratuitement** ; la projection locale, retenue pour
garder `sender.language`, l'a laissée derrière.

> **Un choix de projection emporte ce que la projection écartée faisait AUTOUR
> de la lecture, pas seulement ses colonnes.** J'avais comparé les deux sur leur
> jeu de champs — la bonne question, posée trop étroitement. La question
> complète est : *que fait l'unité que je n'utilise pas, en plus de lire ?*

Corrigé en gardant les deux : projection locale **et** réparation branchée à la
main, déclarée dans la table du cliquet. Mutation : retirer la réparation fait
tomber le cliquet.

### 2. Le cliquet d'atteignabilité ne voyait pas les arêtes en `.js`

`route-file-reachability` (#4284) a déclaré `links/messageIdempotency.ts`
ORPHELIN alors qu'il est importé et servi. Son résolveur n'essayait que
`${base}.ts` et `${base}/index.ts` : un spécificateur `'./x.js'` — la convention
TS/ESM, portée par **175 fichiers de `routes/`** — était invisible au graphe.

Elle n'avait jamais rougi parce que **toutes** les arêtes en `.js` du dépôt
pointaient HORS de `routes/` (vers `validation/`, `utils/`, `services/`), et ce
cliquet ne juge que l'atteignabilité des fichiers de `routes/`. Mon frère
importé en `.js` à l'intérieur de `routes/` était le premier.

> **Le SENS de l'erreur valait d'être mesuré avant de corriger.** Une arête
> manquante ne peut que RÉTRÉCIR le graphe, donc ce défaut ne produisait que des
> faux POSITIFS — un fichier vivant déclaré mort — jamais l'inverse. Le cliquet
> n'a donc jamais manqué un orphelin réel ; il pouvait seulement accuser à tort.
> Sans cette mesure, « le cliquet était aveugle » se lirait comme « des
> orphelins ont pu passer », ce qui est faux et aurait lancé une revue inutile.

Le résolveur dépouille désormais `.js`, et l'import du lot suit la convention
locale (`'./types'` sans extension, comme son voisin). Mutation : remis en
`.js`, le cliquet passe — l'arête est bien vue.

## Deux faux ROUGES après le rapprochement, et comment les lire

Le merge de `dev` (86 commits, dont la feature batterie #14147) a fait passer
`tsc --noEmit` de `EXIT=0` à `EXIT=2`, sur des fichiers que ce lot ne touche
pas (`services/battery/*`). **Aucun des deux n'était un défaut** — ce sont des
ARTEFACTS périmés, et ils se succèdent dans cet ordre :

| symptôme | cause | remède |
|---|---|---|
| `"device.battery"` n'est pas assignable à l'union des features | `packages/shared/dist` détruit par les passes complètes de la suite gateway | `cd packages/shared && bun run build` |
| `batterySharingDisabledAt` n'existe pas sur `UserSelect` | client Prisma GÉNÉRÉ antérieur au champ que `dev` vient d'ajouter au schéma | `npx prisma generate --generator client` |

La première moitié était **annoncée** : l'audit adversarial du cycle 171 l'avait
mesurée et laissée en note pour la session suivante (« faire tourner la suite
gateway complète détruit `packages/shared/dist` … c'est un faux rouge qu'il faut
savoir lire »). La seconde ne l'était pas, et elle est plus piégeuse : le hook de
démarrage de session LANCE `prisma generate`, donc le client est juste **au
début** de la session et périme silencieusement au premier merge qui touche le
schéma.

> **Un gate qui rougit juste après un rapprochement accuse d'abord les
> ARTEFACTS, pas le code.** La question à poser n'est pas « qu'ai-je cassé ? »
> mais **« ce que ce gate LIT est-il à jour avec ce que je viens de recevoir ? »**
> — un `dist` compilé, un client généré, un cache de build. Le discriminant est
> gratuit : les fichiers accusés sont ceux de l'autre, et la source du dépôt,
> elle, porte bien ce qu'ils réclament (`RELATION_FEATURES` contient
> `'device.battery'`, `schema.prisma:200` déclare `batterySharingDisabledAt`).

## Correction de la CORRECTION — et c'est la méthode qui a fauté, trois fois de suite

**Tout ce qui suit dans la section ci-dessous est à lire à travers ceci.** J'ai
affirmé « DEUX dispatches annulés sans AUCUN dispatch postérieur » en
interrogeant l'API avec `perPage: 2` puis `perPage: 3`. Le relevé COMPLET en
porte **douze**, et il change le verdict :

| run | créé | annulé | successeur AVANT l'annulation ? | de moi ? |
|---|---|---|---|---|
| 29613 | 22:48:46 | 22:51:31 | non (29615 créé après) | oui |
| 29615 | 22:52:19 | 23:00:47 | non (29618 créé après) | oui |
| 29618 | 23:03:12 | 23:06:19 | non (29624 créé après) | oui |
| **29624** | 23:29:44 | 23:30:47 | **OUI — 29625 à 23:30:24** | oui |
| 29625 | 23:30:24 | 23:32:05 | non | **NON** |
| 29526 | 19:09:01 | 19:15:58 | — | **NON** |
| **29538** | 19:17:09 | **19:55:59 `success`** | — | oui |

Deux faits, tous deux vrais, et aucun des deux n'était dans ma correction :

1. **Une AUTRE session de ce compte lance des `workflow_dispatch` sur MA
   branche** (29526, 29625). Celle de 23:30:24 a bien annulé la mienne de
   23:29:44 — donc le mécanisme de concurrence que j'avais décrit au cycle 171
   EST à l'œuvre, au moins là. C'est un problème de COORDINATION, pas de
   capacité.
2. **Quatre annulations sur cinq n'ont toujours aucun successeur dans leur
   groupe.** Un second mécanisme, non identifié, existe bel et bien.

Et le seul `success` de la soirée (29538) a été lancé dans le CREUX laissé par
l'annulation de 29526 — il a tenu ses 38 minutes.

> **Une affirmation d'ABSENCE tirée d'un relevé TRONQUÉ n'est pas une mesure.**
> J'avais écrit cette leçon quelques heures plus tôt, dans ce même dépôt, à
> propos d'un balayage qui écartait ce qu'il ne savait pas résoudre : *« zéro
> trouvé » et « zéro existe » ne sont pas la même affirmation.* Je l'ai rejouée
> sur `perPage: 2` — et la première correction, celle qui se voulait rigoureuse,
> a introduit une seconde erreur de la même famille que celle qu'elle corrigeait.
>
> Le discriminant n'est pas « ai-je vérifié ? » mais **« mon instrument pouvait-il
> voir ce que j'affirme absent ? »** — et un `perPage` est exactement le genre de
> paramètre qui rend la réponse non.

Ce qui reste donc établi : la règle de concurrence existe et explique AU MOINS
une annulation de ce soir ; une autre session dispatche sur cette branche ; et
un second canceller, non identifié, reste à trouver. Ce qui est RETIRÉ : la
phrase « ce n'est pas la règle de concurrence », trop forte dans les deux sens.

## Correction à ma propre explication du cycle 171 — le mécanisme n'est PAS établi

Le journal du cycle 171 et le corps de la PR #18705 affirment que « chaque
dispatch annule le précédent sur la même branche », et comptent cinq runs tués
ainsi. **La règle de concurrence est réelle et citée correctement**
(`cancel-in-progress` vaut vrai hors `dev` et `main`), et la corrélation tenait
pour ces cinq runs — chacun avait bien un dispatch postérieur.

Elle ne tient plus. Mesuré ce soir sur ce lot, DEUX dispatches annulés :

| run | créé | annulé | dispatch postérieur ? |
|---|---|---|---|
| `43771352962` | 22:48:46 | 22:51:31 | **non** — le suivant est à 22:52:19, APRÈS |
| `43771678426` | 22:52:19 | 23:00:47 | **non** — aucun |

Et le dépôt ne déclare **aucun** annuleur (`grep` sur
`cancel-workflow`/`skip-duplicate` dans `.github/workflows/` : vide). Le run du
cycle 171 qui a abouti avait tourné 38 minutes sans être touché, donc ce n'est
pas déterministe non plus.

> **Une corrélation qui tient sur cinq cas n'est pas un mécanisme.** J'ai écrit
> « chaque dispatch annule le précédent » parce que c'était vrai de tous les cas
> que j'avais, et la phrase a la forme d'une loi. Le discriminant qui manquait
> est trivial et je ne l'avais pas posé : **y a-t-il un run postérieur ?** —
> deux appels d'API, et ils rendent « non ».

Ce qui reste établi, et qu'il faut garder : la règle de concurrence existe, elle
suffit à expliquer les annulations que J'AI causées en relançant, et le verdict
agrégé reste trompeur (il nomme ce qui n'a pas RÉUSSI).

### Et chercher la cause a rendu un défaut RÉEL, qui n'est pas celui-là — #18760

En cherchant plus loin, le relevé des runs `push` de `dev` de ce soir rend ceci :
**neuf annulés consécutivement** entre 22:03 et 22:15, chacun quelques dizaines
de secondes après sa création — et les deux runs **isolés** (22:30, 22:49)
concluent normalement. C'est trait pour trait le comportement de
`cancel-in-progress: true` : une rafale s'auto-annule, un push isolé n'a rien à
annuler.

Or `ci.yml` déclare l'inverse pour `dev`, et son commentaire raconte au PASSÉ
l'incident que cette forme existe pour empêcher (« ONZE runs consécutifs de
`dev` annulés … près de deux heures pendant lesquelles personne ne pouvait dire
si `dev` était vert », #4395). **La protection ne tient pas, et le dépôt la croit
acquise** — y compris la directive #9226, qui fait de la CI verte de `dev` la
condition de la fusion automatique.

L'inférence — que l'expression `${{ }}` est évaluée **truthy**, le résultat
arrivant sous forme de chaîne et `"false"` étant une chaîne non vide — est
PLAUSIBLE et prédit exactement la table, mais elle n'est pas prouvée ici ; elle
est écrite comme telle dans #18760, séparée de la mesure.

> **Un commentaire qui raconte un incident RÉSOLU est une affirmation, et
> celle-ci dit faux.** C'est la forme de la leçon de ce cycle (un commentaire qui
> exempte en nommant un mécanisme), appliquée non plus à du code mais à de
> l'outillage — et trouvée en cherchant pourquoi ma propre preuve n'aboutissait
> pas. Chercher la cause d'un blocage d'outillage est rentable même quand on ne
> la trouve pas : ce n'est pas le blocage qui a été expliqué, c'est un défaut
> voisin qui coûtait plus cher.

**Ce qui reste NON expliqué** : mes trois dispatches annulés sans aucun run
postérieur dans leur groupe. #18760 n'en rend pas compte, le groupe d'une
branche de travail ne contenant que ses propres dispatches. Reporté une fois sur
la PR, et je n'ai pas relancé davantage — chaque relance étant elle-même une
annulation garantie de la précédente.

## Ce que le cycle n'a pas pris

| # | ce que c'est | pourquoi pas ce lot |
|---|---|---|
| #18614 | l'accusé de remise par fenêtre de temps | **cédé** — PR #18732 écrit déjà le fichier |
| #18618 | rien n'ordonne le direct contre le drain | demande une décision de contrat |
| #18680 | le rejeu ne rattrape que la conversation OUVERTE sur iOS et Android (prémisse corrigée par une session sœur) | lot CLIENT : ni Xcode ni SDK Android dans ce conteneur, donc rien de prouvable ici |
| #18681 | le rejeu révèle l'existence d'un message sous plancher | verdict de produit |
| #18707 | la tranche mémoire partagée entre familles | ouverte par le cycle 171 ; demande un arbitrage de budget |

## La leçon du cycle

`tasks/lessons/2026-11-15-un-commentaire-qui-exempte-en-promettant-un-mecanisme.md`.
