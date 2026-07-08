---
"@meeshy/web": patch
---

Présence : un utilisateur hors ligne (>30 min) n'affiche plus de pastille sur les avatars.

Suite au retour produit sur la centralisation de la présence (PR #1729), l'état `offline` ne rend plus de point sur les avatars et indicateurs (`OnlineIndicator`, `Avatar` v2, `ConversationItem`, `UserPresenceBadge`, `UserPresenceLabel`) — comportement standard (WhatsApp/Telegram) : vert = online/recent, orange = away, rien au-delà de 30 min.

Le gris `#9CA3AF` reste défini dans les maps centrales (`PRESENCE_DOT_CLASS.offline`, `presenceDotClassV2.offline`) pour les affichages explicitement labellisés (en-têtes de section « Hors ligne », badge story-intro), mais les dots d'avatar ne le rendent jamais.
