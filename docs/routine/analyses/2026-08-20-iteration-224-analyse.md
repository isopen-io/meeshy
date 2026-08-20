# Iteration 224 — Parité cross-platform des tables de réduction de langue (TS ↔ Swift)

## Protocole (démarrage)
`main` @ `3ccd8a72` (dernier commit : `feat(android): gate opening a locked conversation behind its PIN code (#3221)`).
Branche `claude/brave-archimedes-wyyzir` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install --ignore-scripts` + `prisma generate` + `bun run build` (parité CI).
Runner shared : **Vitest 4.1.10** (`packages/shared`, 92 suites / 2297 tests verts au démarrage).

PRs ouvertes au démarrage — **audit anti-doublon** (12 PRs). Une famille active de correctifs
`$`-sequence est en cours (#3218/#3220/#3222 : emails d'ami, alertes d'appel vidéo) — c'est
exactement la « Future Consideration » de l'itération 221 (EmailService, noms d'affichage). **Cette
itération n'y touche PAS.** Aucune PR ouverte ne touche `packages/shared/utils/language-normalize.ts`
ni la table Swift `iso639ReductionMap` (`AuthModels.swift`). Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — durcir la SSOT du Prisme Linguistique (parité cross-platform non gardée)**

La résolution de langue (`resolveUserLanguage`, `resolveLastMessagePreview`, `normalizeLanguageCode`)
est le cœur du produit et est déjà exhaustivement testée EN COMPORTEMENT côté TS (146 tests sur ces
seuls helpers, règle #3 du Prisme couverte des deux côtés). Le trou n'est pas dans le comportement :
il est dans l'**invariant cross-platform** qui le sous-tend.

`normalizeLanguageCode` réduit un identifier hétérogène (BCP-47, ISO 639-2/3, aliases 639-1 dépréciés)
vers un code Meeshy supporté, via DEUX tables explicites :
- `ISO_639_3_TO_1` — 64 entrées (`eng→en`, `swe→sv`, `deu`/`ger→de`, `zho`/`chi→zh`…)
- `LEGACY_ISO_639_1` — 3 entrées (`iw→he`, `in→id`, `ji→yi`, aliases émis par la JVM/Android)

Ces tables existent **en double** : le miroir Swift `iso639ReductionMap` + `legacyISO6391Map`
(`MeeshyUser.normalizeLanguageCode`, `packages/MeeshySDK/.../Auth/AuthModels.swift`). iOS et le web
rendent la MÊME ligne depuis la MÊME charge REST.

## Current state (avant correctif)

Les deux tables TS et leurs jumelles Swift sont, au moment de l'audit, **rigoureusement identiques**
(vérifié entrée par entrée). Mais l'invariant « les deux tables sont égales » ne tient QUE par une
consigne en commentaire, répétée aux quatre sites :

> « Miroir Swift à maintenir synchrone » / « Toute évolution DOIT toucher les deux sites (TS + Swift) »

Rien ne l'atteste. Le test unitaire existant (`language-normalize.test.ts`) prouve le COMPORTEMENT du
resolver TS ; il ne lit jamais le Swift et ne verrait donc aucune dérive du miroir.

## Problems identified

1. **Invariant cross-platform non gardé.** Ajouter une entrée à `ISO_639_3_TO_1` (ex. `tgl: 'tl'` si
   le Tagalog devient supporté) en oubliant le Swift — ou l'inverse — passe tous les tests, la revue,
   et le merge. La dérive ne se constate qu'en production, sur un utilisateur précis.
2. **Classe de bug à impact Prisme silencieux.** Une divergence sert un texte différent selon le
   client : un utilisateur suédois (`swe`), philippin (`fil`, dont le rejet DOIT rester symétrique),
   ou un client Android sur locale hébraïque (`iw`) reçoit la mauvaise langue — violation directe du
   Prisme Linguistique, exactement la classe de collision que ces tables ont été créées pour éliminer
   (cf. commentaires de `language-normalize.ts` : `fil→fi`, `swe→sw` étaient les bugs d'origine).

## Root causes
- Une règle dupliquée sur deux plateformes, protégée uniquement par la discipline humaine — le même
  anti-patron que `password-min-length-parity.test.ts` a fermé pour la longueur de mot de passe
  (« une règle dupliquée en onze endroits dérive au premier changement »), et que `messageMentions.ts`
  / `referenceAccess.ts` ferment pour les règles d'accès (« quand une règle vit dans les appelants, il
  suffit d'un nouvel appelant pour la perdre »).

## Business impact
- Un compte reçoit des textes dans une langue différente selon qu'il ouvre l'app sur iOS ou sur le web,
  pour toute langue dont la réduction dériverait entre les deux tables. Incohérence de la fonction la
  plus centrale du produit, invisible jusqu'au signalement utilisateur.

## Technical impact
- Convertit un invariant « discipline » en invariant **enforced par CI**. Zéro changement de
  comportement de production : la seule modification de code source est l'export de deux constantes
  jusque-là privées au module (données pures, SSOT légitimement publique). Aucun changement de contrat,
  de schéma, ni d'API runtime.

## Risk assessment
**Très faible.**
- Le seul diff de production est `const` → `export const` sur `ISO_639_3_TO_1` et `LEGACY_ISO_639_1`
  (additif, immuables `Readonly<Record>`). `tsc` vert, 2297/2297 tests shared verts.
- Le test lit le Swift comme TEXTE et compare des objets parsés — il n'exécute ni ne réimplémente le
  resolver Swift, donc pas de « témoin qui recopie la production ». Contre-épreuve intégrée : la taille
  du map Swift parsé est ancrée (`> 50` / `> 0`) pour qu'une extraction cassée ne « passe » pas contre
  un TS vidé.

## Proposed improvements
1. Exporter `ISO_639_3_TO_1` et `LEGACY_ISO_639_1` depuis `utils/language-normalize.ts`.
2. Ajouter `__tests__/language-normalize-swift-parity.test.ts` : parse les deux dictionnaires Swift
   nommés depuis `AuthModels.swift` et prouve leur égalité stricte avec les tables TS.

## Expected benefits
- Toute dérive future d'une seule plateforme tombe au ROUGE en CI, sur le fichier fautif, avant merge.
- La consigne en commentaire cesse d'être le seul rempart de l'invariant.

## Implementation complexity
Très faible : +2 mots-clés `export`, +1 fichier de test (2 cas), extraction regex bornée par le nom de
déclaration.

## Validation criteria
- RED prouvé : ajout temporaire de `tgl: 'tl'` au seul TS ⇒ le cas `iso639ReductionMap` tombe
  (`expected …(64) to deeply equal …(65)`, diff `- "tgl": "tl"`). Reverté.
- GREEN : 2/2 sur la nouvelle suite ; `language-normalize` + `conversation-helpers` +
  `resolve-participant-language` = 146 verts ; suite shared complète 2297/2297 ; `tsc` vert.

## Future Considerations
- **Parité du SET de codes supportés.** Les deux resolvers re-valident la cible réduite contre leur
  propre liste de codes supportés (`getSupportedLanguageCodes()` TS vs `LanguageData.supportedCodeSet`
  Swift). Une divergence de CES listes ferait diverger `normalizeLanguageCode` même avec des tables de
  réduction identiques (ex. `swe→sv` accepté côté TS, `nil` côté Swift si `sv` manquait). Guarder cette
  parité est un effort plus large (liste Swift volumineuse) — candidat itération suivante.
- **Miroir Android.** `Presence.kt` et consorts sont cités comme 3e plateforme miroir ailleurs ; si une
  table de réduction de langue apparaît côté Kotlin, l'étendre à ce garde.
- **Généralisation du patron.** Un helper `assertSwiftStringMapEquals(source, name, tsMap)` factoriserait
  ce garde pour les futures tables jumelles TS↔Swift (couleurs de présence, flags d'effet…).
