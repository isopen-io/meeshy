/**
 * Le balayage des objets NUS, étendu aux schémas de `packages/shared`.
 *
 * `response-schema-sweep` ne lit que `services/gateway/src/routes`, et sa
 * documentation le dit depuis le cycle 87 bis : « les schémas de
 * `packages/shared`, dont un défaut se propage le plus loin, lui échappent ».
 * C'était une limite ÉCRITE, jamais outillée — et le cycle 95 en a mesuré le
 * coût en gouvernant `GET /sync` :
 *
 * `messageAttachmentSchema.metadata` était un objet NU. Le champ étant LISTÉ,
 * fast-json-stringify appliquait `additionalProperties: false` et servait `{}`
 * — sur TOUTE route employant ce schéma, la liste de messages comprise.
 * `apps/web/components/conversations/conversation-item/message-formatting.tsx`
 * lit `attachment.metadata?.audioEffectsTimeline` : la timeline d'effets d'une
 * note vocale n'a donc jamais atteint un client. Sa JUMELLE, l'attachement
 * inline de `messageSchema`, portait le même défaut, avec une description qui
 * NOMMAIT `audioEffectsTimeline` pendant qu'elle le supprimait.
 *
 * Deux raisons de le mettre en cliquet plutôt qu'en prose :
 *
 * 1. **La portée.** Un schéma de route sert une route ; un schéma partagé sert
 *    toutes celles qui l'importent. Le même défaut y coûte strictement plus.
 * 2. **La leçon du cycle 87 bis.** Le cycle 86 avait construit le balayage des
 *    routes et l'avait laissé dans son JOURNAL ; deux cycles plus tard, deux
 *    agents ont retrouvé les mêmes trois sites séparément, à la main, le même
 *    jour. Un outil vit dans le dépôt ou il n'existe pas.
 *
 * La différence de mécanique avec son frère tient en une ligne : là-bas les
 * schémas vivent SOUS une clé `response:`, qui borne où le balayage doit
 * regarder. Ici ce sont des constantes exportées, consommées ailleurs — il n'y
 * a pas de borne, donc le fichier est balayé en entier.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from './response-schema-sweep';

const SHARED_SCHEMAS = join(__dirname, '../../../../../packages/shared/types/api-schemas.ts');

/**
 * L'inventaire des objets nus TOLÉRÉS de `api-schemas.ts`.
 *
 * Il est VIDE, et c'est un état à défendre, pas un état atteint : quand ce
 * cliquet tombe, l'entrée en trop est un site NEUF. La question à lui poser est
 * binaire et le dépôt l'a déjà tranchée — **carte à clés inconnues ⇒
 * `additionalProperties` ; sinon ⇒ `properties`.** Le silence n'est jamais la
 * réponse, et geler une ligne ici demande une raison ÉCRITE de la laisser
 * ouverte.
 */
const FROZEN_SHARED_NAKED: ReadonlyArray<string> = [];

/** Fin (exclusive) de l'objet littéral ouvert à `openIndex`. */
function matchBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

const DECLARED = /\b(properties|additionalProperties|patternProperties)\s*:/;

/**
 * Les `{ type: 'object' }` sans aucune des trois déclarations qui laissent
 * passer une clé. Rendus en `champ` — jamais en numéro de ligne, qui dérive à
 * la première édition et transforme le cliquet en bruit (règle du frère).
 */
export function sweepNakedObjects(source: string): ReadonlyArray<string> {
  const code = stripComments(source);
  const sites: string[] = [];
  const re = /type\s*:\s*'object'/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    const open = code.lastIndexOf('{', m.index);
    if (open === -1) continue;
    if (DECLARED.test(code.slice(open, matchBrace(code, open)))) continue;

    const before = code.slice(0, open).trimEnd();
    sites.push(/([A-Za-z_$][\w$]*)\s*:\s*$/.exec(before)?.[1] ?? 'items');
  }

  return sites;
}

describe('packages/shared — aucun objet NU dans les schémas partagés', () => {
  it('ne laisse entrer aucun site neuf', () => {
    const naked = sweepNakedObjects(readFileSync(SHARED_SCHEMAS, 'utf8'));

    expect(naked).toEqual([...FROZEN_SHARED_NAKED]);
  });

  /**
   * Le balayage doit pouvoir TOMBER, sinon il ne garde rien. Ces deux formes
   * sont exactement celles qui vidaient les pièces jointes du dépôt.
   */
  it('voit un objet nu, et ne confond pas une carte déclarée avec lui', () => {
    expect(sweepNakedObjects(`{ metadata: { type: 'object', nullable: true } }`)).toEqual(['metadata']);
    expect(sweepNakedObjects(`{ metadata: { type: 'object', additionalProperties: true } }`)).toEqual([]);
    expect(sweepNakedObjects(`{ sender: { type: 'object', properties: { id: { type: 'string' } } } }`)).toEqual([]);
  });

  /** Un objet nu écrit dans un COMMENTAIRE explique un défaut, il n'en est pas
   *  un — c'est la discrimination que `stripComments` porte, et sans elle le
   *  balayage retrouve les notes des cycles précédents au lieu des sites. */
  it('ne rapporte pas un objet nu cité en commentaire', () => {
    expect(sweepNakedObjects(`// jadis: { type: 'object' }\n{ a: { type: 'string' } }`)).toEqual([]);
  });
});
