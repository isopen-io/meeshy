## Cycle 203 — l'agent ne parle plus à la place d'un membre BANNI, et le balayage des audiences voit DEUX paquets (#20111)

**Date** : 2026-11-21. **Base** : `dev` à `9f7a74ca9`. **Issue** : #20111
(suivi de #20100, parent #20091).

### Pourquoi ce lot

Le cycle 202 (#20183) s'est clos sur deux instruments manquants, et #20111 est
le plus ancien des deux : **la portée du balayage des audiences est une
affirmation que personne ne relit, et #20091 ne l'avait bougée que d'un cran.**
Elle est passée de `src/socketio/` à `src/` — d'un RÉPERTOIRE — pas de
`services/gateway` à `services/`, c'est-à-dire pas d'un PAQUET.

`services/agent` est un paquet TypeScript BLOQUANT en CI, et il lit
`Participant`.

### Ce que l'ouverture a rendu : QUATRE lectures, pas deux

L'issue en nommait deux (`mongo-persistence.ts:407` et `:469`). Mesuré sur
l'arbre vivant, il y en avait **quatre** — la leçon 261 appliquée à l'énoncé du
défaut lui-même (« cette liste dit-elle les sites où la règle s'applique, ou
seulement ceux par lesquels je l'ai trouvée ? ») :

| # | site | ce qu'il décide | sort |
|---|---|---|---|
| A | `getInactiveUsers` (`:407`) | — | **SUPPRIMÉ** : zéro appelant dans tout le dépôt |
| B | `getPotentialControlledUsers` (`:469`) | à la place de QUI l'agent parle | loi posée |
| C | `getLeastActiveParticipants` (`:507`) | le repli du même choix | loi posée |
| D | `participant.groupBy` de `getEligibleConversations` (`:624`) | quelles conversations valent un scan | loi posée |

**A était du code mort**, et le relever change le compte rendu du lot : l'issue
demandait que « les deux lectures répondent par écrit » ; l'une répond en
disparaissant. Corriger du code mort aurait produit une garde qu'aucun appel
n'exerce, donc une garde qui se périme sans bruit.

**D n'est pas une fuite, c'est un nombre FAUX** — troisième ligne du tableau de
`services/gateway/CLAUDE.md` § audiences (« COMBIEN ils sont : dire ce que le
nombre alimente »). Il élit les conversations à scanner : compter un banni comme
éligible envoyait scanner un fil dont B et C ne retiendront personne. La loi y
est posée pour que **le compte dise la même chose que ce qu'il garde**, pas pour
fermer une porte.

### Ce que B et C laissaient faire, et pourquoi c'est pire qu'une fuite

L'agent sélectionne les membres DORMANTS d'une conversation **pour parler à leur
place** (archétype « Impersonator »). Un membre actif-et-banni y était éligible :
l'agent publiait un message **signé de quelqu'un d'exclu, dans le fil dont il est
exclu**.

> Les cinq portes du cycle 202 rendaient de l'information, et la plus grave
> rendait une CAPACITÉ (fabriquer un lien). Celle-ci ne rend ni l'une ni
> l'autre : elle **ÉCRIT**, et elle écrit sous une identité qui n'a plus le
> droit d'être là. Un banni n'avait rien à contourner — c'est le produit qui
> parlait pour lui.

La population existe : `{ isActive: true, bannedAt ≠ null }` est en base (bannir
pendant qu'une participation est inactive n'écrit que `bannedAt`,
`conversationBanState.ts`), son producteur est fermé (#19688, #10436), et aucune
migration n'a repris les lignes existantes.

Le site était **doublement masqué** : hors de la racine du balayage, **et**
derrière le `notIn` que le discriminant d'identité prenait pour la désignation
d'une personne (corrigé par #20100, mais hors de sa portée).

### LE TROU QUE L'AUDIT A OUVERT : la garde était sur l'ÉLECTION, pas sur la LIVRAISON

**C'est le constat le plus important du cycle, et il condamnait le titre du lot.**
Le § neuf de `services/agent/CLAUDE.md` s'appelait « L'agent ne parle JAMAIS à la
place d'un membre BANNI ». Mesuré par l'audit adversarial : **faux.**

Les quatre lectures ci-dessus gardent l'**ÉLECTION** — qui ENTRE sous contrôle de
l'agent. `getControlledUsers` est l'autre bout : ce que les **trois** chemins de
livraison appellent avant de faire parler l'agent
(`reactive/reactive-handler.ts`, `scheduler/conversation-scanner.ts`,
`server.ts`). Il ne lisait **aucune** participation — `agentUserRole.findMany({
where: { conversationId } })` nu, puis un filtre sur la seule horloge
`User.lastActiveAt`.

Deux chemins par lesquels un banni parlait encore, et le second ne dépend
d'aucune ligne héritée :

| chemin | pourquoi il survivait |
|---|---|
| le rôle déjà **DÉTENU** | rien, sur le chemin de bannissement, ne libère `AgentUserRole` (mesuré : seuls `routes/admin/agent-reset.ts` et `jobs/obsolete-conversation-purge.ts` y touchent) ; et il ne se périme pas, `touchUserRoles` réécrivant `lastUsedAt` **chaque fois qu'il SERT**, pendant qu'`evictRecentlyActiveUsers` n'agit que si la personne REVIENT |
| l'**épinglage manuel** (`AgentConfig.manualUserIds`) | la branche `missingManualIds` fabriquait un `ControlledUser` sans lire `Participant` du tout |

> **Une garde posée sur l'ÉLECTION ne garde pas la LIVRAISON.** C'est la question
> du cycle 202 — « qui AUTORISE ce que cette clause rend ? » — **retournée** :
> là-bas la clause était nue et l'autorisation vivait en aval, donc il n'y avait
> rien à réparer ; ici la clause est juste et **personne ne la rejoue au moment
> où le message part**. La même question, les deux sens, deux verdicts opposés.
> Il faut donc la poser dans les deux sens : *qui autorise ce que cette clause
> rend ?* **et** *cette clause est-elle rejouée là où l'effet se produit ?*

Et le cliquet des audiences ne pouvait pas le voir **par construction** :
`getControlledUsers` ne lisait pas `Participant`. L'affirmation du lot — « une
quatrième lecture posée sur `isActive` nu le fait rougir » — était donc vraie et
**hors sujet** : un cliquet qui garde une TABLE ne dit rien d'un chemin qui ne
l'interroge pas.

**Fermé dans ce lot**, et fail-closed : `getControlledUsers` relit
`PARTICIPATION_VIVANTE` sur les ids candidats, et un contrôlé sans participation
vivante est LÂCHÉ — le silence d'un animateur ne coûte rien, parler au nom d'un
exclu si. L'épinglage manuel garde exactement ce qu'il a toujours contourné —
l'horloge d'inactivité — **jamais l'appartenance**.

**L'écriture reste OUVERTE : #20208.** Retirer `AgentUserRole` AU bannissement
n'est pas redondant avec cette garde, et la raison est celle qu'`unsetOrNull`
écrit déjà pour `LIVE_MESSAGE_MARK` : *écrire la colonne rend les lectures
exactes pour les lignes À VENIR, le prédicat de lecture les rend exactes pour
celles DÉJÀ EN BASE.* Ce que seul le retrait gagne : `getEligibleConversations`
retient un fil sur `hasRoles` **seul**, donc un fil dont tous les rôles sont des
bannis est scanné à chaque passe pour ne rien produire — la MESURE que ce lot
vient de corriger est court-circuitée.

### Pourquoi la loi a déménagé dans `@meeshy/shared`

`PARTICIPATION_VIVANTE` vivait dans
`services/gateway/src/routes/conversations/utils/access-control.ts`. **Le service
agent ne peut rien importer de la passerelle.** Une loi qu'un paquet ne peut pas
importer est une loi qu'il va réécrire ou ignorer ; ici il l'avait ignorée.

- `packages/shared/utils/prisma-unset.ts` — `unsetOrNull` / `differsOrUnset`
  déménagés ; `services/gateway/src/utils/prisma-unset.ts` est une **coquille de
  ré-export**, la forme que ce dépôt prescrit déjà après une scission de module.
  **55 fichiers de la passerelle consomment ce chemin (53 de production, 2 de
  témoins), et ils sont inchangés** — `tsc` le prouve.
- `packages/shared/utils/participation-vivante.ts` — la loi et
  `participationEstVivante`, avec le doc-comment qui les instruit.
  `access-control.ts` les ré-exporte **sous le même nom** : le cliquet reconnaît
  la loi à cette orthographe (`LAW_SPELLINGS`), et la renommer reclasserait son
  inventaire entier pour aucun signal de plus.

### La portée est une LISTE DE RACINES, et elle NOMME ce qu'elle laisse dehors

`AUDIENCE_ROOTS` remplace le `path.resolve` unique :

| paquet | lit `Participant` ? | dans la portée ? |
|---|---|---|
| `services/gateway/src` | oui, partout | **oui** (préfixe vide) |
| `services/agent/src` | oui — les sélecteurs de dormants | **oui**, préfixe `@meeshy/agent/` |
| `services/translator` | non — Python, aucun client Prisma | non |
| `packages/shared` | il DÉCLARE la loi, n'interroge rien | non |
| `apps/*` | non — aucun client Prisma instancié | non |
| `scripts/` | **OUI** — 6 lectures dans 4 fichiers | non, et sa raison est AUTRE |

Deux décisions de forme, et chacune a sa raison écrite sur le site :

1. **Le préfixe de la passerelle est VIDE.** L'asymétrie est mesurée :
   repréfixer la passerelle reclasserait **89 clés d'inventaire** à la main pour
   zéro signal — et un inventaire recopié est l'endroit où une ligne se perd. Ce
   qu'une clé doit garantir est qu'elle désigne EXACTEMENT un fichier, et
   `@meeshy/agent/` ne peut par construction collisionner avec aucun chemin
   relatif (aucun ne commence par `@`). Un témoin garde l'unicité du préfixe
   vide.
2. **Une racine déclarée et ABSENTE du disque JETTE.** Un balayage qui saute en
   silence une racine qu'il annonce est exactement la portée fausse que le lot
   corrige — « un inventaire vide et un balayage aveugle sont le même vert ».

### Preuve

- **ROUGE mesuré, deux fois.**
  - `services/agent/src/__tests__/memory/mongo-persistence-living-participation.test.ts`,
    12 témoins neufs : sur l'arbre d'avant, **5 des 7 premiers tombent** (le
    banni est élu par B et par C ; les deux témoins de non-régression ; la
    conversation au seul dormant banni est retenue par D), et **3 des 5
    derniers** (la garde de LIVRAISON, § ci-dessous).
  - Portée : `...PARTICIPATION_VIVANTE` → `isActive: true` sur les trois sites
    ⇒ le balayage les rend `law=false` et **3 témoins des deux suites de cliquet
    rougissent**. Le balayage voit bien le paquet, et il voit bien la loi.
- **Les doubles honorent leur `where`.** `findManyIn` et `groupByIn`
  (`services/gateway/src/__tests__/helpers/mongo-where.ts`, le **plus complet**
  des cinq évaluateurs de `where` du dépôt, et le seul SANS DÉPENDANCE — ce qui
  est la propriété qui autorise un import inter-paquets ; importé, jamais
  recopié) ÉVALUENT la clause contre
  des documents nus. La fixture `dormantVivant` ne porte **aucune clé
  `bannedAt`** : le témoin « vivant admis » passe donc par la branche
  `{ isSet: false }`, pas par chance. `groupByIn` est neuf, et il refuse toute
  agrégation autre que `_count: true` plutôt que de rendre un nombre inventé.
- **Un témoin de la loi elle-même** : `PARTICIPATION_VIVANTE` deep-equals
  `{ isActive: true, OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }] }`.
  C'est la seconde preuve qui autorise le cliquet à faire confiance au NOM dans
  un second paquet — il reconnaît la loi par son orthographe, et seule une
  identité prouvée justifie cette confiance (même régime que
  `ADMITTED_FILE_READER_WHERE`).
- `tsc --noEmit` vert sur `packages/shared`, `services/gateway` et
  `services/agent` ; 496 témoins de l'agent verts ; suite complète du gateway
  rejouée.

### TROIS erreurs du lot, gardées pour ce qu'elles mesurent

**1. Une garde ANNONCÉE totale, posée sur un seul bout** — le § ci-dessus. Le
titre disait « JAMAIS » là où le lot tenait l'élection et laissait la livraison
ouverte. Le dépôt a un nom pour cela : **« une garde partielle annoncée totale
est pire qu'une garde absente »**, et c'est la troisième fois en deux cycles que
ce reproche tombe. Trouvée par l'audit adversarial, pas par le lot.

**2. Des comptes écrits sans être posés comme des questions — TROIS.** Les
documents ont d'abord annoncé « 98 importeurs », « 99 clés d'inventaire » et
« 4 témoins tombent ». Mesuré : **55** consommateurs (53 de production, 2 de
témoins), **89** clés (15 + 74 ; les 10 de `MEASURED_FAMILIES` ne sont pas des
clés de site), **5** témoins sur 7. Le détail du premier : **53**
fichiers de PRODUCTION importent `utils/prisma-unset` ; **55 consommateurs** en
tout, les 2 témoins compris (56 fichiers si l'on compte la coquille elle-même).
98 est le
compte des fichiers qui **mentionnent** `unsetOrNull` ou `differsOrUnset` —
commentaires, journaux et balayages de texte compris — c'est-à-dire la réponse à
une autre question que celle qui était posée (« combien de fichiers casse ce
déménagement ? »).

Les deux commandes se ressemblent (`grep -rl <nom>` contre
`grep -rlE '^import .*<chemin>'`) et une seule répond. Le chiffre a été écrit
dans le même lot que la phrase du § portée qui dit qu'un compte recopié dérive —
**écrire une règle ne l'applique pas au lot qui l'écrit** (c'est le constat
textuel du cycle 202, rejoué sur un compte au lieu d'une porte). Corrigé dans
`services/gateway/CLAUDE.md`, le doc-comment de la coquille et ici ; les deux
premiers messages de commit du lot portent encore 98, et cette ligne est leur
correction.

**Et la passe de CORRECTION a laissé passer le chiffre résiduel** vingt lignes
au-dessus de son propre paragraphe, dans le fichier de leçon — plus les deux
autres comptes, qu'elle n'a pas pensé à relire parce qu'elle corrigeait « le »
compte. Une passe de correction a besoin de la même relecture que la passe
d'origine ; l'audit adversarial les a trouvés tous les trois.

**3. La garde partie par accident.** La seconde passe de documentation a
**effacé le spread** `...PARTICIPATION_VIVANTE`
du site D en réécrivant son commentaire. Le témoin du compte l'a dit tout de
suite — c'est précisément pour cela qu'il assert sur les conversations RENDUES
et non sur la forme du `where`.

> Un témoin de garde doit tomber quand la garde part **par accident**, pas
> seulement quand on la retire exprès. Le second cas est celui qu'on imagine en
> écrivant le témoin ; le premier est celui qui arrive.

### Ce qui reste OUVERT

- **#20155** — le balayage FRÈRE, celui des PORTES keyées sur l'appelant, reste
  à construire. Ce lot n'y touche pas : il étend la portée du balayage des
  AUDIENCES, dont le discriminant écarte par construction une clause qui désigne
  une personne.
- **#20189** — décision produit du porteur (les droits d'un banni sur les liens
  qu'il a créés), inchangée.
- `getInactiveUsers` supprimé : si un lot futur a besoin d'un tel sélecteur, il
  le réécrit sous la loi, et le cliquet l'y oblige.
- **#20208 (NEUF)** — bannir ne libère pas `AgentUserRole`, et ce rôle ne se
  périme jamais. La LECTURE est fermée par ce lot ; l'écriture, non, et c'est
  elle qui rendrait au scan les conversations qu'il parcourt pour rien.
- **Deux faiblesses de témoin, consignées par l'audit** : le `throw` sur racine
  absente n'a aucun rouge propre (la propriété est tenue par le témoin voisin
  « chacune EXISTE sur le disque », qui rougit bien), et `groupByIn` n'a pas de
  témoin dans le paquet qui le porte. Les deux sont réparés dans ce lot.
- **Le cliquet de la passerelle, SEUL, certifie `bannedAt: null`** — l'orthographe
  qui ÉTEINT la sélection pour toute la population. `guardsAgainstBan` l'admet
  par décision écrite (`captureNoticeVisibility.ts` l'épelle ainsi), et ce sont
  les témoins de COMPORTEMENT de l'agent qui l'attrapent (5 rouges sur 7). La
  phrase du lot — « un témoin qui compare la clause reçue ne vérifie que sa
  propre copie » — vaut donc **aussi de son propre cliquet**.
