## 2026-10-23 — Une série d'appels de mesure s'arrête au premier appel qui ne décroche pas, et une liaison connectée ne prouve pas qu'on a décroché

**Date :** 2026-10-23 · **Domaine :** appels, mesure sur appareil réel (#11468)

### Ce qui s'est passé

La série devait mesurer, en production, l'établissement d'un appel vers un appelé sur plusieurs appareils :
- l'appelant était `admin`, sur un Chrome for Testing piloté depuis le Mac ;
- l'appelé était `jcnm`, l'iPhone du porteur ;
- l'iPhone décrochait par un lien de débogage local.

Les trois premiers appels ont abouti. Ensuite, l'iPhone ne décrochait plus : son écran s'était probablement verrouillé, et un lien ne réveille pas l'app. Le script n'a rien vu. Il attendait « une `RTCPeerConnection` connectée », et la page en ouvre une autre, locale, qui se connecte toujours en 300 ms environ, avant toute sonnerie.

Quinze appels ont donc sonné environ 26 s chacun sur tous les appareils du porteur, jusqu'à ce qu'il fasse arrêter la série en urgence.

### La règle

1. **Une série d'appels réels s'arrête au premier appel qui n'atteint pas `active`.** Le vérifier côté passerelle (`Call status updated … to active`), ou sur la liaison qui reçoit la réponse SDP. Un échec dans une série sur l'appareil de quelqu'un n'est pas une donnée à collecter : c'est une sonnerie de plus chez lui.
2. **La liaison d'un appel est celle dont la réponse SDP arrive APRÈS l'ordre de décroché.** Ne jamais conclure de « une liaison s'est connectée » : la page web en ouvre une autre, locale, qui se connecte toujours.
3. **Avant une série :**
   - faire régler le verrouillage automatique de l'appareil sur « Jamais » (réglage système, que seul son propriétaire peut changer) ;
   - vérifier `devicectl device info lockState` avant chaque appel ;
   - dire au porteur que tous les appareils de l'appelé vont sonner ;
   - avancer par lots de cinq, avec un compte rendu entre deux lots.
