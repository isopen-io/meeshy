# Cycle 187 — le dédoublonnage rendait « succès » sans les pièces qu'il venait d'admettre

*2026-11-20, à la suite du cycle 186 (#19865, fusionné dans `dev` par
`5c5983e759`). Branche `claude/exciting-planck-dr9e11`. Instruit **#19917**,
que l'audit adversarial du cycle 186 a relevé en cherchant ce que mon propre
lot METTAIT EN SERVICE.*

---

## Pourquoi celui-là

Il n'a pas été choisi dans un tri : **c'est le cycle précédent qui l'a
produit.** Le lot #19865 a rendu possible un second `POST …/messages` sous le
même `clientMessageId` avec des `attachmentIds` NEUFS — et l'audit a demandé
ce que ce chemin allumait. Réponse : un succès qui ment.

Le critère des cycles précédents tient aussi — défaut **mesuré**, sur le chemin
de remise, qui **supprime silencieusement une pièce jointe** — avec la
propriété qui rend celui-ci particulier : **l'erreur a la bonne apparence.**
L'expéditeur voit « envoyé », sa bulle porte ses aperçus `blob:` locaux, et
rien ne se signale jamais. C'est le pire des états pour une remise.

Aucune branche vivante n'écrit `MessagingService`, `MessageProcessor` ni
`attachmentSendAdmission` (relevé avant d'écrire).

## Le défaut, mesuré

`MessagingService.handleMessage` (`:212-261`) répond à un rejeu dont le couple
`(conversationId, clientMessageId)` existe déjà par un `earlyHit` :
`return this.createSuccessResponse(openedHit)` — **AVANT** tout
`handleAttachments`. Les `attachmentIds` du rejeu, que les deux transports
viennent pourtant d'ADMETTRE, ne sont liés par personne.

| transport | admet avant d'appeler `handleMessage` |
|---|---|
| REST | `admitMessageAttachments` (`messages-send.ts:381`) |
| WS | `admitLoadedMessageAttachments` (`MessageHandler.ts:561`) |

Les ids qui arrivent ici sont donc **vivants, à l'expéditeur, non attachés** —
mesuré site par site, et c'est ce qui autorise ce lot à les lier sans rejouer
une admission.

## La cause racine est écrite dans le dépôt, vingt lignes au-dessus

`MessageProcessor.handleAttachments` lie les pièces pré-téléversées sous un
`catch` qui JOURNALISE et ne relève pas. Un envoi dont la liaison a échoué
laisse une bulle sans elles — et la branche COPIE, juste au-dessus, est
**volontairement hors de ce `try`**, avec le raisonnement complet en
commentaire :

> « […] une bulle orpheline […] **qu'un rejeu au même `clientMessageId`
> rendrait ensuite `success: true` en dédup** […]. Supprimer la ligne avant de
> propager l'erreur fait échouer l'envoi ET libère le `clientMessageId`. »

**Le raisonnement vaut mot pour mot pour la branche voisine, qui ne l'a jamais
reçu.** C'est « cette entité a-t-elle une JUMELLE ? » dans sa forme la plus
nette : la règle existe, elle est écrite, elle est juste — et elle ne documente
que l'exemplaire qu'elle touche. La réparer est **#19956**, pas ce lot : les
deux branches ne portent pas le même risque (un échec de SCELLEMENT après une
liaison RÉUSSIE n'a pas la même réponse qu'un échec de liaison), et l'aligner
naïvement serait faux.

## Ce que le lot livre

`linkAdmittedAttachmentsToDedupHit` (`services/messaging/earlyDedupAttachments.ts`)
— appelé en une ligne depuis le bloc `earlyHit`, et qui ne fait quelque chose
que lorsque les trois conditions tiennent :

| condition | sinon |
|---|---|
| le rejeu porte des `attachmentIds` | `null` |
| la ligne existante n'en porte AUCUNE | `null` — le rejeu NOMINAL ne retouche rien |
| la ligne n'est pas SUPPRIMÉE | `null` — voir ci-dessous |

`null` dit **« ne touche pas à ce que tu as »**, jamais « il n'y en a pas » :
rendre `[]` ferait effacer les pièces que la ligne porte déjà. C'est la
distinction que `CLAUDE.md` pose pour tout champ qu'un client lit
autoritativement, appliquée à une valeur de retour.

Le lien lui-même reste le site unique du dépôt
(`associateAttachmentsToMessage`), qui ne vise que les lignes dont `messageId`
est absent ou nul (#9587) et pose le `rank` dans l'ordre du composeur (#9776) —
une réponse de dédup qui rendrait les pièces dans un autre ordre que le
`message:new` des autres destinataires rouvrirait l'écart que #9776 a fermé.

## Ce que le lot REFUSE d'aggraver, et pourquoi c'est une garde et non un oubli

Le dédoublonnage n'a **aucun filtre sur `deletedAt`**. Mesuré en harnais : il
rend un message supprimé avec `success: true`. Attacher les pièces du rejeu à
une telle ligne les rendrait à la fois **invisibles et IMMORTELLES** — le
balayage des orphelines ne ramasse que les lignes dont `messageId` est vide,
donc les octets resteraient pour toujours sous un message que personne ne lit.

Le lot pose donc la garde, avec son témoin, et **ne tranche pas** le sort du
rejeu sur un message supprimé : les trois réponses possibles (refuser,
ressusciter, laisser) disent trois produits différents, et l'éphémère EXPIRÉ
n'est pas le message RAPPELÉ. C'est **#19957**, une décision du porteur.

> C'est la règle du cycle 186 retournée vers son auteur : *réparer ce qui
> rendait une donnée invisible oblige à décider, dans le même lot, ce que la
> visibilité DÉCLENCHE.* Ici la question se pose d'un LIEN, pas d'un affichage,
> et la réponse honnête est une garde plus une issue — pas une ligne de plus.

## Preuve

- **RED prouvé par mutation, une par garde** : l'appel retiré ⇒ 1 témoin tombe ;
  la garde « porte déjà ses pièces » retirée ⇒ 1 ; la garde du message supprimé
  retirée ⇒ 1. Chacune nomme exactement le scénario qu'elle garde ;
- `earlyDedupAttachments.test.ts` **4 verts** ;
- les suites de messagerie du gateway (`unit/services/messaging` +
  `unit/services/MessagingService*`) : **64 suites, 2 070 verts** ;
- élargi à `unit/routes/conversations` et `unit/socketio` — les deux surfaces
  qui appellent `handleMessage` : **240 suites, 3 783 verts** ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0**.

**La suite COMPLÈTE du gateway n'a pas tourné localement**, et il faut le dire
plutôt que de l'omettre : lancée d'un seul `npx jest`, elle a épuisé la mémoire
du conteneur (le worker est tombé, `exit 137`). La CI la joue en TROIS tranches,
et c'est elle qui porte cette mesure. Rejouée ici avec `--maxWorkers=2` sur le
périmètre ci-dessus, pas au-delà.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **Le scénario complet contre un vrai MongoDB** : l'enchaînement (envoi
  commité, liaison avalée, balayage, rejeu) est établi par lecture et par
  harnais, jamais rejoué contre le moteur.
- **La fréquence réelle** : combien d'envois, chez de vrais utilisateurs,
  atteignent cet état. Le `catch` qui le produit ne compte rien — il
  journalise.
- **#19956** (la cause racine) et **#19957** (le verdict sur un message
  supprimé) restent ouverts : ce lot ferme le chemin par lequel la pièce se
  perdait, pas ce qui créait l'état.
