# Cycle 119 — La règle 3 du Prisme était écrite, et le résolveur AUDIO du web disait l'inverse

Date : 2026-08-24
Branche : `claude/keen-hamilton-gl4sjg`
Périmètre : `apps/web/hooks/use-audio-translation.ts` (+ son témoin)

---

## 1. Point de départ — le suivi du cycle 118, et pourquoi il n'a PAS été suivi

Le cycle 118 laissait trois suivis, dont un annoncé comme « le plus intéressant du
trois » : la moitié SOCKET de l'aperçu Android — `ConversationUpdatedSocketEvent`
ne déclare que `{conversationId, title, description, avatar, updatedAt}`, aucun
champ du groupe d'aperçu.

**La déclaration est exacte ; sa conséquence ne l'est pas.** Mesuré dans le
dépôt : `ConversationListViewModel.kt:414` collecte `conversationUpdated` et
appelle `requestRefresh()` — une revalidation `GET /conversations` fusionnée par
un `Channel.CONFLATED`. La rangée Android **se met donc bien à jour** sur
`conversation:updated` ; elle le fait par relecture au lieu d'appliquer le delta.
C'est une question de bavardage réseau, pas de justesse, et le journal 118 la
présentait comme « la parité TEMPS RÉEL » manquante.

> Application directe de la leçon 107 : **un suivi hérité est une AFFIRMATION, il
> se mesure avant d'être exécuté.** Ce cycle-ci l'a mesuré et a changé de cible —
> le journal précédent avait raison sur le MÉCANISME et tort sur l'effet.

Les deux autres suivis (les widgets Android, l'octet NUL de
`ConversationListViewModel.kt`) restent ouverts et inchangés.

---

## 2. Ce que l'audit a trouvé à la place

`/CLAUDE.md` § « Règles critiques du Prisme » #3 énonce, en toutes lettres :

> **La langue d'origine concourt à son RANG dans le prisme, jamais comme
> court-circuit.** […] Ne JAMAIS écrire « si la langue d'origine appartient au
> prisme ⇒ afficher l'original » […] Prisme `['fr','en']`, message anglais,
> traduction française disponible ⇒ **« Bonjour »**, jamais « Hello ».

`apps/web/hooks/use-audio-translation.ts`, seul siège de l'auto-sélection de
langue du lecteur audio web, écrivait la phrase interdite **mot pour mot** :

```ts
const originalLang = transcription?.language ?? initialTranscription?.language;
if (originalLang && userLanguages.includes(originalLang)) return 'original';  // ← interdit
for (const lang of userLanguages) {
  if (audios.find(t => t.targetLanguage === lang && t.url)) return lang;
}
```

Le test d'appartenance précède la boucle : dès que la langue d'origine figure
**n'importe où** dans le prisme, l'original gagne, quel que soit son rang.

### Conséquence, et elle est MÉCANIQUE

La règle 2 du Prisme fait entrer la **locale appareil au rang 4**. Tout lecteur
dont l'appareil n'est pas dans sa langue applicative a donc un prisme d'au moins
deux langues — c'est le cas nominal, pas un cas limite. Pour lui :

| prisme | vocal reçu | piste `fr` disponible | attendu | servi (avant) |
|---|---|---|---|---|
| `['fr','en']` | anglais | oui | **piste française** | original anglais |

Un francophone sur iPhone/navigateur en anglais recevait **tous** les messages
vocaux anglais en anglais — transcription ET piste audio jouée, puisque
`selectedLanguage` pilote les deux (`currentAudioUrl`, `currentAudioDuration`) —
alors que le même contenu en TEXTE lui arrivait en français. C'est exactement le
défaut de cohérence que le Prisme existe pour empêcher : « le prisme s'applique à
TOUT le contenu — messages texte, transcriptions audio, métadonnées, aperçus ».

---

## 3. Pourquoi les témoins ne pouvaient pas tomber

La suite portait **62 témoins verts**, dont deux qui nomment précisément cette
résolution :

- `returns original when original language matches user preference` — original
  `fr`, prisme `['fr','en']` ;
- `uses the live transcription language […] to guard the Prisme "already
  preferred" rule` — original `fr`, prisme `['fr','en']`, traduction `en`.

**Les deux placent la langue d'origine au RANG 1.** Or au rang 1, le
court-circuit et la règle juste rendent le MÊME verdict : `'original'`. Les deux
témoins sont donc restés verts sous le correctif, sans une ligne modifiée — ils
n'attestaient pas la règle, ils attestaient le seul point où les deux lectures
coïncident.

> **Nouvelle forme de « un témoin qui ne peut pas tomber ».** Les formes connues
> portaient sur l'ASSERTION (elle accepte les deux issues) ou sur le HARNAIS (il
> saute la couche testée). Celle-ci porte sur la **FIXTURE** : l'assertion est
> juste, le harnais est bon, et c'est le jeu de données qui place les deux règles
> concurrentes en accord. Le témoin du cycle 118 avait exigé un prisme
> `["en","fr"]` plutôt que `["en"]` pour cette raison exacte ; la même exigence
> n'avait pas été portée ici.
>
> Corollaire opposable : **le témoin d'une règle de RANG doit exercer un rang
> autre que le premier.** Sinon il ne mesure pas un ordre, il mesure une
> présence.

---

## 4. Le correctif

Déplacer le test d'origine DANS la boucle — la forme canonique, déjà écrite trois
fois ailleurs dans le dépôt :

```ts
for (const lang of userLanguages) {
  const lower = lang.toLowerCase();
  if (originalLang && lower === originalLang) return 'original';
  const match = audios.find(t => t.targetLanguage.toLowerCase() === lower && t.url);
  if (match) return match.targetLanguage;
}
return 'original';
```

Deux points qui ne sont pas cosmétiques :

- **Comparaison insensible à la casse.** `userLanguages` sort minusculé de
  `resolveUserLanguagesOrdered`, mais la langue d'origine vient de Whisper et la
  langue cible du pipeline TTS : les deux côtés de la comparaison n'ont pas le
  même producteur. `AudioTrackLanguageResolver` (iOS) minuscule déjà les deux.
- **Le code rendu est celui qui est STOCKÉ**, pas la forme minusculée.
  `currentAudioUrl` / `currentAudioDuration` retrouvent leur piste par égalité
  **stricte** sur `targetLanguage` (lignes 295/305/319) : rendre `lower` ferait
  élire la bonne langue puis manquer sa piste, et le lecteur retomberait en
  silence sur l'audio original — le défaut d'origine, réintroduit par le
  correctif. Gelé par un témoin dédié, prouvé rouge par mutation.

---

## 5. Le balayage des JUMELLES — la partie qui explique le défaut

La règle 3 gouverne **toute** résolution de prisme. Le dépôt en compte deux
familles, et une seule est énumérée par la règle :

| famille | sites | conformes |
|---|---|---|
| **Aperçu de liste** (énumérée par `/CLAUDE.md` #3) | `resolveLastMessagePreview` (TS/web), `MeeshyConversation.resolvedLastMessagePreview` (iOS), `LastMessagePreviewResolver.kt` (Android) | 3/3 ✅ |
| **Audio** (énumérée nulle part) | `AudioTrackLanguageResolver` (iOS), `resolveTranslatedAudio` (Android), `use-audio-translation` (**web**) | 2/3 ❌ |

C'est la leçon 260 (« *jumelles* est un COMPTE ») déplacée d'un cran : le compte
énuméré était JUSTE — les trois résolveurs d'aperçu portent bien la règle — et
c'est son exhaustivité apparente qui a rendu invisible la **seconde famille de
trois**, gouvernée par la même règle et jamais recensée.

> **Une énumération de sites porte deux affirmations, pas une** : « ces sites-là
> appliquent la règle » (vérifiable, et vraie ici) et « ce sont les sites où la
> règle s'applique » (rarement vérifiée, fausse ici). La seconde est la
> dangereuse, parce que la première la fait lire comme acquise.

Balayages menés, tous à vide sauf le site corrigé :

- TS/TSX (`apps/web`, `packages/shared`, `services/gateway`) : `includes(original…)`
  → aucun autre site ;
- Swift : `preferredLanguages.contains(…)` → 4 occurrences, toutes des **filtres
  d'admission** sur une traduction ARRIVANTE (« cette langue intéresse-t-elle le
  lecteur ? »), question distincte et correctement écrite ;
- Kotlin : aucune occurrence ;
- Web, autres surfaces audio : `useAudioTranslation` est consommé par le seul
  `SimpleAudioPlayer` ; `TranscriptionViewer` reçoit `selectedLanguage` en prop
  et ne le sème pas. La correction couvre donc toute la surface audio du web.

---

## 6. Vérifié / non vérifié — la distinction est la mesure

- [x] **ROUGE prouvé** sur le témoin de rang : `Expected "fr", Received "original"` —
      le symptôme exact décrit au §2, pas une approximation.
- [x] **ROUGE prouvé** sur le témoin de casse, et il tombe dans la direction
      OPPOSÉE (`Expected "original", Received "fr"`) : les deux gardes sont
      indépendantes, aucune ne subsume l'autre.
- [x] **ROUGE prouvé par MUTATION** sur le témoin « code stocké » (`return lower`
      au lieu de `return match.targetLanguage`) : exactement 1 échec sur 65.
- [x] **65/65 verts** après correctif, dont les **62 préexistants** — dont les deux
      témoins de rang 1, inchangés : la correction ne redéfinit rien de ce qui
      marchait.
- [x] Suites audio voisines vertes : `SimpleAudioPlayer`, `use-audio-playback`,
      `use-audio-translation` — 95/95.
- [x] **Cliquet de dette de types inchangé** : 1196, `EXIT=0` lu directement et
      non à travers un pipe (leçon du cycle « un gate rend DEUX verdicts »).
- [ ] **ESLint non exécutable ICI**, et ce n'est pas ce lot : l'`eslint` global du
      conteneur est en 10.1.0 et `eslint-plugin-react@7.37.5` y lève
      `contextOrFilename.getFilename is not a function` **sur des fichiers que ce
      lot ne touche pas** (`utils/user-language-preferences.ts` vérifié). Le
      verdict vient de la CI, qui installe la version épinglée.

---

## 7. Reste ouvert — nommé, avec sa raison

- [ ] **`BubbleAttachmentView.swift` — branche `.audio` MORTE, sous un commentaire
      FAUX.** Le commentaire dit servir « les attachments audio mixés à un autre
      contenu de la bulle » ; mesuré dans `BubbleContentBuilder.swift:214`,
      `nonMedia` ne retient que `.file` et `.location`, et un message mixte range
      son audio dans `.mixed(audio:)` → `audioAttachments` → le widget autonome.
      Aucun audio n'atteint donc cette branche, qui est par ailleurs le seul
      site iOS ne passant pas `initialTranscriptionLanguage` — un piège armé au
      sens du cycle 84 : la première personne qui rebranche ce chemin y perd le
      Prisme sans qu'un témoin tombe. Non corrigé ici : toute modification iOS
      exige `./apps/ios/meeshy.sh test`, indisponible dans ce conteneur Linux.
- [ ] **Commentaire périmé, Android → iOS.** `BubbleContentBuilder.kt:288-291`
      affirme qu'iOS « defaults to the original and requires a manual language
      pick ». C'était vrai ; ça ne l'est plus depuis que
      `ConversationMediaViews.swift` passe `resolvedPreferredTranscriptionLanguage`
      sur ses trois sites. Même famille que le commentaire d'impossibilité du
      cycle 108 : il n'était pas faux au départ, il l'est DEVENU, et il décrit un
      client que son lecteur n'ira pas vérifier.
- [ ] Les deux suivis 118 non traités : widgets d'écran d'accueil Android sans
      prisme, et l'octet NUL de `ConversationListViewModel.kt` (lignes 539/551)
      qui classe le fichier BINAIRE pour `git` et `grep`.
