/**
 * Garde de source — #4968.
 *
 * `use-post-translation.ts` dépouillait la carte des traductions d'un post
 * (`{ langue: { text } }`) à la main avant de la passer à
 * `resolvePrismTranslation` — la jumelle d'ADAPTATEUR que le § Prisme du
 * `CLAUDE.md` racine interdit : elle ne fait pas servir une mauvaise langue,
 * elle fait servir l'ORIGINAL, ce qui ressemble à une traduction absente.
 *
 * `buildPostTranslationRecord` (`@meeshy/shared`) en est désormais la SSOT.
 * Cette garde vérifie que le hook DÉLÈGUE plutôt que de recopier — modèle :
 * `__tests__/lib/composer-door-single-source.test.ts`.
 *
 * Elle ne vise PAS les constructeurs de liste `TranslationItem[]`
 * (`PostCard.tsx`, `PostDetail.tsx`, `CommentItem.tsx`, `CanvasV3Scene.tsx`,
 * `status-transforms.ts`) : ceux-là alimentent le sélecteur MANUEL de
 * `TranslationToggle` (une liste `{languageCode, languageName, content}`, pas
 * une `Record<langue, texte>`) et ne décident jamais quelle langue s'affiche
 * PAR DÉFAUT — ils ne dupliquent donc pas la RÉSOLUTION que cette garde
 * protège.
 */
import * as fs from 'fs';
import * as path from 'path';

const HOOK_PATH = path.join(__dirname, '../../hooks/use-post-translation.ts');

describe('Garde — la résolution du Prisme des posts ne redépouille plus sa carte à la main', () => {
  const source = fs.readFileSync(HOOK_PATH, 'utf8');

  it('délègue à buildPostTranslationRecord de @meeshy/shared', () => {
    expect(source).toContain('buildPostTranslationRecord');
    expect(source).toContain("from '@meeshy/shared/utils/conversation-helpers'");
  });

  it("ne recopie plus le dépouillement local (`Object.entries(translations`)", () => {
    // Le défaut exact de #4968 : reconstruire `record[code] = entry.text` à la
    // main au lieu d'appeler la fonction partagée. Si ce motif réapparaît ici,
    // la jumelle est de retour.
    expect(source).not.toContain('Object.entries(translations');
  });
});
