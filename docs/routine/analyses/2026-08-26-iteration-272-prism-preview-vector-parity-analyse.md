# Itération 272 — Analyse : la résolution du Prisme sur l'aperçu de liste a TROIS miroirs et AUCUN témoin de parité machine

## État courant

La règle la plus documentée du dépôt — le **Prisme Linguistique** appliqué à
l'aperçu de dernier message d'une ligne de conversation — vit en **trois
miroirs**, que CLAUDE.md nomme explicitement source de vérité, « toute évolution
touche les TROIS » :

| plateforme | site | forme |
|---|---|---|
| TypeScript (web) | `resolveLastMessagePreview()` (`packages/shared/utils/conversation-helpers.ts`) | projection de `resolvePrismTranslation()` |
| Swift (iOS) | `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` (`packages/MeeshySDK/.../Models/CoreModels.swift`) | méthode sur le modèle domaine |
| Kotlin (Android) | `resolveLastMessagePreview()` (`apps/android/core/model/.../lang/LastMessagePreviewResolver.kt`) | fonction top-level |

Chacun des trois est couvert par une suite de tests **écrite à la main** :
`resolve-last-message-preview.test.ts` / `resolve-prism-translation.test.ts` (TS),
`ConversationPrismeResolutionTests.swift` (iOS),
`LastMessagePreviewResolverTest.kt` (Android).

## Problèmes identifiés

### 1. Parité affirmée en PROSE, gardée par RIEN

L'en-tête de la suite Android le dit mot pour mot :

> *One-for-one mirror of `packages/shared/__tests__/utils/resolve-last-message-preview.test.ts`
> and of `ConversationPrismeResolutionTests.swift` (iOS).*

La suite iOS porte la même affirmation. Or **« one-for-one mirror » n'est vérifié
par aucun témoin** : ce sont trois copies parallèles de cas de test, entretenues
à la main. Rien ne force les trois listes à couvrir les mêmes cas, ni à s'accorder
sur le résultat attendu de chacun. Ajouter un cas à l'une n'ajoute rien aux deux
autres ; corriger le résultat attendu de l'une peut la faire diverger des deux
autres sans qu'aucun build ne rougisse.

### 2. C'est le trou « N miroirs, zéro témoin de parité » (leçons 291/292)

Les autres règles cross-plateforme comparables ont, elles, un **fichier de
vecteurs partagé** rejoué par les trois clients : `accent.vectors.json` (couleur
d'accent, 24 cas), `bridge.vectors.json`, `sections.vectors.json`,
`sort.vectors.json`, etc. — douze contrats dans
`packages/shared/fixtures/reading-modes/`. La résolution du Prisme sur l'aperçu —
**la règle produit centrale de Meeshy** — n'en avait AUCUN.

C'est précisément la condition sous laquelle un miroir dérive en silence. Le
précédent est dans CLAUDE.md : au cycle 118, `ApiConversation` (Android) ne
déclarait ni `lastMessageTranslations` ni `lastMessageOriginalLanguage` ; le
décodeur les jetait, et la ligne de liste restait dans la langue de l'expéditeur
pour tout utilisateur Android — pendant que web et iOS servaient la traduction.
Un témoin de parité machine aurait rougi le jour de l'écriture du décodeur.

## Cause racine

La règle du Prisme a été portée client par client (web d'abord, iOS, puis Android
au cycle 118), chaque port dupliquant les cas de test dans le langage cible. La
duplication est la bonne stratégie POUR l'implémentation (chaque plateforme a son
idiome) mais la mauvaise POUR le contrat : un contrat cross-plateforme doit être
une donnée unique que les trois exécutent, pas trois copies de code.

## Impact métier

Le Prisme est la promesse produit nº 1 de Meeshy (« l'utilisateur consomme tout
le contenu dans sa langue principale, sans friction »). Une divergence de
résolution sur l'aperçu de liste — la surface la plus vue de l'app — montre au
MÊME compte deux textes différents selon le téléphone d'où il lit. Le défaut du
cycle 118 était exactement cela, resté invisible jusqu'à une revue manuelle.

## Impact technique

- Aucune garantie que les trois suites couvrent le même espace de cas.
- Toute évolution de la règle doit être re-portée à la main dans trois suites,
  sans filet.
- La revue humaine est le seul rempart contre la divergence — coûteux et
  faillible.

## Vérification préalable (le geste de la leçon 292)

Avant d'écrire le témoin, j'ai **rejoué le contrat par lecture sur les trois
sites** — le premier geste que la leçon 292 impose (« ne pas présumer que les
miroirs coïncident ; regarder »). Les trois résolveurs s'accordent sur l'espace
de cas retenu : descente ordonnée, langue d'origine à son rang, règle #1 (jamais
de repli sur une traduction quelconque), normalisation région/casse, entrées
vides ignorées, aperçu original rendu en l'absence de correspondance. **Aucun bug
caché** comme celui de l'accent au cycle 271 — la parité est réelle aujourd'hui ;
ce qui manquait était sa garde.

**Un écart de forme volontairement HORS contrat** : une carte à deux clés
canonisant vers la même langue (`{'pt':…, 'pt-BR':…}`, prisme `['pt']`). TS retient
la PREMIÈRE entrée (`Map.has → continue`), Android/iOS la DERNIÈRE (`HashMap.put` /
subscript de dictionnaire). Cet écart ne se produit jamais en production (le
gateway n'émet qu'une clé canonique par langue) ; l'encoder déclarerait un miroir
« en faute » sur un cas impossible. Le fichier documente l'exclusion.

## Amélioration proposée (implémentée)

Créer `packages/shared/fixtures/reading-modes/prism-preview.vectors.json` — le
CONTRAT machine, 22 cas `{input, expected}` — et le faire rejouer par les trois
plateformes via leur API RÉELLE de production (jamais une réimplémentation de la
boucle dans le test) :

- **TS** : `prism-preview.vectors.test.ts` via le harnais `runVectors` existant →
  `resolveLastMessagePreview`.
- **Android** : `PrismPreviewVectorParityTest.kt` (module `core/model`), charge le
  JSON en remontant l'arborescence (idiome d'`AccentVectorParityTest`) →
  `resolveLastMessagePreview`.
- **iOS** : `PrismPreviewVectorTests.swift` (target `MeeshyTests`), charge le JSON
  depuis le bundle (`fixtures/reading-modes/`, déjà câblé `type: folder`) →
  `MeeshyConversation.resolvedLastMessagePreview`.

## Bénéfices attendus

- La prose « one-for-one mirror » devient un fait machine-vérifié sur les trois CI.
- Toute évolution future de la règle a un point d'ancrage unique : le vecteur ; un
  miroir qui n'adopte pas le nouveau cas rougit.
- Le mode d'échec du cycle 118 (un client qui jette une donnée du payload) est
  désormais gardé sur les trois plateformes.

## Complexité d'implémentation

Faible. Aucun code de production modifié ; uniquement une donnée de contrat et
trois rejeux qui empruntent des motifs déjà éprouvés (harnais de vecteurs
existant, folder reference iOS déjà câblée, walk-up Android déjà en place pour
l'accent).

## Critères de validation

- TS : `vitest run` vert sur les 22 cas (**FAIT** — 22/22, suite shared complète
  111 fichiers / 2672 tests verte).
- Android : `android.yml` (`assembleDebug` + `testDebugUnitTest`) vert sur le
  nouveau rejeu — validé par la CI GitHub (toolchain Android indisponible en
  local dans ce conteneur ; cf. `android.yml` en-tête).
- iOS : `ios.yml` (compile-only PR gate) vert — validé par la CI GitHub.

## Suivi

- iOS/Android sont validés par leurs CI respectives (déclenchées par les chemins
  `apps/ios/**` et `apps/android/**` du PR). Sur rouge, corriger le miroir (jamais
  le vecteur : le TS est la source vérifiée).
- Prochaine cible du même angle : les AUTRES familles de résolveurs du Prisme
  énumérées dans CLAUDE.md (audio, posts/commentaires) — ont-elles un contrat
  machine cross-plateforme, ou seulement des suites à la main ?
