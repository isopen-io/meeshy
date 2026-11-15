## Leçon 275 — une garde de CONFIDENTIALITÉ qui ne garde qu'une chaîne ne garde rien du tout (2026-08-24, cycle 125)

Quatre cycles ont poursuivi le même symptôme dans la couche push : « deux textes pour un même
message ». Chacun a trouvé son défaut, chacun l'a fermé, chacun a écrit sa garde. Elles sont
toutes justes :

| garde | ce qu'elle retient |
|---|---|
| `protectedPreview` | compose un placeholder à la place du corps |
| `previewPrismSource` | retient la TRADUCTION d'un contenu masqué |
| `prePersistedMessageFields` | retient le corps que la NSE enregistrerait localement |
| cycle 124 — `firstAttachmentTranscript` | retient la TRANSCRIPTION d'un vocal protégé |

Quatre gardes, quatre sites, quatre lots de témoins. **Toutes gardent une chaîne de
caractères.** Et pendant que la quatrième se posait, douze lignes plus bas dans le même objet,
sans aucune condition :

```ts
firstAttachmentUrl: first?.fileUrl || undefined,
```

La NSE iOS télécharge cette URL et l'attache en `UNNotificationAttachment`. Une photo à VUE
UNIQUE s'affichait **entière, en grand, sur l'écran verrouillé**, sous une bannière disant
« 👁️ 🖼️ ». Aucun texte n'avait besoin de fuir pour que le secret parte.

> **Une protection de CONTENU se mesure sur tout ce que la charge TRANSPORTE, jamais sur sa
> seule chaîne.** Le cycle 123 demandait « que transporte-t-on à CÔTÉ de ce qu'on affiche ? » et
> répondait en inventoriant les champs de TEXTE. La bonne réponse n'est pas un inventaire de
> champs : c'est une question sur le MÉDIUM — texte, fichier, nom de fichier, taille, durée,
> vignette, URL.

### Corollaire — chercher la garde manquante là où l'attention vient de passer

Le défaut n'était pas dans un fichier oublié. Il était dans **l'objet littéral suivant**, écrit
par la même main, relu dans le même cycle, à douze lignes de la garde qu'on venait de poser. Ce
n'est pas un hasard de ce lot : une passe qui répare un chemin regarde ce chemin *au niveau
d'abstraction où elle a trouvé le défaut* — ici « quelle chaîne compose l'aperçu ? » —, et ce
niveau rend l'objet voisin invisible parce qu'il ne compose aucune chaîne.

La question qui l'attrape se pose au moment du correctif, pas au cycle suivant :
**« la charge que ce site remet contient-elle autre chose que ce que je viens de garder ? »**
Elle se répond en lisant l'objet remis, ligne à ligne, sans lire le code qui le construit.

### Corollaire — le niveau de protection qu'un modèle DÉCLARE et qu'aucune requête ne LIT

`MessageAttachment` porte `isViewOnce`, `isBlurred` et `effectFlags` — ses propres drapeaux,
indépendants de ceux du message. Le `select` de l'éventail n'en lisait aucun : la protection
d'un média n'était consultée à **aucun** des deux niveaux qui la déclarent.

Mesure honnête, et elle change la qualification sans changer le correctif : **aucun chemin de
création n'écrit ces deux drapeaux** aujourd'hui (`UploadProcessor`, `tus-handler`,
`copyAttachments`, `MessageProcessor` n'y posent que `isEncrypted`). Le niveau attachment est
donc ARMÉ, pas encore atteignable.

> Un champ de protection présent au modèle et absent de toute requête est un **piège armé** : le
> jour où un chemin de création le pose — une ligne, dans un lot qui parlera d'autre chose — la
> protection sera considérée comme acquise par tous ceux qui liront le schéma. Le respecter
> coûte trois champs dans un `select` ; le découvrir plus tard coûte un incident.

### Corollaire — le second verrou se pose sur la clé qui DÉCLARE, pas sur celle qui décrit

`notificationLocKey` a UN SEUL producteur dans tout le dépôt : `protectedPreview`. Sa présence
sur un contexte de notification n'est donc pas un indice, c'est une **déclaration** — aucun
appelant ne la pose par accident, et aucun ne la pose pour autre chose.

C'est ce qui en fait un bon second verrou, au même titre que dans `previewPrismSource` et
`prePersistedMessageFields` : un appelant qui masque le corps sans retirer son média perd le
rich-push, jamais le secret. **Une garde de confidentialité échoue en montrant MOINS.**

### Ce qu'on n'a pas fait, et pourquoi

La NSE pourrait refuser d'attacher un média quand `notificationLocKey` est présent. Elle n'a pas
été touchée : la fuite est fermée à la SOURCE, et la source est le seul endroit qui connaisse
l'état de protection du message. Pour le seul cas où la NSE révèle légitimement un contenu
protégé (E2EE déchiffré localement), la passerelle ne pousse plus d'URL du tout — la garde
cliente serait inerte. Une édition Swift non compilable dans ce conteneur achèterait un risque
de build (leçon 274, corollaire de harnais) contre zéro comportement observable.

> **Ajouter une garde symétrique côté client n'est pas gratuit : elle se paie en risque de build
> et en code qui ne peut pas tomber.** Une garde qu'aucun témoin ne peut faire échouer est une
> ligne de commentaire déguisée.

### Corollaire de harnais — un témoin d'ABSENCE passe au vert quand l'unité entière meurt

Le lot a rendu trois rouges dans `MessageProcessor.test.ts` : le fichier fabrique le module
`NotificationService` à la main (`jest.mock(..., () => ({ NotificationService, protectedPreview }))`)
et la nouvelle jumelle n'y figurait pas — l'éventail mourait sur
`maskedAttachment is not a function`, silencieux dans son propre `catch`.

Trois témoins du bloc sont tombés. Un quatrième, `skips regular notification for users with
mentionsOnly`, est resté **VERT** — parce qu'il assert `not.toHaveBeenCalled()`.

> **Un témoin d'absence ne distingue pas « l'unité a décidé de ne pas appeler » de « l'unité n'a
> jamais tourné ».** Il passe au vert sur la panne totale du chemin qu'il surveille. Seul son
> voisinage — les témoins de PRÉSENCE du même bloc — le rattrape ; isolé dans un fichier où tout
> le reste est aussi une absence, il ne peut plus rien détecter.

Corollaire pratique : quand un `jest.mock(module, factory)` remplace un module de PRODUCTION,
la fabrique est un **inventaire figé** de ce que le module exportait le jour où on l'a écrite.
Ajouter un export au module ne la met pas à jour, et l'appelant obtient `undefined`. La forme
`jest.requireActual` + surcharge ciblée n'a pas ce défaut ; la fabrique littérale, si — et c'est
exactement la leçon 271 (« un helper à un appelant est un inventaire ») dans le harnais de test.
