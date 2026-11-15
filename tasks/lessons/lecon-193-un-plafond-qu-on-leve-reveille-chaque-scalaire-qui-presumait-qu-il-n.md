## Leçon 193 — un plafond qu'on lève réveille chaque scalaire qui présumait qu'il n'y avait qu'un seul pair (cycle 36, routine appels, Vague 129)

**Le défaut.** `useRemoteCallAlerts` recevait `call:screen-capture-alert`
— un événement PAR PARTICIPANT, avec un `participantId` explicite sur son
propre type (`CallScreenCaptureEvent`) — et l'écrivait comme un scalaire
dernier-arrivé-gagne (`setRemoteScreenCapturing(event.isCapturing)`), en
ignorant `participantId`. En appel de groupe, le participant B qui arrête SA
capture efface silencieusement le drapeau alors que le participant A capture
toujours : une pastille de vie privée qui disparaît pendant que
l'enregistrement continue.

**Ce n'est pas un bug neuf, c'est un bug LATENT devenu réel.** Le même hook,
avec le même code, était sans défaut tant que `MAX_CALL_PARTICIPANTS` valait 2
(tout appel était forcément à deux, donc « dernier rapport » et « rapport du
seul autre participant » coïncidaient toujours). La Vague 126 a levé ce
plafond pour permettre le maillage web N-pairs ; ce hook n'a jamais été
retouché depuis, parce qu'il n'a jamais planté ni fait échouer un test — il a
seulement cessé d'être vrai. C'est la MÊME cause racine que W4
(`connectionState`) et W5 (`useCallQuality`), documentées dans le
gap-analysis du 2026-08-13 et déjà corrigées ailleurs dans le même dossier
`hooks/` : *un fait par participant modélisé comme un scalaire d'appel entier
reste correct exactement tant que « par participant » et « pour l'appel » ont
un seul élément en commun.* Le lever du plafond ne casse rien à la
compilation ni à l'exécution immédiate — il change silencieusement le domaine
sur lequel un ancien raisonnement scalaire cesse de tenir.

**La règle.** *Un changement de capacité (plafond, cardinalité) est une
requête à lancer sur chaque site qui consommait l'ancienne limite comme une
hypothèse implicite.* Le grep qui aurait trouvé celui-ci ne cherche pas une
erreur de syntaxe : il cherche, dans TOUT hook/composant qui reçoit un
événement portant un `participantId`/`userId` explicite, si la valeur reçue
finit dans un `useState` scalaire plutôt que dans une `Map`/`Set` keyée par ce
champ. Trois sites dans le même sous-système (`use-webrtc-p2p.ts` ×2,
`use-remote-call-alerts.ts` ×1) partageaient ce même angle mort ; les deux
premiers avaient déjà été trouvés et corrigés avant celui-ci, mais aucune
recherche systématique n'avait balayé le reste du dossier `hooks/*call*` pour
la MÊME forme après le premier correctif — chaque cycle qui lève un plafond de
cardinalité devrait fermer par cette recherche, pas seulement par le site qui
a motivé la levée.

**Le corollaire sur la sévérité.** Toutes les instances de cette forme ne se
valent pas : `remoteQualityDegraded`, dans le MÊME hook, reçoit aussi un
`participantId` ignoré — et n'est PAS un bug, parce que le protocole n'émet
que des alertes POSITIVES (jamais de « qualité rétablie » par pair) : un
scalaire OR-avec-décroissance-temporelle ne peut jamais se faire écraser à
`false` par un autre pair, il n'existe pas de message qui porte cette valeur.
La forme du défaut (`participantId` ignoré) ne suffit pas à conclure au bug —
il faut vérifier si le protocole permet à un AUTRE participant d'émettre la
valeur qui écrase silencieusement celle du premier. Corriger le second signal
aurait été une sur-correction sans repro possible.
