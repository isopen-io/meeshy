## Cycle 204 (suite) — sortir quelqu'un rend le rôle d'agent qui parlait à sa place (#20208)

**Date** : 2026-11-21. **Base** : `dev` à `711e1cafc`. **Issue** : #20208,
ouverte par le lot précédent du même cycle (#20111).

### Pourquoi ce lot, et pourquoi il n'est pas redondant

#20111 a fermé la LECTURE : `getControlledUsers` relit `PARTICIPATION_VIVANTE`,
fail-closed, donc un sorti ne fait plus parler l'agent. L'audit adversarial avait
nommé la moitié restante, et la question méritait d'être posée à voix haute —
*puisque la lecture est gardée, que gagne-t-on à écrire ?*

| | la garde de lecture (#20111) | le retrait (ce lot) |
|---|---|---|
| un sorti ne parle plus | **oui** | oui |
| les lignes DÉJÀ en base | **oui** | non — seuls les gestes futurs |
| le fil cesse d'être scanné pour rien (`hasRoles`) | non | **oui** |
| la place rendue au vivier | non | **oui** |
| l'administration cesse de montrer un sorti comme « contrôlé » | non | **oui** |

C'est la règle qu'`unsetOrNull` énonce déjà pour `LIVE_MESSAGE_MARK` : **écrire
la colonne rend les lectures exactes pour les lignes À VENIR, le prédicat de
lecture les rend exactes pour celles DÉJÀ EN BASE.** Les deux moitiés ne se
substituent pas l'une à l'autre — et ce lot porte les DEUX, parce que la seconde
(le `hasRoles` recoupé) est le seul remède aux lignes déjà écrites.

### La JUMELLE, trouvée au bon moment pour une fois

Le dépôt impose de demander « cette entité a-t-elle une jumelle ? » **au moment
du correctif**, et consigne ce que coûte de l'oublier (`reorderConversationPreferences`,
corrigé trois cycles avant sa jumelle communautaire).

Posée ici, la question a rendu **le départ volontaire** : `leave.ts` ne touchait
pas davantage `AgentUserRole`, pour la même raison, et avec le même effet. Les
deux gestes appellent désormais le même site unique.

> Mesuré au passage : les seuls écrivains d'`AgentUserRole` du dépôt étaient
> `routes/admin/agent-reset.ts` et `jobs/obsolete-conversation-purge.ts`. Le
> premier porte **déjà** l'idiome exact du correctif
> (`deleteMany({ where: { conversationId } })`) : la forme juste était à portée
> de regard, ce qui ne l'a pas rendue présente là où elle manquait.

### Les trois arbitrages, chacun MESURÉ plutôt qu'affirmé

**1. Une SUPPRESSION, pas un champ `releasedAt`.** `AgentUserRole` porte un
travail d'analyse — `personaSummary`, `tone`, `catchphrases`, 23 traits
psychologiques notés — et le supprimer *paraît* le jeter. Mesuré :
`AgentGlobalProfile` est une ligne PAR UTILISATEUR (`userId @unique`), alimentée
depuis le profil de ton à chaque construction (`conversation-scanner` →
`upsertGlobalProfile`), et `getPotentialControlledUsers` la PROJETTE pour amorcer
une élection neuve. **L'analyse survit** ; seule la liaison à cette conversation
part. Un `releasedAt` aurait coûté une colonne, un cliquet et la relecture de
tous les lecteurs, pour conserver ce qui est déjà conservé ailleurs.

Corollaire assumé : **un débannissement ne ressuscite pas le rôle.** La personne
redevient éligible à une élection, qui repartira de son profil global — elle ne
récupère pas sa place par un geste de modération. C'est le bon sens d'erreur.

**2. `AgentConfig.manualUserIds` reste INTACT**, et c'est une décision, pas un
oubli. Aucune fuite à fermer (#20111 le neutralise à la lecture, fail-closed) ;
et bannir est un geste de **MODÉRATION** quand l'épinglage est une instruction
d'**ADMINISTRATION** : retirer silencieusement un id de cette liste laisserait un
modérateur réécrire la configuration d'un administrateur — une escalade de titre
par effet de bord. Reste un écart d'AFFICHAGE, consigné sur le site :
l'administration lit `manualUserIds` et montre donc un banni comme « épinglé ».
De surface, pas de pouvoir.

**3. BEST-EFFORT, et ce qui l'autorise.** Un échec du retrait ne fait pas échouer
le bannissement ni le départ — même arbitrage que la fermeture du lien d'entrée,
à quelques lignes de là. Ce qui rend ce choix légitime, et qu'il fallait écrire
plutôt que supposer : **la lecture d'aval est déjà fail-closed.** Un rôle qui
survit à un retrait raté ne fait plus parler personne ; il ne coûte qu'un slot
de vivier et un scan à vide. **Sans #20111 en aval, ce best-effort serait une
faute** — et c'est la phrase qui dit pourquoi l'ordre des deux lots importait.

### La MESURE, qui dit si le lot a servi

`getEligibleConversations` retenait un fil sur `hasRoles` **seul** — un `groupBy`
qui comptait les rôles sans regarder la participation. Il court-circuitait donc
la mesure d'éligibilité que #20111 venait de resserrer : un fil dont tous les
rôles sont des sortis était retenu à CHAQUE passe, pour que `getControlledUsers`
n'en serve aucun. Un scan à vide, indéfiniment, puisque rien ne périme un rôle.

La lecture compte désormais les rôles dont le porteur a une participation
VIVANTE, recoupés par la paire `conversationId|userId` — un rôle vaut pour SA
conversation, jamais pour une autre. Deux lectures au lieu d'une, bornées aux
conversations candidates.

### Ce que la mesure a rendu EN PLUS, et qui n'est pas de ce lot

En cherchant les jumelles, j'ai mesuré `AccountPurgeService` : il purge **douze**
tables à la suppression d'un compte, et **aucune n'est une table de l'agent**.
Survivent donc à la suppression du compte : `AgentGlobalProfile` (keyé
`userId @unique`) et `AgentUserRole` — c'est-à-dire **un profil comportemental et
psychologique dérivé des messages d'une personne, construit pour parler à sa
place**, nommément attaché à elle.

**Issue #20238**, et délibérément pas ce lot : c'est une question de CONFORMITÉ
(droit à l'effacement sur des données DÉRIVÉES), la suppression n'est peut-être
pas le bon geste (l'anonymisation l'est pour les messages — `anonymizeDeletedAccountMessages`
—, et la cohérence avec lui s'instruit), et je n'ai inventorié que deux tables
sur au moins six. **Un lot qui purge la moitié d'une famille est pire qu'un lot
qui n'en purge aucune : il donne la purge pour faite.**

### Preuve

- **Site unique** `releaseAgentRole.ts` : 4 témoins — la paire visée ; zéro rôle
  n'est pas un échec ; l'échec rend `null` sans remonter ; **et la requête ne
  part PAS sans `userId`**, parce qu'un `undefined` ignoré par Prisma viserait
  TOUS les rôles de la conversation (#14448).
- **Bannissement** : 3 témoins, dont « écrit le bannissement même si le retrait
  échoue ». ROUGE mesuré : retirer l'appel ⇒ 1 témoin rouge.
- **Départ** : 2 témoins, par `app.inject()`, sur l'identifiant RÉSOLU et non
  celui de l'URL.
- **Mesure** : 4 témoins. ROUGE mesuré : retirer le recoupement ⇒ 2 rouges.
- Les doubles Prisma des deux suites de route ont reçu `agentUserRole.deleteMany`
  **parce que la production l'appelle** : sans lui, le retrait best-effort
  avalerait un `TypeError` et les témoins passeraient au VERT sur une production
  qui ne retire rien. Un double incomplet ne cache pas un défaut ici — il en
  FABRIQUE un faux vert.
- 505 témoins de l'agent verts ; `tsc` vert sur `shared`, `gateway` et `agent`.

### Deux accidents du lot, consignés

**1. Le client Prisma était PÉRIMÉ après la fusion de `dev`.** `tsc` rendait
trois erreurs dans des fichiers que ce lot ne touche pas (`relations/locations.ts`,
`game/GameBlockService.ts`, `game/MissionService.ts`) : des champs de schéma
ajoutés par `dev` contre un client généré avant la fusion.

> **Fusionner `dev` peut périmer le client généré, et l'erreur se présente dans
> les fichiers d'AUTRUI.** `npx prisma generate` fait partie du rejeu des gates
> sur l'arbre fusionné, pas des préliminaires d'installation. Trois erreurs
> étrangères après une fusion se lisent comme « `dev` est rouge » ; c'est
> l'outil local qui est en retard.

**2. J'ai relu le code de sortie d'un gate à travers un pipe**, et il rendait
`0` sur un `tsc` qui échouait — le défaut que `services/gateway/CLAUDE.md`
décrit mot pour mot (« ne jamais passer un gate par un pipe quand c'est son code
de sortie qu'on interroge »). Écrit dans le dépôt, relu le matin même pour un
autre lot, commis l'après-midi.

**3. Le message de commit a perdu deux mots, exécutés par bash** (leçon :
`tasks/lessons/2026-11-21-un-accent-grave-dans-un-message-de-commit-est-une-substitution-de-commande.md`). Les
accents graves de la phrase qui justifiait la suppression ont été interprétés
comme des substitutions de commande dans une chaîne entre guillemets doubles :
le commit poussé porte « Un  et non un , mesuré : … », et `bash` a répondu
`delete: command not found`. L'amende aurait exigé un push forcé, refusé —
**la correction est donc cette ligne**, et la leçon est en face.
