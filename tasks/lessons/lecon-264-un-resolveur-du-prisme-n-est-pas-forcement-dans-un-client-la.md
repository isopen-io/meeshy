## Leçon 264 — un résolveur du Prisme n'est pas forcément dans un CLIENT : la quatrième famille était côté serveur (2026-08-24, cycle 121)

**Le constat.** Les cycles 118 à 120 ont recensé trois familles de résolveurs du Prisme
(aperçu de liste, audio, posts/commentaires) et, à chaque fois, la même méthode a trouvé la
suivante : nommer un TYPE de contenu que la liste ne couvre pas, puis chercher son résolveur.
Le cycle 121 a instancié la question sur les NOTIFICATIONS — « et le texte poussé dans une
bannière, qui le résout ? ». Réponse :
`NotificationService.createMessageNotification` (`services/gateway`), qui appariait la carte
`Message.translations` à `resolveUserLanguage(...)` — **une** langue, la plus haute renseignée,
donc le rang 1 dans le cas nominal. Une traduction disponible au rang 2, 3 ou 4 du prisme du
destinataire n'était jamais poussée : la bannière servait l'ORIGINAL pendant que la ligne de
liste de la même application — servie par `resolveLastMessagePreview`, qui DESCEND — affichait
la traduction. Deux textes pour un même message, sur le même écran, à quelques secondes
d'intervalle.

**Pourquoi les trois balayages précédents l'ont manquée.** Ils balayaient les CLIENTS — web,
iOS, Android — parce que les trois premières familles y vivaient, chacune en trois
exemplaires. Celle-ci est résolue **une seule fois, côté serveur, pour les trois clients** :
elle n'a aucun exemplaire à trouver là où on cherchait.

> La règle qui généralise : **dès qu'un contenu part vers un destinataire NOMMÉ — un push, un
> e-mail, un digest — c'est l'émetteur qui descend son prisme, pas le lecteur.** Chercher les
> résolveurs « dans les clients » est un réflexe d'architecture, pas une propriété du Prisme.
> La question juste n'est pas « où sont les écrans ? » mais **« qui connaît les préférences du
> lecteur au moment où le contenu est composé ? »**.

**Le tell, et il était lisible.** Le site portait le bon vocabulaire — un commentaire nommant
le Prisme, la règle #1 correctement citée (« pas de fallback `translations.first` »), et une
résolution par `resolveUserLanguage`. Tout y était juste SAUF la cardinalité : la fonction rend
un `string`, sa voisine `resolveUserLanguagesOrdered` rend la liste. **Un résolveur qui cite la
règle #1 sans citer la règle #3 ne descend pas** — les deux règles ne se gardent pas
mutuellement : #1 interdit de servir n'importe quelle traduction, #3 oblige à descendre. Un
site peut respecter la première à la lettre en violant la seconde, et c'est exactement ce qui
ressemble le plus à du code correct.

### Corollaire — deux résolutions dans la même méthode, et les confondre coûte dans les deux sens

`recipientLang` y servait DEUX choses : le CADRAGE (« Alice vous a envoyé une photo », la
langue d'interface) et la clé de CONTENU. Le cadrage est légitimement une langue unique — le
rang 1. Le contenu, lui, n'a pas de langue d'interface : il a des traductions, et le Prisme dit
de les chercher rang par rang. La correction ne pouvait donc pas être « remplacer
`resolveUserLanguage` par `resolveUserLanguagesOrdered` » : cela aurait localisé la bannière
en portugais pour un lecteur dont l'application est en allemand.

> **Quand une même valeur sert de langue d'AFFICHAGE et de clé de RECHERCHE, ce sont deux
> résolutions qui portent le même nom.** Les rendre ensemble depuis une seule lecture
> (`resolveRecipientPrism` → `{ lang, ordered }`) est ce qui empêche le prochain appelant de
> reprendre l'une pour l'autre. Un témoin garde la séparation : contenu servi au rang 4,
> cadrage resté au rang 1.

### Corollaire — la descente devient UNE fonction, sinon la quatrième famille en fabrique une cinquième

Le consommateur push a besoin de plus qu'un texte : il pousse `translatedContent` **et**
`translatedLanguage` côte à côte sur le fil APNs. `resolveLastMessagePreview` ne rend qu'un
texte — donc l'écrire ici aurait produit une seconde boucle de descente, la copie exacte que
le dépôt interdit et dont les cycles 118-120 sont la facture. La descente est extraite en
`resolvePrismTranslation({ translations, originalLanguage, preferredLanguages })` →
`{ language, text } | null`, et `resolveLastMessagePreview` en devient une projection.

> **Quand un nouveau consommateur a besoin d'un peu PLUS que ce que rend le résolveur
> existant, l'issue par défaut est de le réécrire — et c'est ainsi que naissent les familles
> divergentes.** Le geste juste est d'extraire la décision et de faire de l'ancien résolveur sa
> projection : un seul corps, deux formes de rendu. Le témoin qui gèle l'équivalence
> (`resolved?.text ?? preview` === `resolveLastMessagePreview(...)`) est ce qui interdit à la
> refonte d'avoir changé la ligne de liste des trois clients au passage.

### Corollaire — le filtre de servabilité précède la descente et ne l'INTERROMPT pas

Les traductions chiffrées ne sont jamais poussées (la NSE déchiffre `encryptedContent`, pas
les traductions). L'écriture naturelle — descendre, puis écarter l'élue si elle est chiffrée —
prive le lecteur du rang SUIVANT, auquel il a pourtant droit. Filtrer la carte AVANT la
descente donne le bon résultat sans cas particulier.

> **Un prédicat de servabilité appartient à la carte, pas à l'élue.** La question qui les
> sépare : « cette entrée est-elle un candidat ? » (avant) contre « ce candidat me
> convient-il ? » (après). La seconde forme transforme tout refus en abandon de la recherche.

### Corollaire de méthode — le témoin de la règle #3 ne peut pas tomber contre le code d'AVANT

Quatre des neuf témoins du lot passaient déjà avant le correctif : ceux du rang 1, et ceux où
la langue d'origine gagne. C'est attendu et ce n'est pas un défaut du lot — **ils gardent le
mode d'échec du CORRECTIF, pas celui du défaut.** Une descente écrite naïvement (« prendre la
première traduction disponible ») servirait « Bonjour » là où le message est déjà écrit dans
la langue de rang 2 du lecteur. Un lot qui n'écrit que les témoins rouges contre l'état
antérieur livre un correctif dont le propre mode d'échec n'est gardé par rien.

### Le suivi, MESURÉ (leçon 107) et non hérité

Deux des trois éventails de `messageNotificationFanOut` n'appliquent **aucun** Prisme :
`createReplyNotification` et `createMentionNotification` posent `content: params.messagePreview`
— l'original — et ne poussent ni `translatedContent` ni `translatedLanguage`. Vérifié en
ouvrant les deux méthodes, pas déduit de la forme du lot. Défaut DISTINCT (absence du Prisme,
pas un mauvais rang), et c'est pourquoi il n'a pas été absorbé ici : deux éventails aux
sémantiques de garde différentes dans le même lot, c'est le demi-correctif que le cycle 120
recommande précisément d'éviter — **corriger le résolveur pour tous, câbler les surfaces une
par une.** Le résolveur est partagé et juste ; il ne manque que la liste en entrée.
