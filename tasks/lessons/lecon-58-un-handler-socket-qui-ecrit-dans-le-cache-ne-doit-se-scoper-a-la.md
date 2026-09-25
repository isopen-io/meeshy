## Leçon 58 — un handler socket qui écrit dans le cache ne doit se scoper à la conversation active que si l'événement le permet (2026-08-06, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). Le gateway auto-join CHAQUE socket
à TOUS les rooms de conversation de l'utilisateur (`AuthHandler._joinUserConversations`) : un client
reçoit donc `message:new` ET `message:translation` pour des conversations qu'il ne regarde pas.
`use-socket-cache-sync.handleNewMessage` écrit dans TOUTES les listes de messages en cache (scan par
`conversationId`), mais `handleTranslation` se scopait à la seule `conversationId` active du hook —
alors que `TranslationEvent` ne porte AUCUN `conversationId`. Résultat : une traduction arrivant pour
un message d'une conversation en cache mais non-active était **droppée**, le message restait en langue
d'origine jusqu'à un refocus fenêtre (`staleTime: Infinity` ne relit jamais) — **violation directe du
Prisme Linguistique**. Idem `handleAudioTranslation`, qui ignorait le `data.conversationId` pourtant
présent dans `AudioTranslationReadyEventData`. Fix : router le merge par `messageId` à travers toutes
les listes en cache (miroir du scan de `handleMessageDeleted`) ; router l'audio par `data.conversationId`.

**Leçons :**
1. **Vérifier la portée de LIVRAISON avant de scoper un handler à la vue courante.** Le réflexe
   « je suis dans la conversation X, donc l'événement concerne X » est faux dès que le transport
   auto-join tous les rooms. Deux handlers frères (`handleNewMessage` global vs `handleTranslation`
   local) écrivant le MÊME cache signalent une asymétrie à auditer — l'un des deux a tort.
2. **Un événement sans `conversationId` ne peut pas être routé par la conversation active — il doit
   l'être par son `messageId`.** Se rabattre sur la `conversationId` du hook produit un no-op silencieux
   (le message n'est pas dans ce cache) qui se lit comme « appliqué ». Quand l'événement PORTE un
   `conversationId` (`handleAudioTranslation`), l'utiliser — jamais la fermeture du hook.
3. **Un test de régression doit d'abord échouer sur le cas non-actif.** Mon test « conversation active »
   passait AVANT le fix (le chemin actif marchait déjà) : seul le test « conversation NON-active » prouvait
   le bug. Un test qui ne distingue pas la conversation observée de la conversation cible ne prouve rien.
