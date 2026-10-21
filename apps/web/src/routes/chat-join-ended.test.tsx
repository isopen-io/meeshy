import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { GuestAccessEnd } from '@/lib/api/guest-access-end';
import { sessionStore } from '@/lib/api/session';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ChatJoin, type ChatJoinDeps } from './chat-join';
import { invitationPathOf } from './chat-join-ended';

/**
 * **LA PAGE DU LIEN DIT QUE L'ACCÈS EST FINI** (#10442) — `/chat/:link?ended=`,
 * où l'appareil ramène l'invité refusé par la passerelle. Un état clair dans
 * la langue du lecteur, et deux sorties : un nouveau lien, ou l'accueil.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const LINK = 'mshy_equipe_7f3a';
const LANGUAGES: readonly InterfaceLanguage[] = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'];
const speak = (language: InterfaceLanguage): void => {
  document.documentElement.lang = language;
};

beforeAll(async () => {
  await Promise.all(LANGUAGES.map((language) => loadInviteCatalog(language)));
  ensureHappyDomRegistered({ url: `http://localhost/chat/${LINK}?ended=expired` });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => {
    mounted?.root.unmount();
    sessionStore.getState().clearSession();
    speak('fr');
  });
  mounted?.container.remove();
  mounted = null;
});

function depsRecording(): { readonly deps: ChatJoinDeps; readonly visits: string[]; readonly loads: string[] } {
  const visits: string[] = [];
  const loads: string[] = [];
  const pending = new Promise<never>(() => undefined);
  const deps: ChatJoinDeps = {
    load: (link) => {
      loads.push(link);
      return pending;
    },
    join: () => pending,
    joinGuest: () => pending,
    adoptGuest: () => undefined,
    adoptInterfaceLanguage: () => undefined,
    go: (url) => {
      visits.push(url);
    },
    joined: () => undefined,
    expireSession: () => undefined,
    copyText: async () => 'copied',
    shareUrl: async () => 'partage',
    origin: () => 'http://localhost',
    now: () => new Date('2026-10-13T10:00:00.000Z'),
    handoff: () => ({ getItem: () => null, removeItem: () => undefined }),
    cachedCard: () => undefined,
    loadCard: async () => ({ ok: true, data: null }),
    leave: async () => ({ ok: true, data: null }),
    left: () => undefined,
  };
  return { deps, visits, loads };
}

async function mount(ended: GuestAccessEnd | null, deps: ChatJoinDeps): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<ChatJoin link={LINK} ended={ended} deps={deps} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

const TITLES: Readonly<Record<InterfaceLanguage, Readonly<Record<GuestAccessEnd, string>>>> = {
  fr: { expired: 'Ce lien a expiré', revoked: 'Ton accès a été retiré' },
  en: { expired: 'This link has expired', revoked: 'Your access has been removed' },
  es: { expired: 'Este enlace ha caducado', revoked: 'Se ha retirado tu acceso' },
  pt: { expired: 'Este link expirou', revoked: 'Seu acesso foi removido' },
  de: { expired: 'Dieser Link ist abgelaufen', revoked: 'Dein Zugang wurde entfernt' },
  it: { expired: 'Questo link è scaduto', revoked: 'Il tuo accesso è stato rimosso' },
  ar: { expired: 'انتهت صلاحية هذا الرابط', revoked: 'تمت إزالة وصولك' },
};

const notice = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-guest-access-ended]');

describe('l’état « accès fini », dans les sept langues', () => {
  for (const language of LANGUAGES) {
    for (const ended of ['expired', 'revoked'] as const) {
      test(`${language} — ${ended}`, async () => {
        speak(language);
        const el = await mount(ended, depsRecording().deps);
        const shown = notice(el);
        expect(shown?.getAttribute('data-guest-access-ended')).toBe(ended);
        expect(shown?.querySelector('h1')?.textContent).toBe(TITLES[language][ended]);
        expect(shown?.querySelector('[data-guest-ended-join]')).not.toBeNull();
        expect(shown?.querySelector('[data-guest-ended-home]')?.getAttribute('href')).toBe('/chats');
        if (language !== 'fr') expect(shown?.textContent ?? '').not.toContain('lien');
      });
    }
  }
});

describe('les sorties', () => {
  test('un nouveau lien collé ouvre SA page d’invitation', async () => {
    const { deps, visits } = depsRecording();
    const el = await mount('expired', deps);
    act(() => typeInto(el.querySelector<HTMLInputElement>('[data-guest-ended-link]'), 'https://meeshy.me/chat/mshy_nouveau_2b'));
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-guest-ended-join]')?.click();
    });
    expect(visits).toEqual(['/chat/mshy_nouveau_2b']);
  });

  test('un texte qui n’est pas un lien Meeshy est refusé et le dit', async () => {
    const { deps, visits } = depsRecording();
    const el = await mount('revoked', deps);
    act(() => typeInto(el.querySelector<HTMLInputElement>('[data-guest-ended-link]'), 'https://exemple.com/chat/piege'));
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-guest-ended-join]')?.click();
    });
    expect(visits).toEqual([]);
    expect(el.querySelector('[data-guest-ended-link]')?.getAttribute('aria-invalid')).toBe('true');
    expect(notice(el)?.textContent).toContain('Cette invitation est introuvable.');
  });

  test('sans `ended`, la page d’invitation ordinaire : aucun état de fin', async () => {
    const el = await mount(null, depsRecording().deps);
    expect(notice(el)).toBeNull();
  });
});

describe('invitationPathOf — ce qu’un texte collé désigne', () => {
  const origins = ['http://localhost'];
  test('adresses Meeshy, chemin, clé seule', () => {
    expect(invitationPathOf('https://meeshy.me/chat/mshy_a1', origins)).toBe('/chat/mshy_a1');
    expect(invitationPathOf('https://staging.meeshy.me/join/mshy_a1', origins)).toBe('/chat/mshy_a1');
    expect(invitationPathOf('http://localhost/chat/mshy_a1?x=1', origins)).toBe('/chat/mshy_a1');
    expect(invitationPathOf('/chat/mshy_a1', origins)).toBe('/chat/mshy_a1');
    expect(invitationPathOf('  mshy_a1  ', origins)).toBe('/chat/mshy_a1');
  });
  test('hôte étranger, autre adresse, vide : rien', () => {
    expect(invitationPathOf('https://exemple.com/chat/mshy_a1', origins)).toBeNull();
    expect(invitationPathOf('https://meeshy.me/c/abc', origins)).toBeNull();
    expect(invitationPathOf('javascript:alert(1)', origins)).toBeNull();
    expect(invitationPathOf('', origins)).toBeNull();
  });
});
