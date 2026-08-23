# Analyse — Itération 248 : la porte des langues autorisées d'un lien partagé comparait des codes bruts (décision d'ACCÈS)

## Current state

`POST /anonymous/join/:linkId` (`services/gateway/src/routes/anonymous.ts`) est
la porte d'entrée d'un invité de lien partagé. Parmi ses vérifications de
sécurité (pays, IP, compte requis…), elle contrôle que la langue déclarée par le
joignant fait partie des langues autorisées du lien :

```ts
// AVANT
if (
  shareLink.allowedLanguages.length > 0 &&
  !shareLink.allowedLanguages.some((l) => l.toLowerCase() === body.language)
) {
  return sendForbidden(reply, 'Langue non autorisee pour ce lien');
}
```

Le `body.language` du joignant est **déjà canonicalisé** au boundary Zod
(`anonymous.ts:32` : `z.string().transform((v) => normalizeLanguageForDedup(v)).default('fr')`) —
casse repliée, région strippée, réduction 3-lettres/legacy (`'fr-FR'`→`'fr'`,
`'FR'`→`'fr'`, `'fra'`→`'fr'`). Mais le côté LIEN (`allowedLanguages`) n'était
comparé qu'avec un `.toLowerCase()` **brut**.

C'était exactement le **suivi #1 de l'itération 247**, nommé « Priorité 1 pour
la prochaine itération » : une décision d'accès, sévérité supérieure à un défaut
d'affichage.

## Problems identified

`shareLink.allowedLanguages` vient de la BASE, configuré à la main par le
créateur du lien. Rien ne le canonicalise — ni à l'écriture, ni à la lecture.
Un lien peut donc porter `['fr-FR']`, `['fra']` ou `['FR']`. Face à un joignant
dont le `body.language` canonique est `'fr'` :

1. **Langue région-taguée dans le lien ⇒ ACCÈS REFUSÉ (défaut principal).**
   Lien `allowedLanguages: ['fr-FR']`, joignant `'fr'`.
   `'fr-fr'.toLowerCase() === 'fr'` est **faux** ⇒ `sendForbidden`. Un
   francophone se voit refuser un lien qui autorise le français. L'intention du
   créateur (« ce lien est pour les francophones ») est trahie par la forme
   verbatim de sa configuration.
2. **Code 3-lettres dans le lien ⇒ ACCÈS REFUSÉ.** Lien `['fra']` (ISO 639-2),
   joignant `'fr'`. `'fra' !== 'fr'` ⇒ refus, même cause.
3. **Asymétrie de robustesse.** La casse mixte côté lien était déjà gérée
   (`.toLowerCase()`), la casse mixte côté joignant aussi (normalisée). Mais dès
   qu'un tag de région ou un code 3-lettres entrait d'un côté seulement, la
   comparaison divergeait — la porte devenait dépendante de la forme d'écriture
   plutôt que de la langue réelle.

## Root causes

Le dépôt possède la SSOT de canonicalisation `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`), déjà consommée par le boundary
Zod de cette même route (le côté joignant) et par l'agrégat `spokenLanguages` du
même fichier (`anonymous.ts:952-956`). Le côté LIEN de la comparaison d'accès
n'y avait jamais été routé : la canonicalisation s'arrêtait au joignant et
laissait la donnée configurée par le créateur du lien sur un `.toLowerCase()`
brut — le point exact où la divergence `'fr'` vs `'fr-FR'`/`'fra'` naît.

C'est la même classe de défaut que les itérations 243 (résolveur client),
246 (clé de dédup du hook web) et 247 (pré-filtre serveur d'aperçu) : un site de
comparaison de codes de langue qui bypasse la SSOT. Ici, contrairement aux
précédents, la conséquence n'est pas un affichage dégradé mais un **refus
d'accès**.

## Business impact

- Un utilisateur légitime (bonne langue) se voit **refuser l'entrée** d'une
  conversation via un lien partagé, sans recours — pour un anonyme, ce lien est
  sa seule identité, le 403 est terminal.
- Le refus est **silencieux du point de vue du créateur du lien** : il croit
  autoriser le français, la restriction fonctionne « à l'envers » selon la forme
  du code qu'il a saisie (un sélecteur qui émet `fr-FR` casse la porte, un qui
  émet `fr` la laisse ouverte).

## Technical impact

Surface minimale : une seule comparaison dans une seule fonction de route.
Aucun schéma, aucune migration, aucun changement de contrat de fil. La fonction
devient indépendante de la forme d'écriture des `allowedLanguages`, comme le
boundary Zod l'est déjà pour `body.language`.

## Risk assessment

Très faible. La canonicalisation ne peut qu'**élargir** les correspondances
légitimes (une langue configurée sous une forme verbatim matche enfin la même
langue canonique) ; elle n'ouvre jamais la porte à une langue absente — vérifié
par une contre-épreuve (`['en-US','de']` refuse toujours `'fr'`). Aucun chemin
où deux langues distinctes se replieraient sur la même clé (la SSOT réduit
strictement vers un code de langue canonique, jamais entre langues différentes —
cf. la garde anti-troncature `'fil'`→`'fi'`/`'swe'`→`'sw'`).

## Proposed improvements — IMPLÉMENTÉ

```ts
// APRÈS
if (
  shareLink.allowedLanguages.length > 0 &&
  !shareLink.allowedLanguages.some((l) => normalizeLanguageForDedup(l) === body.language)
) {
  return sendForbidden(reply, 'Langue non autorisee pour ce lien');
}
```

Les DEUX côtés passent désormais par la même SSOT. `body.language` l'étant déjà
au boundary, la comparaison `normalizeLanguageForDedup(l) === body.language` est
cohérente et symétrique.

## Expected benefits

- Un lien configuré avec `['fr-FR']`, `['fra']` ou `['FR']` admet enfin un
  joignant francophone (`body.language = 'fr'`).
- La porte d'accès est indépendante de la forme d'écriture des langues, comme le
  reste du pipeline Prisme.
- Robustesse alignée sur les résolveurs client et serveur durcis aux itérations
  243/246/247.

## Implementation complexity

Triviale : une substitution (`l.toLowerCase()` → `normalizeLanguageForDedup(l)`),
l'import existait déjà. Commentaire du site réécrit pour nommer la SSOT et la
raison.

## Validation criteria

- 2 témoins RED posés d'abord (lien `['fr-FR','de']` ⇒ 201 ; lien `['fra']` ⇒
  201), verts après le fix.
- 2 témoins de garde qui passaient déjà (joignant `'fr-FR'` sur lien `['fr']` ⇒
  201 ; contre-épreuve `['en-US','de']` ⇒ 403 toujours).
- Suite `anonymous` 30/30 ; les 11 suites `anonymous*` 126/126.
- `tsc --noEmit` gateway : exit 0.
- Suites voisines (`last-message-preview`, `last-message-prisme`,
  `lastMessagePreviewPrism`, `conversation-rejoin-and-ban-evasion`) : 45/45.

## Future improvements (relevées par l'audit 247, restant à instruire)

Par ordre de sévérité décroissante, les autres sites de comparaison de codes de
langue bypassant la SSOT :

2. **`services/gateway/src/services/posts/reelAffinity.ts:114,124`** — scoring de
   reels : `c.originalLanguage === seed.originalLanguage` et
   `viewerLanguages.has(c.originalLanguage)` en brut ⇒ un reel région-tagué perd
   le poids `seedSameLanguage`/`viewerLanguage`. Ranking dégradé, zéro risque.
   **Attention** : la correction exige de canonicaliser les TROIS sources
   (candidat, seed, ET le `Set` `viewerLanguages` construit en amont) — vérifier
   où `ReelAffinityContext` est bâti avant de toucher `.has()`.
3. **`services/gateway/src/socketio/MeeshySocketIOManager.ts:2262-2273`
   (`_findUsersForLanguage`)** — le repli `user.language.toLowerCase() === lang`
   et la clé `lang` non canonicalisés ⇒ un destinataire `'en-US'` peut manquer
   un emit filtré par langue (derrière `SOCKET_LANG_FILTER`).
4. **Web (jest web, lot dédié)** : `CanvasV3Scene.tsx`, `BubbleMessage.tsx`,
   `TranslationToggle.tsx`, `use-stream-translation.ts`.
5. **Backfill** de `Message.originalLanguage` / clés de `translations` / colonne
   `ConversationShareLink.allowedLanguages` tagués en base (migration) —
   supprimerait la classe de défaut à la SOURCE. Décision produit + fenêtre de
   migration.
