# Analyse — Itération 250 : `_findUsersForLanguage` comparait des codes de langue bruts (suivi #1 de l'it. 249)

## Current state

`_findUsersForLanguage(targetLanguage)`
(`services/gateway/src/socketio/MeeshySocketIOManager.ts`) sélectionne, parmi les
sockets connectés du nœud, ceux dont le lecteur lit `targetLanguage`. C'était le
**suivi #1 nommé par l'itération 249** (et déjà par l'audit de l'itération 247) :
le dernier site de comparaison de codes de langue du gateway qui bypassait la
SSOT `normalizeLanguageForDedup`.

```ts
const lang = targetLanguage.toLowerCase();
// …
const matches =
  user.resolvedLanguages.includes(lang) ||
  user.language.toLowerCase() === lang;
```

## Problems identified

Trois formes du même défaut de comparaison :

1. **Cible taguée vs `resolvedLanguages` canonique.** `resolvedLanguages` est
   déjà canonique (construit par `resolveUserLanguagesOrdered`, qui normalise
   `systemLanguage`/`regionalLanguage`/`customDestinationLanguage`/`deviceLocale`).
   Mais `targetLanguage` arrive brut : une cible `'en-US'` réduite naïvement à
   `'en-us'` ne matche jamais `['en']` — le destinataire est perdu.
2. **Champ `language` brut vs cible canonique.** `SocketUser.language` vaut
   `user.systemLanguage || 'en'`, persisté **verbatim** (pas de `resolvedLanguages`
   pour un participant sans prefs résolues). Un `user.language` `'en-US'` ou
   `'swe'` comparé en `===` brut à une cible `'en'`/`'sv'` échoue.
3. **Cible 3-lettres (ISO 639-2).** `'swe'` (Suédois) restait `'swe'` et ne
   matchait ni `['sv']` ni `language: 'sv'`.

## Root causes

Même classe de défaut que les itérations 243 (résolveur client), 246 (clé de
dédup web), 247 (pré-filtre serveur d'aperçu), 248 (porte d'accès de lien) et
249 (scoring d'affinité des réels) : un site de comparaison de codes de langue
jamais routé par la SSOT `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`).

**Précision honnête sur l'impact courant :** `_findUsersForLanguage` est
**dépourvu d'appelant de production** — seuls trois témoins directs l'exerçaient.
C'est donc un correctif **fail-safe** (« piège armé » à l'endroit correct, cf.
philosophie du dépôt : corriger à la source pour qu'un futur câblage ne
réintroduise pas le défaut), pas la réparation d'une panne active. Le chemin de
filtrage linguistique **vivant** (`SOCKET_LANG_FILTER`) passe par
`groupSocketsByLanguage` → `normalizeGroupLanguage`, qui route déjà par la SSOT
depuis le sprint bande-passante — vérifié cette itération.

## Business impact

Nul aujourd'hui (méthode non câblée). Latent : tout futur appelant filtrant un
emit par langue via cette méthode aurait silencieusement omis des destinataires
tagués région / 3-lettres — exactement la violation du Prisme Linguistique que la
convergence SSOT élimine partout ailleurs. Le fix ferme la porte avant qu'elle
serve.

## Technical impact

Surface minimale : un import + une cible canonicalisée + un repli `language`
canonicalisé. `resolvedLanguages` reste comparé par `.includes(lang)` (canonique
par contrat, `lang` désormais canonique). Aucun schéma, aucun contrat wire,
aucune signature publique modifiée. La méthode reste pure vis-à-vis de
`connectedUsers`.

## Risk assessment

Très faible. `normalizeLanguageForDedup` est idempotente sur les codes canoniques
(`'fr'` → `'fr'`, `'es'` → `'es'`) : les cibles et les `language` déjà canoniques
sont inchangés (les 3 témoins pré-existants restent verts, dont `language: 'ES'`
→ `'es'`). La canonicalisation ne peut qu'**élargir** des correspondances
légitimes ; elle ne fait jamais matcher deux langues distinctes (garde
anti-troncature `'fil'`/`'swe'` de la SSOT) — vérifié par une contre-épreuve
(`language: 'fr-FR'` + `resolvedLanguages: ['fr']` vs cible `'en-US'` ⇒ 0).

## Proposed improvements (implemented)

```ts
const lang = normalizeLanguageForDedup(targetLanguage);
// …
const matches =
  user.resolvedLanguages.includes(lang) ||
  normalizeLanguageForDedup(user.language) === lang;
```

Répartition volontaire, cohérente avec l'it. 249 : le champ brut (`targetLanguage`,
`user.language`) est canonicalisé au site de comparaison ; `resolvedLanguages`,
canonique à la source, garde le `.includes` (pas de re-normalisation par entrée).

## Expected benefits

- Un destinataire dont la langue est stockée taguée (`'en-US'`) ou en 639-2
  (`'swe'`) est enfin trouvé par une cible canonique, et réciproquement.
- Convergence : **le dernier site de comparaison de codes de langue du gateway**
  est routé par la SSOT. Restent les suivis web (#2) et le backfill base (#3).

## Implementation complexity

Triviale : un import + deux atomes canonicalisés.

## Validation criteria

- 4 témoins ajoutés ; **3 prouvés ROUGES** en revertant la logique (cible `'en-US'`
  vs `['en']` ; `language: 'en-US'` vs cible `'en'` ; cible `'swe'` vs `['sv']`),
  verts après le fix. 1 contre-épreuve (langues distinctes taguées ⇒ 0) verte
  dans les deux états (garde anti-sur-matching).
- Suite `MeeshySocketIOManager.test.ts` : **392/392**.
- `tsc --noEmit` gateway : exit 0.

## Future improvements (audit it. 247, restant à instruire)

Par sévérité décroissante (suivis #1 et #2 de l'it. 249 désormais clos ; le #1
de l'it. 249 était ce site) :

1. **Web (jest web, lot dédié)** : `CanvasV3Scene.tsx` (`sameLanguage` via
   `split('-')`), `BubbleMessage.tsx` (`===` brut origine + clé),
   `TranslationToggle.tsx` (`startsWith`), `use-stream-translation.ts`. Vrai
   chemin utilisateur (bulles de message web) — priorité 1 prochaine itération.
2. **Backfill base** des codes tagués (`Message.originalLanguage`, clés de
   `translations`, `Post.originalLanguage`, `ConversationShareLink.allowedLanguages`,
   `User.systemLanguage`) — supprimerait la classe de défaut à la SOURCE
   (écriture). Décision produit + fenêtre de migration.
3. **`_findUsersForLanguage` est du code mort** : envisager sa suppression (avec
   ses témoins) OU son câblage à un chemin réel dans une itération future. Fixé
   d'abord pour ne pas laisser un défaut latent dans une méthode encore
   test-couverte ; l'arbitrage suppression-vs-câblage est un lot distinct.
