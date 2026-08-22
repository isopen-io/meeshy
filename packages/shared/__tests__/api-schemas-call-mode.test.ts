import { describe, it, expect } from 'vitest';
import {
  callSessionMinimalSchema,
  callSessionSchema,
} from '../types/api-schemas';

// `CallSession.mode` (Prisma `CallMode`, `packages/shared/prisma/schema.prisma`)
// porte l'ARCHITECTURE WebRTC — `p2p` (2 participants) ou `sfu` (3+), JAMAIS le
// type d'appel (audio/video, qui vit dans `metadata.type`). Le schéma de détail
// `callSessionSchema.mode` le documente déjà correctement ; sa version minimale
// (listes) décrivait le MÊME champ avec l'enum du type d'appel (`voice`/`video`,
// copié de `startCallRequestSchema` où `mode` désigne bien le type demandé).
//
// fast-json-stringify n'impose pas un `enum` de chaîne EN SORTIE : le fil portait
// donc `p2p`/`sfu` correctement quoi qu'il arrive, et aucune donnée ne fuyait.
// Mais le schéma est EXPORTÉ (contrat OpenAPI) : un client généré depuis lui
// typerait `mode` en `'voice' | 'video'` et casserait au décodage de `'p2p'`.
// Piège armé, pas panne — le premier `response:` qui adopte la forme minimale
// publie le faux contrat. On gèle donc l'invariant jumeau : les deux schémas
// décrivent le même champ, leurs enums DOIVENT coïncider.
describe('callSession mode — architecture WebRTC (p2p/sfu) sur les deux schémas', () => {
  it('déclare enum [p2p, sfu] sur callSessionSchema (détail)', () => {
    expect((callSessionSchema as { properties: { mode: { enum: string[] } } }).properties.mode.enum).toEqual([
      'p2p',
      'sfu',
    ]);
  });

  it('déclare le MÊME enum sur callSessionMinimalSchema (listes)', () => {
    const minimal = (callSessionMinimalSchema as { properties: { mode: { enum?: string[] } } }).properties.mode.enum;
    const full = (callSessionSchema as { properties: { mode: { enum: string[] } } }).properties.mode.enum;
    expect(minimal).toEqual(full);
  });
});
