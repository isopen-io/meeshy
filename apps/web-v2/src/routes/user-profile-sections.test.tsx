import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PublicProfileStats } from '@/lib/api/public-profile';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { ProfileRelation } from '@/lib/profile/relation';
import { actionsFor } from '@/lib/profile/relation';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileRelationSection, ProfileStatsBand, ProfileStatsSection } from './user-profile-sections';
import { ProfilePostsEmpty } from './user-profile-states';

/**
 * **LES PIÈCES DU PROFIL PUBLIC, DESSINÉES** (#7083) — ce qu'aucune capture ne
 * dit et qu'aucun témoin de port ne peut prouver : qu'un compteur ABSENT ne
 * peint aucune tuile, que la tuile « Stories » n'est pas un bouton, et qu'un
 * lecteur sans session reçoit une INVITATION plutôt qu'un contrôle inerte.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const noop = () => undefined;

/** LA CHARGE D'UN TIERS — `servedUserStats` a RETIRÉ les quatre intimes
 * (`routes/user-stats.ts:245-251`). Le décodeur les rend `null`, jamais `0`. */
const THIRD_PARTY: PublicProfileStats = {
  languagesUsed: 4,
  memberDays: 561,
  postsCount: 3,
  reelsCount: 2,
  storiesCount: 7,
  totalMessages: null,
  totalConversations: null,
  totalTranslations: null,
  friendRequestsReceived: null,
};

const SELF: PublicProfileStats = { ...THIRD_PARTY, totalMessages: 1204, totalConversations: 18, totalTranslations: 340, friendRequestsReceived: 3 };

const parse = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

const band = (stats: PublicProfileStats | null, filter: 'all' | 'posts' | 'reels' = 'all') =>
  parse(renderToStaticMarkup(<ProfileStatsBand language="fr" stats={stats} filter={filter} onFilter={noop} />));

const statsSection = (stats: PublicProfileStats | null) =>
  parse(renderToStaticMarkup(<ProfileStatsSection language="fr" stats={stats} createdAt="2024-03-08T09:00:00.000Z" loading={false} />));

describe('ProfileStatsBand — ce qui est servi, et rien de plus', () => {
  test('les trois tuiles portent les comptes SERVIS', () => {
    const el = band(THIRD_PARTY);
    expect(el.querySelector('[data-profile-tile="postsCount"]')?.textContent).toContain('3');
    expect(el.querySelector('[data-profile-tile="reelsCount"]')?.textContent).toContain('2');
    expect(el.querySelector('[data-profile-tile="storiesCount"]')?.textContent).toContain('7');
  });

  test('« 0 » SERVI se peint — il est distinct d’un compteur absent', () => {
    const el = band({ ...THIRD_PARTY, postsCount: 0 });
    const tile = el.querySelector('[data-profile-tile="postsCount"]');
    expect(tile).not.toBeNull();
    expect(tile?.querySelector('strong')?.textContent).toBe('0');
  });

  test('un compteur ABSENT ne peint AUCUNE tuile — jamais un zéro fabriqué', () => {
    const el = band({ ...THIRD_PARTY, reelsCount: null });
    expect(el.querySelector('[data-profile-tile="reelsCount"]')).toBeNull();
    expect(el.querySelector('[data-profile-tile="postsCount"]')).not.toBeNull();
  });

  test('« Postes » et « Réels » sont des BOUTONS ; « Stories » n’en est PAS un', () => {
    const el = band(THIRD_PARTY);
    expect(el.querySelector('[data-profile-tile="postsCount"] button')).not.toBeNull();
    expect(el.querySelector('[data-profile-tile="reelsCount"] button')).not.toBeNull();
    /* iOS l'ouvre parce qu'il a l'écran ; la v3.1 ne l'a pas. Un bouton sans
       effet serait un contrôle qui ment (loi 4). */
    expect(el.querySelector('[data-profile-tile="storiesCount"] button')).toBeNull();
  });

  test('la tuile ACTIVE le dit, et son libellé devient « tout afficher »', () => {
    const active = band(THIRD_PARTY, 'reels').querySelector('[data-profile-filter="reels"]');
    expect(active?.getAttribute('aria-pressed')).toBe('true');
    expect(active?.getAttribute('aria-label')).toBe('Tout afficher');
    const idle = band(THIRD_PARTY, 'all').querySelector('[data-profile-filter="reels"]');
    expect(idle?.getAttribute('aria-pressed')).toBe('false');
    expect(idle?.getAttribute('aria-label')).toBe('Filtrer sur Réels');
  });

  test('chaque tuile porte UN nom lisible, « valeur + nom », jamais deux fragments épars', () => {
    const el = band(THIRD_PARTY);
    expect(el.querySelector('[data-profile-tile="storiesCount"] [role="img"]')?.getAttribute('aria-label')).toBe('7 Stories');
  });

  test('sans statistiques, aucun bandeau — pas un bandeau de zéros', () => {
    expect(band(null).querySelector('[data-profile-band]')).toBeNull();
  });
});

describe('ProfileStatsSection — le défaut d’iOS qu’on ne copie pas', () => {
  test('sur la fiche d’un TIERS, « Messages » et « Traductions » sont ABSENTS du document', () => {
    const el = statsSection(THIRD_PARTY);
    expect(el.querySelector('[data-profile-stat="languagesUsed"]')).not.toBeNull();
    expect(el.querySelector('[data-profile-stat="memberDays"]')).not.toBeNull();
    /* iOS rend `stats.totalMessages` sans condition et annonce « 0 Messages »
       sur la fiche d'autrui — une valeur FAUSSE présentée comme mesurée. */
    expect(el.querySelector('[data-profile-stat="totalMessages"]')).toBeNull();
    expect(el.querySelector('[data-profile-stat="totalTranslations"]')).toBeNull();
    expect(el.textContent).not.toContain('Messages');
    expect(el.textContent).not.toContain('Traductions');
  });

  test('sur SA PROPRE fiche, les deux compteurs intimes se peignent', () => {
    const el = statsSection(SELF);
    expect(el.querySelector('[data-profile-stat="totalMessages"]')?.textContent).toContain('1204');
    expect(el.querySelector('[data-profile-stat="totalTranslations"]')?.textContent).toContain('340');
  });

  test('« Membre depuis » porte une date, formatée dans la langue du lecteur', () => {
    expect(statsSection(THIRD_PARTY).querySelector('[data-profile-member-since]')?.textContent).toContain('2024');
  });
});

describe('ProfilePostsEmpty — le vide d’un FILTRE n’est pas le vide d’un COMPTE', () => {
  const empty = (filter: 'all' | 'posts' | 'reels') =>
    parse(renderToStaticMarkup(<ProfilePostsEmpty language="fr" filter={filter} />));

  test('sans filtre, c’est le compte qui ne publie rien', () => {
    const el = empty('all');
    expect(el.querySelector('[data-profile-posts-empty]')?.getAttribute('data-profile-posts-empty')).toBe('all');
    expect(el.textContent).toContain('Aucune publication');
    expect(el.textContent).toContain('Rien de public à lire');
  });

  /* Le bandeau annonce « 2 Réels » au-dessus : lui répondre « Aucune
     publication » serait faux au même instant, et priverait le lecteur du
     SEUL geste qui le sort de là — re-toucher la tuile. */
  test('sous un filtre, le texte nomme ce qui manque ET rend son geste', () => {
    const reels = empty('reels');
    expect(reels.textContent).toContain('Aucun réel');
    expect(reels.textContent).not.toContain('Aucune publication');
    expect(reels.textContent).toContain('Touchez à nouveau la tuile');
    expect(empty('posts').textContent).toContain('Aucun poste');
  });
});

const relationSection = (params: {
  readonly relation: ProfileRelation;
  readonly signedIn?: boolean;
  readonly online?: boolean;
  readonly awaitingRequest?: boolean;
}) =>
  parse(
    renderToStaticMarkup(
      <ProfileRelationSection
        language="fr"
        relation={params.relation}
        actions={actionsFor(params.relation)}
        name="Kwame Mensah"
        signedIn={params.signedIn ?? true}
        online={params.online ?? true}
        awaitingRequest={params.awaitingRequest ?? false}
        busy={false}
        onAction={noop}
        onSignIn={noop}
      />,
    ),
  );

describe('ProfileRelationSection — un contrôle existe s’il a un effet', () => {
  test('un lecteur SANS session reçoit une invitation à se connecter, jamais un bouton désactivé', () => {
    const el = relationSection({ relation: { kind: 'none' }, signedIn: false });
    expect(el.querySelector('[data-profile-signin]')).not.toBeNull();
    expect(el.querySelector('[data-profile-action="add"]')).toBeNull();
    expect(el.querySelector('[data-profile-signin-cta]')?.hasAttribute('disabled')).toBe(false);
  });

  test('sans relation : ajouter, écrire, bloquer', () => {
    const el = relationSection({ relation: { kind: 'none' } });
    expect([...el.querySelectorAll('[data-profile-action]')].map((n) => n.getAttribute('data-profile-action'))).toEqual(['add', 'write', 'block', 'report']);
  });

  test('une demande REÇUE explique de quoi il s’agit, et offre accepter / refuser', () => {
    const el = relationSection({ relation: { kind: 'pendingReceived', request: null }, awaitingRequest: true });
    expect(el.querySelector('[data-profile-context]')?.textContent).toContain('en attente');
    expect(el.querySelector('[data-profile-action="accept"]')?.hasAttribute('disabled')).toBe(true);
    /* « Écrire » et « Bloquer » n'attendent AUCUNE ligne : ils restent actifs. */
    expect(el.querySelector('[data-profile-action="write"]')?.hasAttribute('disabled')).toBe(false);
  });

  test('hors ligne, AUCUN geste d’écriture ne part — la v3.1 n’a pas de file d’écriture', () => {
    const el = relationSection({ relation: { kind: 'none' }, online: false });
    expect([...el.querySelectorAll('[data-profile-action]')].every((n) => n.hasAttribute('disabled'))).toBe(true);
  });

  test('un CONTACT ne se redemande pas : écrire et bloquer, rien d’autre', () => {
    const el = relationSection({ relation: { kind: 'friend' } });
    expect([...el.querySelectorAll('[data-profile-action]')].map((n) => n.getAttribute('data-profile-action'))).toEqual(['write', 'block', 'report']);
    expect(el.querySelector('[data-profile-context]')).toBeNull();
  });
});
