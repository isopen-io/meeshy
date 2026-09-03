import { axe } from 'jest-axe';

import {
  documentDeLInvitation,
  documentDeLaStory,
  documentIndisponible,
  type EtatDeLaStory,
} from '@/app/(public)/partage-vue';
import { GENRE_STORY } from '@/lib/contenu/partage';
import { partageLu, voisinage, type Story, type Voisine } from '@/lib/api/publication';

/**
 * Gate B (§ 9.5) sur la STORY : « 0 violation `axe` `serious`/`critical` ».
 *
 * L'écran ne peut pas entrer dans le balayage automatique de
 * `v3-a11y.spec.ts` : celui-ci découvre les PAGES que `next build` a émises, et
 * `/stories/:id` est un GESTIONNAIRE de route (§ 12.6) — il n'apparaît dans
 * aucun manifeste de page. Son gate vit donc ici, comme celui du fil et celui
 * de la galerie, et se rejoue au navigateur dans `e2e/visual/v3-story.spec.ts`.
 *
 * LES QUATRE ÉTATS SONT BALAYÉS, pas seulement le nominal : la story seule, la
 * story au milieu d'une file (les deux taps, qui sont des liens SANS texte
 * visible), l'invitation du visiteur, et l'indisponible.
 */

const ORIGINE = 'https://gate.test';
const MAINTENANT = Date.parse('2026-09-02T12:00:00.000Z');

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

const ecris = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

const story = (attributs: Record<string, unknown> = {}, langues: readonly string[] = ['fr']): Story => {
  const lue = partageLu({ genre: 'STORY',
    brut: {
      id: 's1',
      type: 'STORY',
      content: 'Three charts, two surprises.',
      originalLanguage: 'en',
      createdAt: '2026-09-02T09:00:00.000Z',
      expiresAt: '2026-09-03T05:00:00.000Z',
      authorId: 'u2',
      author: { id: 'u2', displayName: 'Ibrahim' },
      translations: { fr: { text: 'Trois graphiques, deux surprises.' }, es: { text: 'Tres gráficos, dos sorpresas.' } },
      ...attributs,
    },
    langues,
    langueDemandee: null,
    maintenant: MAINTENANT,
    origine: ORIGINE,
  });
  if (lue === null) throw new Error('story non lue');
  return lue;
};

const VOISINES: readonly Voisine[] = [
  { id: 's0', auteurId: 'u2', publieeA: '2026-09-02T06:00:00.000Z' },
  { id: 's1', auteurId: 'u2', publieeA: '2026-09-02T09:00:00.000Z' },
  { id: 's2', auteurId: 'u2', publieeA: '2026-09-02T11:00:00.000Z' },
];

const etat = (lue: Story, visibles: readonly Voisine[] = []): EtatDeLaStory => ({
  genre: GENRE_STORY,
  story: lue,
  voisinage: voisinage({ story: lue, visibles }),
  maintenant: MAINTENANT,
  confirmation: false,
  erreur: null,
  brouillon: '',
});

describe('la story — gate B', () => {
  it('ne porte aucune violation grave, story seule', async () => {
    ecris(documentDeLaStory(etat(story())));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, taps et file de segments rendus', async () => {
    ecris(documentDeLaStory(etat(story(), VOISINES)));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, story en MÉDIA avec sa légende', async () => {
    ecris(
      documentDeLaStory(
        etat(story({ media: [{ id: 'p1', fileUrl: '/api/v1/attachments/file/s.jpg', mimeType: 'image/jpeg', width: 1080, height: 1920, alt: 'Trois graphiques' }] })),
      ),
    );
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, réponse confirmée puis refusée', async () => {
    ecris(documentDeLaStory({ ...etat(story()), confirmation: true }));
    expect(await graves()).toEqual([]);

    ecris(documentDeLaStory({ ...etat(story()), erreur: 'Invalid request', brouillon: 'Bravo' }));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, invitation du visiteur sans session', async () => {
    ecris(documentDeLInvitation({ genre: GENRE_STORY, id: 's1' }));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave, story indisponible', async () => {
    ecris(documentIndisponible(GENRE_STORY));
    expect(await graves()).toEqual([]);
  });
});
