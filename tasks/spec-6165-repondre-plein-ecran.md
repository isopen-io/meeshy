# #6165 — Répondre à une pièce depuis sa vue plein écran, avec la barre universelle

Branche `claude/repondre-plein-ecran-6165`, base `dev` 5974647f4c.

## Ce que ce lot livre, en deux temps

### Temps 1 — la MOITIÉ ÉCRITURE de #6164 (condition, mesurée)

`#6164` a livré la LECTURE : `metadata.attachmentReplyTo` est servi par les quatre
transports et `ReplyReference.attachmentId` le porte jusqu'à l'écran. **Rien, côté iOS,
ne l'ÉMET.** Mesuré sur `dev` :

| site | porte l'ancre ? |
|---|---|
| `SendMessageRequest` (corps REST) | NON — le champ n'existe pas |
| `ConversationViewModel.sendMessage` | NON — aucun paramètre |
| `sendMessageWithAttachments` (le tap d'envoi) | NON |
| `optimisticReplyReference(quoting:)` | pose `attachmentId` du REPRÉSENTATIF |
| `message:send` socket (`MessageHandler.ts`, 2325 l. HORS BUDGET) | NON — et le gateway ne l'admet pas |
| `OfflineQueueItem` / `OutboxDispatcher` | NON |

Sans ce temps 1, la barre du temps 2 serait **un contrôle qui ment** : on regarde la
photo 3, on répond, la citation montre la photo 1.

**Le socket ne transporte PAS l'ancre, et ne fera pas semblant.** `admitAttachmentReply`
n'est wiré que sur `messages-send.ts` (REST). Un envoi porteur d'ancre devient donc
INÉLIGIBLE au socket-first et au socket-fallback — même liste que le chiffrement,
l'éphémère, la vue unique, le flou et les effets, et pour la même raison.

### Temps 2 — #6165, la barre AU-DESSUS du plein écran

`UniversalComposerBar` est la barre partagée ; le lecteur de story l'héberge déjà
au-dessus de son canvas (`StoryComposerBarView`). Ce lot fait le MÊME geste au-dessus
du média en plein écran. Il n'en fabrique pas une seconde.

## Témoins (comportement, jamais texte source)

1. répondre depuis le plein écran n'émet AUCUNE fermeture de la galerie ;
2. la citation composée porte l'identifiant de la **3e** pièce, pas du représentatif ;
3. sur une pièce protégée, aucune vignette ne part dans la citation ;
4. l'ancre atteint le CORPS REST, et un envoi qui la porte ne prend pas le socket.
