/**
 * Cliquet : une AUDIENCE de diffusion de conversation lit l'appartenance
 * VIVANTE (#16690). Détail, et la distinction audience / exclusion qui décide
 * du sens du correctif : `conversation-audience-living-participation.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  sweepConversationAudiences,
  sweepUnjudgeableParticipantReads,
  audienceKey,
  DELIBERATELY_WIDE,
  MEASURED_FAMILIES,
  MEASURED_NOT_INSTRUCTED,
} from './conversation-audience-living-participation';

describe('audiences de diffusion — l’appartenance VIVANTE, par la même constante que les portes', () => {
  const sites = sweepConversationAudiences();

  /**
   * Une garde négative dont le balayage rend `[]` reste VERTE — elle
   * n'atteste alors rien du tout. Même précaution que
   * `presence-visibility-viewer-aware-guard`.
   */
  it('balaie réellement quelque chose', () => {
    expect(sites.length).toBeGreaterThan(8);
  });

  /**
   * #20091 — DEUX inventaires, pas un, et le témoin les lit comme deux
   * phrases distinctes : `DELIBERATELY_WIDE` dit « ce site DOIT être large »,
   * `MEASURED_NOT_INSTRUCTED` dit « on ne sait pas encore ce que ce site
   * décide ». Une audience NEUVE n'est dans ni l'un ni l'autre, et rougit.
   */
  it('n’en laisse aucune sur `isActive` nu, hors refus DÉLIBÉRÉS et dette MESURÉE', () => {
    const bare = sites
      .filter((site) => !site.usesLaw)
      .map((site) => ({ key: audienceKey(sites, site), line: site.line, where: site.where }))
      .filter((site) => !(site.key in DELIBERATELY_WIDE) && !(site.key in MEASURED_NOT_INSTRUCTED));

    expect(bare).toEqual([]);
  });

  /**
   * Les deux inventaires sont DISJOINTS. Une clé qui figure dans les deux
   * laisse choisir la phrase qu'on préfère lire — et on lira « décidé »,
   * jamais « dette ».
   */
  it('ne range aucun site dans les DEUX inventaires', () => {
    const both = Object.keys(MEASURED_NOT_INSTRUCTED).filter((key) => key in DELIBERATELY_WIDE);

    expect(both).toEqual([]);
  });

  it('rattache chaque site mesuré à une famille qui dit ce qu’elle retient', () => {
    for (const [key, family] of Object.entries(MEASURED_NOT_INSTRUCTED)) {
      expect(key).toMatch(/\.ts#\d+$/);
      expect(MEASURED_FAMILIES[family]).toBeDefined();
    }
    for (const reason of Object.values(MEASURED_FAMILIES)) {
      expect(reason.length).toBeGreaterThan(200);
    }
  });

  /**
   * La dette ne GROSSIT pas. Le cliquet est un plafond, pas un registre : une
   * audience neuve se répare, elle ne s'inscrit pas — et une ligne qui part
   * fait tomber le témoin « ne garde aucun refus périmé », qui exige qu'elle
   * désigne encore un site.
   */
  it('ne laisse pas la dette mesurée grossir au-delà de ce que #20091 a relevé', () => {
    // #20100 : le dépôt n'a pas grossi — le DISCRIMINANT a, deux fois. La forme
    // imbriquée, `findFirst` et les formes NÉGATIVES ont fait entrer des
    // lectures qui étaient hors de vue, et l'audit adversarial du lot en a
    // ajouté quatre de plus en corrigeant ce qui prenait `{ notIn: … }`,
    // `{ gt: … }` et `NOT: { userId }` pour la désignation d'une personne. Une borne de
    // dette se rédite quand l'instrument change de portée ; elle ne se
    // rédite PAS pour accueillir une clause nue écrite après coup.
    expect(Object.keys(MEASURED_NOT_INSTRUCTED).length).toBeLessThanOrEqual(75);
  });

  /**
   * #20091 — ce que l'instrument ne sait pas JUGER, il le PUBLIE : un `where`
   * qui est une variable, un appel ou un ternaire n'a pas de littéral à lire —
   * et un `where` LITTÉRAL dont la portée vient d'un spread
   * (`{ ...SCOPE, isActive: true }`) n'a pas de `conversationId` à reconnaître.
   * Cette dernière forme était ÉCARTÉE EN SILENCE jusqu'à l'audit adversarial
   * du lot, qui l'a nommée : onze lectures de plus, dont la seconde requête du
   * site même que ce lot resserre.
   * « Zéro trouvé » n'est pas « zéro existe », et c'est par là que l'audience
   * de l'arrivée dans le salon GLOBAL est restée nue sans qu'aucun cliquet
   * puisse le dire.
   *
   * **#20100 a ajouté les deux formes que ce relevé ne savait pas nommer**, et
   * chacune aurait produit un verdict FAUX plutôt qu'un silence :
   * `clé-indirecte` — la clé du membre vient d'un appel étalé
   * (`{ conversationId, ...callerParticipantWhere(caller) }`, soit une PORTE qui
   * a l'apparence d'une audience) — et `modèle-indécidable` — une clause
   * imbriquée qui ne parle ni d'activité ni de bannissement, donc dont on ne
   * sait même pas si elle vient de `Conversation.participants` ou de
   * `CallSession.participants`.
   */
  it('publie les lectures qu’il n’a pas pu juger, au lieu de les sauter', () => {
    const unjudgeable = sweepUnjudgeableParticipantReads();

    expect(unjudgeable.length).toBeGreaterThan(0);
    expect(unjudgeable.length).toBeLessThanOrEqual(52);
    for (const read of unjudgeable) {
      expect(read.form).toMatch(/^(variable|appel|ternaire|absent|portée-indirecte|clé-indirecte|modèle-indécidable)$/);
    }
  });

  /**
   * L'inventaire de refus n'est pas une dette à faire grossir : chaque entrée
   * doit encore DÉSIGNER un site, sans quoi elle autorise en silence un site
   * futur qui reprendrait la même clé.
   */
  it('ne garde aucun refus périmé, ni aucune dette périmée', () => {
    const keys = new Set(sites.filter((site) => !site.usesLaw).map((site) => audienceKey(sites, site)));
    for (const declared of [...Object.keys(DELIBERATELY_WIDE), ...Object.keys(MEASURED_NOT_INSTRUCTED)]) {
      expect(keys.has(declared)).toBe(true);
    }
  });

  it('motive chaque refus', () => {
    for (const [key, reason] of Object.entries(DELIBERATELY_WIDE)) {
      expect(reason.length).toBeGreaterThan(80);
      expect(key).toMatch(/\.ts#\d+$/);
    }
  });
});
