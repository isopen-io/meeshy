---
"@meeshy/gateway": patch
---

Supprimer/restaurer une conversation et vider son historique se propagent enfin aux autres appareils

`UserConversationPreferences` est une ligne **par utilisateur**, pas par
appareil : chacune de ses écritures doit incrémenter `version` (le schema la
déclare monotone, les clients jettent `incoming.version <= local`) **et**
diffuser l'instantané sur `user:<id>`. Les deux moitiés ne valent que
conjointes — un incrément que personne ne reçoit ne change rien, une diffusion
non versionnée est jetée par tous.

Trois écrivains vivaient hors de `conversation-preferences.ts` —
`DELETE /api/conversations/:id/delete-for-me`,
`POST /api/conversations/:id/restore-for-me`,
`POST /api/conversations/:id/clear-history` — et n'honoraient **ni l'une ni
l'autre**, alors qu'ils écrivent précisément les deux colonnes
(`deletedForUserAt`, `clearHistoryBefore`) que `ConversationPreferencesPayload`
déclare et que `ConversationStoreSocketBridge` (iOS) mappe déjà sur `userState`.

Un unique `writeConversationPreferences`
(`services/gateway/src/services/conversationPreferencesSync.ts`) porte désormais
les trois obligations en un seul endroit, et les quatre sites d'écriture y
passent — un cinquième ne peut plus n'en appliquer qu'une partie.
