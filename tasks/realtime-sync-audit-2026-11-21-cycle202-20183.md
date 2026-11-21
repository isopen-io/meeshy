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

---

## L'audit adversarial, et ce qu'il a retourné du lot

Lancé sur la branche livrée, consigne : chercher un resserrement net-négatif,
une septième porte, un témoin qui ne peut pas tomber. **Verdict : BLOQUANT**, et
il avait raison sur trois des quatre points qui comptent.

### 1. La SIXIÈME porte n'en était pas une — et c'est l'erreur du lot lui-même

`routes/links/messages.ts` était comptée parmi « six portes qui admettaient sur
`isActive` NU ». **Faux** : son autorisation vit soixante-dix lignes plus bas,
dans `guestAccessEnd` (#10470), qui appelle `participationEstVivante` et rend
`'revoked'` pour toute ligne portant `bannedAt`. Un invité banni recevait DÉJÀ
son 410.

Mesuré par l'auditeur, deux mutations : les six clauses remises à `isActive` nu
laissent `links-messages.test.ts` **VERT** (les cinq autres suites tombent) ; et
sous une clause nue avec `guestAccessEnd` nourri d'une participation saine, le
témoin tombe — **le 410 venait de la garde aval, jamais du resserrement.**

Pire que l'inutilité : **le resserrement INVERSAIT l'ordre unique des causes**
(#10457). La ligne ne revenant plus, le 410 PRÉCOCE de `guestAccessEnded`
partait avant le contrôle d'échéance — un invité banni dont le lien était ÉCHU
lisait « accès retiré » au lieu de « lien expiré », l'inverse exact de l'ordre
que #10457 a unifié pour qu'un même invité ne lise pas deux causes selon le
chemin.

**Reverti.** Le témoin reste, pour la raison INVERSE de celle qui l'a fait
naître : il atteste que la garde AVAL suffit, sous clause nue, et un second
témoin gèle l'ordre des causes. Mesuré : rejouer le resserrement le fait tomber.

> **Le lot a commis, dans le même commit, l'erreur qu'il venait de documenter.**
> Il a corrigé l'affirmation fausse sur `messages-send.ts` — « la question n'est
> pas *cette clause est-elle la bonne ?* mais *qui AUTORISE ce que cette clause
> rend ?* » — puis compté une porte dont l'autorisation vivait en aval, dans le
> même fichier. **Écrire une règle ne l'applique pas au lot qui l'écrit** : la
> relire contre son propre diff est une étape, pas une évidence. Et le
> resserrement « gratuit, en défense en profondeur » ne l'est jamais sans avoir
> mesuré ce qui DÉPEND de la ligne qu'on retire — ici, l'ORDRE.

### 2. La SEPTIÈME porte existe, et c'est une DÉCISION, pas un oubli

`isCreator = link.createdBy === userId` (`routes/links/management.ts`) nomme
l'appelant par une colonne de **PROPRIÉTÉ** d'une AUTRE table, sans lire aucune
participation. La sonde de ce lot ne pouvait pas la voir : son discriminant
cherche une porte dans une lecture de `Participant`.

> **La famille « porte keyée sur l'appelant » a au moins DEUX genres** —
> *participation* et *propriété* — et le relevé n'a couvert que le premier. Les
> 237/211 ne disent rien du second. C'est « un balayage qui cherche UN idiome
> mesure sa popularité » appliqué au MODÈLE lu, pas à la forme du `where`.

L'auditeur l'a classée « trou vivant ». **Elle est en réalité gelée par un
témoin du cycle 200** (`links-admin-host-not-creator.test.ts` § « sert le
CRÉATEUR du lien même banni »), écrit explicitement « pour qu'un lot futur ne le
resserre pas par symétrie », et #20155 la porte dans son inventaire des portes
qui DOIVENT rester larges. L'auditeur a manqué ce témoin.

Mais sa MESURE tient, et elle est le vrai constat : **la décision couvre
beaucoup plus que sa justification.** « Le droit sur son PROPRE lien » ne décrit
ni `/toggle` — réactiver un lien qu'un admin vient de désactiver, un geste de
modération de l'entrée pris contre un administrateur vivant — ni `/arrivals` —
nom, pays, langue et date de CHAQUE arrivée, y compris après le bannissement. Et
le bannissement **ne désactive pas les liens que la cible a créés**
(`participant-ban-core.ts` ne ferme que celui par lequel elle est ENTRÉE).

Avec `GET /links` **sans** `?conversationId=` — `where = { createdBy: userId }`,
aucun contrôle d'appartenance, au-dessus du `if` que ce lot resserre — la chaîne
est complète : lire le code de son lien, puis le rouvrir. **Une garde qui n'est
effective que si l'appelant veut bien se désigner.**

Les deux ne sont pas deux défauts : **deux conséquences d'une seule décision.**
D'où une issue `décision-produit` assignée au porteur, **#20189**, avec ses trois
réponses tenables — et rien de resserré ici : retourner une décision gelée par un
témoin dans le lot qui découvre son coût est exactement ce que ce témoin existe
pour empêcher.

### 3. La porte 4 est PARTIELLE, et le dire importe

`hasAccess = memberRow !== null || canPreview` : le resserrement retire le SEUL
grant de membre. Un banni garde exactement ce qu'un INCONNU obtient — l'aperçu
public, messages compris — et le salon GLOBAL « meeshy » reste admis
inconditionnellement pour tout compte authentifié, **avant** toute lecture de
participation. Ce que le lot ferme est donc : l'accès de membre quand l'aperçu
public est fermé, l'étiquette `userType: 'member'`, et le `redirectTo`. Écrit sur
le site, et dans `CLAUDE.md`.

> **Une garde partielle annoncée totale est pire qu'une garde absente** — c'est
> la règle du dépôt sur les énumérations, appliquée à une CLAUSE : « ne lit plus
> le fil » était faux à l'adresse sœur.

### 4. Ce que l'auditeur a attaqué SANS rien trouver

Il a relevé tous les écrivains de `bannedAt` : `resolveUnbanWrite` et
`liftBanOnly` posent **toujours** `bannedAt: null` ; `commitParticipantRejoin` et
`restore-for-me` portent `unsetOrNull('bannedAt')` dans le `where` de leur
écriture ; `resolveConversationEntry` teste `bannedAt != null` AVANT
`already-member`. **Aucun chemin ne produit `isActive: true, bannedAt ≠ null`
pour quelqu'un qui n'est pas réellement banni** — donc aucun resserrement de ce
lot ne paie sur une population légitime. Aucune des cinq lectures n'alimente une
comparaison EXACTE (`directoryOf` est intact), donc pas de répétition de #20093.
Les doubles sont honnêtes : la fixture `VIVANT` ne porte aucune clé `bannedAt`,
donc les témoins « VIVANT admis » passent par la branche `{ isSet: false }`, pas
par chance. Aucune des cinq clauses touchées n'avait de `OR` préexistant, donc
aucun écrasement introduit.

### 5. Les quatre constats mineurs, et leur sort

| constat | sort |
|---|---|
| le double de `links-retrieval.test.ts` ignore `bannedAt`, donc PLUS permissif que la production (piège armé) | **corrigé** — il appelle `participationEstVivante` |
| l'audience d'admins de `share-link-mint.ts` porte DÉJÀ un `OR` : y spreader la loi l'écraserait | **commenté sur place** — c'est le site que la prochaine passe « fermons les audiences » ouvrirait en premier |
| `GET /conversations/:id/links` supprime `isModerator` et `participantCount` sur le fil, sous un commentaire qui affirme que iOS et le web les lisent | **issue #20190** (forme 2, route dépréciée, hors périmètre) |
| la porte 1 refuse en **403** (oracle d'existence) là où #8116 impose le 404 des portes 2 et 3 | **consigné** — préexistant, incohérence de famille |

### Ce que l'audit change au compte du lot

**CINQ portes**, pas six. Et la famille n'est **pas** fermée : la dette est écrite
dans `CLAUDE.md` au PRÉSENT, avec ses deux issues (#20189, #20190) — parce que
c'est la troisième fois que ce paragraphe se voit reprocher d'avoir dit l'absolu
là où il fallait dire l'état.
