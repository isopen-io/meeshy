---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

Le Prisme Linguistique s'applique enfin à l'aperçu de la liste de conversations.

`GET /conversations` ne transportait ni les traductions du dernier message ni sa
langue d'origine : la ligne de liste restait dans la langue de l'expéditeur pour
tout le monde, à chaque démarrage à froid. Le résolveur client existait pourtant
(`MeeshyConversation.resolvedLastMessagePreview`), et sa documentation attendait
explicitement ce câblage serveur.

La réponse porte désormais, au niveau conversation, `lastMessageOriginalLanguage`
et `lastMessageTranslations` — une carte `{ langue: aperçu }` restreinte aux
langues du prisme du LECTEUR (`resolveUserLanguagesOrdered`), tronquée au même
plafond que `lastMessage.content`, débarrassée des traductions chiffrées et de la
langue d'origine (qui EST déjà `lastMessage.content`). `null` quand il ne reste
rien, pour que le client retombe sur l'original — règle #3 du Prisme.

Coût nul côté base : `Message.translations` est une colonne JSON du même
document, pas une relation.
