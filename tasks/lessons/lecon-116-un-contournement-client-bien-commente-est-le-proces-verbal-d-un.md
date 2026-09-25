## Leçon 116 — un contournement client bien commenté est le procès-verbal d'un défaut serveur (2026-08-12, routine messaging, cycle 82)

`bubble-stream-page.tsx` portait la phrase exacte : « Sessions ANONYMES exclues : la route
mark-as-read est JWT-only (allowAnonymous: false) — chaque flush partirait en 401 », trois lignes
après avoir expliqué qu'un écran privé de ce hook voit « son compteur croître indéfiniment ». Tout
était écrit : la cause, l'effet, et jusqu'au nom de l'option fautive. Personne n'avait suivi la
flèche jusqu'au serveur.

1. **Un commentaire qui EXPLIQUE pourquoi le client renonce à un appel nomme une cause serveur.**
   Le grep qui trouve `allowAnonymous`, `JWT-only`, `401`, `403` dans les commentaires du CLIENT est
   un détecteur de défauts backend, et il est bon marché.
2. **Deux moitiés d'une même capacité peuvent vivre dans deux fichiers et ne jamais se rencontrer.**
   Ici le serveur COMPTAIT les non-lus d'un anonyme et les lui POUSSAIT (trois sites délibérés,
   commentés, testés) mais aucune route ne lui permettait de les ACQUITTER. Chaque moitié était
   défendable seule ; c'est leur asymétrie qui était le défaut. Chercher la moitié manquante :
   « qui écrit ce que ce chemin lit ? », « qui remet à zéro ce que ce chemin incrémente ? ».
3. **Deux verrous en série s'auditent séparément.** La porte (`allowAnonymous: false`) répondait 403
   AVANT la clé (la garde `where: { userId }`). Corriger la clé seule n'aurait rien changé et le
   test serait resté rouge sans qu'on sache pourquoi ; corriger la porte seule aurait ouvert sur un
   403 plus tardif. Prouver CHAQUE verrou par sa propre mutation.
4. **`authContext.userId` ne contient pas toujours un `User.id`.** La branche anonyme d'auth y écrit
   `participant.id`. Tout `where: { userId: authContext.userId }` sur `Participant` est donc suspect
   par construction — il compare un id de participant à une colonne d'utilisateur. Le résolveur
   partagé (`resolveCallerParticipant`) existe désormais ; la dette restante est nommée dans
   `tasks/todo.md`.
