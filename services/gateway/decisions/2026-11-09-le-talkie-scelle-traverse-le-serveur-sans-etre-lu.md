## 2026-11-09 : le talkie scellé traverse le serveur sans être lu (#13949)

**Statut** : contrat serveur posé, **ÉTEINT** (`TALKIE_SEALED_VOICE_ENABLED` absent ⇒ toute voix scellée est refusée). Conception cryptographique PROPOSÉE, non validée : `crypto-e2ee`, `auditeur-adversarial` puis un audit cryptographique tiers avant de présenter le talkie scellé comme chiffré de bout en bout. Tant que le drapeau est éteint, une paire dont la conversation directe est chiffrée refuse TOUT talkie (`TALKIE_E2EE_CONVERSATION`), exactement comme avant ce lot.

### Décision

Dans une paire dont la conversation directe est chiffrée de bout en bout, le talkie passe SI ET SEULEMENT SI la voix est scellée sur l'appareil ET que la passerelle accepte la voix scellée. Une voix en clair y reste refusée (`TALKIE_E2EE_CONVERSATION`, fail-closed). Une voix scellée dans une paire SANS conversation chiffrée est refusée (`TALKIE_INVALID`, cause `sealed-without-e2ee`) : sa clé ne voyage que par `e2ee:send-signal`, lié à une conversation E2EE, donc personne ne pourrait la déchiffrer.

### Contrat serveur

- Une voix scellée porte l'encodage `sealed-aac-adts` (`TALKIE_SEALED_CODEC`) ET `sealed: { keyId }` (base64url, 22 à 64 caractères) ; l'un sans l'autre est illisible. `TALKIE_SEALED_CODEC` vit HORS de `TALKIE_CODECS` à dessein : les clients déployés n'ouvrent qu'un encodage de cette liste (web `decodeTalkieIncoming`, iOS et Android `isPlayable`), donc aucun ne joue comme de l'AAC une charge qu'il ne déchiffre pas. Tout autre champ du sceau est retiré par Zod : aucune matière de clé ne repart à côté de l'identifiant.
- La voix scellée n'ouvre que sur `TALKIE_SEALED_VOICE_ENABLED=true` (`talkieSealedVoiceEnabled`, lu à chaque ouverture) ; autrement elle est refusée `TALKIE_INVALID` AVANT tout jugement. Le drapeau ne s'allume qu'une fois publiés des clients qui (a) déchiffrent la voix scellée et (b) refusent dans une paire chiffrée toute voix qui n'est pas scellée ET déchiffrable, le plancher de version qui les impose posé, et la conception auditée. Ce n'est pas une décision de session : elle revient au porteur.
- `talkie:incoming` répète l'encodage et `sealed` tels quels ; `judgeTalkie(deps, from, to, { sealed })` ; le rejugement d'arrière-plan garde le sceau.
- `talkie:send-chunk` porte `last: true` sur le DERNIER fragment ; `talkie:chunk` le répète tel quel. Les fragments restent des octets opaques : aucune trame ADTS exigée, ni transcription, ni normalisation, ni stockage. Bornes inchangées (16 Ko, 300 fragments, 512 Ko, 30 s).

### Pourquoi la clé ne voyage PAS dans `talkie:start`

La première version portait une `keyEnvelope` unique (4 096 caractères au plus) « scellée pour l'appareil du destinataire ». C'était une jumelle du relais d'enveloppes existant (`E2EE_SEND_SHAPE`, `e2ee-signals.ts`) en moins bien : une seule enveloppe pour un compte qui a jusqu'à `E2EE_MAX_ACTIVE_DEVICES` appareils, sans Sesame (`E2EE_DEVICES_MISMATCH`), et trop petite pour un seul premier message PQXDH (environ 1 800 octets, 2 400 caractères base64). La clé passe donc par le relais des signaux chiffrés de la paire — une enveloppe libsignal par appareil, le type du signal dans le chiffré, le réveil des appareils (`e2ee-wake`) déjà branché, la NSE déjà capable de l'ouvrir.

### Conception cryptographique proposée aux clients

1. L'émetteur tire, par prise de parole, une clé aléatoire de 32 octets et un `keyId` aléatoire de 16 octets au moins. Il remet `{ talkie-key, keyId, key }` comme SIGNAL chiffré dans la conversation directe E2EE de la paire (`e2ee:send-signal`), attend l'accusé, puis ouvre `talkie:start` avec `codec: 'sealed-aac-adts'` et `sealed.keyId`.
2. Chaque fragment est chiffré par un AEAD (ChaCha20-Poly1305 ou AES-256-GCM) ; nonce = numéro de séquence sur 12 octets (jamais réutilisé : clé unique, séquence strictement croissante) ; données associées = `keyId || seq || dernier`, où `dernier` est le drapeau `last` du fil. Le `keyId`, choisi par l'émetteur et authentifié par le canal E2EE, remplace le `talkieId`, choisi par le serveur.
3. **Troncature.** Le destinataire ne tient une prise de parole pour complète qu'au vu d'un fragment `last: true` qui s'authentifie. Un `talkie:ended` (dicté par le serveur) sans ce fragment, ou des fragments après lui, signalent une prise de parole tronquée : l'interface le dit, elle ne la présente pas comme entière.
4. **Rejeu et origine.** Le destinataire n'accepte une clé de talkie que d'un signal dont l'expéditeur, authentifié par la session libsignal, est le `fromUserId` du `talkie:incoming` ; il MÉMORISE les `keyId` consommés (au moins le temps de vie d'une clé de talkie) et refuse tout `talkie:incoming` qui en réutilise un. Une clé sert une seule prise de parole, puis est effacée. Sans ces deux règles, un serveur malveillant pourrait réémettre une ancienne prise de parole, qui s'authentifierait de nouveau.
5. Le destinataire garde les fragments reçus avant la clé (borne : une prise de parole) et les déchiffre dès qu'elle arrive ; un fragment qui ne s'authentifie pas est jeté. La NSE déchiffre sur l'appareil.
6. `capturedAt` reste lisible à côté d'un fragment scellé (minutage, déjà observable par le serveur à la réception) ; un client scellé peut l'omettre ou le placer dans le chiffré.
7. La copie vocale de repli suit le chemin des messages vocaux E2EE du client, jamais un envoi en clair.

### Avec le talkie réveillé (#17165, fusionné avant ce correctif)

Une voix scellée ne passe JAMAIS en `waking` : quand la porte rend `waking`, elle se replie en message vocal (`TALKIE_FALLBACK_VOICE`, avec la conversation la plus récente), et `audioFor` refuse une voix scellée. Le push de suivi et la lecture HTTP du tampon déclarent de l'AAC qu'elle n'est pas, et la NSE ne la déchiffre pas encore. Ouvrir le réveil à la voix scellée (push portant `sealed.keyId`, sans `audio/aac`, déchiffrement dans la NSE) est un lot à part, après les clients.

### Ce que cette décision ne prouve pas

Ni un audit cryptographique tiers, ni la solidité du scellement, qui dépend des clients (aucun n'existe à cette date). La passerelle ne vérifie pas qu'une voix « scellée » l'est vraiment : elle ne le peut pas. Ce qui protège le destinataire, c'est l'encodage distinct (un client déployé ne la joue pas) et, demain, l'AEAD côté client (un client scellé ne joue que ce qui s'authentifie). La recette appareil (deux téléphones, paire chiffrée) reste à faire.
