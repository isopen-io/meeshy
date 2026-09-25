## Leçon 133 — une promesse à DÉTRUIRE se décide là où l'information est et s'exécute là où elle est déjà écrite (2026-08-12, routine messaging, cycle 93)

Le cycle 93 devait faire respecter `isViewOnce`/`maxViewOnceCount` : le budget de spectateurs était
compté exactement, `isFullyConsumed` calculé et diffusé, les clients masquaient le média — et rien
n'effaçait jamais. La tête du cycle posait explicitement la question du chemin : *le balayage, ou
la consommation elle-même ?*, avec une préférence annoncée pour la seconde (« plus juste, pas de
fenêtre résiduelle »).

**Les deux réponses étaient fausses prises isolément, et l'énoncé binaire était le piège.**

- La **consommation** est la seule à SAVOIR que le budget vient de s'épuiser. Un balayage devrait
  recalculer `viewOnceCount >= maxViewOnceCount ?? 1` sur toute la collection, à la minute, pour
  redécouvrir ce qu'un appel de route venait de lui apprendre.
- La consommation est aussi la plus mauvaise place pour **EFFACER**. Le client attend
  `consumeViewOnce` AVANT de révéler la bulle, et le média n'est pas toujours déjà en cache :
  effacer dans la foulée prend le contenu des mains du destinataire à l'instant précis où il vient
  de payer sa vue. Personne ne l'aurait vu en relisant le serveur — il fallait aller lire l'ordre
  d'appel côté iOS.

Le correctif pose une ÉCHÉANCE (`expiresAt = now + grâce`) et laisse le balayage éphémère du cycle
précédent exécuter. Zéro seconde implémentation de la destruction : fichiers, clair, traductions,
effets de retrait et annonce `message:deleted` étaient déjà écrits, testés et câblés.

**Règle : quand la promesse est une destruction, séparer DÉCIDER et EXÉCUTER, et chercher
l'exécutant existant AVANT d'en écrire un second.** Le point de décision est là où l'information
naît ; le point d'exécution est là où la destruction est déjà correcte. Les relier par un champ que
les deux connaissent coûte une ligne.

**Corollaire, et c'est lui qui aurait pu faire une régression silencieuse :** quand deux promesses
écrivent la MÊME échéance, l'écriture ne doit jamais la repousser. Un message à la fois éphémère
(30 s) et à vue unique aurait vu sa grâce de 5 min écraser son échéance de 30 s — la promesse
faible annulant la forte, sans qu'aucun test de l'une ou l'autre ne rougisse. Le prédicat
n'apparie donc que l'absence, le nul et les échéances POSTÉRIEURES ; l'idempotence vient en prime,
sans qu'aucun appelant ait à s'en souvenir.
