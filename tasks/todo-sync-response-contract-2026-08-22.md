# Cycle 95 — donner un CONTRAT de réponse à `GET /sync`

Lot nommé par le cycle 94 bis (§9) comme sa suite, dans cet ordre-là :
« le lot est *donner un contrat à `/sync`*, pas *recopier un transform* — et
c'est cet ordre qui compte, puisque c'est le contrat qui rend la forme fausse
observable. »

L'ordre s'est vérifié : le transform seul aurait corrigé UN défaut sur trois.

## Constat d'entrée (relevé, pas hérité)

- `GET /sync` n'avait **aucun** `schema.response`. Rien n'y était gouverné :
  la charge utile traversait entière, donc aucune forme n'y était fausse.
- `syncMessageSelect` chargeait `translations` — colonne `Json?`, une **CARTE**
  Mongo. Les trois clients décodent un **TABLEAU**.
- `attachments: { select: attachmentMediaSelect }` chargeait la relation
  `reactions` **BRUTE** (`{emoji, participantId}`) — une forme qu'aucun client
  ne décode, et qui publiait QUI a réagi.
- Zéro appelant client (`ConversationSyncEngine` passe par
  `GET /conversations?updatedSince=`). Piège armé, pas panne — et c'est
  précisément la fenêtre où le corriger ne casse personne.

## Lot — FAIT

- [x] 1. RED d'abord — témoins de sérialisation sur le VRAI module de route
      (`app.inject()`), assertant sur les VALEURS servies, jamais sur
      `statusCode`. 4 tombaient avant correctif.
- [x] 2. `syncResponseSchema` (200) + enveloppes d'erreur (400/401) + 304 sans
      corps, composé depuis les schémas partagés canoniques
      (`messageTranslationSchema`, `messageAttachmentSchema`) aux FEUILLES —
      les clés du message relevées mécaniquement depuis `syncMessageSelect`,
      jamais héritées de `messageSchema` (leçon du cycle 94 bis : « la
      réutilisation naïve du schéma partagé perdait ici CINQ choses »).
- [x] 3. `translations` : CARTE → TABLEAU via `transformTranslationsToArray`.
- [x] 4. Pièces jointes : `serializeAttachmentForSocket` + `Participant.id`
      ajouté au `select` des appartenances (un utilisateur porte un id
      DIFFÉRENT par conversation).
- [x] 5. **Défaut trouvé en chemin, plus large que le lot** :
      `messageAttachmentSchema.metadata` et sa jumelle inline de `messageSchema`
      étaient des objets NUS → servaient `{}` sur TOUTE route les employant. Le
      web lit `attachment.metadata?.audioEffectsTimeline` et ne l'a jamais reçu.
      Corrigés, plus les deux voisins de la même famille
      (`voiceQualityAnalysis`, `documentLayout`).
- [x] 6. `shared-schema-sweep.test.ts` — cliquet fermant l'angle mort que le
      CLAUDE.md du service documentait depuis le cycle 87 bis sans l'outiller.
      `FROZEN_SHARED_NAKED` vide.
- [x] 7. Témoin fail-closed sur la présence de l'expéditeur (ni au `select`, ni
      au schéma) — piège armé au sens du cycle 84.
- [x] 8. Gates : `tsc` propre, suite gateway complète, 6 mutations prouvées.

## Mutations jouées (le ROUGE se prouve, il ne s'affirme pas)

| mutation | effet |
|---|---|
| retrait de `transformTranslationsToArray` | 11 tombent |
| retrait de `serializeAttachmentForSocket` | 2 tombent |
| retrait de `messageSource` du schéma | 1 tombe, en le NOMMANT |
| retrait d'`additionalProperties` sur `metadata` (shared) | 1 tombe |
| `isOnline` déclaré sur l'expéditeur | 1 tombe |
| retrait d'`id: true` du select d'appartenance | **0 — VERT**, corrigé par un témoin de REQUÊTE |

La dernière est le résultat le plus utile : le double Prisma rend sa ligne quel
que soit le `select`, donc un témoin de VALEUR ne peut jamais garder une
projection. Cf. `tasks/lessons.md` § cycle 95.

## Ouvert (dit, pas avalé)

- `/sync` n'agrège pas `currentUserReactions` au niveau du MESSAGE (seulement
  des pièces jointes) — une requête d'agrégation de plus sur le chemin de
  rattrapage, à instruire contre son coût.
- `APIMessage.translations` en `try` non tolérant côté iOS (reporté du 94 bis).
- `GET /messages/:messageId` n'agrège pas les réactions de pièce jointe
  (reporté du 94 bis) — `serializeAttachmentForSocket` le fermerait.
- La quatrième famille reste non outillée : rien ne voit une déclaration
  présente, bien formée, et fausse contre son producteur.
