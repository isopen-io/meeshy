import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Chest, Flame, GameBadge, GameBird, LevelRing, MeeshCoin, MintScene, RankBlason, Signature, Trophy } from './index';

/**
 * LE CONTRAT COMMUN DU DÉCOR (#9380) : tout dessin est décoratif, aucune bulle
 * de conversation, et UNE PAGE qui les réunit tous ne partage aucun identifiant.
 */
const page = renderToStaticMarkup(
  <main>
    <Signature size={40} />
    <MeeshCoin side="obverse" size={60} />
    <MeeshCoin side="reverse" size={60} number={1} year={2026} edition="gold" />
    <RankBlason rank="mythe" division={null} size={100} label="Mythe" />
    <RankBlason rank="voix" division={2} size={100} />
    <Trophy kind="prestige" size={100} label="PRESTIGE I" />
    <Trophy kind="flame" size={100} />
    <GameBadge shape="accumulation" material="gold" size={60} label="100" />
    <GameBadge shape="collection" size={60} collected={2} total={6} />
    <LevelRing level={12} tier="lueur" progress={0.4} size={56} />
    <Flame form="brasier" size={60} />
    <Chest state="open" size={90} />
    <GameBird bird="meoGuide" size={80} flip />
    <MintScene size={80} face="reverse" edition="prism" number={1000} year={2026} />
  </main>,
);

describe('le décor du jeu', () => {
  test('chaque dessin racine est masqué au lecteur d’écran', () => {
    const roots = page.match(/<svg [^>]*>/g) ?? [];
    expect(roots.length).toBeGreaterThanOrEqual(13);
    for (const root of roots) expect(root).toContain('aria-hidden="true"');
  });

  test('aucun dessin ne porte de texte alternatif : le texte lu est celui de l’hôte', () => {
    expect(page).not.toMatch(/<title|aria-label=|role="img"/);
  });

  test('aucune bulle de conversation', () => {
    expect(page.toLowerCase()).not.toMatch(/bubble|bulle|speech/);
  });

  test('aucun identifiant en double sur la page', () => {
    const ids = [...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(ids.length).toBeGreaterThan(40);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  test('aucune référence url(#…) ne pointe dans le vide', () => {
    const ids = new Set([...page.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? ''));
    const refs = [...page.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1] ?? '');
    expect(refs.length).toBeGreaterThan(20);
    expect(refs.filter((ref) => !ids.has(ref))).toEqual([]);
  });
});
