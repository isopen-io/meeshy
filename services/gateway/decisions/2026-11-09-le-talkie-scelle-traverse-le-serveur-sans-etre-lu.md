## 2026-11-09 : le talkie scellé traverse le serveur sans être lu (#13949)

**Statut** : Accepté côté serveur (lot #13949, chantier Cercles, milestone #215). Conception cryptographique PROPOSÉE, non validée : `crypto-e2ee` puis `auditeur-adversarial` avant tout client qui scelle.

### Décision

Dans une paire dont la conversation directe est chiffrée de bout en bout, le talkie passe SI ET SEULEMENT SI la voix est scellée sur l'appareil. Une voix en clair y reste refusée (`TALKIE_E2EE_CONVERSATION`, fail-closed).

### Contrat serveur

- `talkie:start` porte `sealed: { keyId }` (base64url, 22 à 64 caractères) ; son absence signifie voix en clair. Tout autre champ du sceau est retiré par Zod : aucune matière de clé ne repart à côté de l'identifiant.
- `talkie:incoming` répète `sealed` tel quel.
- `judgeTalkie(deps, from, to, { sealed })` ; le rejugement d'arrière-plan garde le sceau.
- Les fragments restent des octets opaques : aucune trame ADTS exigée, ni transcription, ni normalisation, ni stockage. Bornes inchangées (16 Ko, 300 fragments, 512 Ko, 30 s).

### Pourquoi la clé ne voyage PAS dans `talkie:start`

La première version portait une `keyEnvelope` unique (4 096 caractères au plus) « scellée pour l'appareil du destinataire ». C'était une jumelle du relais d'enveloppes existant (`E2EE_SEND_SHAPE`, `e2ee-signals.ts`) en moins bien : une seule enveloppe pour un compte qui a jusqu'à `E2EE_MAX_ACTIVE_DEVICES` appareils, sans Sesame (`E2EE_DEVICES_MISMATCH`), et trop petite pour un seul premier message PQXDH (environ 1 800 octets, 2 400 caractères base64). La clé passe donc par le relais des signaux chiffrés de la paire — une enveloppe libsignal par appareil, le type du signal dans le chiffré, le réveil des appareils (`e2ee-wake`) déjà branché, la NSE déjà capable de l'ouvrir.

### Conception cryptographique proposée aux clients

1. L'émetteur tire, par prise de parole, une clé aléatoire de 32 octets et un `keyId` aléatoire de 16 octets au moins. Il remet `{ talkie-key, keyId, key }` comme SIGNAL chiffré dans la conversation directe E2EE de la paire (`e2ee:send-signal`), attend l'accusé, puis ouvre `talkie:start` avec `sealed.keyId`.
2. Chaque fragment est chiffré par un AEAD (ChaCha20-Poly1305 ou AES-256-GCM) ; nonce = numéro de séquence sur 12 octets (jamais réutilisé : clé unique, séquence strictement croissante) ; données associées = `keyId || seq || dernier`. Le `keyId`, choisi par l'émetteur et authentifié par le canal E2EE, remplace le `talkieId`, choisi par le serveur : un serveur ne peut ni rejouer une prise de parole sous un autre identifiant, ni la tronquer sans que le dernier fragment manque.
3. Le destinataire garde les fragments reçus avant la clé (borne : une prise de parole) et les déchiffre dès qu'elle arrive ; un fragment qui ne s'authentifie pas est jeté. La NSE déchiffre sur l'appareil.
4. La copie vocale de repli suit le chemin des messages vocaux E2EE du client, jamais un envoi en clair.

### Avec le talkie réveillé (#17165, non fusionné à cette date)

Une voix scellée mise en tampon pour un destinataire hors ligne reste des octets opaques. Le lot fusionné EN SECOND applique : le push de suivi d'une voix scellée porte `sealed.keyId` et ne déclare pas `audio/aac` (la NSE déchiffre avant de jouer) ; à défaut, une voix scellée ne passe pas en `waking` (repli vocal E2EE).

### Ce que cette décision ne prouve pas

Ni un audit cryptographique tiers, ni un audit adversarial : le serveur ne voit jamais le clair, mais la solidité du scellement dépend des clients. Un client ancien qui reçoit une voix scellée la lirait comme de l'AAC : l'émetteur ne scelle que pour un destinataire dont les appareils l'annoncent, le plancher de version fait le reste. La recette appareil (deux téléphones, paire chiffrée) reste à faire.
