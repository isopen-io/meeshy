/**
 * Garde de source du chantier DMA (#17115, #17007) — deux clauses :
 *
 * 1. **Aucun module de production n'importe `dma-interoperability/`** : le moteur
 *    Signal maison (X3DH non authentifié, clés sur le serveur, ratchet défectueux)
 *    est REMPLACÉ par libsignal, jamais réutilisé ; il sera retiré au lot
 *    « retrait-moteur-maison ». Seuls ses propres fichiers et des suites de test
 *    le nomment encore.
 * 2. **Le pair externe n'appelle aucun hôte** : aucune URL, aucun nom d'hôte de
 *    Meta, WhatsApp ou Facebook, aucun module réseau dans `services/external-peer/`.
 *    Le faux WhatsApp vit en mémoire ou dans le Redis du staging ; l'adaptateur
 *    réel n'existera qu'après signature avec Meta, par une décision du porteur.
 *
 * Une garde NÉGATIVE meurt en silence si son balayage rend `[]` : les témoins
 * positifs prouvent que le balayage atteint les fichiers et que les motifs
 * attrapent ce qu'ils interdisent.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../../../');
const EXTERNAL_PEER = join(__dirname, '..');
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'dist', 'dma-interoperability']);

const sourcesUnder = (root: string): readonly string[] =>
  readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourcesUnder(path);
    return /\.(ts|mts|cts|js|mjs)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });

const MODULE_SPECIFIER = String.raw`(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"\x60]`;
const IMPORTS_HOMEMADE_ENGINE = new RegExp(`${MODULE_SPECIFIER}[^'"\x60]*dma-interoperability`);
const REACHES_NETWORK = [
  /\bhttps?:\/\//i,
  /\bwss?:\/\//i,
  /whatsapp\.(?:net|com)/i,
  /facebook\.(?:net|com)/i,
  /\bfbcdn\b/i,
  /\bmeta\.com\b/i,
  /\bwa\.me\b/i,
  new RegExp(`${MODULE_SPECIFIER}(?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process)['"\x60]`),
  new RegExp(`${MODULE_SPECIFIER}(?:axios|undici|node-fetch|got|ws|socket\\.io-client)['"\x60]`),
  /\bfetch\s*\(/,
];

const offenders = (files: readonly string[], patterns: readonly RegExp[]): readonly string[] =>
  files.filter((file) => patterns.some((pattern) => pattern.test(readFileSync(file, 'utf8')))).map((file) => relative(GATEWAY_SRC, file));

describe('chantier DMA — le moteur maison n’est importé par aucun module de production', () => {
  const production = sourcesUnder(GATEWAY_SRC);

  it('le balayage atteint la production, dont le pair externe', () => {
    expect(production.length).toBeGreaterThan(500);
    expect(production.map((file) => relative(GATEWAY_SRC, file))).toEqual(
      expect.arrayContaining(['services/external-peer/external-peer-contract.ts', 'services/external-peer/fake-whatsapp-peer.ts']),
    );
  });

  it('le motif attrape toutes les formes d’import, y compris l’import pour effet et le chemin entre accents graves', () => {
    expect(IMPORTS_HOMEMADE_ENGINE.test("import { X3DH } from '../dma-interoperability/signal-protocol/X3DH';")).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test("const engine = await import('./dma-interoperability');")).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test("require('../../dma-interoperability/index')")).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test("import '../dma-interoperability/bootstrap';")).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test("export * from '../dma-interoperability';")).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test('const engine = await import(`./dma-interoperability/${name}`);')).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test("const engine = require(`../dma-interoperability`);")).toBe(true);
    expect(IMPORTS_HOMEMADE_ENGINE.test("import { createFakeWhatsAppPeer } from './fake-whatsapp-peer';")).toBe(false);
  });

  it('aucun module de production n’importe dma-interoperability/', () => {
    expect(offenders(production, [IMPORTS_HOMEMADE_ENGINE])).toEqual([]);
  });
});

describe('chantier DMA — le pair externe n’appelle aucun hôte', () => {
  const peerSources = sourcesUnder(EXTERNAL_PEER);

  it('le balayage atteint les sources du pair externe', () => {
    expect(peerSources.length).toBeGreaterThanOrEqual(4);
  });

  it('les motifs attrapent une URL, un hôte de Meta et un module réseau', () => {
    const caught = (line: string) => REACHES_NETWORK.some((pattern) => pattern.test(line));
    expect(caught("const API = 'https://graph.facebook.com/v19.0';")).toBe(true);
    expect(caught('const host = "g.whatsapp.net";')).toBe(true);
    expect(caught("import https from 'node:https';")).toBe(true);
    expect(caught("import axios from 'axios';")).toBe(true);
    expect(caught('await fetch(url);')).toBe(true);
    expect(caught("const https = await import('node:https');")).toBe(true);
    expect(caught("const { request } = await import('undici');")).toBe(true);
    expect(caught("import 'node:net';")).toBe(true);
    expect(caught("const { execFile } = require('child_process');")).toBe(true);
    expect(caught("import { spawn } from 'node:child_process';")).toBe(true);
    expect(caught("const http = require(`node:http`);")).toBe(true);
    expect(caught("import { createHash } from 'crypto';")).toBe(false);
  });

  it('aucune source du pair externe ne porte d’URL, d’hôte de Meta ni de module réseau', () => {
    expect(offenders(peerSources, REACHES_NETWORK)).toEqual([]);
  });
});
