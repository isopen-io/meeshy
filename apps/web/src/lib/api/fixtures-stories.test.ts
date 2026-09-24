import { describe, expect, test } from 'bun:test';

import { STORY_FEED, STORY_TRAY } from './fixtures-stories';
import { feedMediaKindOf } from '@/lib/feed/layout';

/**
 * **LE CORPUS DES STORIES DOIT EXERCER CE QUE LE LECTEUR SAIT RENDRE** (#6807).
 *
 * `StoryMediaLayer` élit un `<video>` sur `feedMediaKindOf(mimeType) === 'video'`
 * (#6801, gardé par `routes/story-parts.test.tsx`) — mais AUCUNE story du
 * corpus ne porte de vidéo : les quatre servent `image/jpeg` ou
 * `image/svg+xml`. Mesuré au navigateur sur le serveur de développement le
 * 2026-09-16 : `/story/st-amie-2`, la SEULE story à média, monte un `<img>`,
 * et aucune adresse du corpus ne peut faire naître un `<video>`.
 *
 * La règle est donc juste, testée en unitaire, et **jouée par aucune recette** :
 * ni une capture, ni un gate navigateur, ni un œil humain ne peuvent la voir.
 * C'est la forme de défaut que le CLAUDE.md nomme au § Prisme — un correctif
 * dont la valeur n'atteint aucun lecteur n'a corrigé personne.
 *
 * Ces témoins gardent la DONNÉE, pas le rendu : le rendu a déjà les siens.
 */
describe('STORY_FEED — le corpus exerce ce que le lecteur sait rendre', () => {
  test('une story VIDÉO existe, avec une source décodable — sans elle, la branche vidéo du lecteur n’est jouée par aucune recette', () => {
    const avecVideo = STORY_FEED.filter((story) =>
      (story.media ?? []).some((media) => feedMediaKindOf(media.mimeType) === 'video'),
    );

    expect(avecVideo.length).toBeGreaterThanOrEqual(1);
    expect(avecVideo[0]?.media?.[0]?.url ?? '').toMatch(/^data:video\//);
  });

  test('le rail ANNONCE cette story vidéo — une story que le rail ignore n’est atteignable par aucun geste', () => {
    const videoStory = STORY_FEED.find((story) =>
      (story.media ?? []).some((media) => feedMediaKindOf(media.mimeType) === 'video'),
    );
    const idsDuRail = new Set(STORY_TRAY.map((story) => story.id));

    expect(videoStory === undefined ? '(aucune story vidéo)' : videoStory.id).toMatch(/^st-/);
    expect(videoStory !== undefined && idsDuRail.has(videoStory.id)).toBe(true);
  });
});
