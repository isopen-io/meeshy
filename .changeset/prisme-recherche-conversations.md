---
"@meeshy/gateway": patch
---

La recherche de conversations servait la dernière ligne de liste restée hors
Prisme Linguistique.

`GET /conversations/search` construit son `lastMessage` à la main. Son `include`
Prisma rapportait déjà `Message.translations` et `Message.originalLanguage` — ce
sont des colonnes du même document Mongo, aucun `select` restrictif ne les
excluait — mais le mapping manuel les jetait : la donnée était payée puis perdue,
exactement comme `metadata.location` avant le Lot 3. Un lecteur francophone
cherchant une conversation lisait « Hello » dans le résultat et « Bonjour » dans
sa liste, pour le même message.

La réponse porte désormais `lastMessageOriginalLanguage` et
`lastMessageTranslations`, construits par le même
`buildLastMessagePreviewTranslations` et le même `resolveUserLanguagesOrdered`
que `GET /conversations` — `conversationMinimalSchema` les déclarait déjà.
L'aperçu original est tronqué à la même borne : sans cela, le poids de la ligne
aurait dépendu de la langue du lecteur, la carte traduite étant plafonnée et
l'original non.

Côté iOS, la ligne de résultat de recherche résout enfin via
`resolvedLastMessagePreview` au lieu de rendre l'aperçu brut — même texte que
`ThemedConversationRow`, sur les deux chemins (cache local et réseau).
