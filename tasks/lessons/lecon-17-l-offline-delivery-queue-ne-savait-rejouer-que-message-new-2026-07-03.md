## Leçon 17 — L'offline delivery queue ne savait rejouer que `message:new` (2026-07-03/04)
Suite directe de la Leçon 13 : une fois `MessageHandler`/`MeeshySocketIOManager` capables
d'enqueue les nouveaux messages pour les destinataires hors-ligne, l'audit suivant a montré que
`handleMessageEdit`/`handleMessageDelete` (WS) et leurs équivalents REST (`routes/messages.ts`)
n'enqueuent JAMAIS rien — et plus profondément, `QueuedMessagePayload`/`RedisDeliveryQueue` ne
pouvaient structurellement représenter qu'un `message:new` (`_drainPendingMessages` émettait
`SERVER_EVENTS.MESSAGE_NEW` inconditionnellement). Un edit/delete fait pendant qu'un destinataire
est hors-ligne était donc silencieusement perdu pour lui : son cache garde l'ancien contenu (ou
le message supprimé reste visible) jusqu'à un refetch complet non lié. **Fix scopé au chemin WS
uniquement** (le chemin REST edit/delete a le même trou mais est laissé en suivi documenté, comme
Hotspot B.1 dans `tasks/realtime-hotspots-analysis.md` — élargir le schéma une seconde fois puis
router 4 call sites au lieu de 2 aurait dépassé le "petit changement chirurgical" de cette
passe) : `QueuedMessagePayload.eventType?: 'new'|'edited'|'deleted'` (absent = legacy, 100%
rétrocompatible), `_drainedEventName()` route l'émission du replay selon ce champ, et
`_emitDeliveryForDrainedMessages` ignore désormais les entrées non-`'new'` (une distribution
"delivered" n'a pas de sens pour un edit/delete). **Règle générale (applicable à tout futur ajout
similaire) : quand une queue de replay ne transporte qu'UN type d'événement en dur (ici
`MESSAGE_NEW` hardcodé dans la boucle d'émission), vérifier si d'autres mutations en place du
même objet (edit, delete, réaction...) ont le même besoin de rejeu offline avant de considérer le
sujet clos — le premier fix pour "new" laisse un faux sentiment de complétude.** Tests :
`MeeshySocketIOManager.test.ts` (routage par eventType + exclusion receipt), 2 nouveaux cas dans
`MessageHandlerEditDelete.test.ts`.
