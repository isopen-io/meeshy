## 2026-10-24 : Seul le dernier message arrivé s'anime à son entrée dans le fil (#11223)

**Contexte.** Le ROULEAU (2026-08-18) interdisait toute animation d'insertion : un message neuf apparaissait sec, sans rien qui dise qu'il venait d'arriver. L'audit des appuis longs du 2026-10-20 a posé la question au porteur. Sa décision du 2026-10-24 : **seul le DERNIER message arrivé s'anime** ; un lot chargé d'un coup (reconnexion, pagination, rattrapage) apparaît sans animation, sur iOS et sur le web.

**Décision.**

- La règle est une loi pure, `MessageArrivalMotion` (`Features/Main/Views/MessageArrivalMotion.swift`), jumelle de `apps/web/src/lib/view/arrival-motion.ts` : même énoncé, même fenêtre de fraîcheur (30 s), mêmes quatre causes. Parmi les messages NOUVEAUX d'une pose, seul le plus récent s'anime, et seulement s'il arrive en temps réel :
  - `firstRender` : aucun message en commun avec la pose précédente (ouverture du fil, fenêtre entièrement neuve) ;
  - `pagination` : le plus récent des nouveaux n'est pas en tête du fil ;
  - `catchUp` : le plus récent des nouveaux date de plus de 30 s, ou n'a pas de date ;
  - `realtime` : tout le reste, message du pair comme mon propre envoi.
- La cause se lit sur la POSE, jamais sur un canal de côté : le store ne dit pas d'où vient une ligne, et le socket, la synchro de reprise et l'envoi local écrivent dans la même fenêtre.
- « Réduire les animations » (système ou réglage Meeshy, `MeeshyMotion.shouldReduce`) coupe tout.
- `MessageArrivalAnimator` (type valeur tenu par le contrôleur) arme l'arrivée à la pose (`applySnapshot`, avant `noteArrival`) et la joue dans `willDisplay`, sur la cellule de CET item, dans la seconde qui suit. Le data source reste sans animation (`animatingDifferences: false`). L'entrée est une animation Core Animation sur la couche de la cellule (opacité, montée de 12 pt, échelle 0,97 → 1, 0,32 s), jamais sur ses propriétés de modèle, que la pose des attributs de layout réécrit, ni sur la couche du `contentView`, que la scène Focal pose.
- Ni hauteur ni offset ne bougent : le défilement automatique (`noteArrival`, `scrollToBottom`) est inchangé.

- La courbe de l'entrée est `MessageArrivalMotion.timingControlPoints` (0,22 · 1 · 0,36 · 1), celle du web (`ARRIVAL_MOTION_CURVE`) : aucun point au-delà de 1, la cellule se pose sans rebond sur les deux plateformes.
- Le câblage a ses témoins (`MessageArrivalAnimatorTests`) : l'entrée posée sur la couche de SA cellule seule, une fois, rien au premier rendu, à une page plus ancienne, sous Réduire les animations ni hors de la fenêtre d'affichage ; l'armement contre la pose précédente avant `noteArrival`, le jeu au `willDisplay`.

**Conséquences, et ce que la fenêtre de 30 s ne distingue pas.** Le premier message d'une conversation vide ne s'anime pas : sans message avant, la pose est un premier rendu. Hors de cela, la cause se lit sur la DATE du plus récent des nouveaux, comparée à l'horloge de l'appareil — ce qui ne tient la décision du porteur (« un lot chargé d'un coup apparaît sans animation ») qu'au-delà de 30 s :

- une reconnexion après une coupure de MOINS de 30 s anime le dernier message rattrapé, et la revalidation qui suit une ouverture sur un cache périmé anime de même un message de moins de 30 s : la règle n'a aucun signal de reconnexion ni d'ouverture, elle ne voit que la pose ;
- une horloge d'appareil EN AVANCE sur le serveur de plus de 30 s fait tomber une arrivée réelle en rattrapage : elle apparaît sans animation ;
- une horloge d'appareil EN RETARD sur le serveur rend récentes (voire futures) les dates serveur : le dernier message d'un rattrapage de reconnexion, envoyé pendant la coupure, peut alors s'animer.

Le premier et le troisième cas animent à tort UN seul message, jamais un lot. Les fermer exige un signal de reconnexion et d'ouverture (aucun armement pendant N ms après la reconnexion du socket ou la première pose) : c'est le suivi #12688. Le miroir Kotlin (`apps/android`) n'a rien reçu (gel du 2026-09-16).
