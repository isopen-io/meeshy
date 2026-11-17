import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

/**
 * UN MÊME MOT POUR UNE PUBLICATION (épure #17584) — l'onglet et le compteur du
 * profil, le filtre des enregistrements et le titre de `/post` nomment la même
 * chose. En français un « poste » est un emploi : c'est « Publications ».
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

const PLURAL = { fr: 'Publications', en: 'Posts', es: 'Publicaciones', pt: 'Publicações', de: 'Beiträge', it: 'Pubblicazioni' } as const;

describe('« Publications », jamais « Postes »', () => {
  test('profil et enregistrements portent le même pluriel, celui du titre de /post', () => {
    for (const [language, plural] of Object.entries(PLURAL) as [keyof typeof PLURAL, string][]) {
      expect(translate(language, 'userProfile.tab.posts')).toBe(plural);
      expect(translate(language, 'userProfile.stat.posts')).toBe(plural);
      expect(translate(language, 'bookmarks.filter.posts')).toBe(plural);
      expect(plural.toLocaleLowerCase(language).startsWith(translate(language, 'post.detail.title').toLocaleLowerCase(language).slice(0, 4))).toBe(true);
    }
  });

  test('en arabe, les trois libellés partagent la racine du titre', () => {
    for (const key of ['userProfile.tab.posts', 'userProfile.stat.posts', 'bookmarks.filter.posts'] as const) {
      expect(translate('ar', key)).toContain('منشورات');
    }
    expect(translate('ar', 'post.detail.title')).toBe('منشور');
  });
});
