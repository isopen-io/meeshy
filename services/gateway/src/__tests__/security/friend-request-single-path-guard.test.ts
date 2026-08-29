/**
 * Une SEULE famille de mutations de demande d'amitié (#4162).
 *
 * ## Pourquoi une garde négative, et pourquoi sur la COEXISTENCE
 *
 * Le défaut n'était pas qu'un handler soit faible : c'était que DEUX familles
 * complètes vivent en parallèle, montées sur le même préfixe, avec des gardes
 * divergentes — et que le trafic aille à la plus faible. Un témoin posé sur le
 * seul handler cible ne rougirait pas si une seconde famille revenait ; il
 * attesterait que la bonne route est bonne, pendant qu'une autre, moins gardée,
 * servirait les clients.
 *
 * La garde compte donc les SITES qui écrivent une demande d'amitié, et exige
 * qu'ils passent tous par le module `directory`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const RACINE = path.resolve(__dirname, '../../routes');

/** Le seul module autorisé à ÉCRIRE une demande d'amitié. */
const MODULE_AUTORISE = 'directory/friend-requests-core.ts';

/**
 * L'exception, NOMMÉE et bornée : la MODÉRATION.
 *
 * `PATCH /admin/invitations/:id` écrit le même modèle sous un régime tout
 * autre — `requireAdmin`, une piste d'audit, et une question différente :
 * « cette invitation doit-elle rester ? », pas « puis-je répondre à cette
 * demande ? ». Ce n'est pas une seconde famille du chemin UTILISATEUR, qui est
 * ce que cette garde interdit.
 *
 * Elle est ÉNUMÉRÉE plutôt que filtrée par un motif de chemin : une exception
 * qu'on écrit se relit, et la liste tombe si une seconde s'y ajoute.
 */
const SOUS_ADMINISTRATION = ['admin/invitations.ts'] as const;

function fichiersTs(racine: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(racine, { withFileTypes: true })) {
    const complet = path.join(racine, entree.name);
    if (entree.isDirectory()) sortie.push(...fichiersTs(complet));
    else if (entree.name.endsWith('.ts') && !complet.includes('__tests__')) sortie.push(complet);
  }
  return sortie;
}

/** Les lignes de CODE — un commentaire cite forcément ce qu'il interdit. */
function lignesDeCode(texte: string): Array<{ ligne: string; numero: number }> {
  return texte
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
    .filter(({ ligne }) => !ligne.startsWith('//') && !ligne.startsWith('*') && !ligne.startsWith('/*'));
}

describe('Un seul module écrit une demande d’amitié', () => {
  it('le balayage LIT bien l’arbre des routes — sinon il serait vert à vide', () => {
    const fichiers = fichiersTs(RACINE);
    expect(fichiers.length).toBeGreaterThan(40);
    expect(fichiers.some((f) => f.endsWith(MODULE_AUTORISE))).toBe(true);
  });

  it('aucun autre fichier n’appelle `friendRequest.create`, `.update` ou `.delete`', () => {
    const ecrivains = fichiersTs(RACINE)
      .filter((f) => !f.endsWith(MODULE_AUTORISE))
      .filter((f) => !SOUS_ADMINISTRATION.some((admin) => f.endsWith(admin)))
      .flatMap((f) =>
        lignesDeCode(fs.readFileSync(f, 'utf8'))
          .filter(({ ligne }) => /friendRequest\.(create|update|delete)\s*\(/.test(ligne))
          .map(({ numero, ligne }) => `${path.relative(RACINE, f)}:${numero}  ${ligne}`)
      );

    expect(ecrivains).toEqual([]);
  });

  it("l'exception d'administration EXISTE — une liste d'exemptions qui ne désigne rien ne s'entretient pas", () => {
    // Une exception dont le fichier a disparu se lit comme une exception
    // active. Elle doit désigner un fichier réel qui écrit bien le modèle,
    // sans quoi elle est du bruit qui masquera le jour où un vrai site
    // reprendra son nom.
    for (const admin of SOUS_ADMINISTRATION) {
      const complet = path.join(RACINE, admin);
      expect(fs.existsSync(complet)).toBe(true);
      expect(fs.readFileSync(complet, 'utf8')).toMatch(/friendRequest\.(create|update|delete)\s*\(/);
    }
  });

  it('les alias DÉLÈGUENT — ils n’ont plus de logique de garde à eux', () => {
    // `friends.ts` porte les trois alias de mutation. S'il réécrivait une
    // garde, ce serait le retour de la divergence : deux endroits où décider
    // qui peut envoyer une demande à qui.
    const source = fs.readFileSync(path.join(RACINE, 'friends.ts'), 'utf8');

    for (const appel of ['envoyerDemande(', 'repondreDemande(']) {
      expect(source).toContain(appel);
    }

    const gardesLocales = lignesDeCode(source).filter(({ ligne }) =>
      /You cannot add yourself|deactivatedAt|blockedUserIds/.test(ligne)
    );
    expect(gardesLocales.map((g) => `friends.ts:${g.numero}  ${g.ligne}`)).toEqual([]);
  });
});
