# Cycle 190 — deux retraits de plus atteignent la liste, et l'un d'eux entre enfin dans la file

*2026-11-20, à la suite du cycle 189 (#20007, PR #20022, fusionnée dans `dev`).
Branche `claude/exciting-planck-z11wka`. Livre **#20019** (ouverte par le point 4
de #20007) et **#20036** (un ROUGE de `dev`, trouvé en passant le gate).*

---

## Pourquoi celui-là

Le point 4 de #20007 demandait de vérifier « la même asymétrie » sur les retraits
hors de la famille des cinq. Le relevé — `to(ROOMS.conversation(` dans
`services/gateway/src` hors tests — a rendu deux sites, et ils ne sont pas des
cas limites : ce sont les deux SEULS retraits de contenu que le dépôt adresse
encore au fil seul.

| retrait | site | charge | file hors ligne |
|---|---|---|---|
| `attachment:deleted` | `routes/attachments/metadata.ts` (#13608) | `{ conversationId, messageId, attachmentId }` | **aucune** |
| `message:cited-post-withdrawn` | `socketio/announceCitedPostWithdrawal.ts` (#7969) | `{ conversationId, postId, deletedAt }` | aucune, avec un repli de relecture écrit |

Aucune branche vivante ne les écrivait au relevé : la règle d'asymétrie (#5243)
ne s'appliquait pas.

## Ce que chacun perdait, et pour qui

La même chaîne que #18556 → #19943 → #20007, à un contenu près :

1. le lecteur a reçu la bulle dans sa room **PERSONNELLE** — c'est la seule
   adresse de `message:new` dès que le message porte une pièce protégée
   (`messageNewEmission.emitPerReader`) ;
2. il revient à la liste, donc **quitte** `conversation:<id>` et garde la sienne ;
3. un membre retire une pièce : l'annonce ne part qu'à `conversation:<id>` ;
4. pour `attachment:deleted`, **rien** ne le rattrape — pas de file.

Son cache de fil (`staleTime: Infinity` côté web) gardait donc la pièce
supprimée jusqu'à un rechargement manuel.

## Le jumeau était à un fichier de là

`message:attachment-updated` — l'enrichissement de la MÊME pièce — nomme les
rooms personnelles **et** enfile depuis toujours (`emitAttachmentUpdated`). Les
deux événements décrivent la même pièce, dans la même conversation, et un seul
des deux avait une audience et une file.

> **La jumelle d'un retrait n'est pas forcément un autre retrait : c'est souvent
> la MISE À JOUR du même objet.** Chercher « qui d'autre supprime ? » ne l'aurait
> pas rendue ; chercher « qui d'autre parle de cette PIÈCE ? » la rend tout de
> suite.

## La forme du correctif

- **`socketio/broadcastAttachmentDeleted.ts`**, module neuf : la fonction privée
  de `routes/attachments/metadata.ts` est devenue un site nommé, testable
  directement, qui fait les DEUX canaux — audience vivante
  (`loadLiveAudience` + `conversationAudienceRooms`) et file hors ligne.
- **`'attachment-deleted'` entre dans le contrat de la file** : l'union partagée
  (`packages/shared/types/delivery-queue.ts`) et la table `DRAINED_EVENT`, dont
  le `satisfies Record<QueuedEventType, ServerEventName>` rend l'ajout
  obligatoire. **Aucun client ne change** : le drain rejoue le MÊME nom
  d'événement (`attachment:deleted`), que les trois clients écoutent déjà.
- **La clé de dédup nomme la PIÈCE, pas le message.** Sous la dédup par défaut
  (`messageId` + `eventType`), le retrait d'une seconde pièce du même message
  supplanterait le premier, et l'absent n'en apprendrait qu'un. Même raison et
  même forme que `emitAttachmentUpdated` (#17026).
- **`announceCitedPostWithdrawal`** nomme l'audience vivante de CHAQUE
  conversation citante. Le coût est d'une lecture par conversation citante — pas
  par participant — et **une lecture qui lève ne prive que SA conversation** :
  les autres sont servies, et la sienne replie sur sa room de fil.
- Ni l'un ni l'autre ne porte de contenu : élargir n'ouvre aucune surface, c'est
  l'arbitrage de #19943 appliqué tel quel.

## Le ROUGE, mesuré

| mutation | témoins rouges |
|---|---|
| l'audience étroite sur `message:cited-post-withdrawn` | **2** (dont le repli par conversation) |
| le module neuf, posé avant la production | **8** |
| la surface REST (`DELETE /attachments/:id`, par `app.inject`) | **2** |

## Le témoin de surface n'exerçait que le REPLI

Le harnais de `DELETE /attachments/:id` passe un `prisma` à `participant.findFirst`
et `participant.findUnique` — **pas** `findMany`. La lecture d'audience y lève
donc, l'audience retombe sur la room de conversation, et le témoin passait au
VERT en n'exerçant jamais ce que le lot venait d'ajouter. Son `io.to(room: string)`
avait le même défaut : il ACCEPTE un tableau et le range sous `String(tableau)`,
c'est-à-dire sous une clé qu'aucune assertion ne peut nommer (cycle 188).

> **Un double incomplet ne fait pas échouer le témoin : il le fait réussir sur le
> chemin de REPLI.** Et un repli est précisément ce qu'un lot d'audience ne doit
> PAS prouver. Les deux moitiés — ce que le double RÉPOND et ce qu'il ACCEPTE —
> se vérifient ensemble.

## #20036 — `dev` était ROUGE sur le budget de taille, et ce n'était pas ce lot

Au gate, `MessageHandler.ts` mesurait **2 281** lignes pour une dette déclarée à
**2 269**, donc rouge pour toute branche partie de `dev`.

**L'attribution que #20036 écrivait d'abord — « #19939 a ajouté 14 lignes à un
fichier déjà hors budget » — est FAUSSE, et c'est une autre session qui l'a
mesurée juste** (PR #20032, ouverte à 10:12, avant cette issue) : l'ancêtre était
à 2 252, `dev` à **2 267** après #19943, la branche de #19939 à **2 266** après
ses quatorze lignes. **Les deux côtés étaient SOUS le plafond, et les deux CI
étaient vertes** ; c'est leur FUSION qui donne 2 281.

> **Un cliquet qui borne une valeur par FICHIER ne peut pas être vérifié avant la
> fusion** : chaque branche mesure sa distance au plafond, aucune ne mesure la
> somme — et un `git merge` sans conflit TEXTUEL ne dit rien de ces gardes
> CUMULATIVES (taille, dette de `any`, cohésion, cumul de couverture). C'est la
> démonstration la plus nette de la directive #18654 (« rejouer les gardes sur
> l'arbre FUSIONNÉ »), qui n'est donc pas une précaution de style mais la seule
> mesure possible pour cette classe de gardes.

Réparé par une EXTRACTION, jamais en montant le plafond (« une dette héritée ne
se solde pas en montant le plafond ») : le fan-out de `message:deleted` du
transport socket vit dans `socketio/emitMessageDeletedToAudience.ts` — 2 267
lignes, cliquet vert, table inchangée.

**Et ce lot ne revendique pas cette réparation.** PR #20032 l'avait écrite
d'abord, dans une AUTRE région du même fichier (les commentaires de
`handleMessageEdit`, rapatriés vers les modules qui portent la loi — 2 268
lignes). La règle d'asymétrie (#5243) tranche en faveur de qui a écrit le
premier, et elle vise la duplication : il n'y en a pas ici, les deux régions
étant disjointes et les deux réductions CUMULATIVES (2 281 − 13 − 14 = 2 254 à
la fusion des deux). Ce lot garde la sienne pour sa COHÉSION — le fan-out d'un
retrait n'a pas sa place dans un handler de 2 300 lignes — et non pour le
budget, que #20032 paie déjà.

Et l'extraction a payé plus que des lignes : la fonction **REND** la charge
qu'elle a servie, que la file réutilise. Le direct et la file sont deux
projections d'une SEULE composition (cycle 123) ; les recomposer séparément est
ce qui laisse deux `deletedAt` pour un seul retrait.

## Ce qui RESTE

- **#20020** — quatre lecteurs des MÊMES lignes (`conversationAudienceRooms`,
  `offlineParticipantQueue`, `emitAttachmentUpdated`,
  `MessageHandler.autoDeliverToOnlineRecipients`), dont **deux sans aucune
  borne**. Ce lot en ajoute un cinquième par `broadcastAttachmentDeleted`, borné.
- **#17029 / #18681** — l'existence d'un message hors plancher d'historique :
  élargir ces deux retraits élargit d'autant la population qui apprend qu'un id
  existe. Inchangé par ce lot, comme par #19943 et #20007.
- **Non mesuré** : la requête citante d'`announceCitedPostWithdrawal`
  (`storyReplyToId`, `distinct`) n'a **aucun `take`** — un post cité par un très
  grand nombre de conversations paie autant de lectures d'audience. Antérieur au
  lot, et borné par aucune mesure de production.
