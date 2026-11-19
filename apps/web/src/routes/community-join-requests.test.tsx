import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CommunityJoinRequest } from '@/lib/api/community-join-requests';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';

import { JoinRequestsSection } from './community-join-requests-parts';

/**
 * LES DEMANDES EN ATTENTE DESSINÉES (#19871) — qui, d'où, quand, et les deux
 * gestes nommés pour le lecteur d'écran.
 */

const noop = () => undefined;

const request = (over: Partial<CommunityJoinRequest> = {}): CommunityJoinRequest => ({
  id: 'q1',
  userId: 'u-ann',
  name: 'Ann Sow',
  username: 'ann',
  avatar: null,
  country: 'SN',
  createdAt: '2026-11-18T09:00:00.000Z',
  ...over,
});

const section = (over: Partial<Parameters<typeof JoinRequestsSection>[0]> = {}) =>
  renderToStaticMarkup(
    <JoinRequestsSection language="fr" requests={[request()]} hasMore={false} busy={false} onAccept={noop} onReject={noop} onMore={noop} {...over} />,
  );

describe('les demandes en attente', () => {
  beforeAll(async () => {
    await loadCommunityMembershipCatalog('fr');
    await loadCommunityMembershipCatalog('en');
  });

  test('la section dit combien attendent ; « + » quand d’autres pages restent', () => {
    expect(section()).toContain('Demandes en attente · 1');
    const more = section({ hasMore: true, requests: [request(), request({ id: 'q2', name: 'Bob' })] });
    expect(more).toContain('Demandes en attente · 2+');
    expect(more).toContain('data-community-join-requests-more');
    expect(section()).not.toContain('data-community-join-requests-more');
  });

  test('une ligne dit qui, d’où (le pays, dans la langue) et quand', () => {
    const html = section();
    expect(html).toContain('Ann Sow');
    expect(html).toContain('Sénégal');
    expect(html).toContain('Demande du 18 nov. 2026');
    expect(section({ language: 'en' })).toContain('Senegal');
  });

  test('sans pays, la ligne ne dit que la date', () => {
    const html = section({ requests: [request({ country: null })] });
    expect(html).not.toContain('Sénégal');
    expect(html).toContain('Demande du');
  });

  test('« Accepter » et « Refuser » sont de vrais boutons nommés pour la personne', () => {
    const html = section();
    expect(html).toContain('aria-label="Accepter la demande de Ann Sow"');
    expect(html).toContain('aria-label="Refuser la demande de Ann Sow"');
    expect(html).not.toContain('disabled');
  });

  test('pendant un geste (ou hors ligne), les deux boutons attendent', () => {
    expect(section({ busy: true }).match(/disabled=""/g)?.length).toBe(2);
  });

  test('aucun point de présence sur un demandeur', () => {
    expect(section()).not.toContain('data-presence');
  });
});
