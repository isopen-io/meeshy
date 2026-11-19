/**
 * **UNE COLONNE « PAS ENCORE FAIT » SE POSE À LA CRÉATION** (#19802).
 *
 * Deux files se composent des lignes dont une colonne de date est encore vide,
 * et les deux la lisent par une ÉGALITÉ — `{ champ: null }`, qui sous MongoDB
 * exige la clé PRÉSENTE et nulle (`utils/prisma-unset.ts`). Un créateur qui
 * n'écrit pas la colonne produit donc une ligne qu'aucune des deux files ne
 * verra jamais, sans qu'aucune erreur ne remonte.
 *
 * | file | colonne | lecteur |
 * |---|---|---|
 * | la vérification des partenaires | `PartnerProfile.verifiedAt` | `LensPartners.pending()` |
 * | les rappels hebdomadaires de suppression de compte | `AccountDeletionRequest.lastReminderAt` | `MaintenanceService` (passe journalière) |
 *
 * ─── CE QUE LA MESURE REND, ET QUI N'EST PAS CE QUE L'ISSUE ANNONÇAIT ────────
 *
 * #19802 affirme que les CINQ créateurs omettent leur colonne. Mesuré site par
 * site, **deux des trois créateurs de `PartnerProfile` l'écrivent déjà** :
 *
 * | créateur | ce qu'il écrit |
 * |---|---|
 * | `LensPartners.ts:249` | `verifiedAt: null` — porté par `data`, RÉPANDU dans `create` |
 * | `PackPublishers.ts:585` | `verifiedAt: current?.verifiedAt ?? now` — l'éditeur officiel naît vérifié |
 * | `PackPublishers.ts:609` | **rien** — c'est le seul site nu |
 *
 * La file de vérification n'est donc pas VIDE : un partenaire qui déclare son
 * profil y entre. Ce qui n'y entre jamais est le profil d'éditeur **créé
 * automatiquement** quand un auteur publie un pack — et celui-là ne peut pas
 * être vérifié une première fois.
 *
 * > **L'erreur de l'issue n'est pas une inattention, c'est un SPREAD.**
 * > `create: { userId, createdAt: now, ...data }` ne montre pas ses clés : il
 * > faut résoudre `data`, trente lignes plus haut, pour voir `verifiedAt: null`.
 * > C'est exactement la raison pour laquelle le cliquet du cycle 183 rend
 * > `unresolved` — et non `missing` — devant un spread de premier niveau : une
 * > énumération de clés littérales conclut « absente » là où la valeur est
 * > posée ailleurs. **Ici, l'instrument avait raison et l'humain a tranché.**
 *
 * Les DEUX créateurs de demande de suppression, en revanche, sont nus comme
 * l'issue le dit — et leurs littéraux sont complets, sans aucun spread, donc la
 * mesure est directe. **Aucun premier rappel n'est jamais parti, pour aucune
 * demande.**
 *
 * ─── LA DISCIPLINE D'ÉCRITURE, ET PAS LA LECTURE ─────────────────────────────
 *
 * Les trois sites nus posent leur colonne. La lecture n'est PAS touchée, et
 * c'est la même raison qu'au cycle 183 : réparer la lecture ferait entrer d'un
 * coup tout l'arriéré — pour les rappels, cela veut dire **un envoi de courriels
 * de masse** à chaque demande expirée depuis la mise en service. Écrire la
 * colonne rend exactes les lignes À VENIR sans rien déclencher ; le sort de
 * l'arriéré est une décision séparée.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import { stripCommentsPreservingStrings } from '../route-manifest/root-mounted-surfaces';

const SRC = join(__dirname, '..', '..');

/**
 * Le littéral que le créateur remet, relevé sur la SOURCE et borné par ses
 * ACCOLADES — jamais par un nombre de caractères.
 *
 * Un double Prisma rendrait ce qu'on lui dit : c'est le texte du créateur qui
 * porte la discipline, et c'est donc lui qu'on interroge. La clause de lecture,
 * elle, est évaluée pour de vrai (`matchesMongoWhere`) contre la ligne que ce
 * littéral produit — les deux moitiés composées, jamais chacune chez elle.
 *
 * > **Une fenêtre en CARACTÈRES est un témoin qui mentira.** La première
 * > version de ce fichier lisait `slice(at, at + 500)` : elle est passée au
 * > ROUGE dès que le correctif a posé la clé, parce que les commentaires qui
 * > l'expliquent l'avaient repoussée au-delà du 500e caractère. Le témoin
 * > accusait un code juste — et la version symétrique de cette erreur (une
 * > fenêtre trop LARGE qui attrape le littéral suivant) aurait blanchi un code
 * > faux, sans rien dire. L'appariement d'accolades n'a pas de réglage.
 */
/**
 * **ET LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE MESURE**, pour la raison que
 * ce lot a payée en direct : le commentaire qui EXPLIQUE la règle cite la
 * clause, donc contient `lastReminderAt: null`. Mesuré — en retirant la clé
 * d'un des deux `data`, le témoin restait **VERT**, blanchi par le texte qui
 * documente la discipline. Trois occurrences dans le fichier, deux seulement
 * étaient du code.
 *
 * C'est la même leçon que le cliquet du cycle 183 (#19801), qui blanchit les
 * commentaires pour cette exacte raison — et elle s'est reproduite dans le
 * TÉMOIN du cycle suivant, écrit par qui venait de l'appliquer à l'instrument.
 * **Une règle de méthode ne se transporte pas d'un outil à son voisin : elle se
 * réapplique.**
 */
const sourceOf = (file: string): string =>
  stripCommentsPreservingStrings(readFileSync(join(SRC, file), 'utf8'));

const blockFrom = (source: string, start: number): string => {
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error('littéral non refermé');
};

const creationLiteral = (file: string, anchor: string): string => {
  const source = sourceOf(file);
  const at = source.indexOf(anchor);
  expect(at).toBeGreaterThan(-1);
  return blockFrom(source, at);
};

describe('une colonne « pas encore fait » se pose à la création (#19802)', () => {
  describe('la file de vérification des partenaires — `PartnerProfile.verifiedAt`', () => {
    /**
     * Le site NU : l'éditeur créé automatiquement quand un auteur publie un
     * pack. Son `create` est un littéral COMPLET, sans spread — donc la mesure
     * est directe, et l'absence est une absence.
     */
    it('l’éditeur créé automatiquement à la publication d’un pack pose `verifiedAt`', () => {
      const literal = creationLiteral(
        'services/packs/PackPublishers.ts',
        'await this.prisma.partnerProfile.upsert({ where: { userId }, create: { userId, displayName, nameKey',
      );

      expect(literal).toContain('verifiedAt: null');
    });

    /**
     * Et la ligne qu'il produit est APPARIÉE par la clause que `pending()`
     * envoie. C'est le témoin qui COMPOSE les deux unités : sans lui, chaque
     * moitié atteste une règle que l'autre ne reçoit pas (leçon du cycle 182).
     */
    it('la ligne ainsi créée entre dans la file que `pending()` interroge', () => {
      const ligneNue: MongoDocument = { userId: 'u1', displayName: 'Studio', nameKey: 'studio' };
      const ligneAvecCle: MongoDocument = { ...ligneNue, verifiedAt: null };

      expect(matchesMongoWhere(ligneNue, { verifiedAt: null })).toBe(false);
      expect(matchesMongoWhere(ligneAvecCle, { verifiedAt: null })).toBe(true);
    });

    /**
     * LES DEUX AUTRES CRÉATEURS SONT DÉJÀ JUSTES, et le témoin le dit — sans
     * quoi un lot de nettoyage retirerait la clé en croyant la rendre
     * cohérente avec le troisième. Celui de `LensPartners` la porte par un
     * SPREAD : c'est la forme qui a trompé l'issue.
     */
    it('les deux créateurs qui l’écrivaient déjà continuent de l’écrire', () => {
      // Chez `LensPartners`, la clé vit dans le `data` RÉPANDU dans le `create`
      // — c'est la forme qui a fait conclure à l'issue que le site était nu, et
      // c'est donc le `data` qu'il faut résoudre, pas l'appel.
      const partenaire = creationLiteral('services/packs/LensPartners.ts', 'const data = {');
      const officiel = creationLiteral('services/packs/PackPublishers.ts', 'const data = { slug: MEESHY_PUBLISHER_SLUG');

      expect(partenaire).toContain('verifiedAt: null');
      expect(officiel).toContain('verifiedAt:');
    });
  });

  describe('les rappels hebdomadaires de suppression — `AccountDeletionRequest.lastReminderAt`', () => {
    /**
     * Les DEUX créateurs, parce qu'ils sont deux : la route de demande et celle
     * d'un compte désactivé. Un seul réparé laisserait la moitié de la
     * population sans premier rappel, et rien ne le dirait.
     */
    it('les deux routes de demande de suppression posent `lastReminderAt`', () => {
      const source = sourceOf('routes/me/delete-account.ts');
      const ancre = 'accountDeletionRequest.create(';
      const créations = [...source.matchAll(new RegExp(ancre.replace('(', '\\('), 'g'))]
        .map((match) => blockFrom(source, match.index ?? 0));

      expect(créations).toHaveLength(2);
      for (const création of créations) expect(création).toContain('lastReminderAt: null');
    });

    /**
     * Et la ligne produite est appariée par la clause RÉELLE du balayage —
     * recopiée ici dans sa forme exacte, les DEUX branches comprises : la
     * seconde (`{ lt }`) n'apparie pas davantage une clé absente, ce qui est la
     * moitié du piège que l'on oublie en lisant un `OR`.
     */
    it('la ligne ainsi créée entre dans la file des rappels, dont les DEUX branches rataient une clé absente', () => {
      const ilYaSeptJours = new Date('2026-11-01T00:00:00Z');
      const clause = {
        status: 'GRACE_PERIOD_EXPIRED',
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: ilYaSeptJours } }],
      };
      const nue: MongoDocument = { userId: 'u1', status: 'GRACE_PERIOD_EXPIRED' };

      expect(matchesMongoWhere(nue, clause)).toBe(false);
      expect(matchesMongoWhere({ ...nue, lastReminderAt: null }, clause)).toBe(true);
    });
  });
});
