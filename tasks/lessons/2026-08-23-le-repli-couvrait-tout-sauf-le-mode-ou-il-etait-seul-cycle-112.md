## 2026-08-23 — Le repli couvrait tout, sauf le mode où il était seul (cycle 112)

### 1. Une mesure PUBLIÉE est une affirmation, au même titre qu'un suivi hérité

Le cycle 110 a instruit `mentionedUserIds` — champ que le web émet, que le schéma
socket strippe, que REST honore — et l'a classé sous un titre sans ambiguïté :
« Ce qui a été **MESURÉ CORRECT**, et pourquoi on l'écrit ». Motif : la passerelle
retombe sur l'extraction des `@` du CONTENU quand la liste explicite est vide.

Chaque phrase était vraie. La conclusion manquait une condition — et le titre,
plus qu'un suivi ordinaire, décourageait d'y revenir.

- **Un inventaire de NON-défauts se relit avec le soupçon d'un inventaire de
  suivis.** La règle du cycle 107 (« un suivi hérité est une AFFIRMATION ») vaut
  par l'autre bout : ce qu'un cycle déclare mesuré et sain est aussi une
  affirmation, et elle se vérifie.

### 2. Deux canaux qui lisent la MÊME variable ne sont pas deux canaux

Le repli existe bien : `if (explicit.length === 0 && !content.includes('@'))`.
Reste à savoir ce que `content` porte, et c'est le CLIENT qui en décide douze
fichiers plus tôt :

```ts
if (encryptionMode === 'e2ee') messageData.content = '[Encrypted]';
```

| mode | `content` sur le fil | liste explicite | mentions |
|---|---|---|---|
| clair / `server` / `hybrid` | `coucou @alice` | strippée | extraites — rien n'est perdu |
| **`e2ee`** | **`[Encrypted]`** | strippée | **AUCUNE** |

Nommer quelqu'un dans une conversation chiffrée ne produisait ni ligne `Mention`,
ni `validatedMentions` (le web surligne depuis ce champ), ni notification — le
compositeur affichant la pastille du mentionné, l'expéditeur voyait un succès.

- **Une redondance ne se mesure pas à ce que chaque voie PORTE, mais à ce qui les
  fait TOMBER.** Deux voies qui échouent sur la même cause n'en font qu'une. La
  question n'est pas « existe-t-il un autre chemin ? » mais « cet autre chemin,
  dans quel état est-il quand celui-ci est coupé ? ».
- **Un repli mal conditionné n'est jamais silencieux là où on le teste.** Trois
  modes sur quatre n'en avaient aucun besoin et le rendaient invisible ; le
  quatrième en dépendait entièrement et n'en recevait rien.

### 3. Un plafond appartient à la RÉSOLUTION, pas au transport — et il TRONQUE

L'extraction depuis le contenu borne à 50 depuis toujours ; la liste EXPLICITE
n'était bornée nulle part. Déclarer le champ sur le transport qui porte le trafic
sans le borner aurait ouvert une entrée non bornée de plus.

Posé à la CONVERGENCE des deux sources, jamais dans les schémas :

- dans un schéma, `.max(50)` **REJETTE** l'envoi ;
- à la convergence, il **TRONQUE** — ce que l'autre source fait déjà.

- **Deux sources de la même donnée doivent subir la même règle ET le même
  comportement.** Aligner la règle en divergeant sur l'issue (rejet contre
  troncature) fabrique une seconde incohérence en fermant la première.

### 4. Fermer l'ENTRÉE avant la SORTIE n'était pas un ordre de commodité

Le suivi n°1 du cycle 110 — typer la charge d'émission du web, qui naissait
`Record<string, unknown>` et partait sous deux `as unknown as` — ne pouvait pas
être exécuté plus tôt : **le contrat était faux**. Il ne déclarait ni l'enveloppe
de chiffrement ni les dix champs que la passerelle honore. Typer l'émetteur
d'abord aurait produit des erreurs sur un contrat mensonger, qu'on aurait fait
taire par des casts.

- **Un `Record<string, unknown>` de charge est un symptôme de CONSTRUCTION, pas
  de typage.** Tant que l'objet se complétait par MUTATION (chiffrement, puis
  pièces jointes), aucun type ne pouvait le décrire. Le corriger commence par
  rendre la construction immuable — résoudre le chiffrement en VALEUR — pas par
  écrire une annotation.
- **Rendre l'émission à l'appelant supprime le besoin de corréler.** Deux
  branches monomorphes portant chacune un nom d'événement LITTÉRAL sont vérifiées
  par le socket typé ; l'enveloppe de délai n'a plus à connaître ni le nom ni la
  charge. Les deux casts n'ont pas été contournés, ils sont devenus inutiles.

### 5. Ce que la porte typée a fait tomber — trois déclarations manquantes

À la première compilation, et aucune n'avait été nommée par une relecture :

1. **`SendMessageRequest`** (contrat REST des clients) ne déclarait pas
   `mentionedUserIds` — troisième site du même champ ;
2. **le repli REST du web** ne l'envoyait pas non plus : même défaut que le lot,
   sur le chemin de secours du MÊME envoi, et invisible parce que rien ne relie
   visuellement les deux sites ;
3. **`EncryptionMetadata` était une `interface`** — donc sans signature d'index
   implicite, donc assignable à AUCUNE carte ouverte. Le contrat de fil déclare
   la métadonnée en `Readonly<Record<string, unknown>>` délibérément (trois
   clients, trois formes, JSON opaque en base). Tant que ce type était une
   interface, **aucun émetteur typé ne pouvait remplir ce champ** : c'est ce qui
   rendait le cast du web inévitable, et le cast, à son tour, empêchait de le
   remarquer.

- **Un cast sur un objet de contrat NOMME la déclaration qui manque** (cycle 96),
  et la troisième vivait dans le paquet PARTAGÉ, à deux fichiers du contrat
  qu'elle empêchait de satisfaire.

### 6. Un commentaire qui justifie de GARDER quelque chose est une affirmation

La charge socket portait `messageType` sous cette phrase :

```ts
// Elle reste posée — et posée JUSTE — parce que l'objet sert aussi de charge
// au repli REST, où elle est, elle, autoritative (cf. `sendMessageViaRest`).
```

Le contrat ne déclare aucun champ de ce nom et le schéma le STRIPPE : ce motif
justifiait, seul, de continuer à le poser. Il était faux — `sendMessageViaRest`
reconstruit sa charge depuis `options` et recalcule `messageType` lui-même. Les
deux objets ne se touchent jamais.

Rien n'était perdu (le serveur dérive la même règle), mais **huit témoins
attestaient une clé que la passerelle ne reçoit jamais**. Recalibrés sur le repli
REST — seul site où la valeur est autoritative, donc le seul dont un changement
casse quelque chose — plus un neuvième, en négatif, qui gèle son absence sur la
charge socket.

- Même famille que le compte (93) et le tri (86 bis) : **une justification de
  maintien s'ouvre avant d'être crue**, et celle-ci tenait en vie le seul champ
  que le typage refuserait.
