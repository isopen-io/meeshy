## Leçon 310 — un déclencheur ÉPHÉMÈRE ne rattrape rien, et une synchronisation qui n'en a qu'un ne synchronise que les présents (2026-08-28, cycle 132)

Le cycle 131 a livré la moitié LECTURE des préférences user-level d'Android : deux
`GET` et un coordinateur qui relit le bloc que `user:preferences-updated` annonce.
Suivi mesuré à sa clôture, ouvert ici : **ces deux `GET` n'avaient qu'un seul
appelant, et c'était une diffusion.**

> **Une diffusion n'atteint que les appareils PRÉSENTS pour l'entendre**, et un
> téléphone est absent par construction au moment qui compte : son propriétaire
> change ses réglages ailleurs pendant que l'application est en arrière-plan ou
> déconnectée. Rien ne rejoue l'événement manqué — un `attach()` enregistre un
> écouteur, il ne demande pas d'arriéré. Le bloc restait donc périmé
> **indéfiniment**, exactement le symptôme que le cycle précédent venait de
> fermer, une fenêtre plus loin.

La question à poser à toute synchronisation par événement n'est donc pas « le
lecteur applique-t-il bien ce qu'il reçoit ? » mais **« que se passe-t-il pour
celui qui n'a rien reçu ? »**. Un lecteur correct sur un déclencheur éphémère est
une synchronisation à moitié faite ; il lui faut un second déclencheur PÉRENNE —
ici la connexion elle-même, qui couvre du même geste l'ouverture de session et le
rattrapage après coupure.

### L'ÉTAT de connexion, jamais le SIGNAL de connexion

> Une session s'ouvre en appelant `connect()` **puis** `attach()`. Un collecteur
> lancé par `attach()` peut donc s'abonner APRÈS que la connexion a abouti. Sur un
> `SharedFlow` sans replay, cette connexion-là est perdue **en silence**, sur le
> chemin (démarrage à froid) qui a le plus besoin du rattrapage. Un `StateFlow`
> rend sa valeur courante à l'abonnement : le collecteur en retard voit
> `CONNECTED` et hydrate quand même — et la conflation donne gratuitement « une
> hydratation par connexion réelle, aucune pour un état qui se répète ».

C'est la même famille que la leçon du cycle 131 sur les témoins (« un harnais qui
met un transport entre l'assertion et son sujet ») : ici le transport est en
production, et le mode d'échec est le même — une absence indiscernable d'un
fonctionnement normal.

### Et la question qui a rendu le lot dangereux avant de le rendre juste

Ajouter un déclencheur à une relecture, c'est demander **« contre quoi cette
relecture court-elle ? »**. Les écritures de préférences ne sont pas « en ligne
d'abord » : elles passent par l'**outbox**. Au moment exact où une hydratation de
reconnexion part, l'outbox draine la même voie.

> **Une relecture qui gagne la course contre l'écriture locale qu'elle double
> ANNULE un geste de l'utilisateur** : le serveur finit juste (le PATCH arrive
> après), l'écran finit **revenu à l'ancienne valeur**, et aucune diffusion ne
> reste pour le défaire. Un réglage qui revient tout seul est PIRE qu'un réglage
> périmé — l'utilisateur l'a vu changer, puis se défaire.

Deux corollaires, tous deux mesurés :

- **Le défaut préexistait au correctif, en plus étroit.** La passerelle renvoie au
  compte émetteur la diffusion déclenchée par son propre PATCH ; un interrupteur
  basculé deux fois de suite courait déjà contre son propre écho. Le nouveau
  déclencheur ne l'a pas créé, il l'a fait passer du cas rare au cas nominal — donc
  le veto se pose sur la relecture, PAS sur le déclencheur, et garde les deux
  chemins d'un seul site.
- **Devant deux façons de se tromper, mesurer laquelle est réversible.** Un saut
  inutile laisse un bloc périmé jusqu'à la connexion suivante ; une relecture
  inutile annule un geste. On échoue vers la première — y compris quand la question
  posée à l'outbox est elle-même en défaut (queue illisible ⇒ sauter). Même famille
  que « un échec de relecture ne remet rien à zéro » (cycle 131), appliquée cette
  fois à l'INCERTITUDE et non à l'échec.
