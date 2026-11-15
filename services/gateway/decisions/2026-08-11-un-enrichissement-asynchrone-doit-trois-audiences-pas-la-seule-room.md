## 2026-08-11 : Un enrichissement asynchrone doit TROIS audiences, pas la seule room de conversation

**Contexte** : `message:attachment-updated` — le delta émis quand Whisper finit une transcription,
puis quand NLLB+Chatterbox rendent chaque langue d'audio traduit — était diffusé dans la seule room
`conversation:<id>`. Deux audiences le perdaient. (1) Le lecteur resté sur la liste : iOS n'émet
`conversation:join` qu'à l'OUVERTURE du fil, donc au lancement de l'app un lecteur sur la liste n'est
dans AUCUNE room de conversation. (2) Le lecteur hors ligne : le `message:new` mis en file à l'ENVOI
porte la pièce jointe sans transcription ni audio traduit — ils n'existent pas encore — donc la copie
rejouée à la reconnexion reste définitivement la non enrichie.

**Décision** : l'émission chaîne la room de conversation ET les rooms personnelles de tous les
participants (`emitToConversationParticipants` : une seule copie par socket), et l'enrichissement
obtient sa PROPRE entrée de file sous `eventType: 'attachment-updated'`, rejouée en
`message:attachment-updated` au drain. La clé de dédup est l'id de la PIÈCE JOINTE, pas celui du
message : l'identité par défaut `(messageId, eventType)` ferait superséder l'enrichissement de la
première pièce jointe par celui de la seconde sur un message à deux audios, alors que par pièce
jointe la règle « le dernier payload gagne » est exactement la bonne (le payload porte l'état
COMPLET).

**Alternatives rejetées** :
- **Laisser les clients rattraper au refetch d'ouverture** : c'est le comportement d'avant, et il
  rend le Prisme fonction de la ROUTE du lecteur (avoir le fil ouvert quand Whisper a fini) plutôt
  que de ses préférences de langue. Même défaut que l'aperçu de liste qui ne se retraduisait jamais.
- **Filtrer le payload par langue du destinataire**, comme `message:new`
  (`filterMessagePayloadForLanguages`) : les clients REMPLACENT la carte de traductions de la pièce
  jointe (iOS `handleAttachmentUpdated`, web `use-socket-cache-sync`), donc un sous-ensemble par
  lecteur EFFACERAIT les langues qu'un fetch REST antérieur avait mises en cache. Le filtrage
  suppose d'abord un contrat de FUSION côté client.
- **Émettre aux rooms personnelles seulement** (sans la room de conversation) : suffisant en théorie
  — tout socket authentifié joint sa room personnelle — mais retirer une audience déjà servie n'était
  pas nécessaire au correctif.

**Conséquences** :
- Une requête participants par delta d'enrichissement (réutilisée par la mise en file, jamais deux
  fois). Une panne de cette requête dégrade vers la room de conversation seule, jamais vers le
  silence.
- Plus de sockets reçoivent chaque delta, non filtré par langue : une conversation à N langues paie
  N diffusions complètes de la pièce jointe. Assumé jusqu'au contrat de fusion client.
- Au plus UNE entrée de file par pièce jointe et par destinataire hors ligne, quel que soit le nombre
  d'étapes d'enrichissement (supersede en place).
