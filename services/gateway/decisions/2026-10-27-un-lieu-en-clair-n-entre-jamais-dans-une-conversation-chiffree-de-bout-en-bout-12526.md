## 2026-10-27 : Un lieu en clair n'entre jamais dans une conversation chiffrée de bout en bout (#12526)

### Ce qui change

Le choix du 2026-07-29 (`docs/superpowers/specs/2026-07-29-partage-position-design.md`, « E2EE non résolu ») rangeait `metadata.location` EN CLAIR, y compris dans une conversation `e2ee`. La directive du 2026-10-03 (#9224, #9229) le révoque : avec E2EE, le serveur ne voit jamais le clair, et un lieu partagé est un contenu au même titre qu'un texte.

- **À côté d'un chiffré, le lieu en clair est RETENU** : ni écrit dans `metadata.location`, ni diffusé, ni hissé. Le message chiffré passe. Loi : `admitSharedPlace(input, { endToEnd })` (`services/location/sharedPlace.ts`), appliquée par le site unique `clientDeclaredMetadata(input, regime)`, dont le régime est un paramètre REQUIS.
- **Sans chiffré, le lieu EST le message** : un envoi qui ne porte qu'un lieu dans une conversation `e2ee` est un clair, refusé `400 E2EE_PLAINTEXT_REFUSED` (« aucun lieu en clair ») par `admitSendUnderRegime`, avant toute écriture.
- **Lien anonyme** (`routes/links/messages.ts`) : inchangé, déjà fermé — le contenu y est requis et `plaintextRefusedIn` le refuse en `e2ee` avant que le lieu ne soit lu.
- **Hors bout en bout** (clair, `server`, `hybrid`) : rien ne change, le lieu s'écrit dans `metadata.location`.

### Pourquoi retenir plutôt que refuser l'envoi

Rétrocompatibilité (#9223) : les clients iOS antérieurs à `1542fd2ec9` joignent le lieu en clair à côté du chiffré. Refuser l'envoi entier leur ferait perdre le message ; retenir le seul champ en clair protège le contenu sans casser l'envoi. Les clients actuels ne l'envoient plus : iOS retire la tuile « Lieu » en `e2ee` (`GuestAttachmentAllowance.sealing`) et refuse l'envoi avant tout octet (`EndToEndSendGate.carriesUnsealableContent`), la fiche de chiffrement le dit (« … lieux et stickers ne peuvent pas encore être envoyés »).

### Mesure d'usage

Chaque retrait se journalise `warn` sous `code: E2EE_PLAINTEXT_LOCATION_WITHHELD`, avec `field` et `conversationId`, jamais une coordonnée ni un nom de lieu. Quand le compte tombe à zéro sur la fenêtre de mise à jour, la retenue peut devenir un refus.

### Ce qui n'est pas fait

- `sticker` et `attachmentReplyTo` déclarés en clair à côté d'un chiffré : même famille, hors de ce lot (#12526 reste ouverte pour eux).
- Le lieu EN DIRECT (`location:live-*`, `LocationHandler`) ne lit pas le régime de la conversation.
