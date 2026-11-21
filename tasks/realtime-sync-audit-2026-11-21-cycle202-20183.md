## Cycle 202 — un membre banni ne FABRIQUE plus de lien de partage, et n'en lit plus un (#20183)

**Date** : 2026-11-21. **Base** : `dev` à `5b369794a`. **Issue** : #20183.
**Milestone** : #286 (« Un membre banni ne franchit ni ne figure plus dans la
conversation dont il est exclu »).

### Pourquoi ce lot, et comment il a été trouvé

#20135 (cycle 200) a fermé l'**administration** d'un lien de partage à un
modérateur actif-et-banni, et son commentaire de clôture a nommé la lacune
d'instrument : **le cliquet garde les AUDIENCES ; personne ne garde les
PORTES** — une lecture de `Participant` keyée sur l'APPELANT est écartée du
balayage par construction, puisqu'une audience est un ENSEMBLE (#20100). C'est
l'issue #20155.

Ce lot n'a pas construit ce balayage. Il a passé une **sonde jetable** de
discriminant OPPOSÉ — `namesAParticularMember(where) && !spellsTheLaw(where)`,
les deux primitives du balayage des audiences — et ouvert ce qu'elle rendait :

| mesure, 2026-11-21, `services/gateway/src/` entier | |
|---|---|
| portes relevées (clause keyée sur l'appelant) | **237** |
| dont clause NUE (`isActive` seul, ou rien) | **211** |
| lectures que la sonde n'a pas su juger | 30 |

211 n'est pas un inventaire à geler : la majorité de ces portes ne décide
d'aucune autorisation (statistiques d'administration, succès, export RGPD,
identité de déposant). **Le relevé sert à CHOISIR où regarder**, pas à conclure
— c'est la leçon 261 appliquée à soi-même.

### Ce que l'ouverture a rendu : UNE famille, six portes

| # | site | ce qu'un banni-mais-actif obtenait |
|---|---|---|
| A | `links/utils/share-link-mint.ts` (`POST /links`, `POST /conversations/:id/new-link`) | **il FABRIQUAIT un lien** vers la conversation dont il est exclu |
| B | `conversations/sharing.ts` (`GET /conversations/:id/links`, alias déprécié) | la liste des liens vivants |
| C | `links/user.ts` (`GET /links?conversationId=`) | idem, et **TOUS** les liens s'il est modérateur |
| D | `links/utils/prisma-queries.ts` → `findActiveUserParticipant` (fiche d'un lien) | `hasAccess` de MEMBRE, par-dessus l'aperçu public |
| E | `links/messages-retrieval.ts` (`GET /links/:identifier/messages`) | **les messages de la conversation** |
| F | `links/messages.ts` (la porte de l'invité anonyme lui-même) | il écrivait encore |

### A n'est pas une fuite de lecture, c'est un CONTOURNEMENT par procuration

Les cinq autres portes rendent de l'information. Celle-là rend une
**capacité**, et le détour est ce qui la rend grave : le banni ne peut pas
rentrer lui-même — `resolveConversationEntry` refuse sa ligne — mais **le lien
qu'il fabrique n'a, lui, aucun passé.** Un invité anonyme qui l'emprunte n'a
pas de ligne à refuser. Un membre exclu pouvait donc encore faire entrer qui il
veut, et publier la conversation à qui la demande.

> La question à poser à une porte n'est pas seulement « que LIT-on à travers
> elle ? » mais **« que peut-on FABRIQUER avec ce qu'elle rend, et ce que l'on
> fabrique porte-t-il encore le refus ? »**. Un artefact neuf hérite des droits
> de son auteur, jamais de ses interdits.

### Le ROUGE, porte par porte

Mesuré sur l'arbre d'avant le correctif, avec des doubles qui **honorent leur
`where`** (`findFirstIn`, `findFirstHonouringWhere` — sous un
`mockResolvedValue`, retirer la garde laisse les témoins VERTS) :

| porte | témoin | avant |
|---|---|---|
| A | fabrique refusée · aucune ligne écrite | **2 ROUGES** (le banni atteignait la génération de l'identifiant public) |
| D | `findActiveUserParticipant` rend `null` | **1 ROUGE** |
| B | 404 d'une conversation inconnue, aucun lien lu | **1 ROUGE** |
| C | 404, aucun lien lu | **1 ROUGE** |
| E | 403, aucun message lu | **1 ROUGE** |
| F | `410 GUEST_ACCESS_REVOKED` | **1 ROUGE** |
| **total** | | **7 ROUGES sur 7**, puis 120/120 verts |

Et les témoins qui PASSAIENT déjà avant le correctif valent autant : chaque
porte garde son témoin « membre PARTI » (`isActive: false`) et son témoin
« participation VIVANTE admise ». Sans le second, une clause trop serrée
fermerait la porte à toute la population et les trois premiers resteraient
verts.

### L'erreur SYMÉTRIQUE, remesurée

`bannedAt: null` au lieu d'`unsetOrNull('bannedAt')` — la colonne étant ABSENTE
du document de tout participant jamais banni :

| mutation | témoins rouges |
|---|---|
| clause NUE (l'état d'avant) | 7 |
| `bannedAt: null` | **14** |

Même enseignement qu'au cycle 200, et c'est une bonne nouvelle : l'erreur
symétrique est **catastrophique, pas subtile** — un dépôt qui l'écrirait par
accident le saurait le jour même.

### F : le refus juste n'est pas le refus voisin

La porte de l'invité anonyme a DEUX lectures, et la seconde est délibérément
LARGE (ni `isActive`, ni `bannedAt`) : c'est elle qui distingue « accès FINI »
de « session inconnue » (#10492). Resserrer la première fait donc tomber
l'invité banni dans le `410 GUEST_ACCESS_REVOKED` que le fichier avait **déjà
écrit pour lui**, et non dans le `401` — qu'un client REJOUE. Le correctif n'a
rien eu à décider : la branche existait, il lui manquait son cas.

> **Avant de choisir un code de refus, lire ce que le site d'en face fait des
> codes qu'il sert déjà.** Un 401 posé ici aurait transformé une exclusion
> définitive en boucle de renvoi, sous une étiquette qui dit autre chose — la
> forme exacte du net-négatif que #20093 a mesuré sur l'annuaire E2EE.

### Ce que ce lot ne touche pas, et pourquoi

- **Les cinq AUDIENCES du même répertoire** (`findLinkMembers`,
  `findLinkAnonymousParticipants`, `countLinkParticipantsByType`,
  `countOnlineAnonymousParticipants`) : elles répondent « qui est affiché /
  combien sont-ils », relèvent de la loi #16690 et de l'inventaire du balayage
  des audiences. Une porte et une audience n'ont ni la même question ni le même
  sens d'erreur.
- **La seconde lecture de `messages.ts`** (voir ci-dessus) : large par décision
  écrite sur place.
- **`loadReaderHistoryFloor`** (`services/historyFloor.ts`), qui lit la ligne de
  l'appelant en clause nue : c'est un RÉSOLVEUR de plancher d'historique, il ne
  refuse rien, et il est appelé APRÈS la porte que ce lot vient de fermer.
  Consigné, pas corrigé.

### Une affirmation du dépôt, mesurée FAUSSE

`services/gateway/CLAUDE.md` et #20093 affirmaient tous deux que
`POST /conversations/:id/messages` admet un banni-mais-actif à l'ENVOI —
« un banni-mais-actif peut encore ENVOYER ». **Suivi jusqu'au site qui refuse,
c'est faux :**

1. la clause nue de `messages-send.ts` est un **résolveur d'identifiant** ;
2. `MessagingService.handleMessage` relit la ligne (`findUnique`, `bannedAt`
   **projeté**) et refuse — `!participant.isActive || participant.bannedAt`
   (#10440) ;
3. le cache de lecture (`participant-lookup-cache`, TTL 30 s) **porte
   `bannedAt`**, et les deux sites de bannissement l'invalident
   (`participant-ban-core.ts:146`, `:395`) ;
4. la branche ANONYME, qui ne lit RIEN, tombe sur la même garde, plus le
   contrôle `p.conversationId !== conversationId`, plus les refus de
   `ensureParticipantFromMember` (pas de ligne `User` pour un `Participant.id`,
   #10443, #16724).

> **« Un audit qui liste des `select:` ne liste pas des fuites » vaut aussi des
> `where:`.** La question n'est pas « cette clause est-elle la bonne ? » mais
> **« qui AUTORISE ce que cette clause rend ? »** — et elle se répond en
> suivant la valeur jusqu'au site qui REFUSE, jamais en lisant la requête.
> Le coût n'est pas théorique : deux documents envoyaient réparer une porte qui
> tient, pendant que six, dans un répertoire que personne ne regardait,
> n'avaient aucune garde.

Les deux documents sont corrigés avec leur mesure (`CLAUDE.md` § « Une audience
de diffusion lit la participation VIVANTE », commentaire sur #20093).

### Suivi

- **#20155 reste ouverte** : la sonde de ce lot était JETABLE, délibérément. Un
  cliquet des portes doit publier ce qu'il ne sait pas juger et séparer
  « décidé large » de « pas encore instruit » — ce lot lui laisse son premier
  chiffre (237 / 211 / 30) et sa famille la plus chargée, déjà soldée.
- **#20093 reste ouverte** : l'annuaire E2EE et les quatre lectures qui servent
  la liste de membres. Ce lot ne touche pas le chemin chiffré ; il retire de son
  dossier l'affirmation fausse sur `messages-send.ts`.
