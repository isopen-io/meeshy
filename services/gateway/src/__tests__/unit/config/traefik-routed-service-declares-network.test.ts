/**
 * #10323 — un service routé par Traefik qui rejoint PLUSIEURS réseaux déclare celui par
 * lequel Traefik le joint (`traefik.docker.network`).
 *
 * Incident de la promotion #10290 : la passerelle a rejoint le réseau privé de l'agent
 * (#10289). `--providers.docker.network=meeshy-network` ne désignait pas le nom RÉEL du
 * réseau (`meeshy_meeshy-network`, préfixé par le projet compose) : Traefik a choisi l'IP
 * du réseau de l'agent, qu'il ne joint pas, et gate.meeshy.me a répondu 504.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const FILE = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose', 'docker-compose.prod.yml');

function blocks(source: string): Array<{ name: string; body: string }> {
  const lines = source.split('\n');
  const start = lines.indexOf('services:');
  const out: Array<{ name: string; body: string }> = [];
  for (let i = start + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
    const m = /^ {2}([a-z0-9-]+):\s*$/.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^ {2}\S/.test(lines[j]) && !/^\S/.test(lines[j])) j++;
    out.push({ name: m[1], body: lines.slice(i + 1, j).join('\n') });
  }
  return out;
}

function networksOf(body: string): string[] {
  const m = /^ {4}networks:\n((?: {6}.*\n?)+)/m.exec(body);
  if (!m) return [];
  return m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.replace(/^- /, '').replace(/:.*$/, '').replace(/\s+#.*$/, ''));
}

describe('Traefik joint un service multi-réseaux par le réseau déclaré (#10323)', () => {
  const services = blocks(fs.readFileSync(FILE, 'utf8'));

  it('lit bien les services du compose de production', () => {
    expect(services.map((s) => s.name)).toEqual(expect.arrayContaining(['gateway', 'agent', 'traefik']));
  });

  it('tout service routé (traefik.enable=true) sur plus d’un réseau déclare traefik.docker.network', () => {
    const fautifs = services
      .filter((s) => /traefik\.enable=true/.test(s.body) && networksOf(s.body).length > 1)
      .filter((s) => !/traefik\.docker\.network=\S+/.test(s.body))
      .map((s) => `${s.name} (${networksOf(s.body).join(', ')})`);
    expect(fautifs).toEqual([]);
  });

  it('la passerelle, sur deux réseaux depuis #10289, est jointe par le réseau d’entrée', () => {
    const gateway = services.find((s) => s.name === 'gateway')!;
    expect(networksOf(gateway.body)).toEqual(expect.arrayContaining(['meeshy-network', 'meeshy-agent-network']));
    expect(gateway.body).toMatch(/traefik\.docker\.network=meeshy_meeshy-network/);
  });
});
