## Un RÉ-EXPORT ne traverse pas un double qui énumère ses clés — et le symptôme est une levée avalée

*2026-11-08 — #17076, cycle 150*

### Ce qui s'est passé

J'ai extrait une fonction pure d'un gros service vers un module feuille, en
laissant un ré-export chez l'ancien propriétaire :

```ts
// service lourd
export { resolveAttachmentType };   // importé du module feuille
```

C'était le choix PRUDENT : neuf sites importaient ce nom depuis le service, dont
plusieurs doubles de test dont les commentaires disent explicitement « seul le
singleton est doublé, `resolveAttachmentType` reste le VRAI ». Ne pas toucher à
leur spécificateur d'import paraissait le moindre risque.

Sept témoins d'une suite voisine sont tombés, sur une assertion sans rapport :
`expect(mockOnMessageDeleted).toHaveBeenCalled()` → zéro appel.

### Le mécanisme

Le double de cette suite est pourtant de la bonne forme — `jest.requireActual`
plus surcharge ciblée, le patron que le dépôt prescrit :

```ts
jest.mock('…/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('…/ConversationMessageStatsService') as object),
  conversationMessageStatsService: { onMessageDeleted: … },
}));
```

À travers ce double, le ré-export se résout en `undefined`. Le consommateur
faisait `mimeTypes.map(resolveAttachmentType)` : `Array.prototype.map(undefined)`
LÈVE, dans un `try/catch` best-effort dont la seule trace est un `warn`. Donc
pas d'erreur visible, pas de 500, pas de message : **un compteur jamais
débité.**

### Ce qu'il faut en retenir

> **Un `export { x }` d'une liaison IMPORTÉE n'est pas un export comme les
> autres** : il se comporte différemment selon qu'on lit le module réel ou une
> copie de ses clés. Un balayage ne le voit pas, le compilateur l'accepte, et
> le patron de double le plus recommandé du dépôt ne le transporte pas.

La réparation n'est pas de rattraper le double : c'est de **ne pas
réexporter**. Les consommateurs de production importent la fonction du module
feuille, qui n'est doublé par personne — donc ils reçoivent toujours la vraie,
ce que les commentaires des doubles réclamaient depuis le début. Le ré-export
promettait ce que seul le changement d'import garantit.

Et la vérification qui m'a fait perdre le plus de temps : j'ai écrit une sonde
qui faisait `{ ...jest.requireActual(module) }` dans un fichier où ce module
n'était PAS mocké. Elle est passée. **Une sonde qui ne reproduit pas le
RÉGIME du site fautif — ici, module enregistré comme mocké — répond à une autre
question que celle qu'on pose.** La mesure utile a été d'instrumenter le `catch`
lui-même, qui a nommé la cause en une ligne.
