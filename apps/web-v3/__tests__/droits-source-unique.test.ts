/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { documentDuChoix, SAISIE_VIDE } from '@/app/(public)/chat/[lien]/choix-vue';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import type { Droits } from '@/lib/api/invite';
import { DROITS_DE_L_INVITE, droitsRendus, SANS_DROITS, TOUS_LES_DROITS } from '@/lib/contenu/droits';

import { APERCU_DE_TEST } from './lib/porte-du-lien';

/**
 * LES QUATRE DROITS D'UN INVITÉ ONT UNE SOURCE (issue #4523) — `lib/contenu/
 * droits.ts`, importé DEUX fois : par le bandeau du fil (`app/connecte/
 * fil-vue.ts`, l'état INVITÉ de `/chat/:lien`, la vue `rights`) et par
 * l'accordéon de la modale (`app/(public)/chat/[lien]/choix-vue.ts`, l'état
 * CHOIX, la vue `join`). Une liste recopiée ne se voit pas à l'exécution tant
 * qu'elle n'a pas divergé : ces témoins lisent les SOURCES et le RENDU.
 *
 * Ce que l'accordéon rend AVANT la jonction est désormais le VERDICT que
 * l'aperçu SERT (`GET /anonymous/link/:identifier`, `routes/anonymous.ts:
 * 663-692` : exigences, langues, effectif et, depuis #4522, les quatre droits
 * que le lien ouvre) — la MÊME projection `Droits` que le bandeau du fil rend
 * après la jonction (#4830). Avant #4830, l'aperçu ne servait aucun de ces
 * quatre champs et l'accordéon ne pouvait que NOMMER les droits variables sans
 * verdict ; les témoins ci-dessous en gardent la trace dans leur intitulé.
 */

const RACINE = join(__dirname, '..');
const PLANCHE = join(RACINE, '..', '..', 'docs', 'product', 'MeeshyWebV3Design', 'MeeshyWebV3.dc.html');
const source = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const SOURCE_UNIQUE = 'lib/contenu/droits.ts';
const BANDEAU = 'app/connecte/fil-vue.ts';
const ACCORDEON = 'app/(public)/chat/[lien]/choix-vue.ts';
const PEINTRE = 'lib/realtime/droits-peinture.ts';

const fichiersTs = (dossier: string): readonly string[] =>
  readdirSync(join(RACINE, dossier)).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(join(RACINE, chemin)).isDirectory()) return fichiersTs(chemin);
    return chemin.endsWith('.ts') ? [chemin] : [];
  });

const DROITS_DU_LIEN: Droits = { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true };

const fil = (droits: Droits): string =>
  documentDuFil({
    porte: { genre: 'invite', lien: 'mshy_lagos' as never, segment: 'lagos-q1', pseudo: 'Tolu', droits, jonctionFraiche: true },
    fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: [], presents: [] }, messages: [], plusAncien: null },
    lecteur: { id: 'p1', nom: 'Tolu', langues: ['fr'] },
    erreur: null,
    brouillon: '',
    maintenant: 0,
    composeur: { genre: 'ouvert' },
    tempsReel: null,
    contexte: null,
    plein: null,
    profil: null,
  } satisfies EtatDuFil);

const choix = (droits: Droits = APERCU_DE_TEST.droits): string =>
  documentDuChoix({ segment: 'lagos-q1', apercu: { ...APERCU_DE_TEST, droits }, langueProposee: 'fr', saisie: SAISIE_VIDE, refus: null, clos: null, maintenant: 0 });

/** Les lignes du bandeau, dans l'ordre du document : `[verdict, clé]`. */
const lignesDuBandeau = (html: string): readonly (readonly [string, string])[] =>
  [...html.matchAll(/<li class="(accorde|refuse)" data-droit="([a-z]+)">/g)].map(([, verdict, cle]) => [verdict ?? '', cle ?? ''] as const);

const normalise = (texte: string): string => texte.replace(/[’']/g, '’').trim();

describe('une source pour les quatre droits', () => {
  it('est importée par le bandeau du fil ET par l’accordéon de la modale', () => {
    expect(source(BANDEAU)).toContain(`from '@/${SOURCE_UNIQUE.replace(/\.ts$/, '')}'`);
    expect(source(ACCORDEON)).toContain(`from '@/${SOURCE_UNIQUE.replace(/\.ts$/, '')}'`);
    expect(source(PEINTRE)).toContain(`from '@/${SOURCE_UNIQUE.replace(/\.ts$/, '')}'`);
  });

  it('porte seule la copie des droits — aucun autre fichier de app/ ni de lib/ n’en écrit une ligne', () => {
    const porteurs = [...fichiersTs('app'), ...fichiersTs('lib')].filter((chemin) => {
      const texte = source(chemin);
      return texte.includes('Pas d’appel') || texte.includes('Écrire et répondre') || texte.includes('Historique masqué');
    });
    expect(porteurs).toEqual([SOURCE_UNIQUE]);
    expect(source('lib/contenu/fil.ts')).not.toMatch(/export const DROITS\b/);
  });

  it('nomme quatre droits, dans l’ordre de la planche — trois que le lien décide, un qu’aucun lien n’accorde à un invité', () => {
    expect(DROITS_DE_L_INVITE.map((droit) => droit.cle)).toEqual(['historique', 'ecrire', 'fichiers', 'appels']);
    expect(droitsRendus(TOUS_LES_DROITS).map((droit) => droit.accorde)).toEqual([true, true, true, false]);
    expect(droitsRendus(SANS_DROITS).map((droit) => droit.accorde)).toEqual([false, false, false, false]);
  });
});

describe('le bandeau du fil — la vue rights', () => {
  it('rend les quatre droits du module, dans son ordre, avec le verdict RELU de la passerelle', () => {
    const html = fil(DROITS_DU_LIEN);
    const rendus = droitsRendus(DROITS_DU_LIEN);
    expect(lignesDuBandeau(html)).toEqual(rendus.map((droit) => [droit.accorde ? 'accorde' : 'refuse', droit.cle]));
    rendus.forEach((droit) => {
      expect(html).toContain(`<b>${droit.titre}</b><p>${droit.sous}</p>`);
    });
  });

  it('suit chaque verdict : les mêmes lignes disent autre chose quand le lien accorde autre chose', () => {
    const tout = fil(TOUS_LES_DROITS);
    const rien = fil(SANS_DROITS);
    expect(lignesDuBandeau(tout).map(([verdict]) => verdict)).toEqual(['accorde', 'accorde', 'accorde', 'refuse']);
    expect(lignesDuBandeau(rien).map(([verdict]) => verdict)).toEqual(['refuse', 'refuse', 'refuse', 'refuse']);
    // Photos SEULES, fichiers SEULS : deux droits distincts de la passerelle (`allowAnonymousImages` / `allowAnonymousFiles`, `upload.ts:287-311`), deux verdicts distincts.
    const photos = droitsRendus({ ...SANS_DROITS, canSendImages: true }).find((droit) => droit.cle === 'fichiers');
    const fichiers = droitsRendus({ ...SANS_DROITS, canSendFiles: true }).find((droit) => droit.cle === 'fichiers');
    expect(photos?.accorde).toBe(true);
    expect(fichiers?.accorde).toBe(true);
    expect(photos?.titre).not.toBe(fichiers?.titre);
  });

  it('porte les deux glyphes de verdict sur chaque ligne — c’est la classe qui montre l’un ou l’autre, et le module peut la retourner sans un tracé de plus', () => {
    const html = fil(DROITS_DU_LIEN);
    const lignes = html.match(/<li class="(?:accorde|refuse)" data-droit="[a-z]+">[\s\S]*?<\/li>/g) ?? [];
    expect(lignes).toHaveLength(4);
    lignes.forEach((ligne) => {
      expect((ligne.match(/<svg /g) ?? []).length).toBe(2);
    });
  });
});

/**
 * #4830 — l'aperçu sert désormais les quatre droits que le lien ouvre
 * (`allowViewHistory`, `allowAnonymous*`) : l'accordéon en rend le VERDICT,
 * comme le bandeau du fil après la jonction — la même source, avant et après.
 */
describe('l’accordéon de la modale — la vue join', () => {
  it('rend les quatre droits du module, dans son ordre, avec le verdict SERVI par l’aperçu', () => {
    const html = choix(DROITS_DU_LIEN);
    const rendus = droitsRendus(DROITS_DU_LIEN);
    expect(lignesDuBandeau(html)).toEqual(rendus.map((droit) => [droit.accorde ? 'accorde' : 'refuse', droit.cle]));
    rendus.forEach((droit) => {
      expect(html).toContain(`<b>${droit.titre}</b><p>${droit.sous}</p>`);
    });
  });

  it('suit chaque verdict : les mêmes lignes disent autre chose quand le lien ouvre autre chose', () => {
    const tout = choix(TOUS_LES_DROITS);
    const rien = choix(SANS_DROITS);
    expect(lignesDuBandeau(tout).map(([verdict]) => verdict)).toEqual(['accorde', 'accorde', 'accorde', 'refuse']);
    expect(lignesDuBandeau(rien).map(([verdict]) => verdict)).toEqual(['refuse', 'refuse', 'refuse', 'refuse']);
  });

  /** Le verdict d'« appeler » ne varie jamais : aucun lien n'ouvre d'appel à un invité (§ 5.1). */
  it('n’accorde jamais le droit d’appeler, quel que soit ce que le lien ouvre par ailleurs', () => {
    expect(lignesDuBandeau(choix(TOUS_LES_DROITS)).find(([, cle]) => cle === 'appels')).toEqual(['refuse', 'appels']);
  });
});

/**
 * LA RÉFÉRENCE DE CONTENU : `cible/rights.png`, dont la planche porte la
 * source (`MeeshyWebV3.dc.html`, le littéral `rights`). Ce qui se compare est
 * le CONTENU — quatre droits, leur ordre, leur verdict, leur glyphe —, jamais
 * la disposition d'une page (issue #4523). La planche DATE l'historique
 * (« depuis le 12 août ») : la passerelle ne sert qu'un booléen
 * (`allowViewHistory` ; le plancher est `joinedAt`, `messages-list.ts:
 * 265-275`), et un chiffre ne s'invente pas — ce droit se compare par sa
 * famille, les trois autres mot pour mot.
 */
describe('le contenu, contre cible/rights.png', () => {
  // Le littéral des DONNÉES de la vue (`{ icon, title, sub }` par ligne) — pas la carte des sorties, qui s'appelle aussi `rights`.
  const litteral = /rights: \[((?:\s*\{ icon: [^\n]*\n)+)\s*\],/.exec(readFileSync(PLANCHE, 'utf8'))?.[1] ?? '';
  const attendus = [...litteral.matchAll(/icon: '([a-z-]+)'[^\n]*?title: (?:'([^']*)'|"([^"]*)")/g)].map(([, icone, simple, double]) => ({
    icone: icone ?? '',
    titre: normalise(simple ?? double ?? ''),
  }));

  it('lit quatre droits dans la planche', () => {
    expect(attendus).toHaveLength(4);
  });

  it('rend les quatre, dans le même ordre, avec le même verdict et le même glyphe', () => {
    const rendus = droitsRendus(TOUS_LES_DROITS);
    expect(rendus.map((droit) => (droit.accorde ? 'ph-check-circle' : 'ph-x-circle'))).toEqual(attendus.map((droit) => droit.icone));
    expect(normalise(rendus[0]?.titre ?? '')).toMatch(/^Historique/);
    expect(normalise(attendus[0]?.titre ?? '')).toMatch(/^Historique/);
    rendus.slice(1).forEach((droit, rang) => {
      expect(normalise(droit.titre)).toBe(attendus[rang + 1]?.titre);
    });
  });
});
