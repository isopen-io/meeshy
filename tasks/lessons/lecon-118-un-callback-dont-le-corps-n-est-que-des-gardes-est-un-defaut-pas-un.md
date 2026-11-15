## Leçon 118 — un callback dont le corps n'est que des gardes est un défaut, pas un no-op délibéré (2026-08-12, routine messaging, cycle 86)

`ConversationLayout.onUserTyping` filtrait l'écho de soi, filtrait les autres conversations… puis se
terminait. Rien n'écrivait. La forme est traître parce qu'elle a l'air FINIE : deux `return` gardés,
des paramètres préfixés `_` qui signalent « volontairement inutilisés », des deps cohérentes. Le
hook d'à côté exposait pourtant `handleUserTyping`, seul écrivain de l'état que l'en-tête rend — et
personne ne l'avait déstructuré.

1. **Un `useCallback` remis à une couche transport et dont AUCUNE branche n'écrit ni n'appelle est
   presque toujours une moitié de câblage perdue.** Le test bon marché : « ce callback produit-il un
   effet observable dans au moins un chemin ? ». Si la réponse est non, chercher la fonction qu'il
   aurait dû appeler — elle est en général exportée par un hook du même fichier.
2. **Un préfixe `_` sur un paramètre est une AFFIRMATION, pas une preuve.** Ici `_username` et
   `_isTyping` — les deux valeurs qui portent toute l'information — étaient marqués inutilisés par
   la personne qui venait justement d'oublier de les utiliser.
3. **Une fonctionnalité qui marche sur une surface et pas sur l'autre masque la panne au test
   manuel.** `use-stream-socket.ts` tient sa PROPRE copie du handler typing et la câble juste : les
   indicateurs marchaient sur l'accueil, donc « les indicateurs marchent ». Quand deux surfaces
   réimplémentent le même câblage, vérifier les DEUX, ou n'en garder qu'une.
