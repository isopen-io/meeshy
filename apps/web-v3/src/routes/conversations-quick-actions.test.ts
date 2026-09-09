import { describe, expect, test } from 'bun:test';

const source = await Bun.file(new URL('./conversations.tsx', import.meta.url)).text();

/**
 * **La queue d'accès rapides ne dépend pas de ce que le FILTRE laisse voir.**
 *
 * Mesuré sur iOS le 2026-09-09 : `listTail` vit à l'indentation du
 * `if groupedConversations.isEmpty { … } else { … }` de `ConversationListView`,
 * donc DEHORS — la queue se rend dans toutes les branches, y compris « la
 * recherche ne rend rien ». Et le compte qu'elle reçoit est
 * `conversationViewModel.conversations.count`, le compte BRUT, avec un
 * doc-comment qui dit pourquoi : « Combien de conversations ai-je ? » ne dépend
 * pas du filtre en cours.
 *
 * La v3.1 conditionnait la queue à `visible.length > 0` — le compte FILTRÉ.
 * Chercher un mot absent effaçait la seule aide de l'écran, exactement au
 * moment où l'on ne trouve pas ce qu'on cherche. Ces témoins auraient échoué
 * sur cette version-là.
 */
describe('la queue d’accès rapides suit iOS', () => {
  test('elle est conditionnée au corpus, jamais à la vue filtrée', () => {
    expect(source).toContain('{conversations.length > 0 ? (');
    expect(source).not.toContain('{visible.length > 0 ? (\n          <li');
  });

  test('elle reçoit le compte BRUT — sinon un filtre ferait revenir les héros', () => {
    expect(source).toContain('conversationCount={conversations.length}');
    expect(source).not.toContain('conversationCount={visible.length}');
  });

  test('la CALE, elle, reste conditionnée aux rangées : elle n’a rien à caler sans elles', () => {
    expect(source).toContain("minHeight: visible.length > 0 ? '50dvh' : 0");
  });

  test('l’état vide de démarrage passe zéro, écrit plutôt que sous-entendu', () => {
    expect(source).toContain('conversationCount={0}');
  });
});
