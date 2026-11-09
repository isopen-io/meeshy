## 2026-11-09 : le talkie scellé traverse le serveur sans être lu (#13949)

**Statut** : Accepté (lot #13949, chantier Cercles, milestone #215).

### Décision

Dans une paire dont la conversation directe est chiffrée de bout en bout, le talkie passe SI ET SEULEMENT SI la voix est scellée sur l'appareil. Une voix en clair y reste refusée (`TALKIE_E2EE_CONVERSATION`, fail-closed).

### Contrat serveur

- `talkie:start` porte `sealed: { keyEnvelope }` (base64url, 1 à 4 096 caractères) ; son absence signifie voix en clair.
- `talkie:incoming` répète `sealed` tel quel ; le destinataire y lit l'enveloppe de clé.
- `judgeTalkie(deps, from, to, { sealed })` ; le rejugement d'arrière-plan garde le sceau.
- Les fragments restent des octets opaques : aucune trame ADTS exigée, ni transcription, ni normalisation, ni stockage. Bornes inchangées (16 Ko, 300 fragments, 512 Ko, 30 s).

### Conception cryptographique proposée aux clients (à valider par `crypto-e2ee`, puis `auditeur-adversarial`)

1. L'émetteur tire une clé aléatoire de 32 octets par prise de parole et la scelle pour l'appareil du destinataire par la session de la paire existante (pile E2EE, spec 2026-10-23). Le résultat est `keyEnvelope`.
2. Chaque fragment est chiffré par un AEAD (ChaCha20-Poly1305 ou AES-256-GCM) avec la clé de la prise de parole ; nonce = numéro de séquence sur 12 octets (jamais réutilisé, la séquence est strictement croissante) ; données associées = `talkieId || seq`.
3. Le destinataire déchiffre au fil de l'eau ; un fragment qui ne s'authentifie pas est jeté. Dans la NSE, le fragment se déchiffre sur l'appareil.
4. La copie vocale de repli suit le chemin des messages vocaux E2EE du client, jamais un envoi en clair.

### Ce que cette décision ne prouve pas

Ni un audit cryptographique tiers, ni un audit adversarial : le côté serveur ne voit jamais le clair, mais la solidité du scellement dépend des clients. La recette appareil (deux téléphones, paire chiffrée) reste à faire.
