## Leçon 43 — `drain()` concaténait la queue mémoire AVANT Redis : un `edited` retombé en mémoire rejouait avant son `new` resté dans Redis (2026-07-08, routine messaging, iter 136)

`RedisDeliveryQueue.drain()` retournait `[...memoryEntries, ...redisEntries]` en s'appuyant sur un commentaire
affirmant que les entrées mémoire « prédatent toujours » ce que Redis contient (elles n'y arrivent que par
fallback pendant une panne Redis). Vrai UNIQUEMENT si Redis était down dès le départ. Faux sur un blip Redis
EN MILIEU de séquence : (1) Redis sain → `enqueue('new', M)` va dans Redis ; (2) blip transitoire →
`enqueue('edited', M)` throw dans `redis.eval`, catché, retombe en MÉMOIRE ; (3) Redis récupère → `drain()`
renvoie `[edited (mémoire), new (redis)]`. `_drainPendingMessages` (MeeshySocketIOManager) rejoue les events
au client dans CET ordre → le client reçoit `MESSAGE_EDITED` AVANT `MESSAGE_NEW` → l'edit cible un message
qu'il n'a pas encore → edit perdu, contenu pré-edit figé. Violation directe de l'invariant FIFO documenté sur
`ENQUEUE_DEDUP_LUA` (« edit/delete après un `new` offline ne doivent pas être perdus, rejeu FIFO »).

**Fix** : chaque entrée porte déjà un `enqueuedAt` monotone (ISO, stampé à l'enqueue par les 3 appelants). Trier
la fusion par `enqueuedAt` croissant au lieu de concaténer mémoire-d'abord. `Array.prototype.sort` étant stable,
les égalités de timestamp gardent l'ordre mémoire-avant-Redis — le test de réconciliation panne-totale (mémoire
enqueuée plus tôt en wall-clock) reste vert, et l'ordre up→down→up est corrigé. Bonus : `_emitDeliveryForDrainedMessages`
qui dérive le « dernier message » de l'ordre d'itération devient correct lui aussi.

**Règle réutilisable** : un commentaire qui justifie un ordre par « X précède toujours Y » cache souvent une
hypothèse temporelle non testée (« la panne a commencé au début »). Dès qu'un buffer de repli (mémoire, retry,
dead-letter) peut recevoir des entrées PENDANT une séquence déjà partiellement écrite dans le canal principal,
son contenu peut être plus RÉCENT que le canal — ne jamais présumer l'ordre par la source, toujours trier par la
clé temporelle monotone que les entrées portent déjà. Test : reproduire le blip milieu-de-séquence (channel sain
→ channel qui throw → channel récupéré) avec des `enqueuedAt` explicitement ordonnés, et asserter l'ordre de rejeu
(RED = ['edited','new'], GREEN = ['new','edited']).
