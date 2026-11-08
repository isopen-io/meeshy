## Un verrou qui garde le CLAIR et le FICHIER peut laisser partir la CLÉ qui les rouvre

*2026-11-08 — #17080, cycle 150. Gateway, `createNotification` et l'éventail de notification.*

### Le défaut

Quatre cycles de gardes se sont posées sur la charge d'une notification de
message protégé — éphémère, vue unique, flouté, chiffré :

| cycle | ce qui a été refermé |
|---|---|
| 124 | le CORPS, et le couple `content` / `originalLanguage` que la NSE pré-enregistre |
| 125 | le MÉDIA — fichier, nom, taille, durée, vignette, URL |
| 125 bis → 128 | le TEXTE des trois éventails, puis ce qui le QUALIFIE (clé de protection, horloge, type, base) |

Toutes justes, toutes testées, toutes sous le second verrou
`notificationLocKey`. **Et `encryptedContent` — l'enveloppe que l'appareil du
destinataire déchiffre — voyageait à côté, sous le seul `showPreview`.**

Côté client, `applyBodyRewrites` (NSE iOS) écrit :

```swift
if let encryptedContent = userInfo["encryptedContent"] as? String, …,
   let decrypted = NSEDecryptor.decrypt(…) {
    content.body = decrypted          // ← sans jamais regarder notificationLocKey
}
```

La branche `locKey` existe douze lignes plus bas, mais c'est un **repli pour
l'échec de déchiffrement**, pas une garde. Résultat : dans une conversation
chiffrée de bout en bout, le texte ENTIER d'un message à vue unique s'affichait
sur l'écran verrouillé, sous une bannière composée par la passerelle disant
« 👁️ 🖼️ ».

### Pourquoi les quatre cycles précédents ne pouvaient pas le voir

Deux raisons, et la seconde est la vraie.

**1. L'enveloppe ne compose aucune chaîne, et n'en qualifie aucune.** C'est la
leçon du cycle 126 (« un lot qui partage une valeur composée doit énumérer ce
qui voyage AVEC elle ») poussée d'un cran : le cycle 126 a trouvé les champs qui
QUALIFIENT un texte — clé de localisation, horloge, type. L'enveloppe n'est ni
le texte, ni son qualificatif : c'est le **moyen de l'obtenir**. Elle ne se
trouve donc ni en cherchant « qui compose ce corps ? », ni en cherchant « qu'est-ce
qui décrit ce corps ? ».

**2. Son absence de garde avait l'air d'être la garde.** Et c'est ce qui la
rendait invisible. Le verrou des deux autres s'écrit `protectedOverride === null`
(celui du média) : en `e2ee`, `protectedPreview` rend TOUJOURS une clé — la
branche `encrypted` est la moins restrictive de sa préséance — donc cette
formule-là retirerait l'enveloppe à toute conversation chiffrée, c'est-à-dire la
feature entière. **Un champ dont la garde évidente est manifestement fausse se
lit comme un champ qu'on a décidé de ne pas garder.**

> La question à poser à un verrou de protection n'est donc pas seulement « quel
> CONTENU retient-il ? » (cycle 125 : texte, fichier, nom, taille, durée,
> vignette, URL) mais **« retient-il ce qui permet de RECONSTITUER le contenu
> qu'il vient de masquer ? »** — une clé, une enveloppe, une URL signée, un
> jeton de téléchargement, un identifiant de ressource. Ces objets-là ne
> ressemblent pas au secret : ils ressemblent à de l'infrastructure.

### La forme du correctif

Le discriminant n'est pas « ce message est-il protégé ? » mais **« la protection
est-elle le CHIFFREMENT SEUL ? »** :

```ts
export function envelopeMayTravelUnder(locKey: string | null | undefined): boolean {
  if (!locKey) return true;
  return locKey === PROTECTION_LOC_KEY.encrypted;
}
```

L'enveloppe EST le mécanisme par lequel un message chiffré se montre à son
destinataire légitime ; elle n'est pas celui par lequel un message à vue unique
se montre à un écran verrouillé. Fail-CLOSED sur l'inconnu : une clé qu'un lot
futur ajouterait sans relire ce site retient l'enveloppe.

Et les quatre clés de `protectedPreview` sont désormais NOMMÉES
(`PROTECTION_LOC_KEY`), parce que deux gardes les comparent — une chaîne
recopiée au site de comparaison aurait été une loi de plus.

### Le corollaire de LOT, et c'est lui qui coûtait le plus cher

L'issue du dépôt (#17080) décrivait l'autre moitié du même champ : l'enveloppe
ne partait que sur l'éventail `regular`, si bien qu'une RÉPONSE ou une MENTION
en conversation chiffrée restait « 🔒 💬 » à vie. Un lot de COMPLÉTUDE, de
dimension 13.

**Le livrer seul aurait porté la fuite aux deux populations les plus exposées** —
celle à qui on répond, et les mentionnés, dont la bannière perce la sourdine.
C'est la leçon du cycle 127 (« une garde qui protège la population la plus
NOMBREUSE peut manquer la plus EXPOSÉE ») prise à l'envers : ici, le chemin
nombreux portait déjà le défaut, et le correctif de complétude était le véhicule
qui l'aurait répandu.

> **Avant de propager un champ d'un éventail aux autres, demander ce que ce champ
> FAIT chez son destinataire final** — pas ce qu'il est, ni d'où il vient. Un lot
> de complétude qui ne pose pas cette question est un multiplicateur de la fuite
> qu'il n'a pas cherchée.

### Le témoin

Un témoin écrit hors `e2ee` ne peut pas tomber : `deviceEnvelopeForPush` rend
`undefined` hors chiffrement, donc les trois éventails y sont identiques. Et un
témoin posé sur le cas NOMINAL chiffré ne peut pas tomber non plus : c'est le cas
où l'enveloppe doit partir.

Le témoin qui attrape les deux moitiés exige donc **`e2ee` ET une protection
AUTRE que le chiffrement** — une par branche de `protectedPreview` au-dessus de
`encrypted` dans sa préséance — plus son miroir : « un message SEULEMENT chiffré
la remet aux trois, l'enveloppe EST la feature », qui garde contre le correctif
trop large.
