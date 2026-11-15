## Leçon 41 — le chemin `add` d'une paire add/remove n'exposait pas le no-op que `remove` signale déjà : `reaction:add` re-broadcastait + re-notifiait sur une ré-réaction identique (2026-07-08, routine messaging, iter 134)

`ReactionService.removeReaction()` retourne un `boolean` (`false` = rien supprimé) et TOUS ses consommateurs
(handler socket, route REST, DELETE conversation) respectent ce faux pour court-circuiter avant le broadcast
`REACTION_REMOVED` — garde idempotente explicite, testée. Mais `addReaction()` retournait
`{ reaction, replacedEmojis }` où le no-op (le participant a DÉJÀ exactement cet emoji, ligne 102) renvoyait
`replacedEmojis: []` — **strictement indiscernable** d'une première réaction authentique (elle aussi
`replacedEmojis: []`). Les 4 consommateurs (`ReactionHandler.handleReactionAdd`, `handleAgentReaction` dans
`MeeshySocketIOManager`, `routes/reactions.ts`, `routes/conversations/messages-advanced.ts`) broadcastaient
donc `REACTION_ADDED` à toute la room ET (3 d'entre eux) firaient `notifyReactionAdded` à chaque ré-envoi
d'un emoji déjà posé — un cas de routine (double-fire optimiste, retry socket après ACK perdu, second device
qui écho le même tap). Effet net : fan-out redondant à tous les participants + (une fois la fenêtre anti-spam
écoulée) seconde notif « X a réagi 👍 » pour une seule réaction logique qui n'a jamais changé d'état.

**Fix** : rendre le service seule source de vérité du « rien n'a changé » — ajouter `unchanged: boolean` à
`AddReactionResult` (`true` sur le retour no-op, `false` sur l'upsert réel), et une garde dans les 4
consommateurs qui répond succès mais saute broadcast + notif quand `unchanged` (miroir exact de la garde
`removed === false`). REST : 200 (pas 201, rien n'a été créé) sur le no-op.

**Règle réutilisable** : quand une opération et son inverse (add/remove, subscribe/unsubscribe,
acquire/release) forment une paire et que l'un des deux expose déjà un signal « no-op / rien fait » respecté
par ses appelants, VÉRIFIER que l'autre l'expose aussi — l'asymétrie (un côté durci contre l'idempotence,
l'autre non) est une signature de sibling-drift (cf. Leçon 38). Le piège spécifique ici : le no-op renvoyait
la MÊME forme de données qu'un succès réel (`replacedEmojis: []` des deux côtés), donc aucun appelant ne
POUVAIT distinguer les deux même en le voulant — un no-op silencieux doit toujours être rendu observable par
le type de retour, jamais laissé se confondre avec le cas nominal. Corollaire test : une garde d'idempotence
n'est prouvée que par un test qui compte les effets de bord (broadcast/notif appelés exactement 0 fois sur le
no-op) — vérifié RED ici en retirant la garde (io.to appelé 1× au lieu de 0×).
