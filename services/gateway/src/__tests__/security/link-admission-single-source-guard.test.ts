/**
 * #4167 critère 6 — « une garde qui rougit si un second site du dépôt
 * réimplémente la boucle d'admission (`grep` sur `maxUses` hors
 * `admitLinkEntry` et hors sérialisation) ».
 *
 * Le mot `maxUses` seul est un MAUVAIS grep : il apparaît légitimement dans
 * des dizaines de schémas de requête/réponse (`POST /links`, `POST
 * /conversations/:id/new-link`, les statistiques d'un lien…) sans jamais
 * TRANCHER une admission. Ce balayage cherche la FORME de la comparaison qui
 * décide — `currentUses >= …maxUses` (garde informative) ou
 * `currentUses: { lt: …maxUses }` (réclamation atomique) — jamais le nom du
 * champ isolé.
 *
 * Domaine BORNÉ à ce que #4167 gouverne (lien de partage de CONVERSATION) :
 * `routes/conversations/**`, `routes/links/**`, `services/conversations/**`,
 * `routes/anonymous.ts`. `AffiliateToken` (`services/AffiliateTrackingService.ts`,
 * `routes/affiliate.ts`) porte les MÊMES noms de champs pour un domaine
 * SANS RAPPORT (jetons de parrainage) — l'exclure par répertoire est plus sûr
 * qu'un motif regex qui tenterait de le deviner.
 *
 * Deux exemplaires SANCTIONNÉS : la loi (`admitLinkEntry`) et sa réclamation
 * ATOMIQUE (`claimLinkUse`, critère de fin #3 — même comparaison, au moment
 * de l'ÉCRITURE plutôt que de la lecture, c'est le point même de
 * l'atomicité). UN exemplaire GELÉ, répondant à une question AUTRE que
 * « peut-on ENTRER » :
 *
 *   - `routes/anonymous.ts` (`GET /anonymous/link/:identifier`) — aperçu
 *     PUBLIC avant jointure ; il ANNONCE un statut (410 sur la page
 *     d'invitation), il n'admet personne. `POST /anonymous/join/:linkId`,
 *     dans le MÊME fichier, ne compare plus rien lui-même : il délègue à
 *     `performLinkJoin` → `admitLinkEntry`.
 *
 * ─── #4827 : `routes/conversations/messages-list.ts` SORT de la liste ────────
 *
 * Ce quatrième site (`GET …/messages`) y a figuré, gelé, parce qu'il était VU.
 * Être vu n'est pas être justifié : sa raison écrite — « pas une porte
 * d'ENTRÉE mais le PLANCHER de lecture d'un participant DÉJÀ admis » — dit
 * exactement pourquoi il ne devait PAS comparer ce compteur. `currentUses`
 * compte des ADMISSIONS (son unique incrément est `claimLinkUse`) ; le relire
 * après l'entrée refusait le fil au DERNIER admis, celui dont l'admission
 * venait de remplir le lien. La comparaison est RETIRÉE (#4827) et le site
 * quitte `ALLOWED` : la garde est désormais ACTIVE sur lui — la remettre le
 * fait rougir au premier test.
 *
 * Geler documente qu'un site est VU, pas qu'il est exempté sans raison — la
 * raison est écrite ci-dessus et sur place. Un site de plus qui apparaîtrait
 * sans y être ajouté EXPLICITEMENT fait tomber ce test.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(__dirname, '../..');

/** Racines où #4167 gouverne le domaine « lien de partage de conversation ». */
const SCOPED_ROOTS = ['routes/conversations', 'routes/links', 'services/conversations'];
const SCOPED_SINGLE_FILES = ['routes/anonymous.ts'];

/**
 * La FORME d'une comparaison d'admission, dans les deux sens qu'elle prend
 * dans ce dépôt : une garde informative (`currentUses >= …maxUses`) et une
 * réclamation atomique (`currentUses: { lt: …maxUses }`).
 */
const ADMISSION_COMPARISON = /currentUses\s*>=\s*[\w.]*maxUses|currentUses:\s*\{\s*lt:\s*[\w.]*maxUses/;

const ALLOWED = new Set([
  'services/conversations/linkAdmission.ts', // admitLinkEntry — LA loi
  'routes/conversations/link-admission.ts', // claimLinkUse — sa réclamation atomique (critère 3)
  'routes/anonymous.ts', // GET /anonymous/link/:identifier — aperçu public, n'admet personne
  // `routes/conversations/messages-list.ts` a été RETIRÉ par #4827 — cf. doc-tête.
]);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function scopedFiles(): string[] {
  const files = [
    ...SCOPED_ROOTS.flatMap((root) => listTsFiles(join(SRC_DIR, root))),
    ...SCOPED_SINGLE_FILES.map((f) => join(SRC_DIR, f)),
  ];
  return files.map((f) => relative(SRC_DIR, f).replace(/\\/g, '/'));
}

function matchingFiles(): string[] {
  return scopedFiles().filter((rel) => ADMISSION_COMPARISON.test(readFileSync(join(SRC_DIR, rel), 'utf8')));
}

describe('Une seule loi d\'admission de lien — #4167', () => {
  it('aucun site hors de la liste autorisée ne compare currentUses à maxUses', () => {
    const offenders = matchingFiles().filter((rel) => !ALLOWED.has(rel));
    expect(offenders).toEqual([]);
  });

  // Garde de PÉRIMÈTRE (patron `unbounded-findmany-guard.test.ts`) : une
  // garde négative qui ne trouve soudain plus RIEN a pu perdre son terrain de
  // balayage, pas gagner en propreté. Ce test positif prouve que les TROIS
  // sites attendus sont bien vus.
  it('le balayage voit bien les trois sites attendus — preuve qu\'il ne s\'est pas vidé', () => {
    expect(new Set(matchingFiles())).toEqual(ALLOWED);
  });

  it('un troisième site qui réimplémenterait la comparaison ferait tomber la garde — contre-épreuve', () => {
    const REOFFENDING_SNIPPET = 'if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) { return refuse(); }';
    expect(ADMISSION_COMPARISON.test(REOFFENDING_SNIPPET)).toBe(true);
  });
});
