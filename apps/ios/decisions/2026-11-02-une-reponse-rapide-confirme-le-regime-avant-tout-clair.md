## 2026-11-02 : Une réponse rapide confirme le régime de la conversation avant tout clair (#13165)

**Contexte.** Suivi de #13067. La garde du régime (`EndToEndDestinationGuard`) ne lit que ce que CET appareil a vu : sa mémoire, la ligne de la liste et le fil en cache. Si la conversation est passée en chiffrement de bout en bout sur un autre appareil pendant que celui-ci dormait, la réponse depuis la bannière posait une ligne en clair, une entrée d'outbox et une requête en clair, que la passerelle refusait ensuite. Modèle : serveur honnête, appareil en retard sur le régime. Règles : fail-closed (#9229), le bout en bout ne se désactive pas (#12949).

**Décision.** `NotificationReplyRegime` décide de la destination AVANT toute ligne, à partir de trois sources :
1. la garde, nourrie du mode que porte le push (`conversationEncryptionMode`, et `encryptionMode` au niveau du message). Le push ne peut qu'AJOUTER le bout en bout : il date de l'envoi du message, et la conversation a pu basculer depuis. Une valeur inconnue, ou qui n'est pas une chaîne, scelle ;
2. le mode relu de la passerelle (`GET /conversations/:id`) juste avant l'envoi, borné à 6 s. Seule cette relecture peut dire que le serveur lit le message ;
3. sans relecture (hors ligne, délai, erreur), le régime n'est pas confirmé et la réponse prend le chemin chiffré de #13067 : le clair va au coffre sous une bulle scellée en échec, sinon rien ne s'écrit. Jamais d'outbox, jamais de requête.

**Contrat avec la passerelle (rétrocompatible).** La clé `conversationEncryptionMode` s'AJOUTE aux données du push : `e2ee`, `server`, `hybrid`, ou absente (ou vide) pour le clair. Un client antérieur l'ignore. Une passerelle antérieure ne la pose pas : le client relit alors la conversation.

**Conséquences.**
- Une réponse rapide coûte un aller-retour de plus (la relecture), sauf si la mémoire ou le push ferment déjà.
- Une réponse rapide écrite hors ligne vers une conversation en clair n'entre plus dans l'outbox. Elle va au coffre sous une bulle en échec, avec la phrase de la conversation chiffrée, que l'utilisateur renvoie depuis le fil. Si le coffre est fermé, elle est perdue et l'utilisateur le lit. Une phrase propre au régime non confirmé reste à écrire.
- Hors modèle : une bascule entre la relecture et la requête (la passerelle refuse alors le clair, `E2EE_PLAINTEXT_REFUSED`, mais le clair a traversé le réseau jusqu'à elle), et un serveur malveillant qui ment sur le mode d'une conversation que l'appareil n'a jamais vue chiffrée (#12520).
- Le refus d'appel par message (`CallDeclineMessenger`) ne relit pas encore le régime.
- Le miroir Kotlin (`apps/android`) n'a rien reçu.
- Une revue cryptographique externe reste requise.
