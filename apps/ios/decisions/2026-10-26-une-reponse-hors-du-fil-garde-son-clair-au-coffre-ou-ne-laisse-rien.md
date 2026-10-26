## 2026-10-26 : Une réponse écrite hors du fil vers une conversation chiffrée garde son clair au coffre, ou ne laisse rien (#13067)

**Contexte.** La réponse rapide depuis une notification et le refus d'appel par message ne savent pas sceller (#12641). Ils refusaient l'envoi, mais posaient d'abord une ligne `isEncrypted: false` qui portait le clair dans `meeshy.sqlite`. La loi de #12999 juge une ligne sur ses drapeaux : elle ne scellait rien, et la migration du coffre ne voyait pas ces messages. Modèles de menace : appareil volé, et règle fail-closed de #9229.

**Décision.**
- La garde du régime (`EndToEndDestinationGuard`) se lit AVANT toute ligne.
- Dans une conversation chiffrée de bout en bout, `EndToEndOffThreadReply` range le clair au coffre par `EndToEndSendSealer.keep`, comme le fil :
  - le coffre le prend : une ligne scellée (littéral `[Encrypted]`, mode `e2ee`) naît en échec, avec la raison `sealedOnlyInConversation`. Le fil y adopte le clair et la renvoie chiffrée d'un toucher ;
  - le coffre ne le prend pas : le geste attend une fois l'ouverture de session que `EndToEndSessionBridge` a mise en file (`awaitOpening`), puis réessaie ;
  - le coffre refuse encore (session jamais ouverte, trousseau verrouillé, autre compte) : rien ne s'écrit, et le refus `unkeptOutsideConversation` dit que le texte est perdu ;
  - si la ligne ne s'écrit pas, l'entrée du coffre est retirée.
- Rien n'entre dans l'outbox, qui ne rejoue que du clair.
- **Les lignes en clair qu'une version antérieure a laissées sont rattrapées** (#9223). À chaque ouverture de session, `EndToEndUnsentPlaintextRescue` relit mes messages jamais acquittés dont la ligne garde un texte. Pour ceux d'une conversation que la garde dit chiffrée, le clair va au coffre, puis la ligne est rescellée sous `secure_delete` et passe en échec. Un clair que le coffre ne prend pas reste en place jusqu'à la session suivante, car l'effacer perdrait le seul exemplaire du texte.
- Le refus se dit : une notification locale pour la réponse (la toucher ouvre la conversation), un message d'erreur dans l'app pour le refus d'appel.

**Pourquoi pas un envoi scellé depuis ces chemins.** Le geste s'exécute dans l'app réveillée en arrière-plan, jamais dans l'extension de notification. La session libsignal n'y est pas forcément ouverte (`EndToEndSessionBridge` démarre avec l'interface). Un envoi scellé demande l'annuaire des appareils du pair, le régime relu et l'aller-retour Sesame, dans le budget d'une tâche d'arrière-plan. Un groupe ne se scelle pas encore. Le refus lisible, avec une bulle renvoyable depuis le fil, est fail-closed et ne perd le texte que si le coffre est fermé.

**Conséquences.**
- Au réveil à froid, si l'interface n'a pas ouvert la session libsignal, la réponse chiffrée est perdue et l'utilisateur le lit.
- Le miroir Kotlin (`apps/android`) n'a rien reçu.
- Une revue cryptographique externe reste requise.
