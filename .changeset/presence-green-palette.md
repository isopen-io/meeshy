---
"@meeshy/web": patch
"@meeshy/shared": patch
---

Présence : palette verte rétablie + source de vérité centralisée.

Nouvelle source de vérité partagée `@meeshy/shared/utils/user-presence` (`getUserPresenceStatus`) : le flag backend `isOnline` (actif < 1 min) est désormais autoritatif pour l'état online (garde anti-stale au-delà de 30 min), la décroissance 60s/5min/30min sur `lastActiveAt` reste inchangée.

Palette conforme à la convention produit : vert `#34D399` = online/recent (pulse sur online), orange `#FBBF24` = away 5–30 min, gris `#9CA3AF` = hors ligne. Mapping couleur centralisé dans `lib/user-status.ts` (`PRESENCE_DOT_CLASS`/`PRESENCE_BADGE_CLASS`/`PRESENCE_TEXT_CLASS`) et consommé par toutes les surfaces (OnlineIndicator, badges, labels, StreamSidebar, v2 Avatar/ContactCard/ConversationItem, recherche).

Un `typing:start` reçu force l'état online de l'émetteur dans le user-store : une personne en train d'écrire affiche toujours la pastille verte.
