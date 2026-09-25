## Leçon 606 — Un compte SANS secret ne doit pas payer le verrou qui protège les comptes AVEC secret (2026-09-14)

**Cas.** #6424 rend `User.password` nullable. `verifyPassword(saisie, null)`
rend `false` — juste, documenté, et **indistinguable d'un mot de passe faux**.
Or la branche d'échec de `AuthService.authenticate` COMPTE la tentative et
ferme le compte au seuil (#4138). Cinq essais auraient donc verrouillé quinze
minutes un compte dont le mot de passe n'existe pas, c'est-à-dire un compte que
personne ne peut deviner : le verrou n'aurait protégé personne et n'aurait puni
que son détenteur.

1. **Un `false` correct peut être au mauvais ENDROIT.** La fonction de
   comparaison a raison de rendre `false` ; c'est l'appelant qui doit
   distinguer « le secret ne correspond pas » de « il n'y a pas de secret ».
   Le refus se lève AVANT la comparaison, ne compte rien, et nomme la porte à
   prendre (`PASSWORD_NOT_SET`, 401).
2. **Le témoin central n'est pas le message, c'est l'ABSENCE D'ÉCRITURE.**
   `expect(update).not.toHaveBeenCalled()` après sept tentatives : un témoin
   qui vérifierait seulement le code d'erreur resterait vert alors que le
   compteur monte.
3. **La généralisation.** Toute colonne qu'on rend nullable transforme une
   comparaison en trois cas là où le code en compte deux. Chercher, en aval de
   la comparaison, ce qui PUNIT l'échec — compteur, verrou, journal de
   sécurité, limiteur — et se demander si la troisième valeur mérite la même
   punition.
