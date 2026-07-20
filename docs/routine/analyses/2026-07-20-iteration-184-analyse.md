# Iteration 184 — `CommonSchemas.language` : la borne `.max(5)` contredit la regex et rejette la forme `code-639-3 + sous-tag région` (`bas-CM`) — fix partiel incomplet

## Protocole (démarrage)
`main` @ `a0e5279` (derniers merges : android/calls call-transcript-buffer #2169,
ios/a11y #2165, ios/story timeline, android/calls call-reliability #2166 & datachannel
#2160, shared/i18n ISO 639-3 #2067, shared/validators contrat attachmentTranslationsMap
itér. 183 #2132). Branche `claude/brave-archimedes-z7wvon` réinitialisée sur
`origin/main`. Ce cycle prend **184**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript. Harnais **vitest de `packages/shared`** opérationnel (`bun install` OK,
`node_modules/.bin/vitest` présent). Priorité 1 (features récentes) : les merges
les plus récents sont Android/iOS (Kotlin/Swift, non testables ici). Priorité 2/3 :
revue des utilitaires purs `packages/shared` — extrêmement matures (mention-parser,
call-summary, conversation-helpers, email-validator, normalizeLanguageCode tous
audités, aucun défaut résiduel). Le **seul défaut net à haute confiance** est une
contradiction interne dans le validateur de langue de trust-boundary — cible de
cette itération.

## Current state
`packages/shared/utils/validation.ts:91` définit le validateur de code langue
utilisé sur `sendMessage.originalLanguage` / `editMessage.originalLanguage`
(REST + `messages-advanced.ts` posts) :

```ts
language: z.string().min(2).max(5).regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Code langue invalide'),
```

La regex accepte délibérément :
- un corps ISO 639-1 (2 lettres) **OU** ISO 639-3 (3 lettres) — `[a-z]{2,3}` ;
- un sous-tag région BCP-47 optionnel `(-[A-Z]{2})?`.

La longueur maximale d'une chaîne acceptée par la **regex** est donc
`[a-z]{3}` + `-` + `[A-Z]{2}` = **6 caractères** (`bas-CM`). Mais la borne
`.max(5)` plafonne la longueur à **5**. Les deux contraintes se contredisent
pour les codes 639-3 régionalisés.

## Problems identified
1. **Contradiction longueur ↔ regex (correctness).** `CommonSchemas.language.safeParse('bas-CM')`
   échoue avec `too_big` (`.max(5)`, longueur 6) alors que la regex
   `[a-z]{2,3}(-[A-Z]{2})?` **matche** `bas-CM`. Vérifié empiriquement :
   `bas-CM`, `ewo-CM`, `ksf-CM` → **REJECTED: too_big**. `en-US`, `fr-FR`
   (2-lettres + région, 5 car.) passent — le bug ne touche que la combinaison
   **corps 3-lettres + région**.
2. **Fix partiel non terminé.** Le commit qui a relâché le corps `{2}` → `{2,3}`
   documente sa propre motivation (validation.ts:88-90) : « Le corps `{2}` seul
   rejetait tout code 639-3 sur sendMessage/editMessage alors que
   systemLanguage/regionalLanguage les acceptent — incohérence qui bloquait
   l'envoi dans une langue supportée. » Ce commit a corrigé la regex mais a
   **laissé `.max(5)`**, qui rejette encore la même classe d'entrée
   (langue supportée non-envoyable) dès qu'un sous-tag région accompagne un
   code 3-lettres.
3. **Trou de couverture ayant masqué le bug.** `__tests__/validation.test.ts`
   teste séparément « accepte les codes 639-3 3-lettres » (`bas`, `ksf`, …,
   sans région) ET « accepte un sous-tag région BCP-47 » (`en-US`, corps
   2-lettres). Aucun test ne couvre leur **combinaison** (`bas-CM`) — précisément
   le cas où `.max(5)` casse.

## Root causes
`bas`, `ksf`, `nnh`, `dua`, `ewo` sont des langues camerounaises **first-class**
dans `packages/shared/utils/languages.ts` (`code: 'bas'` … confirmé) et préservées
verbatim par `normalizeLanguageCode`. La forme régionalisée `bas-CM` est un
identifier BCP-47 légitime (corps 639-3 + région ISO 3166-1) q\'un client
(iOS `Locale.current.identifier`, intégration tierce) peut émettre comme
`originalLanguage`. La borne `.max(5)` a été copiée de l'ancien contrat
2-lettres (`xx` / `xx-XX`, max 5) et n'a jamais été rehaussée quand le corps est
passé à 3 lettres — la borne longueur et la regex ont divergé.

## Business impact
Réel sur le Prisme Linguistique : un utilisateur émettant dans une langue
camerounaise supportée avec un identifier régionalisé (`bas-CM`) reçoit un **400
VALIDATION** au lieu d'un envoi. C'est exactement la régression que le commit
`{2}`→`{2,3}` visait à supprimer — restée ouverte pour les codes régionalisés.
Impact d'inclusion linguistique (langues sous-représentées) et de cohérence
in-app (systemLanguage/regionalLanguage acceptent ces codes, pas le send).

## Technical impact
- Contrat de `CommonSchemas.language` **cohérent** : la borne longueur cesse de
  contredire la regex ; toute chaîne matchée par la regex est désormais acceptée.
- Zéro élargissement sémantique : la regex reste l'unique gardien de la **forme**.
  `.max(6)` ne laisse passer aucune chaîne que la regex ne matchait déjà (max
  regex = 6). Aucune valeur aujourd'hui acceptée ne change de verdict.

## Risk assessment
Très faible. Un seul caractère change (`5` → `6`). Aucune valeur actuellement
valide ne devient invalide ; seules `xxx-XX` (639-3 + région, matchées par la
regex, jusque-là rejetées à tort) deviennent valides. Aucune forme persistée
modifiée (la valeur passe verbatim). Aucun autre site : `grep` confirme
`validation.ts:91` unique porteur du motif.

## Proposed improvements (TDD)
- **RED** : +1 test dans `__tests__/validation.test.ts` (bloc `language`)
  affirmant que la **combinaison** corps-639-3 + région est acceptée —
  `bas-CM`, `ewo-CM`, `ksf-CM` → `success: true`. Échoue sur `.max(5)` actuel
  (`too_big`).
- **GREEN** : `validation.ts:91` `.max(5)` → `.max(6)` (longueur maximale réelle
  de la regex). Optionnellement, un commentaire lie la borne à la regex pour
  empêcher une future re-divergence.
- **REFACTOR** : néant (changement minimal, la regex reste la SSOT de forme).

## Expected benefits
- Un contrat langue interne cohérent (longueur ⟺ regex) sur la frontière
  d'envoi de message.
- Fin de la régression Prisme pour les langues camerounaises régionalisées.
- Couverture verrouillant la combinaison 639-3 + région (le trou qui a laissé
  passer le bug).

## Implementation complexity
Triviale — 1 caractère de production (`5`→`6`) + 1 test de non-régression.

## Validation criteria
- `packages/shared` : `vitest run __tests__/validation.test.ts` = tous verts,
  dont le nouveau test `bas-CM`/`ewo-CM`/`ksf-CM`.
- `CommonSchemas.language.safeParse('bas-CM').success === true` (était `false`).
- Aucune valeur préalablement rejetée par la regex n'est acceptée (regex
  inchangée) ; `en-US`, `fr`, `bas`, `EN`(rejet), `english`(rejet) inchangés.

## Backlog (candidats consignés — non actionnés ici)
- **`participantsFilters.limit` (`validation.ts:654`)** : `parseInt(val||'50',10)`
  sans clamp ni garde NaN, contrairement aux jumeaux `pagination`/`messagePagination`
  (`Math.min(Math.max(1, …||20),100)`). `limit=abc` → `NaN`, `limit=99999999`
  non borné. **Actuellement dead code** (aucune référence hors définition) → valeur
  faible tant que non câblé ; à unifier si un jour consommé.
- **`CommonSchemas.language` casse/séparateur** : la regex reste case-sensitive
  (rejette `EN`, `fr_FR`, `en-us`). `normalizeLanguageCode` (SSOT) les canonise ;
  divergence write-boundary vs read-side. Loosen changerait la valeur persistée →
  décision produit + intégration iOS à vérifier (reste en backlog, cf. itér. 183).
- **`CommonSchemas.language` sans normalisation** : `originalLanguage` stocké
  verbatim ; `en-US` persiste `en-US` (non canonisé). Downstream `.toLowerCase()`
  (MeeshySocketIOManager:1712) tolère, mais un `transform` de normalisation
  supprimerait la divergence — changement de forme persistée, à instruire.
- `normalizeLanguageCode` ISO 639-3 (traité #2067), sémantique `limit=0`,
  borne email 254/255 (nit, invariant SSOT préservé via délégation finale).
