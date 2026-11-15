# Cycle 131 bis — retirer un lien de partage ne retirait rien à ses invités

> Le numéro porte un `bis` parce qu'un lot PARALLÈLE a pris `cycle131` pendant
> que celui-ci s'écrivait (`tasks/realtime-sync-audit-2026-08-28-cycle131.md`,
> Android et l'arm CATÉGORIE des préférences, issue #4133), et sa leçon le
> numéro 308 en arrivant sur `main` le premier. Les deux ne partagent aucun
> fichier de code — le leur est Kotlin, celui-ci est la passerelle — et la
> collision n'est que d'étiquette. Exactement la forme du cycle 130 / 130 bis,
> deux jours plus tôt.

**Issue** : [#4194](https://github.com/isopen-io/meeshy/issues/4194)
**Suivi ouvert** : [#4195](https://github.com/isopen-io/meeshy/issues/4195) (l'expiration)
**Branche** : `claude/keen-hamilton-r1s4g6`
**Base** : `9f50718c` (cycle 130 bis mergé)

## 1. Ce qui a été cherché

Une classe de défaut, pas un site. Point de départ : le point de convergence
`endConversationMembership` (cycle 122), dont l'en-tête énumère **quatre**
chemins qui mettent fin à une appartenance — quitter, être banni, être retiré,
effacer pour soi. La question de la leçon 261 lui a été posée : *cette
énumération dit-elle « ces sites appliquent la règle », ou « ce sont les sites
où la règle s'applique » ?*

Les quatre chemins énumérés retirent une PERSONNE. La cinquième famille retire
une **PORTE** — et avec elle, en principe, tous ceux qui sont entrés par là.

## 2. Ce qui a été mesuré

La porte d'entrée anonyme (`POST /anonymous/join/:linkId`) vérifie **neuf**
propriétés du lien avant de créer la ligne `Participant` : actif, expiration,
usages, concurrence, pays, langue, plage IP, compte requis, identité requise.
`conversationEntryAdmission.ts` les compte lui-même, dans une phrase écrite pour
dire autre chose (« la porte anonyme vérifie NEUF propriétés du LIEN et zéro
propriété de la conversation »).

Deux de ces neuf ne sont pas des propriétés d'ADMISSION mais de **DURÉE** :
`isActive` et `expiresAt` décrivent l'état du lien à tout instant, pas seulement
au premier pas. **Rien ne les relit après ce premier pas.**

| porte | ce qu'elle lit du lien |
|---|---|
| REST — `middleware/auth.ts:395` | rien (`Participant.sessionTokenHash` + `isActive`) |
| Socket — `AuthHandler._authenticateAnonymousUser` | rien (la même requête, puis `socket.join`) |
| `POST /anonymous/session/refresh` | **tout** — `410 LINK_DEACTIVATED` / `410 LINK_EXPIRED`, `!shareLink ⇒ 410` |

Et les deux routes qui RETIRENT un lien le déclarent dans leur propre contrat
OpenAPI :

- `PATCH /links/:linkId/toggle` — *« When deactivated, the link becomes
  inaccessible to new **and existing** anonymous users. »*
- `DELETE /links/:linkId` — *« will **immediately invalidate all anonymous
  participants** using this link. »*

Derrière la première moitié de chaque phrase, du code. Derrière la seconde,
**rien** : le toggle écrit `{ isActive }` et rend 200 ; le DELETE fait un
`conversationShareLink.delete()` nu, et `Participant.shareLinkId` est un
`String?` **sans relation Prisma** — aucune cascade, aucune ligne touchée.

Ce que gardait un invité déjà entré, après que son hôte a cru couper l'accès :
sa socket dans `ROOMS.conversation(...)` — donc chaque message, chaque réaction,
chaque frappe en temps réel —, son droit d'écriture, sa place dans l'appel en
cours, et son partage de position vive. Indéfiniment, tant que son onglet reste
ouvert.

## 3. La forme du défaut

C'est la forme du **cycle 124**, avec l'inversion qui la rend chère : là, un
champ de service DÉCLARAIT une restriction que l'hôte ne faisait pas respecter ;
ici, c'est le **contrat public de la route** qui la déclare, et personne
derrière.

Et la règle n'était pas à inventer : elle est **écrite, une fois, sur une
route** — `session/refresh`, avec la sémantique fail-closed voulue. Le sort d'un
invité après révocation dépendait donc de si son client appelle, ou non, ce
rafraîchissement. **La même question recevait deux réponses selon la porte
empruntée.**

### Ce que ce n'est PAS

Deux décisions voisines ont été instruites, et aucune n'est touchée :

1. **Le gel des permissions à l'entrée.** `routes/anonymous.ts:396` fige les sept
   droits et l'assume — « on entre sous les conditions du MOMENT. Un hôte qui
   décoche `allowViewHistory` ensuite ne referme rien à qui est déjà là. »
   `isActive` et `expiresAt` ne sont pas des droits accordés à l'entrée : ils
   SONT la révocation.
2. **Le bannissement, qui ferme la porte sans vider la salle.** `ban.ts` désactive
   lui aussi le lien du banni, et dit pourquoi il s'arrête là — « Ce qui est
   fermé, c'est la PORTE, pas la salle ». C'est juste pour SON intention :
   retirer UNE personne. L'intention de `toggle(false)` et de `DELETE` est de
   retirer le LIEN. C'est la seule différence, et c'est toute la différence —
   `ban.ts` n'appelle donc pas la nouvelle unité, et son comportement est
   inchangé.

**Cette distinction a décidé la CONCEPTION**, pas seulement la prose. Une garde
fail-closed dans les deux portes d'authentification (relire le lien à chaque
requête anonyme) aurait couvert l'expiration en prime — et aurait évincé, au
passage, tous les invités d'un lien fermé par un bannissement, cassant une
décision produit écrite. La révocation est donc une **écriture au moment du
geste** (`Participant.isActive = false`), que les deux portes existantes
honorent déjà.

## 4. Le correctif

`socketio/revokeShareLinkGuests.ts` — jumelle PLURIELLE de
`endConversationMembership`, qu'elle appelle plutôt que de recopier ses gestes.

```
1. findMany   { shareLinkId, type: 'anonymous', isActive: true }
2. updateMany { isActive: false, leftAt }          ← la base d'abord
3. par conversation : lire l'effectif restant, émettre un
   `conversation:participant-left` par invité (memberCount ABSOLU)
4. par invité : invalidateParticipantLookup → endConversationMembership
   (position vive → appel en cours → sortie de room → cache socket)
5. disconnect(true) sur ses sockets
```

Trois points d'ordre, tous motivés dans l'en-tête du fichier :

- **La base d'abord** — une annonce ne précède jamais la durabilité du fait
  qu'elle annonce, et c'est ce qui rend la révocation résistante à une panne au
  milieu : les deux portes d'authentification refusent la reconnexion dès cet
  instant.
- **L'extinction par le point de convergence existant** — c'est une CINQUIÈME
  copie de ses trois gestes qu'on évite, pas trois lignes.
- **La socket en dernier** — un invité de lien n'a qu'UNE identité, ce
  participant. Sa ligne close, sa socket n'a plus d'identité valide du tout ;
  `endConversationMembership` ne coupe rien, et c'est juste pour un membre
  inscrit qui garde trente autres conversations.

**Cette unité ANNONCE, contrairement à sa jumelle**, et pour la raison exacte
que la jumelle donne pour ne pas le faire : ses quatre appelants portent des
faits DIFFÉRENTS, les deux appelants d'ici portent le MÊME fait — « ce lien ne
donne plus accès » — avec la même charge.

Câblage : `toggle` seulement quand `isActive === false` (réactiver ne rend rien
à personne — une ligne close se rouvre par la porte d'entrée), et `DELETE`
**avant** la suppression : la colonne étant nue, la ligne partie plus rien ne
relie ses invités au lien retiré, et échouer dans cet ordre échoue FERMÉ.

## 5. Témoins

- `socketio/__tests__/revokeShareLinkGuests.test.ts` — 8 témoins : la requête
  d'invités, le silence quand il n'y en a aucun, l'ordre base→vivant, l'ordre
  extinction→éviction→coupure, le cache REST, la charge de l'annonce
  (`participantId` présent, `userId: null`, effectif restant), la révocation
  sans Socket.IO, et l'éviction de la conversation de CHAQUE invité.
- `__tests__/unit/routes/links-admin-revocation.test.ts` — 4 témoins de
  CÂBLAGE : désactiver révoque, réactiver ne révoque pas, supprimer révoque
  AVANT de supprimer, une révocation qui lève laisse le lien en place.
  **3 des 4 rouges** contre la version sans câblage (le quatrième garde le
  chemin « réactiver », vert des deux côtés par construction).

Trois doubles Prisma de suites existantes ont reçu la surface
`participant.findMany` / `updateMany` — un double partiel perd en silence ce que
le module gagne (leçon des cycles 91/93).

## 6. Ce qui reste — et pourquoi c'est une issue

`expiresAt` n'est le geste de personne : aucune route ne la franchit, elle
survient toute seule. La révoquer demande un balayage périodique
(`ExpiredStoriesCleanupService` en est le patron), plus trois questions à
instruire — le lien bascule-t-il `isActive` au passage, rattrapage au démarrage,
période. C'est [#4195](https://github.com/isopen-io/meeshy/issues/4195), pas une
ligne de ce lot : l'unité de révocation est déjà idempotente et réutilisable
telle quelle, il n'y manque que le déclencheur.

## 7. La leçon

> **Une garde d'ENTRÉE ne garde que l'entrée.** Parmi les propriétés qu'une
> porte vérifie, certaines décrivent l'instant de l'admission et d'autres
> décrivent une DURÉE — et rien, dans le code de la porte, ne les distingue :
> elles sont neuf `if` consécutifs. Les secondes n'ont de sens que si quelque
> chose les relit, et ce quelque chose ne s'écrit jamais au moment où l'on écrit
> la porte.

Corollaire de méthode, et c'est lui qui a trouvé le site : **la description
OpenAPI d'une route est une AFFIRMATION, au même titre qu'un commentaire, un
compte ou un tri.** Elle est publiée, donc lue par des clients, donc plus chère
qu'un commentaire quand elle est fausse — et elle est le seul endroit du dépôt
où la seconde moitié de cette règle était écrite.

Voir `tasks/lessons.md` § Leçon 309.
