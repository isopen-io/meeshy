## Leçon 97 — un champ servi à un instant où sa valeur n'existe pas encore n'est pas « en retard » : il est FAUX pour toujours (2026-08-11, routine messaging, cycle 73)

Le cycle 69 a branché le Prisme Linguistique sur la ligne de liste : `lastMessageTranslations` est
posé par les trois chemins REST et par le temps réel, filtré au prisme de CHAQUE destinataire. Le
câblage était juste. Ce qu'il n'a pas regardé, c'est **à quel INSTANT** la valeur est lue.

1. **Un aperçu servi à l'ENVOI ne peut pas porter une traduction qui atterrit deux secondes plus
   tard.** Le pipeline est asynchrone par construction (ZMQ → NLLB → persistance → diffusion), donc
   `Message.translations` vaut `null` au moment exact où le fan-out d'aperçu le lit. Le champ n'est
   pas « pas encore à jour » : rien ne repasse jamais, donc il est faux définitivement. **Après avoir
   branché un champ sur un rendu, chercher QUAND il est écrit — pas seulement QUI l'écrit
   (leçon 96, point 2, qui posait la moitié de la question).**
2. **Un défaut conditionnel au parcours est plus coûteux qu'un défaut constant.** Ouvrir la
   conversation traduisait la ligne, ne pas l'ouvrir la laissait dans la langue de l'expéditeur : le
   même compte, sur le même appareil, voyait deux comportements selon ce qu'il avait fait avant.
   C'est indébuggable côté support et invisible en test manuel — celui qui vérifie a forcément
   ouvert la conversation.
3. **« Le client reçoit l'événement » ne veut pas dire « le client s'en sert ».** Le lecteur sur
   l'écran de liste recevait bien `message:translation` : `AuthHandler` fait rejoindre TOUTES les
   rooms de conversation à l'authentification. Mais iOS le range dans le cache MESSAGE
   (`cacheTranslation`) et web ne l'écoute que depuis la vue conversation. **Vérifier le CONSOMMATEUR,
   pas l'abonnement** — la room prouve l'arrivée, jamais l'usage.
4. **Un émetteur qui n'est pas une mutation humaine ne mérite pas la même audience.** Une édition
   change la ligne pour tout le monde ; une traduction ne la change que pour les lecteurs de cette
   langue-là, et seulement tant que le message traduit est encore le dernier. Réutiliser le fan-out
   existant SANS ces deux bornes aurait payé N fan-outs complets par message sur le chemin le plus
   chaud du service. **Le bon test d'audience n'est pas « qui est participant ? » mais « pour qui le
   payload CHANGE-t-il ? »** — et ici la réponse se lit sur la carte SORTIE, pas sur les préférences
   en entrée : un lecteur hors de la langue reçoit un objet identique à l'octet près.
5. **Re-servir un état périmé est pire que ne rien servir.** Sans la garde `onlyIfLatestIs`, une
   traduction arrivée après un message plus récent aurait fait RECULER la ligne de liste sur
   l'avant-dernier message. Un correctif de convergence qui n'ordonne pas ses écritures fabrique une
   régression que le défaut d'origine n'avait pas.
6. **Prouver le ROUGE par mutation quand les témoins sont écrits après le correctif.** Trois témoins
   de portée sur six et un témoin de câblage sur quatre sont tombés en neutralisant les gardes ; les
   autres verrouillent ce qui ne doit PAS changer et sont non-discriminants seuls, ce qui est leur
   fonction. **Le dire explicitement dans le rapport vaut mieux que laisser croire que dix témoins
   ferment dix défauts.**
7. **Un défaut trouvé dans la lane d'une AUTRE routine se documente, il ne se corrige pas.** Android
   ne décode ni `lastMessageTranslations` ni `lastMessageOriginalLanguage` — même famille de défaut,
   même surface, mais `apps/android/` appartient à la routine de parité. Le corriger ici aurait
   produit un conflit de fichiers avec une session qui travaille sur les mêmes écrans. La tête
   instruite coûte cinq minutes et vaut plus qu'une PR en conflit.
