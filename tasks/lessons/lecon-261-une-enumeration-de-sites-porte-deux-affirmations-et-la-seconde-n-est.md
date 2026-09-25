## Leçon 261 — Une énumération de sites porte DEUX affirmations, et la seconde n'est jamais vérifiée

**Cycle 119.** `/CLAUDE.md` § « Règles critiques du Prisme » #3 énonce la règle de
RANG — « la langue d'origine concourt à son rang, jamais comme court-circuit » —
puis nomme ses sites : « Sources de vérité, une par client : `resolveLastMessagePreview()`
… `MeeshyConversation.resolvedLastMessagePreview` … et `LastMessagePreviewResolver.kt`
— toute évolution touche les TROIS. »

Les trois sont conformes. Le compte est juste. Et le dépôt porte une **seconde
famille de trois résolveurs**, gouvernée par la MÊME règle et recensée nulle part :
`AudioTrackLanguageResolver` (iOS), `resolveTranslatedAudio` (Android), et
`use-audio-translation` (web). Le troisième écrivait la phrase interdite mot pour
mot :

```ts
if (originalLang && userLanguages.includes(originalLang)) return 'original';
for (const lang of userLanguages) { … }
```

> Une énumération de sites affirme deux choses : **« ces sites-là appliquent la
> règle »** — vérifiable, et vraie ici — et **« ce sont les sites où la règle
> s'applique »** — presque jamais vérifiée. C'est l'exactitude de la PREMIÈRE qui
> fait lire la seconde comme acquise.

Prolongement direct de la leçon 260 (« *jumelles* est un COMPTE, et un compte se
vérifie ») d'un cran vers le haut : là-bas le nombre était devenu faux ; ici il est
resté JUSTE, et c'est le PÉRIMÈTRE qui ne l'a jamais été. Devant toute énumération
qui accompagne une règle, la question n'est donc pas seulement « combien y en
a-t-il aujourd'hui ? » mais **« cette règle gouverne-t-elle un autre TYPE DE
CONTENU, et qui le résout ? »**. Le Prisme le disait lui-même deux paragraphes
plus haut — « le prisme s'applique à TOUT le contenu : messages texte,
transcriptions audio, métadonnées, aperçus » — et l'énumération, elle, ne couvrait
que le dernier.

### Corollaire — le témoin d'une règle de RANG doit exercer un rang AUTRE que le premier

La suite portait 62 témoins verts, dont deux qui nomment cette résolution
exactement. Les deux placent la langue d'origine au **rang 1** — où le
court-circuit et la règle juste rendent le MÊME verdict. Ils sont restés verts
sous le correctif, sans une ligne modifiée.

C'est une troisième forme de « un témoin qui ne peut pas tomber », et la plus
discrète. Les deux connues portent sur l'ASSERTION (elle accepte les deux issues)
ou sur le HARNAIS (il saute la couche testée). Celle-ci porte sur la **FIXTURE** :
l'assertion est juste, le harnais est bon, et c'est le jeu de données qui place
les deux règles concurrentes en accord.

> **Un témoin de RANG écrit sur le rang 1 ne mesure pas un ordre, il mesure une
> présence.** L'écart entre « appartient au prisme » et « gagne à son rang »
> n'existe qu'à partir du rang 2 : c'est là, et seulement là, que le témoin doit
> être écrit.

Le cycle 118 avait déjà payé cette leçon dans sa variante voisine — son témoin
exigeait un prisme `["en","fr"]` plutôt que `["en"]`, faute de quoi il passait
« pour la mauvaise raison ». La même exigence n'a pas été portée à la famille
audio, parce que rien ne disait qu'elle en était une.

### Corollaire — une règle de sélection rend une CLÉ, et la clé doit rester opposable

Le correctif compare les codes de langue en minuscules (les deux côtés ont des
producteurs différents : `resolveUserLanguagesOrdered` d'un côté, Whisper et le
pipeline TTS de l'autre) mais rend le `targetLanguage` **tel qu'il est stocké**.
Trois lecteurs en aval (`currentAudioUrl`, `currentAudioDuration`, la
transcription courante) retrouvent leur piste par égalité **stricte** sur ce
champ : rendre la forme normalisée ferait élire la bonne langue puis manquer sa
piste, et le lecteur retomberait en silence sur l'audio original — c'est-à-dire
le défaut qu'on vient de corriger, réintroduit par le correctif lui-même.

> Quand on normalise pour COMPARER, la question suivante est : **ce que je rends
> est-il une valeur d'affichage, ou une clé que quelqu'un va rapprocher d'une
> autre table ?** Normaliser la comparaison est presque toujours juste ;
> normaliser la valeur RENDUE ne l'est que si tous ses lecteurs normalisent
> aussi. Gelé ici par un témoin prouvé rouge par mutation — le seul moyen de
> montrer qu'une décision de cette forme est gardée.

### Corollaire de méthode — mesurer un suivi hérité AVANT de l'exécuter

Ce cycle devait traiter le suivi que le cycle 118 annonçait comme « le plus
intéressant » : la rangée Android qui « ne se met à jour que par REST et par
`message:new` », faute de champs d'aperçu sur `ConversationUpdatedSocketEvent`.
La déclaration de forme est exacte ; la conséquence ne l'est pas —
`ConversationListViewModel.kt:414` collecte l'événement et déclenche une
revalidation fusionnée, donc la rangée se met bien à jour. Bavardage réseau, pas
défaut de justesse.

Application littérale de la leçon 107 (« un suivi hérité est une AFFIRMATION »),
avec ceci de notable : **c'est en mesurant le suivi qu'on a eu le temps de
chercher ailleurs.** L'exécuter sur parole aurait produit un lot vert, propre et
sans effet — le résultat par défaut décrit au cycle 106.
