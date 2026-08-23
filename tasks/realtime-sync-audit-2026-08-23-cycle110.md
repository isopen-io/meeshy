# Cycle 110 — Le chemin d'envoi PRIMAIRE strippait l'enveloppe de chiffrement

**Branche** : `claude/keen-hamilton-1w0brq`
**Portée** : Phase 10 (sécurité — chiffrement en transit / au repos), Phase 3
(livraison), Phase 8 (architecture — gouvernance de contrat).
Suite directe du cycle 109 : la porte d'ACQUITTEMENT y a été fermée, celle de la
CHARGE ENTRANTE ne l'était pas.

---

## 1. D'où vient ce lot

Le cycle 109 a fermé les neuf rappels des quatre familles de réactions en
DÉRIVANT l'accusé du contrat (`AckOf<E>`), et a clos sur cette phrase :

> **Typer une porte, c'est découvrir ce qui la traversait.** Les deux sites du §5
> n'ont été trouvés par aucune relecture — ils ont été trouvés par la première
> compilation qui avait le droit de les refuser.

Trois suivis en sont sortis. Deux ont été **mesurés** avant d'ouvrir quoi que ce
soit, parce qu'un suivi hérité est une AFFIRMATION (leçon du cycle 107) :

| suivi | mesure | verdict |
|---|---|---|
| les 43 erreurs `strictFunctionTypes` « gestionnaire Fastify » nomment un lot de SÉCURITÉ : rien ne vérifie qu'un `preHandler` d'auth a attaché `authContext` | balayage des **480** enregistrements de route de `src/routes` : **0** route lit `authContext` sans garde ; les 19 sous `optionalAuth` délèguent toutes à `canAccessConversation`, qui refuse sur `!isAuthenticated` | **la prémisse est FAUSSE** — écart de typage, pas de sécurité |
| les 11 portes d'accusé manuscrites gelées, à drainer | rouvertes une par une : `MessageSendResponseData` **EST** `{ messageId: string }`, les autres redisent l'enveloppe nue | lot de consistance, sans urgence — inchangé |

Ce qui a ouvert CE lot n'est ni l'un ni l'autre : c'est d'avoir regardé, en
mesurant le premier, **le paramètre `data` de la porte d'envoi** — celui que le
cycle 109 n'avait pas touché.

## 2. Trois déclarations pour un seul envoi, et elles ne disaient pas la même chose

`message:send` est décrit à trois endroits. Rien ne les confrontait :

| champ | contrat `MessageSendData` | schéma Zod (ce qui est ACCEPTÉ) | type du handler |
|---|---|---|---|
| `conversationId`, `content`, `originalLanguage`, `messageType`, `replyToId` | ✅ | ✅ | ✅ |
| `clientMessageId` | ✅ requis | ✅ requis | **absent** |
| `storyReplyToId`, `copyAttachmentsFromMessageId` | **absent** | ✅ | absent |
| `forwardedFromId`, `forwardedFromConversationId`, `location` | **absent** | ✅ | ✅ |
| `isBlurred`, `expiresAt`, `effectFlags`, `isViewOnce`, `maxViewOnceCount` | **absent** | ✅ | absent |
| **`encryptedContent`, `encryptionMetadata`, `encryptionMode`, `isEncrypted`** | **absent** | **absent** | — |
| `encryptedPayload` | absent | **absent** | ✅ `unknown` |

Les deux dernières lignes sont le défaut, et elles se lisent ensemble.

## 3. Le défaut : le seul champ du chemin qui échappait au schéma

Le client web chiffre AVANT d'émettre et pose sur le fil deux champs **plats** —
`encryptedContent` (le chiffré) et `encryptionMetadata` :

```ts
messageData.encryptedContent = encryptedPayload.ciphertext;
messageData.encryptionMetadata = encryptedPayload.metadata;
if (encryptionMode === 'e2ee') messageData.content = '[Encrypted]';
```

`SocketMessageSendSchema` est un `z.object` : il **STRIPPE en silence** tout
champ non déclaré — le fichier le documente déjà **trois fois**, pour
`copyAttachmentsFromMessageId`, pour `isViewOnce`, pour les effets. Ni
`encryptedContent` ni `encryptionMetadata` n'y figuraient.

Et le handler, de son côté, lisait :

```ts
encryptedPayload: data.encryptedPayload as MessageRequest['encryptedPayload'],
//                ↑ le `data` BRUT, pas `validated`
```

`encryptedPayload` est un nom qu'**aucun client n'émet** et qu'**aucun schéma ne
produit** : c'est la forme que la route REST FABRIQUE en aval, à partir des deux
champs plats. Le handler socket la lisait donc à l'entrée, où elle vaut toujours
`undefined`.

**Sur tout le chemin d'envoi, c'était le SEUL champ lu sur le `data` brut.** Les
dix-neuf autres viennent de `validated`. L'unique champ à contourner le schéma
était l'unique champ que le schéma ne déclarait pas — les deux moitiés du défaut
se tenaient l'une l'autre : le lire sur le brut faisait qu'on ne remarquait pas
qu'il était strippé, et le fait qu'il soit strippé rendait impossible de le lire
sur le validé.

## 4. Ce que ça coûtait, mode par mode — mesuré, pas supposé

`MessageProcessor.saveMessage` PRÉFÈRE l'enveloppe du client, et retombe sinon
sur `getEncryptionContext`, qui chiffre côté serveur. La conséquence dépend donc
du mode, et **la seule formule « le message part en clair » serait fausse** :

| mode de la conversation | ce qui arrivait |
|---|---|
| **`e2ee`** | l'enveloppe est strippée ⇒ repli sur `getEncryptionContext`, qui pour `e2ee` rend `isEncrypted: false, encryptedContent: null`. Or le client avait DÉJÀ remplacé `content` par le littéral `[Encrypted]`. **Le message est persisté comme la chaîne `[Encrypted]`, sans chiffré. Contenu DÉTRUIT, sans recours** — le client était le seul détenteur du clair. |
| **`hybrid`** | la couche CLIENT est perdue ; seule la couche serveur s'applique. **Le mode hybride, qui est par définition deux couches, était silencieusement rétrogradé à une.** |
| **`server`** | le serveur rechiffre le clair lui-même : pas de fuite au repos. La couche client est jetée, sans conséquence visible. |

Le repli REST ne rattrapait rien : `sendMessageViaRest` RECONSTRUIT sa charge
depuis `options`, où l'enveloppe n'existe pas — et une garde en amont interdit de
toute façon ce repli pour un message chiffré. **Le socket était l'unique chemin,
et il perdait le chiffré.**

### La passerelle accusait le client de ce qu'elle faisait elle-même

```ts
logger.warn('[MessageProcessor] E2EE message received as plaintext - client should encrypt');
```

Cette ligne se déclenchait à **chaque** envoi web dans une conversation e2ee. Le
client chiffrait ; c'est le schéma de la passerelle qui retirait le chiffré,
douze fichiers plus tôt. Un log qui nomme le mauvais coupable est pire qu'un log
absent — il oriente l'enquête du mauvais côté, et il l'a fait aussi longtemps que
le défaut a vécu.

Même famille, côté web, et retirée dans ce lot :

```ts
// Don't fallback to REST for E2EE messages (REST can't handle E2EE yet)
```

REST est précisément le transport qui SAIT le porter — il déclare
`encryptedContent`, le valide sous un plafond de 8 Ko, refuse la rétrogradation
et le recompose. La phrase désignait, là encore, le seul des deux qui n'était pas
en cause.

## 5. Le geste : une enveloppe, déclarée UNE fois

Recopier les quatre champs dans le schéma socket aurait rétabli le chiffré **et
rouvert la même porte** pour la prochaine évolution — un mode ajouté d'un côté,
un plafond relevé de l'autre. Le défaut n'était pas qu'un champ manquait : c'est
que la même enveloppe était décrite à deux endroits et qu'un seul la connaissait.

`validation/encryption-envelope.ts` porte donc les trois pièces, et les deux
transports les LISENT :

- `ENCRYPTION_ENVELOPE_SHAPE` — les quatre champs zod, plafond 8 Ko compris ;
- `noSilentDowngrade` + `NO_SILENT_DOWNGRADE_ISSUE` — la garde qui refuse un
  message DÉCLARÉ chiffré sans chiffré. **Déclarée à côté de la forme parce
  qu'elle en fait partie** : un schéma qui prendrait la forme sans la garde
  accepterait exactement l'entrée que la forme existe pour refuser ;
- `toEncryptedPayload()` — la recomposition vers ce que `MessagingService`
  consomme, jusque-là écrite en `as any` dans la seule route REST.

La route REST a **perdu** ses vingt lignes au profit de l'unité ; le handler
socket lit `toEncryptedPayload(validated)` sur ses DEUX chemins — le chemin
pièces jointes ne portait pas l'enveloppe du tout, pas même sous le mauvais nom.

## 6. Le cliquet : une ÉGALITÉ de jeux de clés, dans les deux sens

Un correctif ferme le site ; il ne ferme pas la famille (leçon 237i). Deux
dérives distinctes ont produit ce défaut, et aucune ne subsume l'autre :

| dérive | conséquence |
|---|---|
| le SCHÉMA ignore un champ du contrat | il est **strippé** : le client croit l'avoir envoyé, il n'arrive jamais |
| le CONTRAT ignore un champ du schéma | il est **inexprimable** : la passerelle l'honore, aucun client typé ne peut le poser |

`SendDoorRatchet` (dans `validation/socket-event-schemas.ts`) assert l'égalité des
jeux de clés entre `z.infer<Schéma>` et le contrat, pour les deux événements
d'envoi. Il vit dans un fichier de **PRODUCTION**, jamais dans `__tests__` :
`tsconfig.json` les exclut, et un cliquet que le compilateur n'atteint pas n'est
jamais rouge (règle du cycle 105).

**RED prouvé sur les deux sens** :

- ajouter `quotedPostId` au seul schéma ⇒ `socket-event-schemas.ts(272,10):
  error TS2344: Type 'false' does not satisfy the constraint 'true'` ;
- retirer `...ENCRYPTION_ENVELOPE_SHAPE` du schéma ⇒ 3 erreurs, dont la porte de
  `toEncryptedPayload` et celle du refine.

## 7. Ce que le cliquet a fait dire au contrat

Le rendre vert a obligé à déclarer les **dix** champs que la passerelle accepte
et honore depuis toujours, et qu'aucun client typé ne pouvait exprimer : les
effets de message (`isViewOnce`, `isBlurred`, `expiresAt`, `effectFlags`,
`maxViewOnceCount`), le lieu partagé (`location`), le transfert
(`forwardedFromId`, `forwardedFromConversationId`), la réponse à une story
(`storyReplyToId`), la diffusion (`copyAttachmentsFromMessageId`).

C'est le biais du cycle 105, à l'identique : **on déclare ce qu'on vient
d'ajouter, pas ce qui était déjà là.** Ils ne voyageaient que parce que le web
compose sa charge en `Record<string, unknown>` — une porte de sortie qui, elle,
n'a jamais été gouvernée.

## 8. Ce qui a été MESURÉ CORRECT, et pourquoi on l'écrit

- **`mentionedUserIds`** : le web l'émet, le schéma socket le STRIPPE, REST le
  déclare et l'honore. Ce n'est pas un défaut : `computeValidatedMentions` fait
  primer la liste explicite quand elle existe, et retombe sinon sur l'extraction
  des `@username` du CONTENU — que le web envoie aussi, et qui repasse par
  `validateMentionPermissions`. Les mentions arrivent donc par les deux chemins.
  Écart de consistance, pas de perte.
- **`authContext`** : 0 route sur 480 le lit sans garde (cf. §1).
- **La borne de longueur** : `MessageValidator` applique `MAX_MESSAGE_LENGTH`
  **inconditionnellement**, donc l'exemption `!encryptedPayload` de la garde du
  handler ne la contournait pas. Seule la garde de VIDE était exemptée, ce qui
  est son objet.

## 9. Mesures

| gate | résultat |
|---|---|
| `tsc --noEmit` passerelle | **0 erreur** |
| `tsc --noEmit` sous la mutation du cliquet | **TS2344**, en nommant la ligne |
| Suites `socketio/handlers` + `validation` | 12/12, **488/488** |
| Tests passerelle (complet) | *cf. §11* |

## 10. Le correctif a eu son propre défaut, et il était INVISIBLE au compilateur

Premier jet : l'import de l'unité posé ligne **152** de
`routes/conversations/messages.ts`, sous un `z.object` évalué au chargement du
module ligne **129**. TypeScript émet ses `require` dans l'**ordre de la
source** ; le `const` de l'enveloppe n'existait donc pas encore quand le schéma
l'étalait.

```
ReferenceError: Cannot access 'encryption_envelope_js_1' before initialization
    at src/routes/conversations/messages.ts:129:6
```

**`tsc --noEmit` : 0 erreur. Le type-check bloquant de la CI : vert. Seize suites
refusaient de se charger.** La zone morte temporelle entre deux instructions de
niveau module n'est vérifiée par aucun des deux.

> **Vert au compilateur n'est pas vert au CHARGEMENT.** C'est la mesure qui
> justifie de faire tourner la suite ENTIÈRE avant de conclure, et pas seulement
> les suites du lot — les neuf témoins ajoutés étaient tous verts, et aucun ne
> touchait la route REST.

Le fichier portait déjà l'anti-patron (un import ligne 152, sûr par accident :
sa valeur n'est lue que dans un handler, jamais à l'initialisation). Un
`import/first` le fermerait par construction ; il est hors de ce lot — il
toucherait tout le dépôt (§11).

## 11. Ce que ce cycle apprend

> **Un champ lu sur le BRUT quand tous ses voisins viennent du VALIDÉ ne se
> défend pas — il se remarque.** C'est l'unique asymétrie de tout le chemin, et
> elle nommait exactement le champ que le schéma ne déclarait pas. Les deux
> moitiés du défaut se protégeaient l'une l'autre.

> **Un log qui accuse l'autre bout est un indice, pas un diagnostic.** « E2EE
> message received as plaintext — client should encrypt » disait vrai sur le
> SYMPTÔME et faux sur la CAUSE, à douze fichiers du vrai site. Même famille que
> les commentaires d'impossibilité du cycle 104 : il ne rougit jamais, et il se
> lit comme une raison de chercher ailleurs.

> **Mesurer un suivi hérité peut le RÉFUTER et rester payant.** Les 43 erreurs
> `strictFunctionTypes` ne nommaient aucun défaut de sécurité — la mesure a coûté
> un balayage de 480 routes. Elle a fait regarder le paramètre `data` de la porte
> d'envoi, que le cycle 109 avait laissé de côté. **Une piste peut être fausse
> sur son motif et juste sur son voisinage** (cycle 107).

> **Le cliquet juste n'est pas « le schéma déclare-t-il tout ? » mais « les deux
> déclarations sont-elles ÉGALES ? ».** Les deux dérives ont des symptômes
> opposés — strippé d'un côté, inexprimable de l'autre — et une garde
> unidirectionnelle en laisse toujours une passer.

## 12. Suivis

- [ ] **Neuf** — la charge d'envoi du WEB est un `Record<string, unknown>`, avec
      deux `as unknown as` au moment d'émettre. C'est la porte de SORTIE jumelle
      de celle qu'on vient de fermer côté entrée : le contrat dit désormais vrai,
      mais son émetteur principal ne le lit toujours pas. Lot à part — `apps/web`
      porte son propre cliquet de dette de types.
- [ ] **Neuf** — les autres familles `ClientToServerEvents` n'ont pas leur
      `SendDoorRatchet`. L'envoi de message est le chemin le plus fréquenté, donc
      le premier ; l'égalité de jeux de clés est mécanique et se généralise.
- [ ] Hérité (109) — les 11 portes d'accusé manuscrites gelées, mesurées
      non-divergentes. Lot de consistance.
- [ ] Hérité (109) — le REST `DELETE /reactions/:id/:emoji` sert encore
      `{ message: 'Reaction removed successfully' }`, phrase anglaise non
      localisée sur le fil.
- [ ] Hérité (106) — la LECTURE depuis Redis reste non validée à l'exécution.
- [ ] Hérité — `ConversationUpdatedEventData` et sa signature d'index.
- [ ] **Neuf** — `import/first` n'est pas activé. Un import posé sous une
      instruction de niveau module qui le lit compile, passe le type-check
      bloquant de la CI, et refuse de se charger (§10). Le dépôt en porte au
      moins un autre exemplaire, sûr par accident. Lot d'hygiène à part : la
      règle touche tout le dépôt.
