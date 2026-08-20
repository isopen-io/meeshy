# Composer : masquer l'interdit, et la bulle par défaut — Plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development pour exécuter ce plan tâche par tâche.

**But :** ne plus proposer ce qui n'est pas permis, ne plus afficher de bandeau d'interdiction, laisser le micro toujours disponible, et faire du mode bulle le rendu par défaut.

**Architecture :** trois volets indépendants. Le volet S corrige le serveur (la voix cesse d'être un fichier). Le volet C masque les affordances côté web au lieu d'annoncer une interdiction. Le volet B déplace le défaut d'affichage vers la bulle.

**Pile :** Fastify 5 + Prisma (gateway), Next.js 15 + React Testing Library (web).

## Contraintes globales

- **TDD strict.** Aucune ligne de production sans test rouge écrit d'abord, et l'échec doit être PROUVÉ par exécution.
- **Commits par chemins explicites** : `git add <fichiers> && git commit -- <fichiers>`. **Jamais `git add -A`, jamais `git add .`, jamais `git commit --amend`** — le worktree est partagé avec d'autres sessions actives.
- **Messages de commit en français**, format `type(scope): sujet`, **aucun trailer `Co-Authored-By`**.
- **Décisions produit déjà tranchées par le propriétaire, non rediscutables :**
  1. **La voix est toujours permise** dès lors que la personne peut écrire dans la conversation — indépendamment des autorisations images et fichiers. Aucun nouveau réglage sur le lien de partage.
  2. **Portée : invités anonymes uniquement.** Les conversations ordinaires ne sont pas touchées ; on ne branche pas les permissions par membre.
- **On masque l'affordance, on ne l'affiche pas grisée**, et on ne remplace pas le bandeau par un autre message. Les contrôles et messages d'erreur serveur restent en place comme filet de sécurité.
- Web : `bun run test` depuis `apps/web`. Gateway : `bun run test` depuis `services/gateway`.
- Pas de `any` — `unknown` avec validation si le type est réellement inconnu.
- Le composer web utilise `useI18n` : toute chaîne visible neuve passe par les clés de traduction, jamais en dur. Le code existant à supprimer contient justement des libellés français codés en dur.

---

## Volet S — la voix cesse d'être un fichier

### Task 1 : l'audio anonyme n'est plus soumis à l'autorisation « fichiers »

**Fichiers :**
- Modifier : `services/gateway/src/routes/attachments/upload.ts:140-153`
- Test : `services/gateway/src/__tests__/unit/routes/attachments-upload.test.ts`

**Interfaces :**
- Consomme : `shareLink.allowAnonymousFiles`, `shareLink.allowAnonymousImages` (chargés lignes 130-136).
- Produit : aucune nouvelle signature — un troisième cas dans la classification existante.

État actuel du code (lignes 143-152) : la classification est binaire, `isImage` ou « fichier ».

```ts
for (const file of files) {
  const isImage = file.mimeType.startsWith('image/');

  if (isImage && !shareLink.allowAnonymousImages) {
    return sendForbidden(reply, 'Images are not allowed for anonymous users on this conversation');
  }

  if (!isImage && !shareLink.allowAnonymousFiles) {
    return sendForbidden(reply, 'File uploads are not allowed for anonymous users on this conversation');
  }
}
```

Un message vocal n'étant pas une image, il tombe dans la seconde branche et se fait refuser dès que `allowAnonymousFiles` vaut `false` — ce qui est le défaut en base (`packages/shared/prisma/schema.prisma:542`).

- [ ] **Étape 1 : écrire les tests rouges**

Dans `services/gateway/src/__tests__/unit/routes/attachments-upload.test.ts`, à côté des cas existants qui utilisent `makePrisma({ allowAnonymousFiles: …, allowAnonymousImages: … })` (voir lignes 319, 365, 388 pour la forme exacte à reprendre) :

```ts
it('accepte un message vocal anonyme même quand les fichiers sont interdits', async () => {
  // fichier audio/webm, allowAnonymousFiles: false, allowAnonymousImages: false
  // attendu : 200, l'audio est téléversé
});

it('accepte un enregistrement audio anonyme quel que soit le sous-type', async () => {
  // audio/mp4, audio/mpeg, audio/wav — même verdict
});

it('refuse toujours un document anonyme quand les fichiers sont interdits', async () => {
  // application/pdf, allowAnonymousFiles: false
  // attendu : 403, message inchangé — la régression la plus probable est d'ouvrir TOUT
});

it('refuse toujours une image anonyme quand les images sont interdites', async () => {
  // image/png, allowAnonymousImages: false
  // attendu : 403 — l'ajout de la branche audio ne doit pas relâcher les images
});
```

Reprendre la forme exacte des cas voisins pour la construction de la requête multipart : ne pas inventer un harnais parallèle.

- [ ] **Étape 2 : vérifier l'échec**

`cd services/gateway && bun run test -- attachments-upload`
Attendu : les deux premiers tests échouent en 403, les deux derniers passent déjà.

- [ ] **Étape 3 : implémentation minimale**

```ts
for (const file of files) {
  const isImage = file.mimeType.startsWith('image/');
  const isAudio = file.mimeType.startsWith('audio/');

  if (isAudio) {
    continue;
  }

  if (isImage && !shareLink.allowAnonymousImages) {
    return sendForbidden(reply, 'Images are not allowed for anonymous users on this conversation');
  }

  if (!isImage && !shareLink.allowAnonymousFiles) {
    return sendForbidden(reply, 'File uploads are not allowed for anonymous users on this conversation');
  }
}
```

Le `continue` porte la décision produit : la voix suit le droit d'écrire, pas le droit d'envoyer des fichiers. Commenter cette ligne en une phrase, en français, en nommant la décision — un futur lecteur doit comprendre que c'est voulu et non un oubli.

- [ ] **Étape 4 : vérifier le succès**

`cd services/gateway && bun run test -- attachments-upload` — tout vert.

- [ ] **Étape 5 : commit**

```bash
git add services/gateway/src/routes/attachments/upload.ts services/gateway/src/__tests__/unit/routes/attachments-upload.test.ts
git commit -- services/gateway/src/routes/attachments/upload.ts services/gateway/src/__tests__/unit/routes/attachments-upload.test.ts
```

---

## Volet C — masquer l'affordance au lieu d'annoncer l'interdiction

### Task 2 : `ToolbarButtons` sait ce qui est permis

**Fichiers :**
- Modifier : `apps/web/components/common/message-composer/ToolbarButtons.tsx:7-19` (props), `:96-117` (bouton trombone)
- Test : `apps/web/__tests__/components/message-composer/ToolbarButtons.test.tsx`

**Interfaces :**
- Produit :

```ts
type ToolbarButtonsProps = {
  onMicClick: () => void;
  onAttachmentClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Quand false, le trombone n'est pas rendu du tout. Le micro, lui, reste
   *  toujours rendu : la voix suit le droit d'écrire. */
  canAttach?: boolean;
};
```

`canAttach` est **optionnel et vaut `true` par défaut** : tous les appelants existants (dont le composer des conversations ordinaires, hors périmètre) gardent leur comportement sans modification.

- [ ] **Étape 1 : écrire les tests rouges**

```tsx
it('ne rend pas le trombone quand les pièces jointes ne sont pas permises', () => {
  render(<ToolbarButtons onMicClick={jest.fn()} onAttachmentClick={jest.fn()} canAttach={false} />);
  expect(screen.queryByRole('button', { name: /attach/i })).not.toBeInTheDocument();
});

it('rend toujours le micro, même sans droit de pièce jointe', () => {
  render(<ToolbarButtons onMicClick={jest.fn()} onAttachmentClick={jest.fn()} canAttach={false} />);
  expect(screen.getByRole('button', { name: /mic/i })).toBeInTheDocument();
});

it('rend le trombone par défaut quand la prop est absente', () => {
  render(<ToolbarButtons onMicClick={jest.fn()} onAttachmentClick={jest.fn()} />);
  expect(screen.getByRole('button', { name: /attach/i })).toBeInTheDocument();
});
```

Relire le test existant `ToolbarButtons.test.tsx:28` (« should render both Mic and Attachment buttons ») pour reprendre **exactement** ses sélecteurs de requête : s'il interroge par `aria-label`, `data-testid` ou texte, faire pareil plutôt qu'inventer un sélecteur qui ne correspondrait à rien.

- [ ] **Étape 2 : vérifier l'échec**

`cd apps/web && bun run test -- ToolbarButtons`
Attendu : les deux premiers échouent (le trombone est rendu inconditionnellement), le troisième passe déjà.

- [ ] **Étape 3 : implémentation minimale**

Ajouter `canAttach = true` à la déstructuration des props, et envelopper le seul bloc du bouton trombone (`:96-117`) dans `{canAttach && ( … )}`. Ne pas toucher au bouton micro.

- [ ] **Étape 4 : vérifier le succès**

`cd apps/web && bun run test -- ToolbarButtons` — tout vert.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/components/common/message-composer/ToolbarButtons.tsx apps/web/__tests__/components/message-composer/ToolbarButtons.test.tsx
git commit -- apps/web/components/common/message-composer/ToolbarButtons.tsx apps/web/__tests__/components/message-composer/ToolbarButtons.test.tsx
```

### Task 3 : le composer transporte le droit et restreint ce qu'il accepte

**Fichiers :**
- Modifier : `apps/web/components/common/message-composer/index.tsx:388-400` (retrait du bandeau), `:458` (passage de la prop), `:522-532` (input caché)
- Test : `apps/web/__tests__/components/common/message-composer.test.tsx`

**Interfaces :**
- Consomme : `ToolbarButtons` avec `canAttach` (Task 2).
- Produit : `MessageComposer` remplace sa prop `permissionHints?: string[]` par

```ts
  /** Autorisations d'envoi de la personne dans CETTE conversation. Absentes =
   *  tout est permis (conversations ordinaires). */
  attachmentPermissions?: { canSendImages: boolean; canSendFiles: boolean };
```

- [ ] **Étape 1 : écrire les tests rouges**

```tsx
it("ne rend aucun bandeau d'interdiction", () => {
  render(<MessageComposer {...baseProps} attachmentPermissions={{ canSendImages: false, canSendFiles: false }} />);
  expect(screen.queryByText(/non autoris/i)).not.toBeInTheDocument();
});

it('masque le trombone quand ni image ni fichier ne sont permis', () => { /* … */ });

it("n'accepte que les images quand seules les images sont permises", () => {
  render(<MessageComposer {...baseProps} attachmentPermissions={{ canSendImages: true, canSendFiles: false }} />);
  // l'input caché n'annonce que des types image
});

it('accepte tout quand la prop est absente', () => { /* comportement des conversations ordinaires */ });
```

Reprendre `baseProps` du fichier de test existant plutôt que d'en fabriquer un.

- [ ] **Étape 2 : vérifier l'échec**

`cd apps/web && bun run test -- message-composer`

- [ ] **Étape 3 : implémentation minimale**

1. Supprimer entièrement le bloc de badges ambre (`:388-400`).
2. Remplacer la prop `permissionHints` par `attachmentPermissions` dans le type et la signature.
3. Calculer `canAttach = permissions === undefined || permissions.canSendImages || permissions.canSendFiles`, et le passer à `ToolbarButtons` (`:458`).
4. Dériver la valeur d'`accept` de l'input caché (`:529`) : sans permissions, la valeur actuelle inchangée ; images seules permises, uniquement les types image ; fichiers seuls permis, la valeur actuelle privée des types image.

L'audio n'entre pas dans ce calcul : le micro a son propre chemin et reste toujours disponible.

- [ ] **Étape 4 : vérifier le succès**

`cd apps/web && bun run test -- message-composer`

- [ ] **Étape 5 : commit**

### Task 4 : la chaîne d'appel passe des booléens, plus des libellés

**Fichiers :**
- Modifier : `apps/web/utils/participant-mapper.ts:112-115` (suppression), `apps/web/components/chat/SharedConversationExperience.tsx:172`, `apps/web/components/bubble-stream/bubble-stream-page.tsx:226,725`, `apps/web/components/bubble-stream/StreamComposer.tsx:41,70,96`
- Test : `apps/web/__tests__/utils/participant-mapper.test.ts:257` (suppression du bloc), `apps/web/components/chat/__tests__/SharedConversationExperience.test.tsx`

**Interfaces :**
- Consomme : `link.allowAnonymousFiles`, `link.allowAnonymousImages` (`LinkConversationData['link']`, présents et typés — `apps/web/services/link-conversation.service.ts:21-22`).
- Produit : `attachmentPermissions` (Task 3) transporté de bout en bout.

- [ ] **Étape 1 : écrire les tests rouges**

Un test qui monte `SharedConversationExperience` avec un lien dont `allowAnonymousFiles: false, allowAnonymousImages: false` et vérifie que le trombone n'est pas rendu et qu'aucun texte « non autorisé » n'apparaît. Reprendre les fixtures existantes (`SharedConversationExperience.test.tsx:112-113` porte déjà ces deux champs).

- [ ] **Étape 2 : vérifier l'échec**

- [ ] **Étape 3 : implémentation minimale**

Supprimer `getAnonymousPermissionHints` et son bloc de test. Remplacer le calcul par la construction directe de `{ canSendImages: link.allowAnonymousImages, canSendFiles: link.allowAnonymousFiles }`, et renommer la prop tout au long de la chaîne (`anonymousPermissionHints` → `attachmentPermissions`).

Vérifier qu'aucun autre appelant de `getAnonymousPermissionHints` ne subsiste (`grep`) avant de supprimer.

- [ ] **Étape 4 : vérifier le succès**

`cd apps/web && bun run test -- participant-mapper SharedConversationExperience`

- [ ] **Étape 5 : commit**

---

## Volet B — la bulle par défaut

### Task 5 : le rendu par défaut devient la bulle

**Fichiers :**
- Modifier : `apps/web/lib/conversations/reading-mode.ts:6-13` (docstring), `:32` (`DEFAULT_READING_MODE`)
- Test : `apps/web/lib/conversations/__tests__/` et `apps/web/__tests__/lentille/`

**Contexte à lire avant d'agir.** Il existe DEUX chemins :

- **Drapeau `reading_modes` éteint** — l'état de la production aujourd'hui (`apps/web/hooks/lentille/resolve-reading-modes-flag.ts:94` renvoie `active: false`). Le rendu vient alors de `DEFAULT_READING_MODE`, qui vaut `'focal'` (`apps/web/lib/conversations/reading-mode.ts:32`). **C'est ce chemin que voient réellement les utilisateurs, et c'est lui que cette tâche corrige.**
- **Drapeau allumé** — `PROVISIONAL_DEFAULT_RENDER = 'bubbles'` (`apps/web/hooks/lentille/use-thread-reading-mode.ts:196`) fait DÉJÀ des bulles le défaut, par une décision produit du 2026-08-17 assumée le 2026-08-18. Rien à y changer.

La demande du propriétaire aligne donc le chemin vivant sur une décision déjà prise pour l'autre.

- [ ] **Étape 1 : écrire le test rouge**

```ts
it('sans préférence, le fil rend des bulles', () => {
  expect(DEFAULT_READING_MODE).toBe('bubble');
});

it("une préférence 'auto' se replie sur les bulles", () => {
  expect(readingModeFromPreference('auto')).toBe('bubble');
});

it('un choix explicite garde tout son pouvoir', () => {
  expect(readingModeFromPreference('focal')).toBe('focal');
  expect(readingModeFromPreference('script')).toBe('script');
});
```

Vérifier d'abord la valeur exacte attendue par `ReadingMode` : le tableau `READING_MODES` (`:28`) contient `'bubble'` au singulier côté façade, tandis que le schéma partagé emploie `'bulles'` et la loi partagée `'bubbles'`. **Utiliser la valeur du type que l'on modifie**, pas celle d'un voisin.

- [ ] **Étape 2 : vérifier l'échec**

`cd apps/web && bun run test -- reading-mode`

- [ ] **Étape 3 : implémentation minimale**

Passer `DEFAULT_READING_MODE` à `'bubble'`, et **corriger la docstring `:6-13`** qui affirme aujourd'hui que le focal est le mode par défaut et que la bulle est « l'ancien rendu, gardé le temps de la transition ». Cette phrase devient fausse : la réécrire en nommant la décision et sa date.

- [ ] **Étape 4 : vérifier le succès, puis la suite complète**

`cd apps/web && bun run test -- reading-mode`, puis `cd apps/web && bun run test`.

⚠️ **Des tests voisins vont probablement rougir** : plusieurs suites épinglent `'focal'` comme défaut (`apps/web/__tests__/lentille/`, `apps/web/stores/__tests__/reading-mode-store.test.ts`, `packages/shared/__tests__/reading-modes.test.ts`). Pour CHACUNE, décider en conscience et le dire dans le rapport : soit le test épinglait le défaut qui vient de changer, et il doit être mis à jour ; soit il épingle autre chose et sa rougeur signale une vraie régression — dans ce cas, **s'arrêter et le signaler** plutôt que de l'ajuster pour le faire taire.

Ne PAS toucher `CLAMP_FALLBACK_MODE` ni les catalogues de `packages/shared/utils/reading-modes.ts` : ils gouvernent le chemin sous drapeau allumé, qui a déjà son propre défaut. Si une incohérence apparaît entre les deux chemins, la signaler sans la corriger — c'est un arbitrage produit distinct.

- [ ] **Étape 5 : commit**

---

## Revue finale

Une fois les cinq tâches passées : vérifier de bout en bout qu'un invité anonyme sur un lien sans droit fichier ni droit image voit un composer **sans trombone**, **avec micro**, **sans aucun bandeau**, et que son message vocal part réellement. Vérifier qu'un invité avec droit image garde un trombone limité aux images. Vérifier qu'une conversation ordinaire est inchangée.
