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

**Conséquences.** Le premier message d'une conversation vide ne s'anime pas : sans message avant, la pose est un premier rendu. Une horloge d'appareil très décalée du serveur (plus de 30 s) fait tomber une arrivée réelle en rattrapage : elle apparaît sans animation, jamais l'inverse. Le miroir Kotlin (`apps/android`) n'a rien reçu.
