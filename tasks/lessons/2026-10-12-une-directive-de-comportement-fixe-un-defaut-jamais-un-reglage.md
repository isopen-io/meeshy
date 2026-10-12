## Une directive de comportement fixe un DÉFAUT, jamais l'écrasement d'un réglage

**Correction porteur, 2026-10-12 (#10284).** La directive « en filmant sans passer par la zone cadre, on passe à l'édition mais on préserve juste l'image dans l'application uniquement » a été appliquée comme une CONTRAINTE : l'original d'une prise hors cadre ne partait plus dans Photos, même quand Réglages › Médias demandait « enregistrer l'original ». Le porteur : « Non il faut respecter la consigne et réglage utilisateur. Je n'exprimais que le comportement par défaut. »

**Règle.** Quand le porteur décrit un comportement (« on garde dans l'app », « on enregistre en galerie »), lis-le comme le comportement PAR DÉFAUT. Un réglage que l'utilisateur a posé explicitement prime, sauf si la directive dit en toutes lettres qu'elle le supprime.

**Comment l'appliquer.**
- Avant de coder une directive de comportement, énumère les réglages existants qui gouvernent le même geste (`CaptureSavePolicy`, préférences de notification, etc.). Pour chacun, écris « défaut = directive ; réglage posé = réglage ».
- Ne rédige jamais une décision qui dit « la directive supplante le réglage » sans que le porteur l'ait dit.
- Un témoin par réglage : réglage par défaut ⇒ comportement de la directive ; réglage activé ⇒ comportement du réglage.
