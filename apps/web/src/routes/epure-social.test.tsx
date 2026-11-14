import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';
import { loadSoundsMineCatalog } from '@/lib/i18n-sounds-mine-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories';
import type { CommunityMember } from '@/lib/api/community-members';

import { BookmarksEmpty } from './bookmarks';
import { CallFilterRail, CallsEmpty } from './calls-parts';
import { KeypadStatusView } from './calls-keypad-parts';
import { CommunitiesEmpty, CommunityConversationsEmpty, CommunityConversationsSection, PrivacyToggle } from './communities-parts';
import { CommunityMembersLink, MemberRow } from './community-members-parts';
import { CommunityPostsEmpty } from './community-posts';
import { DiscoverEmpty, DiscoverTabBar, ReceivedRequestRow } from './discover-parts';
import { FeedEmpty } from './feed';
import { NotificationCategoryRail, NotificationsEmpty } from './notifications';
import { LanguagesSection } from './profile-sections';
import { ReelsEmpty } from './reels';
import { SoundsMineEmpty } from './sounds-mine';
import { StarredMessagesEmpty } from './starred-messages';
import { StoriesEmpty } from './stories';
import { MyStoriesEmpty } from './stories-mine';
import { ProfilePostsEmpty } from './user-profile-states';
import { ProfileRelationSection } from './user-profile-sections';
import { ProfileTabs } from '@/components/profile-tabs';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/notifications' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadCirclesCatalog('fr');
  await loadCommunityMembershipCatalog('fr');
  await loadSoundsMineCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/** Ce que l'œil lit : le texte `sr-only` (la note d'un (i) replié) en est ôté. */
const seen = (html: string): string =>
  html
    .replace(/<(p|span|div)\b[^>]*\bsr-only\b[^>]*>[^<]*<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Ce que le lecteur d'écran entend : tout le texte, repliés compris. */
const heard = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const CATALOG_DIR = new URL('../lib/interface-catalogs/', import.meta.url).pathname;
const catalogSources = readdirSync(CATALOG_DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, source: readFileSync(CATALOG_DIR + name, 'utf8') }));
const filesDeclaring = (key: string): number => catalogSources.filter(({ source }) => source.includes(`'${key}':`)).length;

/**
 * ÉPURE 1/3 (#18196, #17584) — découvrir, profil, appels et états vides.
 * Un état vide TIENT EN UNE LIGNE : le titre, plus l'action s'il en existe une.
 * Ce qui quitte l'écran n'est pas perdu : il passe derrière un (i) nommé par sa
 * question, ou il disparaît avec sa clé, des SEPT langues.
 */
describe('les clés sans lecteur disparaissent des sept langues', () => {
  const REMOVED = [
    'notifications.empty.subtitle',
    'discover.requests.intent',
    'discover.requests.empty.received.subtitle',
    'discover.requests.empty.sent.subtitle',
    'discover.blocked.empty.subtitle',
    'calls.empty.subtitle',
    'calls.empty.missed.subtitle',
    'keypad.prompt.subtitle',
    'community.list.empty.subtitle',
    'community.posts.empty.body',
    'userProfile.conversations.emptyBody',
    'userProfile.posts.emptyBody',
    'hashtag.empty.body',
    'feed.empty.subtitle',
    'storiesMine.empty.subtitle',
    'reels.empty.hint',
    'comments.empty.hint',
    'story.views.empty.subtitle',
    'viewerEngagement.empty.subtitle',
    'community.detail.stats.members',
    'profile.language.primary.subtitle',
  ];
  for (const key of REMOVED) {
    test(`« ${key} » n’existe plus dans aucun catalogue`, () => {
      expect(filesDeclaring(key)).toBe(0);
    });
  }

  const ADDED = [
    'circles.intro',
    'profile.language.intro',
    'community.create.privacy.question',
    'bookmarks.empty.question',
    'starred.messages.empty.question',
    'stories.empty.question',
    'soundsMine.empty.question',
    'calls.search.placeholder',
    'action.more',
  ];
  for (const key of ADDED) {
    test(`« ${key} » est écrite dans les sept langues`, () => {
      expect(filesDeclaring(key)).toBe(7);
    });
  }
});

describe('/notifications : trois pastilles et « Plus »', () => {
  const noop = () => undefined;
  const pills = (html: string): number => (html.match(/data-category="/g) ?? []).length;

  test('au repos : Toutes, Non lues, Messages, et « Plus »', () => {
    const html = renderToStaticMarkup(<NotificationCategoryRail language="fr" selected="all" onSelect={noop} />);
    expect(pills(html)).toBe(3);
    expect(seen(html)).toBe('Toutes Non lues Messages Plus');
    expect(html).toContain('aria-expanded="false"');
  });

  test('la catégorie active, rangée, reste lue sur la pastille « Plus »', () => {
    const html = renderToStaticMarkup(<NotificationCategoryRail language="fr" selected="mentions" onSelect={noop} />);
    expect(seen(html)).toContain('Mentions');
    expect(seen(html)).not.toContain('Plus');
    expect(html).toContain('aria-label="Plus : Mentions"');
  });

  test('ce nom se dit avec la ponctuation de chaque langue, jamais l’espace française devant les deux-points', async () => {
    await loadInterfaceCatalog('en');
    await loadInterfaceCatalog('ar');
    const en = renderToStaticMarkup(<NotificationCategoryRail language="en" selected="mentions" onSelect={noop} />);
    const ar = renderToStaticMarkup(<NotificationCategoryRail language="ar" selected="mentions" onSelect={noop} />);
    expect(en).toContain('aria-label="More: Mentions"');
    expect(ar).not.toContain(' : ');
  });

  test('« Plus » rend atteintes les neuf autres catégories, et choisir en referme la liste', async () => {
    const chosen: string[] = [];
    const host = await mount(<NotificationCategoryRail language="fr" selected="all" onSelect={(category) => chosen.push(category)} />);
    const more = host.querySelector<HTMLButtonElement>('[data-category-more]');
    if (more === null) throw new Error('« Plus » absent');
    const { act } = await import('react');
    act(() => more.click());
    expect(host.querySelectorAll('[data-category]').length).toBe(NOTIFICATION_CATEGORIES.length);
    const calls = host.querySelector<HTMLButtonElement>('[data-category="calls"]');
    if (calls === null) throw new Error('« Appels » inatteignable');
    act(() => calls.click());
    expect(chosen).toEqual(['calls']);
    expect(host.querySelectorAll('[data-category]').length).toBe(3);
  });
});

describe('un état vide tient en une ligne', () => {
  test('notifications : le titre seul', () => {
    const text = seen(renderToStaticMarkup(<NotificationsEmpty language="fr" category="all" />));
    expect(text).toBe('Aucune notification');
  });

  test('appels : le titre seul, sous « Tous » comme sous « Manqués »', () => {
    expect(seen(renderToStaticMarkup(<CallsEmpty language="fr" filter="all" />)).split(' ').length).toBeLessThanOrEqual(4);
    expect(seen(renderToStaticMarkup(<CallsEmpty language="fr" filter="missed" />)).split(' ').length).toBeLessThanOrEqual(4);
  });

  test('clavier d’appel : ni sous-titre redit, ni consigne', () => {
    const html = renderToStaticMarkup(<KeypadStatusView language="fr" status="idle" onRetry={() => undefined} />);
    expect(html).not.toContain('<p');
    const none = renderToStaticMarkup(<KeypadStatusView language="fr" status="none" onRetry={() => undefined} />);
    expect(none.match(/<p /g)?.length).toBe(1);
  });

  test('découvrir : DiscoverEmpty sans sous-titre ne rend que le titre', () => {
    const html = renderToStaticMarkup(<DiscoverEmpty data="blocked" glyph={null} title="Aucune personne bloquée" />);
    expect(html.match(/<p /g)?.length).toBe(1);
  });

  test('communautés, conversations, publications, flux, réels, stories : une ligne', () => {
    const one = (html: string): void => expect(html.match(/<p\b/g)?.length ?? 0).toBeLessThanOrEqual(1);
    one(renderToStaticMarkup(<CommunityConversationsEmpty language="fr" />));
    one(renderToStaticMarkup(<CommunityPostsEmpty language="fr" />));
    one(renderToStaticMarkup(<FeedEmpty />));
    one(renderToStaticMarkup(<ReelsEmpty language="fr" />));
    one(renderToStaticMarkup(<MyStoriesEmpty language="fr" />));
    expect(seen(renderToStaticMarkup(<CommunitiesEmpty language="fr" />))).not.toContain('Rejoignez ou créez');
  });

  test('les conversations d’une communauté se disent « Aucune conversation »', () => {
    expect(seen(renderToStaticMarkup(<CommunityConversationsEmpty language="fr" />))).toBe('Aucune conversation');
  });

  test('profil : la liste vide de publications ne dit que son titre ; filtrée, elle ne dit que ce qui manque et rend son geste', () => {
    const all = renderToStaticMarkup(<ProfilePostsEmpty language="fr" filter="all" onClear={() => undefined} />);
    expect(all.match(/<p\b/g)?.length).toBe(1);
    const reels = renderToStaticMarkup(<ProfilePostsEmpty language="fr" filter="reels" onClear={() => undefined} />);
    expect(reels.match(/<p\b/g)?.length).toBe(1);
  });
});

describe('l’explication d’un état vide passe derrière un (i) nommé par sa QUESTION', () => {
  const cases: ReadonlyArray<readonly [string, () => string, string, RegExp]> = [
    ['enregistrés', () => renderToStaticMarkup(<BookmarksEmpty />), 'Comment enregistrer une publication ?', /signet/],
    ['favoris', () => renderToStaticMarkup(<StarredMessagesEmpty />), 'Comment ajouter un favori ?', /Appuyez longuement/],
    ['sons', () => renderToStaticMarkup(<SoundsMineEmpty language="fr" />), 'D’où viennent mes sons ?', /extraits de vos vidéos/],
    ['stories', () => renderToStaticMarkup(<StoriesEmpty language="fr" />), 'Combien de temps dure une story ?', /vingt heures/],
  ];
  for (const [name, render, question, note] of cases) {
    test(`${name} : le (i) porte la question, la note reste lue mais n’est pas vue`, () => {
      const html = render();
      expect(html).toContain(`aria-label="${question}"`);
      expect(html).toContain('aria-expanded="false"');
      expect(heard(html)).toMatch(note);
      expect(seen(html)).not.toMatch(note);
    });
  }

  test('l’action de l’état vide reste visible (enregistrés, favoris, stories)', () => {
    expect(seen(renderToStaticMarkup(<BookmarksEmpty />))).toContain('Ouvrir le Flux');
    expect(seen(renderToStaticMarkup(<StarredMessagesEmpty />))).toContain('Ouvrir les conversations');
    expect(seen(renderToStaticMarkup(<StoriesEmpty language="fr" />))).toMatch(/Créer|story/i);
  });

  test('sons : le titre est le mot du lexique', () => {
    expect(seen(renderToStaticMarkup(<SoundsMineEmpty language="fr" />))).toBe('Aucun son');
  });
});

describe('/discover', () => {
  const tabBar = renderToStaticMarkup(<DiscoverTabBar language="fr" selected="discover" received={3} onSelect={() => undefined} />);

  test('les onglets disent leur nom entier, sans icône ni troncature, et « Demandes » garde son badge', () => {
    expect(seen(tabBar)).toContain('Demandes');
    expect(tabBar).not.toContain('<svg');
    expect(tabBar).not.toContain('truncate');
    expect(tabBar).toContain('data-discover-tab-count="3"');
  });

  test('une demande reçue montre le message du demandeur, et rien quand il n’en a pas laissé', () => {
    const base = {
      id: 'r1',
      senderId: 'u-ada',
      receiverId: 'u-me',
      status: 'pending',
      createdAt: '2026-11-14T09:00:00.000Z',
      sender: { id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null },
      receiver: null,
    } as const;
    const withMessage = renderToStaticMarkup(
      <ReceivedRequestRow language="fr" request={{ ...base, message: 'Salut, c’est Ada' }} now={new Date('2026-11-14T10:00:00.000Z')} onAccept={() => undefined} onReject={() => undefined} />,
    );
    const without = renderToStaticMarkup(
      <ReceivedRequestRow language="fr" request={{ ...base, message: null }} now={new Date('2026-11-14T10:00:00.000Z')} onAccept={() => undefined} onReject={() => undefined} />,
    );
    expect(seen(withMessage)).toContain('Salut, c’est Ada');
    expect(without).not.toContain('data-request-message');
    expect(seen(without)).not.toContain('Souhaite entrer en contact');
  });
});

describe('/calls : la recherche tient en un mot', () => {
  test('le champ affiche « Rechercher », son nom accessible garde la précision', () => {
    const html = renderToStaticMarkup(
      <CallFilterRail language="fr" selected="all" onSelect={() => undefined} search={{ value: '', onChange: () => undefined }} />,
    );
    expect(html).toContain('placeholder="Rechercher"');
    expect(html).toContain('aria-label="Rechercher un nom"');
  });
});

describe('une communauté', () => {
  test('la confidentialité se nomme, et « Qui peut rejoindre ? » ouvre l’explication', () => {
    const html = renderToStaticMarkup(<PrivacyToggle language="fr" isPrivate onToggle={() => undefined} />);
    expect(html).toContain('aria-label="Qui peut rejoindre ?"');
    expect(seen(html)).toBe('Communauté privée');
    expect(heard(html)).toContain('Seuls les membres invités');
    expect(html).toContain('aria-describedby="community-privacy-caption"');
    expect(html).toContain('id="community-privacy-caption"');
  });

  test('la section d’un onglet actif ne redit pas son nom', () => {
    const html = renderToStaticMarkup(<CommunityConversationsSection>{null}</CommunityConversationsSection>);
    expect(html).not.toContain('<h2');
    expect(seen(html)).toBe('');
  });

  test('le nombre de membres passe dans la rangée Membres', () => {
    const html = renderToStaticMarkup(<CommunityMembersLink language="fr" communityId="c1" count={1284} />);
    expect(seen(html).replace(/ | /g, ' ')).toBe('Membres 1 284');
  });

  test('un membre garde son rôle pour le lecteur d’écran, plus pour l’œil — la section le porte', () => {
    const member: CommunityMember = { id: 'row-1', userId: 'u-bob', role: 'moderator', name: 'Bob Diallo', username: 'bob', avatar: null, online: false };
    const html = renderToStaticMarkup(
      <ul>
        <MemberRow
          language="fr"
          member={member}
          isViewer={false}
          gestures={{ roles: [], canRemove: false }}
          expanded={false}
          pending={false}
          onToggle={() => undefined}
          onRole={() => undefined}
          onRemove={() => undefined}
          first
        />
      </ul>,
    );
    expect(heard(html)).toContain('Modérateur');
    expect(seen(html)).toContain('Bob Diallo');
    expect(seen(html)).not.toContain('Modérateur');
  });
});

describe('/me et /u : les repères restent, le reste se range', () => {
  test('le bloc Langues dit au repos ce qu’il fait, une seule fois pour les trois rangs', () => {
    const html = renderToStaticMarkup(
      <LanguagesSection language="fr" systemLanguage="fr" regionalLanguage="en" customDestinationLanguage={null} disabled={false} onOpen={() => undefined} onClear={() => undefined} />,
    );
    expect(seen(html)).toContain('Le contenu est traduit dans la première de ces langues qui est disponible.');
    expect(html).not.toContain('Le contenu sera traduit dans cette langue');
  });

  test('les onglets du profil sont entiers : pas d’icône, pas de troncature', () => {
    const html = renderToStaticMarkup(<ProfileTabs language="fr" tabs={['details', 'conversations', 'posts']} active="details" onChange={() => undefined} idBase="t" />);
    expect(seen(html)).toContain('Conversations');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('truncate');
  });

  const relation = (actions: readonly ('add' | 'write' | 'block' | 'report')[]) => (
    <ProfileRelationSection
      language="fr"
      relation={{ kind: 'none' }}
      actions={actions}
      name="Ada"
      signedIn
      online
      busy={false}
      onAction={() => undefined}
      onSignIn={() => undefined}
    />
  );

  test('au repos : Ajouter et Écrire ; Bloquer et Signaler derrière ⋯, atteignables', async () => {
    const html = renderToStaticMarkup(relation(['add', 'write', 'block', 'report']));
    expect(html).toContain('data-profile-action="add"');
    expect(html).toContain('data-profile-action="write"');
    expect(html).not.toContain('data-profile-action="block"');
    expect(html).not.toContain('data-profile-action="report"');
    const host = await mount(relation(['add', 'write', 'block', 'report']));
    const more = host.querySelector<HTMLButtonElement>('[data-profile-more]');
    if (more === null) throw new Error('⋯ absent');
    expect(more.getAttribute('aria-label')).toBe('Plus');
    const { act } = await import('react');
    act(() => more.click());
    expect(host.querySelector('[data-profile-action="block"]')).not.toBeNull();
    expect(host.querySelector('[data-profile-action="report"]')).not.toBeNull();
  });

  test('sans geste rare, aucun ⋯', () => {
    expect(renderToStaticMarkup(relation(['add', 'write']))).not.toContain('data-profile-more');
  });
});
