/**
 * #11274 — un pack a une FENÊTRE de disponibilité et un CIBLAGE (communauté,
 * pays, langue). Décision #11252 (défaut retenu) : un objet manqué revient,
 * aucune exclusivité définitive — la fenêtre gouverne l'OFFRE, jamais la
 * possession : un pack possédé hors fenêtre le reste.
 */
import { describe, expect, it } from 'vitest';
import { isPackOwned, packChoiceKey } from '../content-pack';
import { parsePackIndex } from '../content-pack-index';
import { isPackOffered, isPackShelved, packWindowState, type PackAudience } from '../pack-availability';
import { normalizeSeasonSchedule, applySeasonEdit } from '../../utils/game/season-schedule';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const asset = (prefix: string, ext = 'webp') => ({ src: `${prefix}.${ext}`, bytes: 1200, sha256: sha(prefix) });

const entry = (over: Record<string, unknown> = {}) => ({
  slug: 'fond-ete',
  domain: 'wallpaper',
  origin: 'official',
  version: 1,
  order: 1,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: asset('a1b2c3d4e5f60718'),
  preview: null,
  contract: asset('c1b2c3d4e5f60718', 'json'),
  strings: { fr: asset('d1b2c3d4e5f60718', 'json') },
  downloadBytes: { story: 1_800_000, square: null },
  names: { fr: { name: 'Fond d’été', description: 'Un fond solaire.' } },
  ...over,
});

const COMMUNITY = '64b7f0c2a1b2c3d4e5f60718';
const audience = (over: Partial<PackAudience> = {}): PackAudience => ({
  communityIds: new Set<string>(),
  country: 'FR',
  languages: ['fr', 'en'],
  ...over,
});
const at = (iso: string) => new Date(iso);

describe('le registre lit la fenêtre et le ciblage', () => {
  it('garde une fenêtre et un ciblage lisibles', () => {
    const availability = { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' };
    const targeting = { communities: [COMMUNITY], countries: ['CM', 'FR'], languages: ['fr'] };
    const [read] = parsePackIndex([entry({ availability, targeting })]).entries;
    expect(read?.availability).toEqual(availability);
    expect(read?.targeting).toEqual(targeting);
  });

  it('refuse une fenêtre qui finit avant de commencer', () => {
    const availability = { startsAt: '2026-11-30T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z' };
    expect(parsePackIndex([entry({ availability })]).rejected).toBe(1);
  });

  it('refuse un pays qui n’est pas un code ISO à deux lettres et une communauté qui n’est pas un identifiant', () => {
    expect(parsePackIndex([entry({ targeting: { countries: ['France'] } })]).rejected).toBe(1);
    expect(parsePackIndex([entry({ targeting: { communities: ['la-team'] } })]).rejected).toBe(1);
  });

  it('un ancien registre sans fenêtre ni ciblage reste lisible', () => {
    expect(parsePackIndex([entry()]).entries).toHaveLength(1);
  });
});

describe('la fenêtre gouverne l’offre', () => {
  const availability = { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z' };

  it('dit si la fenêtre est à venir, ouverte ou fermée', () => {
    expect(packWindowState(availability, at('2026-10-31T23:59:59Z'))).toBe('upcoming');
    expect(packWindowState(availability, at('2026-11-15T00:00:00Z'))).toBe('open');
    expect(packWindowState(availability, at('2026-11-30T00:00:00Z'))).toBe('closed');
    expect(packWindowState(undefined, at('2026-11-30T00:00:00Z'))).toBe('open');
  });

  it('n’offre le pack que dans sa fenêtre', () => {
    expect(isPackOffered({ availability }, { now: at('2026-11-15T00:00:00Z'), audience: audience() })).toBe(true);
    expect(isPackOffered({ availability }, { now: at('2026-12-01T00:00:00Z'), audience: audience() })).toBe(false);
  });
});

describe('le ciblage gouverne l’offre', () => {
  const now = at('2026-11-15T00:00:00Z');

  it('une communauté ciblée : seuls ses membres se voient offrir le pack', () => {
    const targeting = { communities: [COMMUNITY] };
    expect(isPackOffered({ targeting }, { now, audience: audience({ communityIds: new Set([COMMUNITY]) }) })).toBe(true);
    expect(isPackOffered({ targeting }, { now, audience: audience() })).toBe(false);
  });

  it('un pays ciblé : un pays inconnu du serveur n’est pas offert (fail-closed)', () => {
    const targeting = { countries: ['CM'] };
    expect(isPackOffered({ targeting }, { now, audience: audience({ country: 'CM' }) })).toBe(true);
    expect(isPackOffered({ targeting }, { now, audience: audience({ country: null }) })).toBe(false);
  });

  it('une langue ciblée se lit sur TOUT le prisme du lecteur, région ôtée', () => {
    const targeting = { languages: ['pt'] };
    expect(isPackOffered({ targeting }, { now, audience: audience({ languages: ['fr', 'pt-BR'] }) })).toBe(true);
    expect(isPackOffered({ targeting }, { now, audience: audience({ languages: ['fr'] }) })).toBe(false);
  });

  it('les dimensions se cumulent : il faut satisfaire chacune de celles qui sont déclarées', () => {
    const targeting = { countries: ['CM'], languages: ['fr'] };
    expect(isPackOffered({ targeting }, { now, audience: audience({ country: 'CM' }) })).toBe(true);
    expect(isPackOffered({ targeting }, { now, audience: audience({ country: 'CM', languages: ['en'] }) })).toBe(false);
  });
});

describe('un objet manqué n’est jamais perdu (#11252)', () => {
  const closed = { availability: { endsAt: '2026-11-01T00:00:00.000Z' } };
  const now = at('2026-12-01T00:00:00Z');

  it('un pack possédé hors fenêtre reste possédé', () => {
    const owned = new Set([packChoiceKey('wallpaper', 'fond-ete')]);
    expect(isPackOwned({ domain: 'wallpaper', slug: 'fond-ete', price: 40 }, owned)).toBe(true);
  });

  it('il reste en rayon pour qui le possède ou l’a installé, et sort du rayon pour les autres', () => {
    const offer = { now, audience: audience() };
    expect(isPackShelved(closed, offer, { ownedByRow: true, installed: false })).toBe(true);
    expect(isPackShelved(closed, offer, { ownedByRow: false, installed: true })).toBe(true);
    expect(isPackShelved(closed, offer, { ownedByRow: false, installed: false })).toBe(false);
  });
});

describe('une saison peut nommer son pack récompense', () => {
  const now = { dayKey: '2027-01-05', minuteOfDay: 600 };

  it('le calendrier garde une clé de pack lisible et ignore une clé illisible', () => {
    const base = { number: 2, startDay: '2027-02-15', status: 'scheduled', themeKey: 'language:fr', stepPoints: 100, copy: null };
    const kept = normalizeSeasonSchedule({ revision: 1, seasons: [{ ...base, rewardPack: 'avatar-ring.contour-saison-3' }] });
    const dropped = normalizeSeasonSchedule({ revision: 1, seasons: [{ ...base, rewardPack: 'n’importe quoi' }] });
    expect(kept.seasons[0]?.rewardPack).toBe('avatar-ring.contour-saison-3');
    expect(dropped.seasons[0]).toBeDefined();
    expect(dropped.seasons[0]?.rewardPack).toBeUndefined();
  });

  it('une édition qui nomme une clé de pack illisible est refusée', () => {
    const verdict = applySeasonEdit({ revision: 0, seasons: [] }, { number: 40, rewardPack: 'pas une clé' }, now);
    expect(verdict).toEqual({ ok: false, reason: 'invalid-reward-pack' });
  });
});
