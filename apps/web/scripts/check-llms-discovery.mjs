#!/usr/bin/env node
/**
 * VÉRIFIE QUE MEESHY EST DÉCOUVRABLE PAR UN AGENT IA — par l'EFFET des
 * fichiers servis, jamais par leur seule présence (#12939).
 *
 * POURQUOI CE TÉMOIN EXISTE
 *
 * Trois artefacts annoncent Meeshy à un agent IA, et chacun peut exister sans
 * rien annoncer :
 *
 *   1. `public/llms.txt` — la fiche que lisent les agents. Un fichier vide, ou
 *      un fichier qui ne cite PAS l'URL du spec OpenAPI machine, est présent
 *      mais inerte : l'agent ne sait pas où trouver l'API.
 *   2. `public/.well-known/openapi` — le pointeur machine vers `/docs/json`.
 *      Un `.well-known/` qui ne nomme pas l'URL du spec ne pointe nulle part.
 *   3. `public/robots.txt` — la stance ASSUMÉE envers les crawlers IA. Un
 *      robots.txt qui ne NOMME pas chaque crawler IA le laisse retomber sur
 *      `User-Agent: *` sans intention déclarée.
 *
 * CE TÉMOIN NE COMPTE PAS DES FICHIERS : il lit leur CONTENU et exige que
 * chacun porte ce qui le rend utile. Un fichier qui perd sa citation rougit.
 */
import { readFileSync, existsSync } from 'node:fs';

const PUBLIC = new URL('../public/', import.meta.url).pathname;

/** L'URL du spec OpenAPI machine servi en production. */
const SPEC_URL = 'https://gate.meeshy.me/docs/json';

/**
 * Les crawlers d'agents IA que `robots.txt` doit NOMMER explicitement — une
 * stance assumée, jamais un repli silencieux sur `User-Agent: *`.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
];

const failures = [];

function readOr(path) {
  const full = PUBLIC + path;
  if (!existsSync(full)) {
    failures.push(`${path} est absent de apps/web/public/`);
    return null;
  }
  const body = readFileSync(full, 'utf8');
  if (body.trim().length === 0) {
    failures.push(`${path} est vide`);
    return null;
  }
  return body;
}

const llms = readOr('llms.txt');
if (llms && !llms.includes(SPEC_URL)) {
  failures.push(`llms.txt ne cite pas l'URL du spec OpenAPI (${SPEC_URL})`);
}

const wellKnown = readOr('.well-known/openapi');
if (wellKnown && !wellKnown.includes(SPEC_URL)) {
  failures.push(`.well-known/openapi ne pointe pas vers le spec (${SPEC_URL})`);
}

const robots = readOr('robots.txt');
if (robots) {
  for (const crawler of AI_CRAWLERS) {
    const named = new RegExp(`User-Agent:\\s*${crawler}\\b`, 'i').test(robots);
    if (!named) {
      failures.push(`robots.txt ne nomme pas le crawler IA « ${crawler} »`);
    }
  }
}

if (failures.length > 0) {
  console.error('check-llms-discovery : découvrabilité IA incomplète');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log('check-llms-discovery : llms.txt, .well-known/openapi et robots.txt annoncent Meeshy aux agents IA ✓');
