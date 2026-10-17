import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '@/lib/api/http';
import type { RevokeSessionsResult } from '@/lib/api/revoke-sessions';
import { loadRevokeSessionsCatalog, translateRevokeSessions as translate } from '@/lib/i18n-revoke-sessions-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { arriveByEmailLink, leaveEmailLink, tokenInHistory } from '@/test-support/email-link-arrival';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { REVOKE_SESSIONS_KEYS, RevokeSessionsPage, type RevokeSessionsPageDeps } from './revoke-sessions';

/**
 * `/auth/revoke-sessions` (#10859) — le lien « ce n'était pas moi » de l'alerte
 * de nouvelle connexion. Il visait un `GET` de la passerelle qui MUTAIT, jeton
 * dans la requête : journalisé, et déclenché par tout pré-chargeur de liens.
 * La page dit la conséquence ; seul le CLIC part, jeton dans le corps.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  await loadRevokeSessionsCatalog('en');
  await loadRevokeSessionsCatalog('fr');
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const refused = (status: number, code?: string): ApiFailure => ({ ok: false, status, error: 'refus', ...(code === undefined ? {} : { code }) });

function scripted(reply: ApiResult<RevokeSessionsResult> = refused(500)) {
  const sent: string[] = [];
  const deps: RevokeSessionsPageDeps = {
    revoke: async (token) => {
      sent.push(token);
      return reply;
    },
  };
  return { deps, sent };
}

describe('le lien « ce n’était pas moi »', () => {
  test('la page dit la conséquence, et rien ne part avant le clic', async () => {
    const script = scripted();
    const host = await mount(<RevokeSessionsPage token="jwt.1" online language="fr" deps={script.deps} />);
    expect(host.querySelector('h1')?.textContent).toBe(translate('fr', 'revokeSessions.title'));
    expect(buttonNamed(host, translate('fr', 'revokeSessions.action'))).not.toBeNull();
    expect(script.sent).toEqual([]);
  });

  test('le clic remet le jeton, puis la page dit que tout est fermé', async () => {
    const script = scripted({ ok: true, data: { revokedCount: 3 } });
    const host = await mount(<RevokeSessionsPage token="jwt.1" online language="fr" deps={script.deps} />);
    await click(buttonNamed(host, translate('fr', 'revokeSessions.action')));
    expect(script.sent).toEqual(['jwt.1']);
    expect(host.querySelector('h1')?.textContent).toBe(translate('fr', 'revokeSessions.done.title'));
  });

  test('un lien expiré le dit, et ne propose plus le geste', async () => {
    const script = scripted(refused(400, 'INVALID_OR_EXPIRED_LINK'));
    const host = await mount(<RevokeSessionsPage token="jwt.1" online language="fr" deps={script.deps} />);
    await click(buttonNamed(host, translate('fr', 'revokeSessions.action')));
    expect(host.textContent).toContain(translate('fr', 'revokeSessions.invalid'));
    expect(buttonNamed(host, translate('fr', 'revokeSessions.action'))).toBeNull();
  });

  test('une panne garde le geste pour réessayer', async () => {
    const script = scripted(refused(503));
    const host = await mount(<RevokeSessionsPage token="jwt.1" online language="fr" deps={script.deps} />);
    await click(buttonNamed(host, translate('fr', 'revokeSessions.action')));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(buttonNamed(host, translate('fr', 'revokeSessions.action'))).not.toBeNull();
  });

  test('sans jeton, la page le dit et n’offre aucun geste', async () => {
    const script = scripted();
    const host = await mount(<RevokeSessionsPage token={null} online language="fr" deps={script.deps} />);
    expect(host.textContent).toContain(translate('fr', 'revokeSessions.invalid'));
    expect(buttonNamed(host, translate('fr', 'revokeSessions.action'))).toBeNull();
  });

  test('hors ligne : le geste attend le réseau', async () => {
    const host = await mount(<RevokeSessionsPage token="jwt.1" online={false} language="fr" deps={scripted().deps} />);
    expect(buttonNamed(host, translate('fr', 'revokeSessions.action'))?.disabled).toBe(true);
  });

  test('les sept langues ont chacune leur texte, jamais une recopie du français', async () => {
    for (const language of ['en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
      await loadRevokeSessionsCatalog(language);
      const texts = REVOKE_SESSIONS_KEYS.map((key) => translate(language, key));
      expect({ language, empty: texts.filter((text) => text.trim() === '' || REVOKE_SESSIONS_KEYS.includes(text as never)) }).toEqual({ language, empty: [] });
      expect({ language, same: REVOKE_SESSIONS_KEYS.filter((key) => translate(language, key) === translate('fr', key)) }).toEqual({ language, same: [] });
    }
  });
});

describe('le jeton quitte l’historique une fois servi (#10864)', () => {
  afterEach(leaveEmailLink);

  test('sessions fermées : l’entrée ne porte plus le jeton', async () => {
    arriveByEmailLink('/auth/revoke-sessions', 'jwt.done');
    const host = await mount(<RevokeSessionsPage token="jwt.done" online language="fr" deps={scripted({ ok: true, data: { revokedCount: 1 } }).deps} />);
    await click(buttonNamed(host, translate('fr', 'revokeSessions.action')));
    expect(tokenInHistory()).toBeNull();
  });

  test('lien refusé pour de bon : l’entrée ne porte plus le jeton', async () => {
    arriveByEmailLink('/auth/revoke-sessions', 'jwt.dead');
    const host = await mount(<RevokeSessionsPage token="jwt.dead" online language="fr" deps={scripted(refused(400, 'INVALID_OR_EXPIRED_LINK')).deps} />);
    await click(buttonNamed(host, translate('fr', 'revokeSessions.action')));
    expect(tokenInHistory()).toBeNull();
  });

  test('une panne le garde : réessayer en a besoin', async () => {
    arriveByEmailLink('/auth/revoke-sessions', 'jwt.retry');
    const host = await mount(<RevokeSessionsPage token="jwt.retry" online language="fr" deps={scripted(refused(503)).deps} />);
    await click(buttonNamed(host, translate('fr', 'revokeSessions.action')));
    expect(tokenInHistory()).toBe('jwt.retry');
  });
});
