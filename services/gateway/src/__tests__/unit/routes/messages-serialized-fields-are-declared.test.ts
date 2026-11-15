/**
 * #4340 (critère 7, cinquième témoin) — **un champ calculé qui n'est pas
 * DÉCLARÉ au schéma de réponse ne rougit nulle part.**
 *
 * ## Le défaut que ce témoin rend impossible à réintroduire
 *
 * `fast-json-stringify` sérialise EXACTEMENT ce que le schéma déclare. Un champ
 * que le handler calcule et pose sur l'objet rendu, mais que le schéma ignore,
 * est retiré de chaque réponse — silencieusement.
 *
 * Le dépôt l'a payé deux fois sur la MÊME route :
 *
 * | champ | ce qu'il coûtait |
 * |---|---|
 * | `currentUserReactions` (message-level) | une requête Prisma par page |
 * | `currentUserConsumption` (par pièce jointe) | une requête Prisma par page |
 *
 * Depuis juin 2026, et jusqu'à ce que #4177 les retire comme travail MORT. La
 * reprise de lecture (#3909) a dû les faire revenir — en commençant par la
 * DÉCLARATION, faute de quoi la projection remourait et le client web qui
 * l'attend serait resté un contrôle non alimenté.
 *
 * > Une projection non déclarée coûte, s'exécute, et passe les tests de route —
 * > qui lisent le HANDLER, jamais la charge sérialisée. Rien ne la signale.
 *
 * ## Portée, dite précisément
 *
 * Ce témoin garde **le sérialiseur de la liste de messages**
 * (`messages-list-query.ts`), c'est-à-dire l'endroit exact où les deux champs
 * morts ont vécu. Il ne prétend pas couvrir les 524 endpoints du gateway : une
 * version globale demanderait de savoir quel schéma gouverne quelle réponse,
 * ce qui est un lot à soi seul. Affirmer « tous » ici serait la forme de
 * péremption que la leçon 261 décrit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { messageSchema, messageAttachmentSchema } from '@meeshy/shared/types/api-schemas';

const SERIALISEUR = join(__dirname, '../../../routes/conversations/messages-list-query.ts');

/**
 * Les champs qu'un site POSE sur l'objet rendu.
 *
 * Lit les affectations `<récepteur>.<champ> = `, en ignorant les LECTURES
 * (`if (cleaned.translations && …)`) : seule une affectation ajoute un champ à
 * la charge. Les commentaires sont retirés d'abord — une mention en commentaire
 * n'est pas un champ, et c'est exactement le faux positif qu'un comptage brut
 * produit.
 */
function champsPoses(source: string, recepteur: string): string[] {
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const motif = new RegExp(String.raw`\b${recepteur}\.(\w+)\s*=(?!=)`, 'g');
  const trouves = new Set<string>();
  for (const m of sansCommentaires.matchAll(motif)) trouves.add(m[1]);
  return [...trouves].sort();
}

function proprietesDeclarees(schema: unknown): Set<string> {
  const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
  return new Set(Object.keys(props));
}

describe('#4340 · tout champ POSÉ par le sérialiseur est DÉCLARÉ au schéma', () => {
  const source = readFileSync(SERIALISEUR, 'utf-8');

  it('les champs posés sur une PIÈCE JOINTE sont déclarés', () => {
    const poses = champsPoses(source, 'cleaned');
    const declares = proprietesDeclarees(messageAttachmentSchema);

    const orphelins = poses.filter((champ) => !declares.has(champ));
    expect(orphelins).toEqual([]);
  });

  it('les champs posés sur un MESSAGE sont déclarés', () => {
    const poses = champsPoses(source, 'mappedMessage');
    const declares = proprietesDeclarees(messageSchema);

    const orphelins = poses.filter((champ) => !declares.has(champ));
    expect(orphelins).toEqual([]);
  });

  // ── Bornes ────────────────────────────────────────────────────────────────
  //
  // Sans elles, ce témoin passerait au vert en ne regardant RIEN : un
  // renommage du récepteur, une réécriture en `Object.assign`, ou un
  // déplacement du sérialiseur le rendraient aveugle sans le faire rougir.
  // C'est le mode de panne que ce dépôt paie en boucle sur ses gardes de
  // source.

  it('le scanner VOIT bien les champs qu’il est censé garder', () => {
    const surPieceJointe = champsPoses(source, 'cleaned');
    const surMessage = champsPoses(source, 'mappedMessage');

    expect(surPieceJointe).toEqual(
      expect.arrayContaining(['currentUserConsumption', 'currentUserReactions', 'reactionSummary'])
    );
    expect(surMessage.length).toBeGreaterThanOrEqual(2);
  });

  it('les deux schémas sont NON VIDES — un schéma absent rendrait tout orphelin', () => {
    // Un schéma vide ferait rougir, pas passer : cette borne garde le sens
    // INVERSE — que `properties` existe bien, et n'a pas changé de forme.
    expect(proprietesDeclarees(messageAttachmentSchema).size).toBeGreaterThan(30);
    expect(proprietesDeclarees(messageSchema).size).toBeGreaterThan(30);
  });

  it('un champ posé et NON déclaré serait bien vu — contre-épreuve', () => {
    // Le témoin ne peut se croire utile que s'il attrape le défaut sur un
    // échantillon dont la réponse est connue. Contre le dépôt, il ne
    // prouverait que l'état du jour.
    const echantillon = `
      const cleaned = { ...att };
      // cleaned.enCommentaire = 1;
      cleaned.champInvente = compute();
      if (cleaned.translations) { /* lecture, pas une pose */ }
      cleaned.reactionSummary = x;
    `;
    const poses = champsPoses(echantillon, 'cleaned');

    expect(poses).toEqual(['champInvente', 'reactionSummary']);
    expect(poses).not.toContain('enCommentaire');
    expect(poses).not.toContain('translations');

    const declares = proprietesDeclarees(messageAttachmentSchema);
    expect(poses.filter((c) => !declares.has(c))).toEqual(['champInvente']);
  });
});
