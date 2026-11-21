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

### Pourquoi la loi a déménagé dans `@meeshy/shared`

`PARTICIPATION_VIVANTE` vivait dans
`services/gateway/src/routes/conversations/utils/access-control.ts`. **Le service
agent ne peut rien importer de la passerelle.** Une loi qu'un paquet ne peut pas
importer est une loi qu'il va réécrire ou ignorer ; ici il l'avait ignorée.

- `packages/shared/utils/prisma-unset.ts` — `unsetOrNull` / `differsOrUnset`
  déménagés ; `services/gateway/src/utils/prisma-unset.ts` est une **coquille de
  ré-export**, la forme que ce dépôt prescrit déjà après une scission de module.
  **98 importeurs de la passerelle sont inchangés**, et `tsc` le prouve.
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
| `apps/*`, `scripts/` | aucun accès base | non |

Deux décisions de forme, et chacune a sa raison écrite sur le site :

1. **Le préfixe de la passerelle est VIDE.** L'asymétrie est mesurée :
   repréfixer la passerelle reclasserait **99 clés d'inventaire** à la main pour
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
    7 témoins neufs : sur l'arbre d'avant, **4 tombent** (le banni est élu par B
    et par C ; la conversation au seul dormant banni est retenue par D).
  - Portée : `...PARTICIPATION_VIVANTE` → `isActive: true` sur les trois sites
    ⇒ le balayage les rend `law=false` et **3 témoins des deux suites de cliquet
    rougissent**. Le balayage voit bien le paquet, et il voit bien la loi.
- **Les doubles honorent leur `where`.** `findManyIn` et `groupByIn`
  (`services/gateway/src/__tests__/helpers/mongo-where.ts`, le seul évaluateur de
  `where` MongoDB du dépôt — importé, jamais recopié) ÉVALUENT la clause contre
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

### Une erreur du lot, gardée pour ce qu'elle mesure

La seconde passe de documentation a **effacé le spread** `...PARTICIPATION_VIVANTE`
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
