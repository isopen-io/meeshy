# Cycle 189 — une clé d'idempotence appartient à son AUTEUR

*2026-11-20, à la suite du cycle 188 (#19956, PR #19970).
Branche `claude/exciting-planck-xa0lx4`. Instruit **#19960**, relevé par l'audit
adversarial du lot RETIRÉ du cycle 187 — « c'est précisément ce qui rendait ce
lot exploitable ».*

---

## Le fait

`clientMessageId` est tiré par chaque client dans SON espace d'ids optimistes
(`cid_<uuid v4>`). L'unicité que la base garde est celle du COUPLE
`(conversationId, clientMessageId)` — un index partiel MongoDB posé par
migration manuelle, donc un espace de noms **PARTAGÉ** par tous les
participants d'une conversation.

Les deux ne coïncident pas. Le chemin socket l'avait déjà tranché dans l'autre
sens dès #16689 : `stripClientMessageId` retire la clé de la charge des PAIRS,
« so a non-sender participant never learns the sender's optimistic-id space ».
Les surfaces au repos la servaient à tout le monde, et les relectures de
dédoublonnage appariaient sur le seul couple.

**Ce que ça coûtait, et ce n'est pas une fuite — c'est une PERTE.** Bob lit le
`clientMessageId` d'Alice dans la liste REST, envoie son propre texte sous
cette clé : le dédoublonnage précoce trouve la ligne d'ALICE, la rend en
`success: true` avec `isDuplicate`, et **le message de Bob n'est écrit nulle
part**. Un succès RENDU sur une perte — la classe de défaut la plus grave d'un
produit de messagerie, et celle dont l'utilisateur ne peut rien déduire.

## L'inventaire : l'issue en nommait DEUX, le dépôt en portait CINQ

| famille | site | état avant |
|---|---|---|
| APPARIEMENT | `MessagingService` — dédup précoce | couple |
| APPARIEMENT | `MessageProcessor` — `catch P2002` | couple |
| APPARIEMENT | `writeLinkMessageIdempotently` — transport des liens | couple |
| SERVICE | `messages-list-query.ts` — la liste REST | servie à tous |
| SERVICE | `routes/sync/messages.ts` — le delta de rattrapage | servie à tous |
| *(déjà juste)* | `stripClientMessageId` — diffusion socket | retirée des pairs |

Les deux que l'issue ne nommait pas sont les plus chers des deux familles :

- **le transport des liens** est le SEUL dont dispose un invité anonyme. Aucun
  autre chemin ne lui reste quand celui-ci se trompe ;
- **le delta `/sync`** étalait la ligne (`...message`) : aucun commentaire, aucun
  champ nommé — la clé partait parce que *rien ne la retenait*.

> Une énumération de sites porte DEUX affirmations : « ces sites appliquent la
> règle » (vérifiable) et « ce sont les sites où la règle s'applique » (presque
> jamais vérifiée). La seconde est désormais gardée par un balayage
> (`client-message-id-ownership-sweep.test.ts`), à inventaire vide.

## L'exemption, et elle est NOMMÉE

Les clés DÉRIVÉES côté serveur — `callSummaryClientMessageId(callId)` ⇒
`call-summary:<callId>` — vivent dans un espace de noms **disjoint** : les
trois entrées qui acceptent une clé d'un appelant (REST, socket, lien) la
valident toutes contre `CLIENT_MESSAGE_ID_REGEX` (`cid_<uuid v4 minuscule>`),
que cette forme ne peut pas satisfaire. Leur appariement sans expéditeur est
JUSTE, et le resserrer serait faux : un résumé d'appel n'a pas l'expéditeur qui
le relit. Le balayage les reconnaît par leur PRODUCTEUR, jamais par leur
fichier — un site neuf du même fichier n'hérite pas de l'exemption.

## Ce que la loi rend, et pourquoi un REFUS

L'index partiel **interdit** la seconde ligne : le seul arbitrage ouvert est
celui du message rendu à l'appelant.

| ce qui arrive | avant | après |
|---|---|---|
| même auteur, même clé (rejeu nominal) | sert la ligne | **inchangé** |
| AUTRE auteur, même clé | sert la ligne d'autrui en `success: true` | `409 CLIENT_MESSAGE_ID_TAKEN` |
| clé libre | écrit | **inchangé** |

`409`, et pas `400` : la requête est bien formée, c'est la CLÉ qui doit changer.
Pas `503` non plus — renvoyer sous la même clé échouerait toujours, et un
`MESSAGE_SEND_RETRYABLE` enverrait le client boucler. Pas un `500` muet, qui est
ce que la relecture resserrée rendrait **sans** ce lot.

## Les deux causes que `P2002` confond

Une violation d'unicité ne dit pas « tu as déjà envoyé ça » : elle dit « la clé
est prise dans cette conversation ». Trois suites, et elles n'ont pas la même
réponse :

| ce que la relecture trouve | ce qu'on rend |
|---|---|
| MA ligne (le TRIO matche) | un doublon idempotent — le rejeu nominal |
| la ligne d'un AUTRE | `ClientMessageIdTakenError` |
| RIEN | l'erreur d'ORIGINE : course irréconciliable, on n'invente pas |

La seconde lecture — la SEULE qui s'apparie sans auteur — vit DANS la loi
(`clientMessageIdHeldByAnother`), avec sa raison, et ne s'appelle que sur le
chemin d'ÉCHEC : le chemin nominal ne paie aucune requête de plus.

## Preuve

**Le ROUGE, dans les trois sens** :

| mutation | témoins qui tombent |
|---|---|
| la loi de SERVICE rend toujours la clé | **3** (liste REST ×2, `/sync` ×1) |
| `ownReplayWhere` redevient le COUPLE | **2** (dédup précoce, course P2002) |
| la détection du porteur ÉTRANGER retirée | **2** |

Et les témoins de NON-RÉGRESSION (rejeu de sa propre clé, clé libre, l'auteur
reçoit la sienne) passent avant comme après : ils ne décrivent aucun changement,
ils gardent ce que le lot ne doit pas casser.

**Le VERT** : `tsc --noEmit` EXIT=0 ; 33 témoins neufs ou repris ; 257 suites
`messaging` / `sync` / `links` vertes ; cliquet de taille du gateway VERT.

## Ce que le lot a trouvé en chemin

- **Deux doubles de test MENTAIENT par ce qu'ils acceptaient.** Le double de
  `participant.findMany` de `sync.test.ts` rendait `{ conversationId: 'c1' }`
  **sans `id`** — une forme que la production ne produit jamais. Toute porte par
  lecteur du delta y échouait FERMÉE, pour une raison qui n'est pas la sienne ;
  mon premier témoin de `/sync` est tombé dessus avant d'atteindre ma loi.
- **Un témoin de « rendabilité » attestait le défaut.** `sync.test.ts` exigeait
  `clientMessageId === 'cid_x'` sur un message dont l'expéditeur n'est PAS le
  lecteur. Son intention — « le delta porte de quoi réconcilier » — est juste ;
  sa fixture codifiait l'ancienne portée. L'expéditeur y devient le lecteur :
  l'intention est gardée, la portée corrigée.
- **`MessageProcessor.ts` est en dette de taille** (1110 lignes gelées) : le
  cliquet a refusé mes douze lignes, et il a eu raison. Le raisonnement du
  `catch P2002` est sorti dans `uniqueViolationDedup.ts` — le fichier passe à
  **1085**, et le cumul de dette du gateway BAISSE.

## Suivis

- **#19957** — le dédoublonnage rend un message SUPPRIMÉ avec `success: true` :
  décision produit, inchangée par ce lot (il resserre QUI apparie, pas QUOI est
  rendu à son propre auteur).
- **#19972** — le `400` muet des autres refus d'envoi : ce lot pose le `409` du
  sien, il ne tranche pas la famille.
- La forme de l'index lui-même — `(conversationId, clientMessageId)` plutôt que
  `(conversationId, senderId, clientMessageId)` — reste celle du dépôt. La
  changer est une MIGRATION, et la loi applicative rend la collision inoffensive
  sans elle : une issue à ouvrir si le `409` se mesure en production.
