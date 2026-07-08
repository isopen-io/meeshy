---
"@meeshy/web": patch
"@meeshy/gateway": patch
---

Fiabilisation des messages en temps réel et de la présence.

Web : revalidation non destructive du fil de conversation (rattrapage par watermark `after` à l'ouverture, au focus et à la reconnexion — les derniers messages reçus apparaissent désormais après un rechargement) ; sync socket→cache active sur la vue liste ; règle de présence vert/orange/gris unifiée sur toutes les surfaces d'avatars.

Gateway : file de livraison hors-ligne pour les participants anonymes, drain multi-device vers la room utilisateur, jointure des rooms socket à la création de conversation/DM/lien d'invitation, gate de confidentialité de la présence (showOnlineStatus/showLastSeen) sur les endpoints REST, et override de présence temps réel sur le détail des conversations.
