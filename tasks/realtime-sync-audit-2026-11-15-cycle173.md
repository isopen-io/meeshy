# Cycle 173 — la file remettait l'adresse NUE que le direct refusait d'émettre

*2026-11-15. Branche `claude/exciting-planck-kexumt`, dans la continuité des
cycles 170 et 171.*

**Livré** : #18619 — la file hors ligne ne porte plus l'adresse nue d'une pièce
liée au lecteur.

---

## Le défaut

Quand un message porte une pièce LIÉE AU LECTEUR (vue unique, flamme),
l'émission directe est par destinataire : `fileUrl` / `thumbnailUrl` signés pour
SA ligne `Participant` (#9646). **L'enfilement, trente lignes plus bas, stockait
la charge GÉNÉRIQUE**, et rien dans le drain ne la signait.

La file est pourtant le canal le plus EXPOSÉ des deux : son entrée vit jusqu'à
48 h, donc elle survit à la fenêtre pendant laquelle la protection d'une pièce
peut changer.

Le sous-cas net : quand la lecture du plan ÉCHOUE, l'émission rend **sans avoir
rien émis**, pour la raison écrite dans `planOutcome.ts` — « l'adresse nue d'une
pièce peut-être protégée partirait à toute la room ». L'enfilement était hors de
cette décision et tournait quand même. **La même phrase vaut mot pour mot d'une
entrée adressée à un destinataire NOMMÉ.**

## La forme

`socketio/offlineSignedPayload.ts` — trois décisions, aucune ne se collapse :

| plan | décision |
|---|---|
| `PLAN_UNAVAILABLE` | `withhold` — on ne sait pas adresser, on n'écrit rien de durable |
| `null` | `as-is` — aucune pièce ne se lit par lecteur |
| un plan | `per-reader` — chaque entrée porte les adresses de SON destinataire |

UN seul hook par lecteur sur la file, et c'est délibéré : deux — l'un pour le
masquage des transferts refusés, l'autre pour la signature — se seraient exclus
au site d'appel, et le premier câblé aurait décidé. La composition est faite
dans le module, dans l'ORDRE qui la rend juste : la base du lecteur d'abord
(masquages, scellements), la signature ensuite. L'inverse signerait une charge
que ce lecteur n'a pas le droit de voir.

`resolvePayloadForReader` reçoit désormais le `Participant.id` en second
paramètre : la clé de file est `userId ?? id`, donc pour un INSCRIT elle ne dit
pas quelle ligne signe.

---

## Ce que ce cycle a appris, et qui vaut plus que le lot

### Un témoin qui passe peut passer VINGT LIGNES avant la garde

Le premier témoin de l'émetteur de pièce jointe — « n'enfile RIEN quand la
lecture du plan tombe » — était VERT, et **décoratif**. Son double faisait
tomber `participant.findMany` dès que le `select` demandait `shareLinkId`. Or la
loi d'AUDIENCE (`translationReaders`) demande exactement la même projection :
elle tombait donc aussi, `messageReadership` rendait `'unknown'`, et l'émetteur
sortait vingt lignes AVANT la garde que le témoin prétendait mesurer. La
mutation l'a dit : retirer la garde laissait 66 témoins au vert.

### Et la garde elle-même était INATTEIGNABLE sur ce site

En cherchant un meilleur discriminant, le verdict a changé de nature : sur
`emitAttachmentUpdated`, `PLAN_UNAVAILABLE` **ne peut pas se produire**.

 · une lecture de PROTECTION tombée est récupérée fail-CLOSED à l'intérieur du
   plan (#16965 : `{}` ⇒ la pièce est tenue pour protégée et signée) ;
 · seule la lecture des lecteurs ADMIS peut le produire — la MÊME requête que
   celle de la loi d'audience, dont le `'unknown'` fait sortir plus haut.

La réponse honnête n'était ni de supprimer la garde (elle tiendrait si la garde
d'audience changeait de forme) ni de la prétendre prouvée : elle reste posée,
son inatteignabilité est ÉCRITE au site, et le témoin dit ce qui est vrai — la
loi d'audience ferme les deux canaux ensemble.

### Deux pièges de fixture, trouvés par la mutation et non par la relecture

- une pièce ne se signe que si **la PIÈCE** déclare sa protection : un message
  `isViewOnce` dont la pièce ne dit rien se range ordinaire, et la signature est
  un no-op silencieux ;
- `fileUrl` doit être une **clé de stockage**, pas une URL de CDN : le signeur ne
  réécrit que ce qu'il sait adresser, et une adresse absolue traverse intacte.

Et son symétrique : « ordinaire » se DÉCLARE. Une colonne de protection non
chargée reste `undefined`, et la loi la lit comme une preuve manquante — donc
ferme et signe. Un témoin du cas ordinaire doit poser les cinq colonnes.

---

## Mutation, une garde à la fois

| # | mutation | témoins tombés |
|---|---|---|
| R1 | `withhold` devient `as-is` (le défaut d'avant) | 3 |
| R2 | tout est retenu (correctif trop large) | 12 |
| R3 | la signature ne s'applique plus | 3 |
| R4 | la base DU LECTEUR est ignorée | 1 |
| R6 | pièce jointe : hook de signature retiré | 1 |
| R7 | WS : `withhold` ignoré au site | 1 |
| R8 | REST : `withhold` ignoré au site | 1 |
| R9 | le `participantId` ne traverse plus la file | 1 |
| R10 | pièce jointe : garde d'audience retirée | 1 |
| R11 | WS : le hook par lecteur retiré | 1 |
| R12 | REST : le hook par lecteur retiré | 1 |
| R5 | pièce jointe : `withhold` ignoré au site | **0 — inatteignable, et c'est écrit** |

## Preuve

- `src/socketio`, `src/__tests__/unit/socketio` et les deux cliquets de budget :
  3 527 témoins verts ; `tsc --noEmit` EXIT=0.
- Le cliquet de taille a rougi en cours de route (`message-new-producer-parity`,
  1 000 → 1 064) : les deux témoins neufs vivent dans un fichier à part
  (`message-new-offline-signed.test.ts`), et le fichier d'origine est repassé
  SOUS son plafond. « On extrait d'abord, on ajoute ensuite. »
