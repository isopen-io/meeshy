import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  createParticipationStore,
  notePublicationParticipation,
  storyRailParticipated,
  usePublicationParticipation,
  type PublicationParticipation,
} from './publication-participation';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

/**
 * CE QUE LE LECTEUR A DÉJÀ FAIT D'UNE PUBLICATION (directive porteur
 * 2026-10-01 : « le contour du cœur sur tous les autres éléments lorsqu'on a
 * commenté, partagé ») — la passerelle sert la réaction du lecteur
 * (`currentUserReactions`) mais NI son commentaire NI son envoi sur une story.
 * Ce magasin retient ce que CE lecteur a fait pendant la session ; le rail le
 * lit pour poser l'anneau.
 */
describe('le magasin de participation', () => {
  test('une publication jamais touchée n’a rien', () => {
    const store = createParticipationStore();
    expect(store.marksOf('st-1').size).toBe(0);
  });

  test('un geste noté est retenu pour SA publication, pas pour la voisine', () => {
    const store = createParticipationStore();
    store.note('st-1', 'commented');
    store.note('st-1', 'sent');
    expect([...store.marksOf('st-1')].sort()).toEqual(['commented', 'sent']);
    expect(store.marksOf('st-2').size).toBe(0);
  });

  test('noter deux fois le même geste ne réveille personne', () => {
    const store = createParticipationStore();
    const before = store.marksOf('st-1');
    store.note('st-1', 'commented');
    const once = store.marksOf('st-1');
    store.note('st-1', 'commented');
    expect(store.marksOf('st-1')).toBe(once);
    expect(once).not.toBe(before);
  });

  test('un abonné apprend le geste noté', () => {
    const store = createParticipationStore();
    const heard: string[] = [];
    const stop = store.subscribe(() => heard.push('changed'));
    store.note('st-1', 'sent');
    stop();
    store.note('st-1', 'commented');
    expect(heard).toEqual(['changed']);
  });
});

describe('ce que le rail de la story allume', () => {
  const marks = (...kinds: readonly PublicationParticipation[]): ReadonlySet<PublicationParticipation> => new Set(kinds);

  test('rien de fait ⇒ aucun anneau', () => {
    expect(storyRailParticipated({ marks: marks(), reacted: false })).toEqual({
      react: false,
      comments: false,
      forward: false,
      share: false,
      repost: false,
    });
  });

  test('le cœur posé, le commentaire écrit, la story envoyée : chacun sur SON bouton', () => {
    expect(storyRailParticipated({ marks: marks('commented', 'sent'), reacted: true })).toEqual({
      react: true,
      comments: true,
      forward: true,
      share: true,
      repost: false,
    });
  });

  test('republier allume « Republier », et lui seul', () => {
    expect(storyRailParticipated({ marks: marks('reposted'), reacted: false }).repost).toBe(true);
    expect(storyRailParticipated({ marks: marks('reposted'), reacted: false }).forward).toBe(false);
  });
});

describe('le lecteur apprend le geste sans relecture', () => {
  function Probe({ postId }: { readonly postId: string }) {
    return <span data-marks={[...usePublicationParticipation(postId)].join(',')} />;
  }

  test('un geste noté pendant la lecture rend la story qui le porte — et seulement elle', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <>
          <Probe postId="st-hook-1" />
          <Probe postId="st-hook-2" />
        </>,
      ),
    );
    const marks = () => [...host.querySelectorAll('[data-marks]')].map((el) => el.getAttribute('data-marks'));
    expect(marks()).toEqual(['', '']);
    await act(async () => notePublicationParticipation('st-hook-1', 'commented'));
    expect(marks()).toEqual(['commented', '']);
    await act(async () => root.unmount());
    host.remove();
  });
});
