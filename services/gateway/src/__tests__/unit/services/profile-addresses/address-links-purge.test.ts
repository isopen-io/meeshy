/**
 * La purge d'un compte supprimé n'oublie aucune copie de ses adresses de fiche (#18863).
 *
 * Une adresse « qui compte » vit DEUX fois : sa ligne `ProfileAddress`, et le `TrackingLink`
 * (URL, titre, propriétaire) qui la sert sous `/l/<jeton>`, avec les `TrackingLinkClick` de ses
 * lecteurs (IP, agent, ville). Fermer le lien laissait l'URL et le titre lisibles par
 * l'administration et les clics des lecteurs en base. Le double est une petite base EN MÉMOIRE
 * qui applique le filtre `where` : un `deleteMany({})` qui viderait les liens de tout le monde
 * rougirait.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { eraseProfileAddressesOf } from '../../../../services/profile-addresses/address-links';

const PARTI = '507f1f77bcf86cd799439011';
const AUTRE = '507f1f77bcf86cd799439022';

type Row = Record<string, unknown> & { id: string };

const matches = (row: Row, where: Record<string, unknown> | undefined): boolean =>
  !where || Object.entries(where).every(([field, expected]) =>
    expected && typeof expected === 'object' && 'in' in (expected as object)
      ? (expected as { in: unknown[] }).in.includes(row[field])
      : row[field] === expected);

function table(rows: Row[]) {
  const state = { rows: [...rows] };
  return {
    state,
    findMany: async (args?: { where?: Record<string, unknown>; take?: number }) =>
      state.rows.filter((row) => matches(row, args?.where)).slice(0, args?.take ?? Infinity),
    updateMany: async (args: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = state.rows.filter((row) => matches(row, args.where));
      state.rows = state.rows.map((row) => (matches(row, args.where) ? { ...row, ...args.data } : row));
      return { count: hit.length };
    },
    deleteMany: async (args?: { where?: Record<string, unknown> }) => {
      const before = state.rows.length;
      state.rows = state.rows.filter((row) => !matches(row, args?.where));
      return { count: before - state.rows.length };
    },
  };
}

function base() {
  const profileAddress = table([
    { id: 'ad1', userId: PARTI, url: 'https://ma-banque.fr/', title: 'Banque', trackingToken: 'tokA' },
    { id: 'ad2', userId: PARTI, url: 'https://aissa.studio/', title: 'Site', trackingToken: null },
    { id: 'ad3', userId: AUTRE, url: 'https://autre.example/', title: 'Autre', trackingToken: 'tokB' },
  ]);
  const trackingLink = table([
    { id: 'tl1', token: 'tokA', createdBy: PARTI, originalUrl: 'https://ma-banque.fr/', name: 'Banque', isActive: true },
    { id: 'tl2', token: 'tokB', createdBy: AUTRE, originalUrl: 'https://autre.example/', name: 'Autre', isActive: true },
    { id: 'tl3', token: 'msg', createdBy: PARTI, originalUrl: 'https://lien-de-message.example/', name: null, isActive: true },
  ]);
  const trackingLinkClick = table([
    { id: 'k1', trackingLinkId: 'tl1', ipAddress: '203.0.113.7' },
    { id: 'k2', trackingLinkId: 'tl1', ipAddress: '198.51.100.9' },
    { id: 'k3', trackingLinkId: 'tl2', ipAddress: '192.0.2.1' },
  ]);
  return { prisma: { profileAddress, trackingLink, trackingLinkClick }, profileAddress, trackingLink, trackingLinkClick };
}

describe('eraseProfileAddressesOf — rien de ses adresses ne survit à la purge', () => {
  it("aucune ligne TrackingLink ne porte encore l'URL ni le titre d'une de ses adresses, et leurs clics partent", async () => {
    const { prisma, profileAddress, trackingLink, trackingLinkClick } = base();

    await eraseProfileAddressesOf(prisma as never, PARTI);

    expect(profileAddress.state.rows.filter((row) => row.userId === PARTI)).toEqual([]);
    expect(trackingLink.state.rows.filter((row) => row.originalUrl === 'https://ma-banque.fr/' || row.name === 'Banque')).toEqual([]);
    expect(trackingLinkClick.state.rows.filter((row) => row.trackingLinkId === 'tl1')).toEqual([]);
  });

  it("laisse les liens et les clics des autres comptes, et ses liens qui ne sont pas des adresses", async () => {
    const { prisma, profileAddress, trackingLink, trackingLinkClick } = base();

    await eraseProfileAddressesOf(prisma as never, PARTI);

    expect(profileAddress.state.rows.map((row) => row.id)).toEqual(['ad3']);
    expect(trackingLink.state.rows.map((row) => row.id)).toEqual(['tl2', 'tl3']);
    expect(trackingLinkClick.state.rows.map((row) => row.id)).toEqual(['k3']);
  });
});
