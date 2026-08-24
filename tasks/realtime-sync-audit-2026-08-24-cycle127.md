# Cycle 127 — la garde de vivacité que seul le lot le plus fréquenté portait

## Point de départ

Suivi MESURÉ du cycle 126, laissé explicitement « distinct, non instruit » :

> **Le lot `regular` reste le seul à faire une relecture VIVANTE du message** (son
> gate d'éligibilité : supprimé / expiré / brûlé en vol). Réponse et mention
> tiennent leur échéance de l'appelant. Ce n'est pas une divergence de bannière
> mais une divergence de GATE : un message soft-supprimé dans la fenêtre de
> l'éventail annonce encore sa réponse et ses mentions.

Instruit ici, et il est plus grand que ce que le suivi en disait — c'est un
défaut de CONFIDENTIALITÉ, pas une notification en trop.

## Le défaut

`createMessageNotification` relit l'état du message juste avant de pousser et
abandonne quand il n'est plus éligible. Son commentaire nomme l'enjeu :

```ts
// If the sender soft-deletes / … / lets the message expire in that window we
// MUST NOT leak the original content via the banner.
```

Ni `createReplyNotification` ni `createMentionNotification` ne portaient cette
garde. Un message rappelé entre son commit et l'éventail poussait donc son texte
ORIGINAL sur l'écran verrouillé de la personne à qui l'on répond et de tous les
mentionnés — pendant que les membres ordinaires du fil, eux, étaient protégés.

| éventail | audience | garde de vivacité (avant) |
|---|---|---|
| `regular` | les membres passifs du fil | **oui** — relecture + 3 branches |
| `reply` | la personne VISÉE | **aucune** |
| `mentions` | les mentionnés — perce jusqu'à la sourdine | **aucune** |

> **Une garde qui protège la population la plus NOMBREUSE peut manquer la plus
> EXPOSÉE.** Posée sur le chemin le plus fréquenté, elle se lit comme une garde
> posée sur le sujet ; elle ne l'est que sur son chemin.

### Pourquoi le balayage de rétraction ne le rattrape pas

L'éventail relit le message APRÈS ses trois lots et retire les lignes
`Notification` d'un message rappelé. Son raisonnement de fenêtre est exact — pour
ce qu'il vise. Il ferme la BASE ; la bannière est déjà sur l'ÉCRAN, et rien ne la
rappelle. **Une compensation en aval ne remplace pas une garde d'admission quand
l'effet qu'elle compense est irréversible.**

### Pourquoi c'était invisible

Les trois éventails relisent la MÊME ligne dans la MÊME fenêtre. Les deux lots
sans garde le font par `loadMessagePrismSource`, dont le `select` demandait
`translations`, `originalLanguage`, `createdAt`, `messageType` — et passait à côté
de `deletedAt` et `expiresAt`. La garde ne coûtait pas une requête : **deux
colonnes sur une lecture qui se faisait déjà.**

Ce qui l'a tenu hors de vue est un doc-comment écrit comme un contrat alors qu'il
DÉCRIVAIT un défaut : « pour les éventails dont la lecture n'est PAS un gate
d'éligibilité ». Vrai du code, et rien de plus — mais posé en tête d'une unité, il
se relit comme une décision qu'on n'a pas à instruire.

## Le correctif

1. **`MessageLiveness`** — `live` | `gone` | `unknown`. Trois états et non deux :
   `gone` est ce qu'une ligne PROUVE, `unknown` ce qu'aucune lecture n'a prouvé.
2. **`messageLiveness()`** — le prédicat, extrait de `createMessageNotification`
   pour qu'il n'existe qu'un site. La parité des trois éventails étant le sujet du
   cycle, deux copies l'auraient reperdue au cycle suivant.
3. **`loadMessagePrismSource`** demande deux colonnes de plus dans la requête
   qu'il faisait déjà, et rend le verdict avec la source.
4. **Réponse et mention abandonnent sur `gone`.** Le lot de mentions le fait aussi
   EN TÊTE : le verdict est déjà dans la source relue une fois, donc il n'ouvre
   pas un Prisme par mentionné pour n'en tirer que des `null`. La garde par
   destinataire reste, pour l'appelant qui atteint la méthode en solo.
5. **Le `select` mort part** — cf. § ci-dessous.

Aucune requête supplémentaire, sur aucun des trois lots.

## Ce qui a été mesuré et NON corrigé

### Une ligne ABSENTE n'est pas une preuve

Le premier correctif traitait `findUnique → null` comme un rappel. **Deux témoins
existants sont tombés**, dont un explicite : « survit à un message VOLATILISÉ : la
bannière part, sans traduction ». Il avait raison, et le dépôt disait déjà
pourquoi — dans le balayage de rétraction du même éventail :

> `deletedAt` non nul est la SEULE preuve d'un rappel. Une ligne absente ne prouve
> rien, et aucun chemin de la gateway ne supprime un message physiquement.

Le mécanisme est réel : le message vient d'être committé, et une lecture servie
par un secondaire en retard sur le jeu de réplicas rend `null` pour un message
vivant. En faire une preuve ferait perdre des annonces qu'aucun réessai ne
rattrape.

**La conception a donc changé, pas la fixture.** Le réflexe d'ajuster le double
pour retrouver le vert aurait retiré une garantie de livraison sans que rien ne le
dise. La décision est désormais gardée en POSITIF des DEUX côtés — les lots qui
annoncent quand même, et le lot `regular` qui se tait (politique qui lui reste :
sans ligne il n'a ni horloge, ni langue d'origine, ni traduction à servir) — pour
qu'elle cesse de dépendre de la mémoire d'un cycle.

### Le « brûlé en vol » n'a jamais existé

Le commentaire du lot `regular` énumérait TROIS causes d'abandon — rappelé, brûlé,
expiré — et `isViewOnce` / `viewOnceCount` étaient SÉLECTIONNÉS pour la deuxième.
**Aucune ligne ne les lisait** : `NotificationService` était le seul site du dépôt
à demander `Message.viewOnceCount`.

Le correctif est de RETIRER le select, et la raison se mesure : `viewOnceCount > 0`
dit que QUELQU'UN a consommé, jamais que CE destinataire l'a fait — s'y fier ferait
taire l'annonce pour tous les autres membres. Et le contenu d'un message à vue
unique est de toute façon masqué en amont par `protectedPreview`, qui ne laisse
partir qu'un placeholder.

> **Une garde ANNONCÉE par un commentaire et PROVISIONNÉE par un `select` se lit
> comme une garde en place** — le champ demandé donne la preuve matérielle que
> quelqu'un y a pensé. Vérifier que le champ est LU, pas qu'il est demandé.

## Gates

| gate | résultat |
|---|---|
| `replyMentionLivenessGate.test.ts` (nouveau) | **8 rouges contre `origin/main` / 14 verts après** |
| suites voisines (`notifications/` + éventail + `NotificationService*`) | 41 suites, 757 témoins, exit 0 |
| suite gateway complète (`bun run test:coverage`) | **860/860 suites, 19553 témoins**, exit 0 — couverture 95,47 % stmts / 89,60 % branches (identique au cycle 126) |
| `services/gateway` `tsc --noEmit` | 0 erreur (code de retour lu SANS pipe) |
| `packages/shared` `tsc --noEmit` | 0 erreur |
| non-régression du cycle 126 (`replyMentionBannerClock.test.ts`) | verte |
| non-régression de la décision « message volatilisé » (`replyMentionNotificationPrism.test.ts`) | verte |
| Swift / Kotlin | non modifiés |

Les 6 témoins du nouveau fichier qui PASSENT déjà contre `main` ne sont pas du
remplissage : ils gardent le mode d'échec du CORRECTIF (fail-open sur une lecture
qui lève, ligne absente qui annonce quand même, lecture unique pour tout le lot)
et non celui du défaut.

## Suivi MESURÉ

- **Le rich-push reste hors des éventails réponse et mention** — décision du
  cycle 125 bis, toujours conservée. Rien de ce cycle ne la rouvre.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste
  traduite du Prisme (cycle 123, toujours ouvert).
- `isEncrypted` reste lue par la NSE iOS et n'est jamais émise (cycle 124) —
  piège armé, pas panne.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une
  `MessageAttachment` (cycle 125) — armé, pas atteignable.
- **La fenêtre n'est pas fermée, elle est RÉTRÉCIE, et c'est structurel.** Les
  trois lots relisent avant de pousser ; `deletedAt` peut être committé entre la
  relecture et l'envoi APNs. Seule la rétraction d'après ferme la base, et rien ne
  rappelle une bannière remise. Le fermer entièrement demanderait un rappel push
  (APNs `content-available` + suppression côté NSE), qui est un lot à lui seul et
  touche les trois clients. **Non instruit ici, et distinct.**
- Couverture de `NotificationService.ts` : 94,59 % (94,63 % au cycle 126). L'écart
  vient du dénominateur — la garde à trois branches du lot `regular` s'est repliée
  sur le prédicat partagé, et les lignes retirées étaient couvertes. Aucune ligne
  neuve non couverte.
