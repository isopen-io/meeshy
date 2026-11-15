/**
 * Aucune route ne réécrit la loi sous forme de LISTE DE RÔLES (#4153).
 *
 * TREIZE gardes locales vivaient dans `routes/admin/`, dont **sept nommées
 * `requireAdmin`** appliquant quatre lois différentes. Une liste de rôles est
 * une loi écrite à l'endroit où on l'applique : elle ne peut pas être changée
 * en un point, ne peut pas être relue en un point, et sa divergence d'avec la
 * matrice est invisible tant que personne ne compare.
 *
 * ## Le piège que cette garde vise
 *
 * `requireAnalyticsPermission` existait DEUX fois — dans le middleware, lisant
 * la matrice, et dans `analytics.ts`, rejouant la même liste en dur. Les deux
 * admettaient les mêmes rôles, donc AUCUN symptôme, donc rien ne signalait la
 * dérive le jour où la matrice bouge.
 *
 * > Un nom identique fait croire à une loi identique. La divergence ne se lit
 * > pas dans « qui appelle quoi » mais dans « qui appelle la MATRICE ».
 *
 * Corriger les treize ne dit rien de la quatorzième : c'est le GESTE qu'il faut
 * interdire.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const ROUTES = path.resolve(__dirname, '../../routes');

/** Les rôles GLOBAUX — ceux dont une liste constitue une loi d'admission. */
const ROLES = ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST'] as const;

/**
 * `role` porte DEUX taxonomies, et cette garde n'en juge qu'une.
 *
 * Le rang GLOBAL (`BIGBOSS…USER`) est la loi que la matrice dit. Le rang DANS
 * UNE CONVERSATION (`creator|admin|moderator|member`, plus `OWNER` dans les
 * chemins de chiffrement) est une appartenance locale, qu'aucune matrice
 * d'administration ne gouverne — et deux de ses valeurs, `admin` et
 * `moderator`, portent le même mot que deux rôles globaux.
 *
 * Une liste qui cite l'un de ces marqueurs parle de la SECONDE taxonomie. La
 * confondre avec la première ferait crier la garde sur du code juste — et une
 * garde qu'on désarme parce qu'elle crie trop ne garde plus rien.
 */
const MARQUEURS_DE_CONVERSATION = ['OWNER', "'owner'", "'creator'", "'member'", "'moderator'", "'admin'"];

function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const complet = path.join(racine, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== '__tests__') sortie.push(...fichiersTs(complet));
    } else if (entree.name.endsWith('.ts')) {
      sortie.push(complet);
    }
  }
  return sortie;
}

function lignesDeCode(texte: string): Array<{ ligne: string; numero: number }> {
  return texte
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
    .filter(({ ligne }) => !ligne.startsWith('//') && !ligne.startsWith('*') && !ligne.startsWith('/*'));
}

/**
 * Une LISTE de rôles : au moins deux rôles globaux entre crochets.
 *
 * Deux, et non un : `role === 'BIGBOSS'` est une comparaison de rang, pas une
 * loi d'admission recopiée, et `requireSovereign` en est la forme nommée. Ce
 * qui caractérise le défaut est l'ÉNUMÉRATION — c'est elle qui prétend dire ce
 * que la matrice dit déjà.
 */
function listesDeRoles(texte: string): Array<{ ligne: string; numero: number }> {
  return lignesDeCode(texte).filter(({ ligne }) => {
    // La liste doit être SUIVIE de `.includes(` : c'est l'idiome de
    // l'admission, et lui seul.
    //
    // Deux formes citent des rôles pour de bonnes raisons et ne décident de
    // rien : un `enum:` de schéma, qui énumère les VALEURS acceptées en
    // entrée, et un `where: { role: { in: [...] } }`, qui compte des lignes.
    // Les confondre avec une loi rendrait la garde ingérable, et une garde
    // qu'on désarme parce qu'elle crie trop ne garde plus rien.
    const admission = /\[[^\]]*\]\s*\.includes\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = admission.exec(ligne)) !== null) {
      if (MARQUEURS_DE_CONVERSATION.some((marqueur) => m![0].includes(marqueur))) continue;
      const cites = ROLES.filter((r) => m![0].includes(`'${r}'`) || m![0].includes(`"${r}"`));
      if (cites.length >= 2) return true;
    }
    return false;
  });
}

describe('Une route nomme une PERMISSION, jamais des rôles', () => {
  it('le balayage LIT bien l’arbre des routes — sinon il serait vert à vide', () => {
    const fichiers = fichiersTs(ROUTES);
    expect(fichiers.length).toBeGreaterThan(50);
    // Et il SAIT reconnaître une liste : sans cette preuve, un motif cassé le
    // rendrait vert en ne mesurant plus rien.
    expect(listesDeRoles("const ok = ['BIGBOSS', 'ADMIN'].includes(role);")).toHaveLength(1);
    expect(listesDeRoles("const ok = ['BIGBOSS'].includes(role);")).toHaveLength(0);
    // Un `enum` de schéma et un `where` de requête citent des rôles sans rien
    // décider : les confondre avec une loi rendrait la garde ingérable.
    expect(listesDeRoles("enum: ['USER', 'ADMIN', 'BIGBOSS'],")).toHaveLength(0);
    expect(listesDeRoles("where: { role: { in: ['ADMIN', 'BIGBOSS'] } }")).toHaveLength(0);
    // Le rang DANS UNE CONVERSATION n'est pas la loi d'administration.
    expect(listesDeRoles("['MODERATOR', 'ADMIN', 'OWNER'].includes(member.role)")).toHaveLength(0);
  });

  it('aucun fichier de route ne porte une liste de rôles', () => {
    const fautifs = fichiersTs(ROUTES).flatMap((f) =>
      listesDeRoles(fs.readFileSync(f, 'utf8')).map(
        ({ numero, ligne }) => `${path.relative(ROUTES, f)}:${numero}  ${ligne}`
      )
    );

    expect(fautifs).toEqual([]);
  });

  it('les treize gardes locales ont bien DISPARU — aucune n’est conservée « en attendant »', () => {
    // Une garde gardée « le temps de » est une quatorzième loi : elle reste
    // appliquée, et son remplacement ne l'est pas.
    const orphelines = fichiersTs(ROUTES).flatMap((f) =>
      lignesDeCode(fs.readFileSync(f, 'utf8'))
        .filter(({ ligne }) => /^(const|function)\s+require\w*\s*=?\s*(async)?\s*\(\s*request/.test(ligne))
        .map(({ numero, ligne }) => `${path.relative(ROUTES, f)}:${numero}  ${ligne}`)
    );

    expect(orphelines).toEqual([]);
  });
});
