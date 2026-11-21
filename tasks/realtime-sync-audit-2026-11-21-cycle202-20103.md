# Cycle 202 — dix projections `participants` sans `where` : ce que la liste SERT décide de sa largeur (#20103)

**Date** : 2026-11-21 · **Issue** : #20103 (suivi de #20100, parent #20091) · **Branche** : `claude/exciting-planck-71qb2n`

## Le point de départ

#20100 a fermé la forme `participants: { where: … }`. Restait la forme **sans aucun
`where`**, strictement plus large qu'`isActive` nu : elle rend les partis, les
retirés, les désactivés et les bannis. Dix des trente blocs mesurés sont de
vraies projections de `Conversation.participants`, et l'issue le dit lui-même :
« plusieurs PROJETTENT `isActive` et filtrent en CODE après lecture », donc
aucun discriminant de clause ne peut en juger — deviner y fabriquerait des
verdicts.

## Le constat qui organise les dix

Le critère de fin demandait, par site, « qui consomme cette liste, et où la
participation vivante est jugée ». En les instruisant une par une, la réponse
s'est révélée être **une seule règle, et elle ne se lit pas sur la projection** :

> **Une liste qui ACCORDE doit être étroite. Une liste qui RETRACTE ou qui
> SOUSTRAIT doit être large.** Ce qui tranche est l'USAGE de la liste — et, pour
> une audience, ce que la charge TRANSPORTE — jamais la forme du `where`.

Appliquée aux dix :

| site | ce que la liste sert | verdict |
|---|---|---|
| `admin/conversation-settings-sovereign.ts` (`SELECT_ECRITURE`) | `broadcastConversationUpdated` **et** `announceConversationClosed` | **défaut corrigé** d'un côté, décision écrite de l'autre |
| `conversations/core-lifecycle.ts` (PATCH) | réponse REST + `broadcastConversationUpdated` | **défaut corrigé** |
| `conversations/core-lifecycle.ts` (DELETE) | `announceConversationClosed` | rétractation — large, écrit |
| `conversations/leave.ts` | `announceConversationClosed` | rétractation — large, écrit |
| `conversations/delete-for-me.ts` | `announceConversationClosed` | rétractation — large, écrit |
| `services/conversations/obsoleteConversation.ts` | `announceConversationClosed` + `conversation:obsoleted` | rétractation — large, écrit |
| `conversations/core-lifecycle.ts` (réouverture d'un DM) | lecture d'IDENTITÉ (l'appelant, le créateur) | ni audience ni refus — écrit |
| `conversations/core-lifecycle.ts` (après `create`) | réponse REST d'une conversation NEUVE | vivante par construction — écrit |
| `services/MessageReadStatusService.ts` | ensemble des opt-out à SOUSTRAIRE du relevé d'accusés | large, et resserrer **exposerait** — écrit |
| `communities/core.ts` | garde de l'appelant + `participantIds` qui ÉCRIT | déjà soldé au cycle 199 (#20136) |

## Le défaut : le RENOMMAGE atteignait un membre banni

`broadcastConversationUpdated` filtrait sur `p.isActive` **nu**, à l'intérieur
de l'unité partagée par les deux routes de métadonnées. Sa charge porte le
TITRE, la description, l'avatar et la bannière : un membre actif-et-BANNI — qui
n'a accès ni à la room du fil ni à son REST — recevait le nouveau titre du
groupe sur sa room personnelle.

C'est **#20110 rejoué sur un autre événement** : là, la charge d'ARRIVÉE d'un
groupe nommait un exclu et pouvait porter son nom comme titre ; ici, la charge
de RENOMMAGE lui sert le titre. Et le défaut était invisible des deux côtés :
la projection des appelants n'a aucun `where` (aucun cliquet de clause ne la
voit) et le filtre vivait en code, sur la moitié de la loi.

**Correctif** : l'unité juge `participationEstVivante`, et **son TYPE exige
`bannedAt`**. C'est la partie qui ne peut pas être oubliée — un champ non
projeté vaut `undefined`, et `undefined == null` est vrai, donc la garde
rendrait `true` pour un banni sans qu'aucun témoin ne rougisse (#20136). Le
compilateur a immédiatement nommé le seul appelant dont la projection omettait
la colonne (la route souveraine) ; l'autre la recevait déjà par son `include`.

## La décision inverse, nommée et mesurée

Les quatre chemins de clôture gardent `isActive` nu, **délibérément** :
`conversation:closed` ne porte aucun contenu, il RETRACTE une ligne. Un banni
garde ce fil dans sa liste — les deux clients la persistent — et seul cet
événement, ou un tombstone `closedAt`, la lui retire. Resserrer échangerait une
fuite inexistante contre un fil fantôme.

Écrire cette raison quatre fois eût été quatre occasions de diverger : elle vit
désormais dans **une** unité, `audienceDeRetractation`, avec ses témoins — dont
celui qui RETIENT un banni, sans lequel un futur balayage « resserre tous les
filtres de participation » l'emporterait en passant (leçon du cycle 197 : une
raison écrite est une affirmation).

## Un effet de bord utile : `core-lifecycle.ts` a REPRIS de la marge

Le cliquet de taille refuse 1000 lignes sous `routes/`, et le fichier était à
997 : documenter trois de ses sites le poussait à 1004. La directive dit ce
qu'il faut faire — « on extrait d'abord, on ajoute ensuite » — et l'extraction
était déjà désignée par le commentaire du code : la fermeture `gatePresence`,
« appliquée aux DEUX sorties, et une porte posée sur une seule des deux n'est
pas une porte ». Une porte qui vaut pour plusieurs sorties a sa place dans une
unité nommée (`gateParticipantsPresence`, `participants-presence.ts`), pas dans
une fermeture que la prochaine sortie oubliera. Le fichier est passé de 997 à
**993** lignes *avec* la documentation ajoutée.

## Preuve

- `src/__tests__/unit/services/conversation-metadata-update.test.ts` : 3 témoins neufs (banni écarté ; `bannedAt` ABSENT admis ; aucune room personnelle quand plus personne n'est vivant). RED mesuré avant correctif : 2 tombent.
- `src/socketio/__tests__/announceConversationClosed.test.ts` : 4 témoins neufs sur `audienceDeRetractation`, dont le banni RETENU.
- Mutation prouvée : retirer `bannedAt: true` de `SELECT_ECRITURE` ⇒ `tsc` rouge sur la ligne exacte. Remettre `p.isActive` dans l'unité ⇒ 2 témoins rouges.
- `tsc --noEmit` vert ; cliquets de taille (`routes/`, gateway, suites) verts ; 220 suites des conversations et du socket vertes ; suite complète du gateway rejouée.
