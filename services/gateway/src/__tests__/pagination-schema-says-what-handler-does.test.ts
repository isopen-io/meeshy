/**
 * **UNE DESCRIPTION DE SCHÉMA DIT CE QUE LE HANDLER FAIT** (#6994).
 *
 * ## Le défaut gardé ici
 *
 * Trois descriptions des deux routes les plus appelées de la passerelle
 * mentaient sur le comportement réel :
 *
 * | site | ce que le schéma DISAIT | ce que le handler FAIT |
 * |---|---|---|
 * | `messages-list.ts` `before` | « get messages before this **timestamp** » | un **id de message**, résolu en `createdAt` |
 * | `list-querystring.ts` `limit` | « max **50**, default **15** » | `{ defaultLimit: 30, maxLimit: 100 }` |
 * | `messages-list.ts` `limit` | « default 20 » | juste, mais `maxLimit: 50` **non documenté** |
 *
 * Un client qui lit « timestamp » envoie une date. Le handler la passe à
 * `findFirst({ where: { id } })`, ne trouve rien, ne pose aucun filtre et
 * ressert la page récente **sans erreur** : le client boucle sur la même page
 * en croyant paginer. La description fausse ne produit pas un échec — elle
 * produit un **succès trompeur**, la seule forme de panne qu'aucun journal ne
 * montre.
 *
 * ## Ce que ce fichier NE teste pas, et pourquoi
 *
 * La première écriture de ce témoin comparait la description à la constante
 * qu'elle interpole. **Mesuré : il ne pouvait pas tomber.** Muter la constante
 * (`{30, 100}` → `{15, 50}`) laissait les neuf assertions VERTES, parce que la
 * description est DÉRIVÉE de cette même constante — les deux bougent ensemble.
 * Un témoin qui confronte deux projections d'une seule source ne mesure que
 * l'interpolation, jamais l'accord.
 *
 * Ce qui peut réellement se rompre est ailleurs : **quelqu'un remet un objet
 * littéral** au site d'appel de `validatePagination`, et la borne repart vivre
 * à deux endroits. C'est exactement comme ça que l'écart est né. La garde est
 * donc une garde d'INVENTAIRE sur la source — « existe-t-il un appel qui ne
 * lit pas sa constante ? » — la seule forme qui survive à l'ajout d'une route
 * que personne n'aura pensé à tester.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from '@jest/globals';

import { conversationListQuerystringSchema } from '../routes/conversations/list-querystring';
import { messagesListQuerystringSchema } from '../routes/conversations/messages-querystring';

const RACINE = join(__dirname, '..');

const descriptionDe = (schema: { properties: Record<string, { description?: string }> }, champ: string): string =>
  schema.properties[champ]?.description ?? '';

/** Le CODE seul : une ligne qui CITE la forme interdite pour l'expliquer ne la commet pas (leçon 630). */
const codeSeul = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function fichiersTypeScript(dossier: string): readonly string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return chemin.includes('__tests__') ? [] : fichiersTypeScript(chemin);
    return chemin.endsWith('.ts') && !chemin.endsWith('.d.ts') ? [chemin] : [];
  });
}

/**
 * `validatePagination(offset, limit, { … })` — un objet LITTÉRAL en troisième
 * argument. C'est la forme qui remet une borne à vivre à deux endroits.
 */
const BORNES_EN_LITTERAL = /validatePagination\s*\([^)]*,\s*\{[^}]*(?:defaultLimit|maxLimit)/;

/**
 * LE PÉRIMÈTRE EST NOMMÉ, et c'est une décision, pas une facilité.
 *
 * Posée sur tout le gateway, cette garde relève **24 appelants** — et la
 * plupart ne sont pas fautifs : un objet littéral ne ment que si un SCHÉMA
 * annonce la borne ailleurs, et ces routes-là n'annoncent rien. Une garde qui
 * rougit sur des sites corrects finit désactivée, ce qui est pire que pas de
 * garde du tout.
 *
 * Elle couvre donc les deux routes dont la description MENTAIT (#6994), celles
 * qui paient le lien schéma ↔ handler. L'étendre demande d'abord de savoir
 * quelles autres routes annoncent une borne dans leur schéma — c'est un
 * relevé, pas une ligne de code, et il a son suivi.
 */
const PERIMETRE = ['routes/conversations/core-list.ts', 'routes/conversations/messages-list.ts'];

describe('les bornes de pagination ne vivent JAMAIS à deux endroits (#6994)', () => {
  const appelants = fichiersTypeScript(RACINE)
    .filter((chemin) => PERIMETRE.some((cible) => chemin.endsWith(cible)))
    .map((chemin) => ({ chemin, source: codeSeul(readFileSync(chemin, 'utf8')) }))
    .filter(({ source }) => /\bvalidatePagination\s*\(/.test(source));

  it('les deux routes du périmètre sont bien trouvées — sans quoi cette garde verdirait sur un inventaire VIDE', () => {
    // L'égalité, jamais `> 0` : un fichier RENOMMÉ ferait tomber la garde à un
    // seul site sans que rien ne le dise.
    expect(appelants.length).toBe(PERIMETRE.length);
  });

  it.each(appelants.map(({ chemin }) => [chemin.slice(RACINE.length + 1)]))(
    '%s lit ses bornes depuis une constante nommée, jamais depuis un littéral',
    (relatif) => {
      const { source } = appelants.find(({ chemin }) => chemin.endsWith(relatif))!;

      // Le diagnostic voyage dans la VALEUR comparée : `expect(valeur, message)`
      // est une API de bun/Vitest que Jest refuse au typage (TS2554), et le
      // gateway tourne sous Jest.
      const diagnostic = BORNES_EN_LITTERAL.test(source)
        ? `${relatif} passe ses bornes en objet LITTÉRAL à validatePagination. La description du ` +
          `schéma les annonce alors depuis une AUTRE source, et les deux divergent en silence — ` +
          `c'est exactement comme ça que « max 50, default 15 » a survécu à un handler en 30/100. ` +
          `Extraire une constante exportée, et l'interpoler dans la description.`
        : 'conforme';

      expect(diagnostic).toBe('conforme');
    },
  );
});

describe('le curseur `before` des messages est un IDENTIFIANT, et le schéma le dit (#6994)', () => {
  const before = messagesListQuerystringSchema.properties.before;

  it("annonce un IDENTIFIANT DE MESSAGE — c'est le mot « timestamp » qui faisait boucler les clients", () => {
    const dit = descriptionDe(messagesListQuerystringSchema as never, 'before').toLowerCase();

    // Une écriture antérieure bannissait le mot « timestamp » — et rougissait
    // sur la description CORRIGÉE, qui l'emploie précisément pour le NIER
    // (« …identifier — NOT a timestamp »). Ce qu'il faut interdire n'est pas le
    // mot, c'est l'AFFIRMATION fautive.
    expect(dit).toContain('message id');
    expect(dit).not.toContain('before this timestamp');
  });

  it('porte le MÊME `pattern` d’ObjectId que la route sœur — une garde déclarative, pas une discipline', () => {
    // La route `/conversations` le porte depuis #6857. Sans lui ici, un curseur
    // mal formé n'était pas refusé : il était RÉSOLU EN RIEN, et la route
    // resservait sa page récente — le succès trompeur que #6994 nomme.
    expect(before.pattern).toBe(conversationListQuerystringSchema.properties.before.pattern);
  });

  it('et ce pattern refuse bien ce qu’un client trompé par l’ancienne description envoyait', () => {
    const regex = new RegExp(before.pattern as string);

    expect(regex.test('68f33afa8ae497b2054c84d7')).toBe(true);
    // La date qu'un lecteur de « before this timestamp » composait.
    expect(regex.test('2026-09-19T00:00:00.000Z')).toBe(false);
    // Et l'identifiant local que l'app iOS composait réellement (#6857).
    expect(regex.test('conv-hydrate')).toBe(false);
  });
});
