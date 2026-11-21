## Cycle 206 — les portes à clé d'appelant ont enfin un cliquet (#20155)

Date : 2026-11-21. Lot : le balayage frère de `sweepConversationAudiences`.
Branche `claude/exciting-planck-iofkyv`.

### Ce que ce lot ferme

Le cliquet des audiences écarte DÉLIBÉRÉMENT toute clause qui nomme une personne
(#20100) : une audience est un ensemble. La conséquence, mesurée en livrant
#20135, est que **toute porte qui résout l'appelant par son propre `userId` était
hors de sa portée par construction** — le relevé de `routes/links/management.ts`
y est littéralement vide, ni audience ni publication d'illisibilité, alors que ce
fichier portait exactement le défaut que le cliquet existe pour empêcher. Trois
défauts de cette famille ont été livrés en deux jours (#20104, #20135, #20136).

### La mesure qui a changé le plan

L'issue parlait d'« un balayage de discriminant opposé ». Les trois défauts de
référence ne sont pas de la même forme :

| défaut | la clause | le genre |
|---|---|---|
| #20135 | `where: { userId, isActive: true }` | CLAUSE |
| #20104 | `where: { isActive: true, type: 'user' }` + `.find(m => m.userId === inviterId)` | PRÉDICAT |
| #20136 | `participants: { select: … }` sans aucun `where` + `.filter(p => p.userId === userId && p.isActive !== false)` | PRÉDICAT |

Le discriminant « opposé » seul retrouve #20135 et manque les deux autres. Le
balayage porte donc DEUX discriminants, et chaque site relevé dit lequel l'a vu.

### Le verdict d'un prédicat ne peut pas se lire sur le seul rappel

#20104 le prouve : son correctif a mis la loi dans la CLAUSE et laissé le rappel
`m => m.userId === inviterId` sans loi. Un balayage qui ne jugerait que le rappel
rendrait ce site NU alors qu'il est juste — et un cliquet qui rougit sur du code
correct est désactivé en une semaine.

La liste prédiquée se rattache donc à la projection `participants:` la plus
proche en amont, et **le rattachement est rendu sans conséquence sur le
verdict** : quand plusieurs projections la précèdent et que leurs verdicts de loi
DIFFÈRENT, le site est publié `source-ambigue` au lieu d'être jugé. Le choix de
la plus proche ne décide jamais seul d'un vert ni d'un rouge.

### Ce qui a été mesuré

| | |
|---|---|
| portes relevées | 156 — 148 clauses, 8 prédicats |
| portes NUES (inventoriées) | 130 |
| dont décidées LARGES, raison instruite | 2 |
| publiées faute d'être jugeables | 25 (15 `where-illisible`, 6 `source-introuvable`, 4 `source-ambigue`) |

Resserrements de portée, tous deux délibérés et écrits sur place : `count` /
`aggregate` / `groupBy` sont des **MESURES** (le `CLAUDE.md` de la passerelle a
déjà tranché leur régime — « la troncature et le sur-comptage y sont des nombres
FAUX, pas des fuites »), et `findMany` rend un ENSEMBLE, donc une audience, qui a
déjà son cliquet. Sans ces deux exclusions, 41 hydratations par lot et 41 mesures
entraient dans un inventaire de sécurité où chacune se lirait comme une
autorisation.

### Preuve de ROUGE

Les trois défauts, repris à leur état d'avant correctif en fixtures, sont nommés
chacun une fois et par le bon discriminant ; les trois mêmes, à leur état
corrigé, sont VERTS. `p.isActive !== false` — l'orthographe que #20136 a
corrigée, qui admet une ligne dont `isActive` est absent — n'est pas prise pour
la loi, et un témoin l'épingle. Mutation sur l'arbre vivant : une porte nue
ajoutée à `routes/conversations/leave.ts` fait tomber le cliquet
(`entrantes ≠ []`).

### Deux défauts du lot, trouvés par ses propres exigences

**1. Le balayage était à moitié aveugle, et rendait un ZÉRO.** Première
exécution : 148 clauses, **0 prédicat**. `callArguments`, réutilisée du cliquet
des audiences, cherche la prochaine ACCOLADE — juste pour `findFirst({ where: …
})`, incapable de lire un rappel en flèche sans accolades. Elle rendait le bloc
du `if` SUIVANT, du code voisin plausible sous lequel le discriminant d'identité
répondait `false`. C'est la preuve de ROUGE, pas une relecture, qui l'a nommé.
Leçon : `tasks/lessons/2026-11-21-un-extracteur-qui-ne-sait-pas-lire-une-forme-rend-un-zero-qui-ressemble-a-une-absence.md`.

**2. L'inventaire a porté une clé INVENTÉE.** Le critère de fin demandait de
porter deux exemptions déjà instruites (créateur de groupe #20100, créateur de
lien #20135). Recopiées depuis l'issue, elles ont produit
`access-control.ts#clause:0` — une clé qu'aucun balayage ne produit. Vérifié :
**aucune des deux n'est dans ce relevé**, et chacune pour une raison différente
qui dit le périmètre du balayage et non l'état du dépôt — le créateur d'un groupe
est cherché par son RANG (sa clause ne nomme personne, donc elle reste une
audience, à sa place dans l'autre inventaire) ; le créateur d'un lien se
reconnaît à `link.createdBy === userId`, une colonne de PROPRIÉTÉ sur une AUTRE
table, **un troisième genre que ce balayage ne couvre pas** (#20189).

Les deux vraies exemptions sont `target-participant.ts`, dont la largeur est
instruite sur place depuis #10465 : « bannir quelqu'un déjà parti est un geste
légitime … et c'est l'appelant qui décide ce qu'il exige de l'état ». Resserrer
là rendrait un banni INTROUVABLE, donc impossible à débannir — la loi appliquée
à ce site retirerait le seul geste qui le répare. Un témoin interdit désormais
toute clé fantôme dans les deux inventaires, et un autre les exige DISJOINTS.

### Les familles nomment une FORME, jamais un verdict

Un premier jeu d'étiquettes fondait `id: authContext.participantId` et
`id: message.senderId` sous « résolution de participant ». Même forme, questions
opposées : la première résout l'appelant, la seconde hydrate un TIERS pour le
notifier. L'étiquette se lisait comme un verdict (« ce sont des portes ») alors
qu'elle ne décrivait qu'une forme. Les familles décrivent donc ce qui est
LISIBLE, et la question reste entière : **« qui AUTORISE ce que cette clause
rend ? »** — celle qui a mesuré fausse, au cycle 202, l'affirmation portée sur
`messages-send.ts`, dont la clause figure dans cette liste et dont l'autorisation
vit en aval (#10440).

### Ce que le balayage a trouvé, et qui n'est pas de ce lot

Six prédicats d'identité sans loi. Deux portent sur `CallSession.participants` —
une AUTRE table qui partage le nom de relation — et sont étiquetés à part :
ce sont des portes réelles (la première garde l'accès à la TRANSCRIPTION d'un
appel) mais la loi y porte sur le `participant` IMBRIQUÉ, donc sur la projection
d'en face.

Le plus sérieux est `routes/conversation-encryption.ts`. `REGIME_SELECT` charge
ses participants sous `where: { isActive: true }` — nu — et `memberOf` les
parcourt par `participant.userId === userId` sans loi, pour alimenter
`actorHasMinimumRole` sur les TROIS routes du régime de chiffrement. Mesuré :
**un modérateur actif-et-banni agit encore sur le régime E2EE d'une conversation
dont il est exclu.** C'est un lot de cryptographie et de contrôle d'accès : il
passe par `auditeur-adversarial` avant fusion (directive #9226), donc par son
issue, pas par celui-ci.
