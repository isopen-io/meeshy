# Revue Opus du lot F — rapport intégral (2026-08-21)

I have completed the review. Here is the report.

---

# Revue finale — lot F (web), branche `feat/composer-lot-f` (base `d36869973`, 11 commits `20731967e`→`a5287ba5a`)

Terrain vérifié : diffs (`git show`) + état final + exécution des 13 fichiers de test touchés (**tous verts : 8 suites/47 tests + 5 suites/52 tests**).

---

## CONSTATS

### Axe 5 — B3.3-6 (annonce du fond + 🔇)

**1. BLOQUANT — le bouton 🔇 de `StoryViewer` ne coupe rien : son état n'est lu par personne.**

`apps/web/components/v2/StoryViewer.tsx:469`
```
const [isBackgroundSoundMuted, setIsBackgroundSoundMuted] = useState(true);
```
`apps/web/components/v2/StoryViewer.tsx:1114-1120`
```
<BackgroundSoundBadge
  sound={backgroundSound}
  muted={isBackgroundSoundMuted}
  onToggleMute={() => setIsBackgroundSoundMuted((m) => !m)}
```
`grep -n 'isBackgroundSoundMuted' apps/web/components/v2/StoryViewer.tsx` ne rend que **ces deux sites** (469, 1116). `CanvasV3SceneProps` (`CanvasV3Scene.tsx:61-67`) n'expose aucun `muted` ; les lecteurs réels (`<video muted={media.muted}>` `CanvasV3Scene.tsx:244`, `<audio autoPlay loop>` `CanvasV3Scene.tsx:306-316`) tirent leur état muet du **payload**, jamais de cet état. Le plan F3 exige « bascule `muted` du lecteur LOCAL (vidéo de fond ou `<audio>`…) » (`plans/…-lot-f.md:92`).

*Défaut : le bouton change son glyphe et son `aria-pressed` sans jamais toucher un lecteur — B3.6 n'est pas livrée, l'UI ment.*

---

**2. BLOQUANT — le badge de `PostCard` n'est monté par aucun appelant : la « carte » de B3.6 n'existe pas.**

`apps/web/components/v2/PostCard.tsx:59-63, 207-209, 357-363` déclarent et consomment `backgroundSound` / `backgroundSoundMeta` / `backgroundSoundMuted` / `onToggleBackgroundSoundMute`.

Balayage exhaustif hors tests :
```
grep -rn 'backgroundSound' apps/web --include='*.tsx' --include='*.ts' | grep -v __tests__ \
  | grep -v 'v2/PostCard.tsx|v2/BackgroundSoundBadge.tsx|v2/StoryViewer.tsx'
→ apps/web/lib/story-transforms.ts:379, :400   (uniquement le funnel StoryViewer)
```
Aucun `<PostCard … backgroundSound=…>` n'existe. Le plan F3 liste pourtant `PostCard.tsx` (rangée auteur) en fichier modifié (`plans/…-lot-f.md:89`), et B3.6 exige « carte, détail, plein écran » (`spec:118-119`).

*Défaut : quatre props publiques mortes ; sur les trois surfaces exigées par B3.6, le web en câble une (plein écran) et elle est inerte (constat 1) — la carte n'est jamais alimentée, le détail (`PostDetail.tsx`) n'est pas touché du tout.*

---

**3. MAJEUR — le crédit de bibliothèque est systématiquement dégradé en `♫ —`, alors que la métadonnée est SUR LE FIL.**

`apps/web/components/v2/StoryViewer.tsx:1114-1120` : le badge est monté **sans** `title`, `username`, `durationSeconds`. Donc `BackgroundSoundBadge.tsx:32-42` :
```
const parts = [title, handle ? `@${handle}` : undefined, duration].filter(...)
return parts.length > 0 ? parts.join(' · ') : GENERIC_CREDIT_GLYPH;
```
rend **toujours** `♫ —` pour `source.t === 'library'`. Or la métadonnée voyage dans l'objet audio de la scène — `services/gateway/src/services/posts/storyEffectsV3.ts:168-172` :
```
...(str(a.soundId) ? { soundId: a.soundId } : {}),
...(str(a.soundAuthorUsername) ? { soundAuthorUsername: a.soundAuthorUsername } : {}),
...(str(a.name) ? { name: a.name } : {}),
```
(miroir iOS `CanvasV3Migration.swift:400-407`), et `postToStoryData` la transmet intacte (`story-transforms.ts:376-380`).

*Défaut : la forme crédit n'est pas dégradée « à cache froid » mais en permanence, parce que le viewer ne lit jamais `name`/`soundAuthorUsername` du `kind:audio` de la scène — B3.4 rend une chip générique là où iOS rend `titre · @pseudo · M:SS`.*

---

### Axe 1 — Émission F5b vs contrat / forme iOS

**4. MAJEUR (latent, activé par le constat 15) — F5b émet un objet texte SANS `locale` : la règle 3 du Prisme casse.**

`apps/web/components/v2/StoryComposer.tsx:211-220`
```
function rootTextObject(content: string, textStyle: TextStyle): UnrankedObjectV3 {
  return { id: generateStoryObjectId(), kind: 'text',
           anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg',
           transform: NEUTRAL_TRANSFORM,
           payload: { text: content, textStyle } };
}
```
Aucun champ `locale`, alors que le même lot le résout deux fichiers plus loin (`posts.service.ts:190-194`, `resolveOriginalLanguageForCreate`) et qu'iOS l'émet toujours (`CanvasV3Migration.swift:189` `locale: nonEmpty(text.sourceLanguage)`).
Côté serveur, la langue n'est **jamais** rétro-écrite : `PostService.ts:584` `const sourceLanguage = obj.sourceLanguage ?? detectLanguage(text);` — lecture seule.
Côté lecture, `CanvasV3Scene.tsx:121-132` a besoin de `o.locale` pour que l'origine concoure à son rang :
```
if (o.locale && sameLanguage(language, o.locale)) return original;
```
Sans `locale` : prisme `['en','fr']`, texte anglais, traduction `fr` disponible ⇒ le rang `en` est sauté (pas de `translations.en`, pas de `locale`), le rang `fr` gagne ⇒ **« Bonjour » servi à un lecteur anglais-primaire** — exactement l'inversion que CLAUDE.md règle 3 interdit.

*Défaut : l'émission web prive son propre résolveur de la seule donnée qui fait respecter la règle 3 ; le bug reste masqué tant que `preferredLanguages` ne contient qu'une langue (constat 15).*

---

**5. MAJEUR — `CanvasV3Scene` lit `payload.fontSizeDesign`, une clé qui n'existe dans AUCUN payload v3.**

`apps/web/components/v2/CanvasV3Scene.tsx:134-138`
```
function fontSize(payload: Record<string, unknown>): string {
  const design = numeric(payload.fontSizeDesign);
  if (design !== undefined) return `${((design / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw`;
  return `${numeric(payload.textSize) ?? 24}px`;
}
```
`fontSizeDesign` est un nom **interne au web**, fabriqué par le funnel v1 : `apps/web/lib/story-transforms.ts:96-97`
```
textSize: typeof r.textSize === 'number' ? r.textSize : undefined,
fontSizeDesign: typeof r.fontSize === 'number' ? r.fontSize : undefined,
```
La clé du FIL est `fontSize` — iOS l'émet ainsi (`CanvasV3Migration.swift:428` `payload["fontSize"] = .number(text.fontSize)`) et le convertisseur la recopie telle quelle via `...rest` (`storyEffectsV3.ts:81-86`).

*Défaut : toute taille de police non-défaut d'une story iOS (ou convertie) retombe sur `24px` au lieu d'être mise à l'échelle en `cqw` — le rendu « fidèle » de F1 perd la typographie, et aucun test ne couvre la taille (`canvas-v3-scene.test.tsx:81-104` ne pose jamais de `fontSize`).*

---

**6. MAJEUR — un média `kind:media` non-`isBackground` n'a pas d'`autoPlay` : la vidéo ne démarre jamais.**

`apps/web/components/v2/CanvasV3Scene.tsx:273-281`
```
{media.url && media.kind === 'video' && (
  <video src={media.url} className="h-full w-full object-contain"
         muted={media.muted} loop={media.loop} playsInline />
)}
```
Ni `autoPlay`, ni `controls`. Le chemin legacy remplacé le faisait (`StoryViewer.tsx:996-1004` : `<video … autoPlay muted playsInline loop … />`). La fixture d'acceptation de F1 est précisément ce cas — `packages/shared/fixtures/canvas-v3/reel-16x9-bands.json` : `{ "id": "m1", "kind": "media", "plane": "content", "payload": { "mediaId": "…", "muted": false } }` sans `isBackground`.

*Défaut : le porteur letterboxé (et tout overlay vidéo posé par iOS) s'affiche figé sur sa première image, sans aucun moyen de le lancer.*

---

**7. MAJEUR — la vidéo de fond hérite de `muted={payload.muted}` : `muted:false` fait bloquer l'autoplay par le navigateur.**

`apps/web/components/v2/CanvasV3Scene.tsx:236-247`
```
<video … muted={media.muted} loop={media.loop} autoPlay playsInline />
```
avec `CanvasV3Scene.tsx:179` `muted: o.payload.muted !== false`. Le convertisseur émet `muted:false` dès que le blob v1 porte `isMuted:false`/`volume>0` (`storyEffectsV3.ts:109-118`), et iOS l'émet en paire avec `volume` (`CanvasV3Migration.swift:355-358`). Le chemin legacy **forçait** `muted` sur les vidéos de fond (`StoryViewer.tsx:906`, `:931`).

*Défaut : une story dont la vidéo de fond porte du son ne démarre plus du tout sur le web (politique autoplay Chrome/Safari), là où le legacy la jouait toujours en sourdine.*

---

**8. MAJEUR — le média posé passe de 65 % à 100 % de large et perd son arrondi : la parité iOS explicitement documentée est rompue.**

Legacy, `apps/web/components/v2/StoryViewer.tsx:951-956`
```
// Foreground: 65% of canvas short-dimension at scale=1, matches iOS
// `baseMediaSize = shortDim * 0.65` heuristic …
const sizePct = 65 * mScale;
```
+ `className="absolute pointer-events-none rounded-lg"` (`:983`, `:996`).
v3, `apps/web/components/v2/CanvasV3Scene.tsx:260-272`
```
style={{ ...objectStyle(o), width: '100%', maxWidth: '100%', maxHeight: '100%', … }}
```
`CanvasV3Scene` ne distingue que `isBackground` ; tout média `isBackground:false` tombe dans cette branche.

*Défaut : un overlay photo/vidéo composé sur iOS occupe désormais toute la largeur de la scène au lieu des 65 % qui assuraient la cohérence inter-plateformes.*

---

**9. MAJEUR — le letterbox n'est prouvé que par un `aspectRatio` FABRIQUÉ dans le test ; la production n'en fournit jamais.**

Test, `apps/web/__tests__/components/canvas-v3-scene.test.tsx:63-70`
```
const mediaById = new Map([
  ['64b000000000000000000001', { url: '/m/reel.mp4', mimeType: 'video/mp4', aspectRatio: 16 / 9 }],
]);
…
expect(Number(screen.getByTestId('canvas-v3-object-m1').style.aspectRatio)).toBeCloseTo(16 / 9, 4);
```
Production, `apps/web/lib/story-transforms.ts:346-350`
```
const mediaById = new Map<string, { url: string; mimeType: string }>();
for (const m of post.media ?? []) {
  if (m.id && m.fileUrl) mediaById.set(m.id, { url: m.fileUrl, mimeType: m.mimeType ?? '' });
}
```
Le type de valeur n'a **pas** de champ `aspectRatio` ; `PostMedia` porte pourtant `width`/`height` (`packages/shared/types/post.ts:67-68`), jamais dérivés. Et la fixture `reel-16x9-bands.json` ne porte pas `payload.aspectRatio` — `CanvasV3Scene.tsx:180` `numeric(o.payload.aspectRatio) ?? entry?.aspectRatio` rend donc `undefined`.

*Défaut : le critère d'acceptation n° 2 de F1 (« le porteur garde SON ratio, letterbox ») est vert grâce à une donnée que l'application ne produit jamais — en prod le conteneur n'a aucun `aspect-ratio`.*

---

### Axe 2 — Lecture / couverture des kinds / résilience

**10. MAJEUR — la résilience nommée par la spec (« le web try/catch `CanvasV3Scene` ») n'est pas implémentée.**

`docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md:312`
```
| v3 au SCHÉMA invalide … | servi TEL QUEL — le rendu client est best-effort
  (résilience de décodage en place iOS ; le web try/catch `CanvasV3Scene`) | …
```
`grep -n 'try {' apps/web/components/v2/CanvasV3Scene.tsx` → aucun résultat ; `grep -rn 'ErrorBoundary'` sur `StoryViewer.tsx`, `PostsFeedScreen.tsx`, `CanvasV3Scene.tsx` → aucun résultat (seule frontière : `apps/web/app/layout.tsx`). Or le rendu déréférence sans garde : `CanvasV3Scene.tsx:89-91` `o.transform.scale`, `:82` `str(payload.textStyle)`, `:122` `str(o.payload.text)`.

*Défaut : un objet v3 amputé de `transform` ou de `payload` — que le gateway sert TEL QUEL aux clients caps-3 par contrat — lève une `TypeError` et fait tomber la page entière sur la frontière racine, au lieu d'être ignoré objet par objet.*

---

**11. MINEUR — les kinds `drawing` et `place`, réellement émis par le convertisseur, ne sont rendus par aucune branche.**

Émission : `services/gateway/src/services/posts/storyEffectsV3.ts:146-161`
```
const o = baseObject({ id: 'drawing' }, 'drawing', 'fg', z++);
…
for (const L of asArray(blob.locationObjects)) { const o = baseObject(L, 'place', 'fg', z++); … }
```
Rendu : `apps/web/components/v2/CanvasV3Scene.tsx:356-362`
```
if (o.kind === 'text') … if (o.kind === 'media') … if (o.kind === 'audio') … if (o.kind === 'sticker') …
return null;
```
Atténuation vérifiée : le chemin legacy web ne les rendait pas non plus (`grep -n 'locationObjects\|drawingStrokes' apps/web/components/v2/StoryViewer.tsx` → aucun résultat), donc **pas de régression** — mais un dessin et une épingle de lieu composés sur iOS restent invisibles sur le web alors que le fil les porte.

---

**12. MINEUR — prédicat `v === 3` là où la spec et le lot B imposent `v >= 3`.**

`apps/web/components/v2/StoryViewer.tsx:842` `const isCanvasV3 = effects?.v === 3;`
`apps/web/lib/story-transforms.ts:376, 379` `effects?.v === 3 && …`
contre `spec:312` « sentinelle (même prédicat `v >= 3`) », `storyEffectsV3.ts:401` `const isV3Native = typeof mark === 'number' && mark >= 3;` et le rattrapage B8c (« prédicat `v >= 3` », P0).

*Défaut : un futur blob `v:4` (que le gateway servirait tel quel à un client caps-3) retombe sur le chemin legacy dont toutes les familles sont absentes ⇒ story VIDE, au lieu d'un rendu best-effort. Le plan F2 prescrivait bien `=== 3` (`plans/…-lot-f.md:70`) : c'est le plan qui diverge de la spec.*

---

**13. MINEUR — `loop` n'est plus forcé : une story vidéo composée sur le web se fige en fin de clip.**

`CanvasV3Scene.tsx:243` `loop={media.loop}` avec `:181` `loop: o.payload.loop === true`.
Le composer n'émet jamais `loop` (`StoryComposer.tsx:222-239`), le convertisseur non plus sauf booléen présent (`storyEffectsV3.ts:119`). Legacy : `loop` en dur (`StoryViewer.tsx:908`, `:932`) — de même pour l'audio (`StoryViewer.tsx:310, 317`).

---

**14. MINEUR — l'indicateur de mise en mémoire tampon meurt sur le chemin v3.**

`StoryViewer.tsx:616-621` définit `primaryVideoGateHandlers` (`onWaiting/onStalled/onPlaying/onCanPlay` → `setIsBuffering`), attaché aux vidéos legacy (`:911`, `:936`). `CanvasV3Scene` n'accepte ni ne pose ces gestionnaires (`CanvasV3Scene.tsx:61-67`, `:236-247`).

---

**15. MAJEUR — `preferredLanguages` reçoit UNE langue alors que le helper de prisme ordonné existe déjà côté web.**

`apps/web/components/v2/StoryViewer.tsx:889`
```
preferredLanguages={userLanguage ? [userLanguage] : []}
```
Le composant est pourtant taillé pour la chaîne complète (`CanvasV3Scene.tsx:65` `preferredLanguages?: readonly string[]`), et le web dispose de la source de vérité partagée : `apps/web/utils/user-language-preferences.ts:129-131`
```
export function getUserLanguagePreferences(user: User): string[] {
  return resolveUserLanguagesOrdered(user, { deviceLocale: resolveDeviceLocale(user) });
}
```
déjà consommée ailleurs (`components/conversations/PinnedMessageBanner.tsx:111`, `components/conversations/hooks/useConversationFiltering.ts:32`). Le commentaire d'excuse (`StoryViewer.tsx:209` « audit B11B will plumb the full chain ») est donc périmé.

*Défaut : le prisme du rendu v3 est tronqué à sa 1re priorité — la langue secondaire, la destination personnalisée et la locale appareil ne servent jamais un objet de scène.*

---

### Axe 6 — F4 / régressions

**16. MAJEUR — l'`aria-label` de l'attribution est posé sur un `<div>` générique dont tout le contenu est `aria-hidden` : le lecteur d'écran n'annonce RIEN.**

`apps/web/components/v2/PostCard.tsx:493-499`
```
<div
  className="flex items-center gap-1.5 mb-2 text-xs text-[var(--gp-text-muted)]"
  aria-label={t('post.repostedFrom', `Reposted from @${repostOf.author?.username ?? ''}`)}
>
  <span aria-hidden="true" className="shrink-0">↻</span>
  <span aria-hidden="true">@{repostOf.author?.username ?? ''}</span>
</div>
```
Un `div` sans `role` a le rôle `generic`, pour lequel ARIA **interdit** le nommage par auteur ; les deux seuls nœuds textuels sont masqués. Le plan exigeait « l'accessibilité garde la phrase complète » (`plans/…-lot-f.md:103`). Le test est vert parce que `getByLabelText` (`post-card-repost-attribution.test.tsx:70`) résout l'attribut DOM, pas l'arbre d'accessibilité — il ne prouve pas l'annonce.

*Défaut : avant F4 la phrase était du texte DOM annoncé ; après F4 l'attribution de repost est muette pour un lecteur d'écran. (Le pattern iOS cité en P0, `accessibilityElement(children: .ignore)`, n'a pas d'équivalent implicite sur un `div` web : il faut `role="img"`/`role="text"` ou un span visuellement masqué.)*

---

**17. MAJEUR — B3.2 n'est appliquée qu'à 1 des 3 surfaces web de republication.**

```
grep -rn 'Reposted from|repostedFrom' apps/web --include='*.tsx'
apps/web/components/v2/PostDetail.tsx:405: <span>{t('post.repostedFrom', `Reposted from @${repostOf.author?.username ?? ''}`)}</span>
apps/web/components/v2/PostCard.tsx:495:   aria-label={t('post.repostedFrom', …)}
apps/web/components/feed/ReelPlayer.tsx:435: <span>{t('player.repostedFrom', 'Reposted from')} @{repostAuthorHandle(reel.repostOf)}</span>
```
B3.2 est une loi produit non négociable (`spec:109-110` « **L'icône est le verbe** : `@marc · ↻ @aïcha`, jamais « a republié » »).

*Défaut : la même application dit `↻ @bob` sur la carte de fil et « Reposted from @bob » sur le détail de post et le lecteur de réel — incohérence visible en deux taps.*

---

**18. MAJEUR — l'animation existante (keyframes W1 + transitions de clip) disparaît sur le chemin qui devient le chemin par défaut.**

Legacy vivant : `StoryViewer.tsx:948-951` (`resolveKeyframeState(m.keyframes, playheadSec, …)`), `:958-963` (`resolveClipTransitionOpacity(m, clipTransitions, playheadSec)`), `:1006-1012` (idem pour les textes).
v3 : `CanvasV3Scene.tsx:336-339`
```
/// Rendu STATIQUE d'une scène v3 : les timings ne sont pas joués (un objet timé
/// est simplement visible — dette explicite du lot F).
```
Le point : avec F2b (`api.service.ts:115` `'X-Canvas-Caps': '3'`) le web annonce caps 3 sur **toute** requête, donc dès `CANVAS_V3_READ` armé la table O17 convertit **toute l'archive v1** en v3 (`storyEffectsV3.ts:402-405`) — plus une seule story ne passera par le chemin animé.

*Défaut : la dette est déclarée « explicite » au niveau du composant mais n'est nulle part comptée comme perte de fonctionnalité livrée ; l'armement du drapeau retire l'animation à 100 % des stories web, pas à une frange.*

---

**19. MAJEUR — le voile de lisibilité est supprimé sur le chemin v3.**

`apps/web/components/v2/StoryViewer.tsx:915-916`
```
{/* Gradient overlay for readability */}
<div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />
```
se trouve à l'intérieur du fragment `: (<> … </>)` du repli legacy (ouvert `:893`, fermé `:1081-1082`). Aucun équivalent dans `CanvasV3Scene`.

*Défaut : un texte blanc posé sur une photo claire perd son scrim — effet visuel retiré sans remplacement (CLAUDE.md « NE PAS retirer effets visuels »).*

---

### Axe 3 / F5 / cohérence

**20. MINEUR — la branche « langue inconnue ⇒ champ absent » de F5 est inatteignable en production.**

`apps/web/services/posts.service.ts:196-200`
```
export function resolveOriginalLanguageForCreate(data: OriginalLanguageCreateInput): string | undefined {
  if (data.originalLanguage) return data.originalLanguage;
  if (!data.storyEffects) return undefined;
  return getCurrentInterfaceLocale() || undefined;
}
```
`apps/web/stores/language-store.ts:172-173` `getCurrentInterfaceLocale = () => useLanguageStore.getState().currentInterfaceLanguage;` et `:68` `currentInterfaceLanguage: 'en', // Will be overridden by persisted state or browser detection` — la valeur n'est **jamais** vide.
Les tests qui couvrent cette branche (`posts-original-language.test.ts:56`, `story.service.test.ts:225`) ne l'atteignent qu'en mockant le store à `''`.

*Défaut : « ne jamais envoyer une langue devinée fausse » n'a pas de garde active — la locale d'interface part toujours et court-circuite `detectLanguage(content)` côté gateway (`services/gateway/src/services/PostService.ts:158-160`), donc un francophone d'interface qui écrit en anglais tague sa story `fr`.*

---

**21. MINEUR — un commentaire livré affirme le contraire du diff du même lot.**

`apps/web/services/posts.service.ts:183-184`
```
* (composer story) : le champ existait déjà sur `CreatePostRequest`, mais
* aucun appelant ne le renseignait.
```
Or `git show d36869973:apps/web/components/feed/PostsFeedScreen.tsx | sed -n '288p'` rend `originalLanguage: userLanguage,` — que F5 **supprime**. Même formulation dans le message du commit `2755b19ec` (« originalLanguage part enfin en creant une story »).

*Défaut : F5 est une CORRECTION de source (langue de lecture → locale d'interface), pas un envoi inaugural ; le commentaire pérennisé induit en erreur. (Le texte final du P0 rétablit, lui, la version exacte.)*

---

**22. MINEUR — clés `mute`/`unmute` absentes du catalogue `components` : libellés anglais en fr/es/pt.**

`apps/web/components/v2/PostCard.tsx:228` `const { t } = useI18n('components');` puis `:363-364` `muteLabel={t('mute', 'Mute')}` / `unmuteLabel={t('unmute', 'Unmute')}`.
```
python3 → fr components.mute/unmute: None None
```
`use-i18n.ts:165` `return fallback || key;` ⇒ « Mute »/« Unmute » dans les 4 locales. (`StoryViewer.tsx:459` utilise `useI18n('common')`, où `common.mute` = « Couper le son » existe — ce site-là est correct.) Impact courant nul tant que le constat 2 tient.

---

**23. MINEUR — l'objet de fond reçoit un id aléatoire là où iOS et le convertisseur posent le littéral `"bg"`.**

`apps/web/components/v2/StoryComposer.tsx:196-198` `id: generateStoryObjectId()`
contre `services/gateway/src/services/posts/storyEffectsV3.ts:73` `...baseObject({ id: 'bg' }, 'media', 'bg', z++)` et `packages/MeeshySDK/…/CanvasV3Migration.swift:174` `ObjectV3(id: "bg", kind: .media, … plane: .bg, …)`.
Sans conséquence fonctionnelle vérifiée (les deux relectures discriminent par `plane`, cf. `CanvasV3Migration.swift:503`), mais la forme émise diverge de ses deux jumeaux.

---

**24. MINEUR — un document v3 multi-scènes ne rend que la scène 0, silencieusement.**

`apps/web/components/v2/CanvasV3Scene.tsx:341, 347` (`sceneIndex = 0`, `doc.scenes?.[sceneIndex]`) ; `StoryViewer.tsx:886-891` ne passe jamais `sceneIndex` ; `story-transforms.ts:263` `asObjectArray(effects.scenes)[0]`. Le contrat autorise `.max(10)` (`packages/shared/types/canvas-v3.ts:109`).
Latent aujourd'hui (iOS n'émet qu'une scène — `CanvasV3Migration.swift:342` `scenes: remapped.isEmpty ? [] : [scene]`), actif dès le composer multi-slides.

---

### Hors périmètre F, relevé en comparant l'émission iOS au contrat étendu

**25. MINEUR (lot B) — iOS émet encore un `bounds` inversé quand seule la borne de début existe.**

`packages/MeeshySDK/…/CanvasV3Migration.swift:330-333`
```
bounds: effects.backgroundAudioStart != nil || effects.backgroundAudioEnd != nil
    ? BackgroundSoundV3.Bounds(start: effects.backgroundAudioStart ?? 0,
                               end: effects.backgroundAudioEnd ?? 0)
    : nil,
```
⇒ `{ start: 3, end: 0 }`, refusé par `BOUNDS_END_BEFORE_START` (`packages/shared/types/canvas-v3.ts:76-79`). Le convertisseur gateway a été durci pour ce cas exact (`storyEffectsV3.ts:234-250`), pas le pont Swift. Sous `CANVAS_V3_WRITE_STRICT`, cette publication iOS prend un `400 CANVAS_INVALID` (`services/gateway/src/routes/posts/core.ts:113-118`).

---

## DÉCOMPTE

| Sévérité | Nombre | Constats |
|---|---|---|
| **BLOQUANT** | **2** | 1, 2 |
| **MAJEUR** | **12** | 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19 → *(13, voir note)* |
| **MINEUR** | **11** | 11, 12, 13, 14, 20, 21, 22, 23, 24, 25 |

Correction du tableau : **BLOQUANT 2** (1, 2) · **MAJEUR 13** (3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19) · **MINEUR 10** (11, 12, 13, 14, 20, 21, 22, 23, 24, 25) — **25 constats**.

---

## AXES BLANCHIS (vérifiés, rien à signaler)

1. **Le v3 émis par F5b passe le Zod ÉTENDU.** `story-composer-emits-v3.test.tsx:107` juge par `CanvasV3Schema.safeParse` ; suite exécutée verte (8/8). Vérifié à la main : `scenes` toujours présent (`StoryComposer.tsx:262-270`, l'objet de fond existe par construction, `selectedBg` initialisé `BACKGROUND_COLORS[0].value` `:279`) ⇒ `.min(1)` satisfait ; `z` entier (rang d'insertion `:270`) ; `kind` ∈ `ACTIVE_KINDS` (`media`/`text`/`audio` seulement) ⇒ ni `KIND_RESERVED` ni `KIND_UNKNOWN` ; aucun `timing` émis ⇒ `TIMING_END_BEFORE_START` hors sujet ; aucun `sound` ⇒ `BOUNDS_END_BEFORE_START` hors sujet ; plafonds (`objects.max(60)`, `scenes.max(10)`) hors d'atteinte (≤ 4 objets).

2. **Canonisation du fond.** `StoryComposer.tsx:156-161` transforme `linear-gradient(135deg, #C4704B, #1A6B5A)` (`:75`) en `gradient:#C4704B,#1A6B5A`, forme lue par les trois lecteurs : `CanvasV3Scene.tsx:146-159`, legacy `StoryViewer.tsx:260-265`, iOS `CanvasV3Migration.swift:504`. Prouvé bout en bout (`story-v3-roundtrip.test.tsx:184-196`, vert).

3. **`X-Canvas-Caps: 3` couvre bien toutes les surfaces de lecture de posts/stories/réels.** Posé au funnel unique `ApiService.buildHeaders` (`api.service.ts:110-117`), là même que `Authorization` et `X-Device-Locale`. Balayage : `grep -rn 'fetch(' apps/web --include='*.ts' --include='*.tsx'` (60+ sites) — le seul `fetch` brut de `posts.service.ts` est `:452` `POST /posts/:id/anonymous-view` (écriture d'impression, aucune lecture de blob). Feed, tray, réels, permalien réel et page hashtag passent tous par `postsService`/`storyService` (`hooks/queries/use-reels-feed-query.ts:29`, `app/reel/[postId]/page.tsx:28`, `hooks/social/use-story-viewers.ts`, `app/hashtag/layout.tsx`). Aucune page `app/post|story|mood|feeds/post/[postId]/page.tsx` ne fait de fetch SSR (`grep -n 'fetch(|apiService|generateMetadata'` → vide sur les 4). Aucune surface oubliée ⇒ le web ne recevra jamais la sentinelle O17.

4. **`X-Canvas-Caps` n'ouvre aucune porte de version côté web.** `canvas-caps-header.test.ts:113` (`never blocks a request for lacking the header itself`) + aucun `X-App-Version` posé par `api.service.ts` ⇒ R6 respecté.

5. **`StoryEffectsSchema` du gateway ne tronque pas le v3.** `services/gateway/src/routes/posts/types.ts:170-187` est `.passthrough()` ; `v`, `scenes`, `sound` survivent à la validation d'écriture. Le plafond global (`STORY_EFFECTS_MAX_BYTES`, `:179-187`) est hors d'atteinte pour un doc de 4 objets.

6. **Claim des médias (O8) satisfait par F5b.** `StoryComposer.tsx:344` `const mediaIds = uploadedAttachments.map(att => att.id);` puis `:382` `mediaIds: mediaIds.length > 0 ? mediaIds : undefined` — sur-ensemble strict des `postMediaId` référencés (`:352`, `:363`) ⇒ `unclaimedCanvasMediaIds` (`storyEffectsV3.ts:270-292`) rend `[]`, pas de `MEDIA_NOT_CLAIMED` sous `CANVAS_V3_WRITE_STRICT`.

7. **Le funnel `postToStoryData` passe le v3 intact (correction `bdfff4a11` valide).** `story-transforms.ts:376-402` loge `v`/`scenes`/`sound` ; prouvé par `story-v3-roundtrip.test.tsx:168-175` (vert). Sans elle la garde `v === 3` était toujours fausse — la correction est réelle et nécessaire.

8. **`computeStoryDurationMs` dérive bien les trois termes depuis la scène v3.** `story-transforms.ts:243-259` (`v1ViewOfScene`) + `:262-266` ; cas 14 s prouvé (`story-v3-roundtrip.test.tsx:228-237`, vert). Vérifié que `payload.isBackground`/`mediaType`/`duration` (émis par `StoryComposer.tsx:229-233` et `storyEffectsV3.ts:113-124`) alimentent bien `:275-278`.

9. **Prisme : aucun `translations.first`, aucun court-circuit « origine ∈ prisme ⇒ original ».** `CanvasV3Scene.tsx:121-132` parcourt `preferredLanguages` DANS L'ORDRE et ne teste `o.locale` qu'**après** la traduction du même rang ; `:129` est bien un test de rang, pas un court-circuit global. Prouvé sur les trois cas de `canvas-v3-scene.test.tsx:172-201` (`['fr','en']`→« Bonjour », `['en','fr']`→« Hello », `['de']`→original), vert. `resolveUserLanguage` n'est pas réimplémenté : le web délègue déjà (`utils/user-language-preferences.ts:108-109, 129-131`) — le défaut est de ne pas l'appeler ici (constat 15), pas de le dupliquer.

10. **B3.5 (existence) et B3.4 (provenance) du résolveur pur sont exacts.** `BackgroundSoundBadge.tsx:29-30` (`!sound ⇒ null`, `original ⇒ ♫〰` et uniquement lui) et `:42` (`library` sans méta ⇒ `♫ —`, jamais l'onde). 10/10 verts. Le défaut est au câblage (constats 1-3), pas au résolveur.

11. **`message-grouping.ts` intact.** Absent de `git diff --name-only d36869973..HEAD` (25 fichiers, aucun `message-grouping`).

12. **Aucune régression de test laissée derrière.** Les 2 suites collatérales réalignées (`__tests__/components/v2/PostCard.repost.test.tsx:61-66`, `__tests__/app/hashtag/page.repost.test.tsx:121-122`) et les 11 autres fichiers touchés sont verts (exécution : 13 suites / 99 tests). Balayage `grep -rn 'Reposted from'` : les assertions restantes (`PostDetail.repost.test.tsx:53`, `ReelPlayer.repostedReel.test.tsx:135`) portent sur des composants **non modifiés** — elles restent légitimement vertes (et c'est ce qui documente le constat 17).

13. **`.gitignore` : l'exception est nécessaire et suffisante.** `+!apps/web/__tests__/components/post-card-repost-attribution.test.tsx` neutralise le motif `post-*` (`.gitignore:184`). Les autres fichiers neufs ne sont masqués par aucun motif (`PostsFeedScreen.storyOriginalLanguage.test.tsx` : `post-*` est sensible à la casse ; `background-sound-badge`, `canvas-v3-scene`, `story-*` : aucun motif). Les 25 fichiers du diff sont bien suivis.

14. **P0 — arithmétique et chaîne exactes.** Chaîne réelle **23 → 29 → 31 / 57** (`584b804eb` : 29/57, 50,9 %, `183.2deg` = 29/57×360 = 183,16 ; `a5287ba5a` : 31/57, 54,4 %, `195.8deg` = 195,79). Segments cohérents : 322,1−195,8 = 126,3 = 20/57×360 ; 360−322,1 = 37,9 = 6/57×360. Somme 31+20+6 = 57. (À noter : la chaîne est 23→31, pas 24→31.)

15. **P0 — comptes de tests annoncés = fichiers réels.** F1 7/7 (`canvas-v3-scene`, 7 `it`), F2 3/3, F2b 4/4, F3 10/10, F4 4/4, F5 8/8 (4 `posts-original-language` + 3 `story.service.test.ts:194,209,225` + 1 `PostsFeedScreen.storyOriginalLanguage`), F5b 8/8 + roundtrip 7/7. Total exécuté 47 + 52 = 99, **0 échec**. Le seul chiffre non vérifiable ici est « 731 suites / 13 805 tests » de F6.
