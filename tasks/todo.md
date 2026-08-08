# Cycle 21 — Éditer un message détruisait ses mentions par nom d'affichage

Suivi direct du premier point laissé ouvert par le cycle 20 :
« **Le chemin d'édition est un quatrième écrivain de `validatedMentions`, et il extrait moins
bien.** `messages-advanced.ts` appelle `extractMentions` (handles bruts) là où la création appelle
`extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Conséquence : éditer un
message qui contenait `@John Doe` **efface** la mention. »

Vérifié : réel, et la destruction est totale — pas une dégradation d'affichage.

## D1 (racine) — deux extracteurs pour un seul champ

La route d'édition commence par **purger** les lignes `Mention` du message
(`prisma.mention.deleteMany`), puis ré-extrait. Si la ré-extraction rend moins que l'originale,
la différence est perdue définitivement :

| | création / lien | édition (avant ce cycle) |
|---|---|---|
| extracteur | `extractMentionsWithParticipants` | `extractMentions` |
| `@john` | reconnu | reconnu |
| `@John Doe` | reconnu (résolu vers `john`) | **ignoré** |

Corriger une faute de frappe dans un message qui nommait quelqu'un par son nom d'affichage
supprimait donc sa ligne `Mention` (il sort de l'inbox `/mentions`) et remettait
`validatedMentions` à `[]` (le web cesse de surligner). Rien dans le texte n'avait changé pour
elle. Deux extracteurs pour un même champ ne peuvent pas rester d'accord : c'est la dérive
qu'une source unique existe pour rendre inécrivable.

## D2 (même bloc) — 150 lignes en double, et leurs quatre chemins d'effacement

Le bloc d'édition ré-implémentait la résolution entière — résolution des usernames, validation,
création, écriture — avec **quatre** branches distinctes qui écrivent `validatedMentions: []`
(aucun utilisateur trouvé, aucune mention extraite, service absent, exception). Ce sont quatre
occasions de diverger de la création, et la table ci-dessus montre qu'elles avaient déjà servi.

## Plan

- [x] `replaceMessageMentions` dans `services/messaging/messageMentions.ts` — même cœur que
      `resolveMessageMentions`, deux différences assumées : purge préalable des lignes `Mention`,
      et écriture TOUJOURS effectuée (même vide)
- [x] Le cœur commun (`computeValidatedMentions`) n'écrit rien : les deux exports décident de ce
      qu'ils persistent, parce que c'est exactement là qu'ils diffèrent
- [x] La route d'édition délègue ; sa notification de mention reste locale (à l'édition, seul un
      NOUVEAU mentionné apprend quelque chose — pas d'éventail réponse/message régulier)
- [x] 6 unités + 2 tests de route, la mention par nom d'affichage vue ROUGE avant le correctif

## Revue

### Pourquoi deux exports plutôt qu'un drapeau

`resolveMessageMentions(…, { replace: true })` aurait été un paramètre qu'un appelant peut
oublier — et l'oublier signifie, sur l'édition, laisser un `validatedMentions` périmé décrivant
des lignes `Mention` déjà supprimées. Deux noms au point d'appel disent laquelle des deux
sémantiques on demande, et aucune des deux n'a de valeur par défaut à deviner.

### L'absence de court-circuit EST le contrat de la variante

`resolveMessageMentions` ne touche à rien quand le contenu ne porte pas de `@` : ne rien écrire
est la bonne réponse à la création. `replaceMessageMentions` doit faire exactement l'inverse —
un contenu édité qui ne porte PLUS de `@` doit effacer le champ. La garde n'est donc pas une
optimisation qu'on aurait oublié de reporter : c'est ce qui distingue les deux unités.

### L'effacement de secours survit à sa propre panne

Les lignes `Mention` sont purgées AVANT la résolution. Si la résolution échoue ensuite, laisser
`validatedMentions` intact décrirait des mentions qui n'existent plus : le `catch` réécrit donc
`[]`, et si cette écriture échoue à son tour elle est journalisée sans lever. Comportement repris
du bloc d'origine, désormais en un seul endroit au lieu de quatre.

### Reste ouvert après ce cycle

- **`validateMentionPermissions` reçoit un `Participant.id` à la création et un `User.id` à
  l'édition.** Inchangé par ce cycle (chaque appelant passe ce qu'il passait déjà). Sans effet
  observable : la comparaison ne sert que dans la branche `direct`, où la création laisse donc
  passer une auto-mention que l'édition refuserait. Un contrat à deux lectures dans une même
  signature — à trancher dans un cycle dédié, avec les tests des deux chemins.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est un deuxième exemplaire du
  chargeur de participants** (celui de `MessageProcessor` a disparu au cycle 20). Même corps,
  même `select`, aucun appelant commun pour l'instant.
- **L'édition n'émet aucun `mention:created`** — pas plus qu'avant : le nouveau mentionné reçoit
  bien sa notification (ligne `Notification` + push), mais aucun événement socket dédié.
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- **Aucun client iOS n'écoute `link:message:new`** — les conversations par lien restent une
  fonctionnalité web (cycle 15).
- **Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio** (cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
