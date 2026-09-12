import { describe, expect, test } from 'bun:test';

import { detectByStopwords } from './stopword-language-detector';

/**
 * `stopwordLanguageDetector` — écriture puis mots-outils, silencieux quand il
 * doute (#5828, § 4.2). Aucune dépendance : le rejet de `tinyld` (33 485
 * octets gzip -9 mesurés) est documenté dans `compose-language.ts`.
 */
describe('stopwordLanguageDetector — écriture puis mots-outils, silencieux quand il doute', () => {
  test('écriture arabe', () => {
    expect(detectByStopwords('مرحبا كيف حالك')).toEqual({ language: 'ar', confidence: 1 });
  });

  test('kana (même mêlé à des sinogrammes)', () => {
    expect(detectByStopwords('こんにちは、元気ですか')?.language).toBe('ja');
  });

  test('hangeul', () => {
    expect(detectByStopwords('안녕하세요')?.language).toBe('ko');
  });

  test('han seul, sans kana', () => {
    expect(detectByStopwords('你好吗')?.language).toBe('zh');
  });

  test('anglais net — confiance au plancher ou au-dessus', () => {
    const result = detectByStopwords('Do you confirm the mockup for tomorrow?');
    expect(result?.language).toBe('en');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.86);
  });

  test('français net — confiance au plancher ou au-dessus', () => {
    const result = detectByStopwords('Est-ce que tu valides la maquette pour demain ?');
    expect(result?.language).toBe('fr');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.86);
  });

  test('deux mots-outils suffisent, un seul ne suffit pas', () => {
    expect(detectByStopwords('je vois')).toBeNull();
    expect(detectByStopwords('je ne vois pas')?.language).toBe('fr');
  });

  test('mélange de langues ⇒ doute ⇒ null', () => {
    expect(detectByStopwords('the maison est big')).toBeNull();
  });

  test('aucun mot-outil ⇒ null', () => {
    expect(detectByStopwords('ok lol mdr')).toBeNull();
  });

  test('la casse et la ponctuation n’y changent rien', () => {
    expect(detectByStopwords('DO YOU CONFIRM?')?.language).toBe('en');
  });

  /**
   * LES SIX LANGUES ANNONCÉES SONT LES SIX LANGUES SERVIES (revue-correction
   * #5828) — le doc-comment du module promet « les SIX langues latines de la
   * liste rapide iOS (fr, en, es, de, it, pt) » ; les témoins n'en couvraient
   * que DEUX (fr, en) plus les écritures. Mesuré avant correction : l'espagnol,
   * l'italien et le portugais rendaient `null` sur NEUF phrases ordinaires sur
   * neuf — trois des six langues annoncées étaient muettes, et un lecteur qui
   * écrit dans l'une d'elles repartait au rang 1 de son Prisme, c'est-à-dire au
   * défaut que #5828 corrige. Une table par langue ne prouve rien tant qu'une
   * PHRASE par langue n'est pas mesurée.
   *
   * Chaque phrase est en outre vérifiée contre les CINQ autres langues : le
   * risque d'une table enrichie n'est pas le silence (qui ramène au repli),
   * c'est le FAUX verdict, qui étiquette le message d'une langue qu'il ne
   * parle pas et corrompt le pipeline NLLB pour tous les destinataires.
   */
  const RECONNUES: Readonly<Record<string, readonly string[]>> = {
    fr: [
      'Est-ce que tu valides la maquette pour demain',
      'Je ne peux pas arriver avant trois heures',
      'J’ai déjà terminé le rapport que tu as demandé',
      'Bonjour, on se voit ce soir chez toi',
      'Je pousse la mesure ce soir avec vous',
    ],
    en: [
      'Do you confirm the mockup for tomorrow',
      'I cannot get there before three in the afternoon',
      'I have already finished the report that you asked for',
      'Hello, see you tonight at your place',
      'The cold start is still above two seconds',
    ],
    es: [
      'Hola, no puedo llegar antes de las tres',
      'Ya está listo el informe que pediste',
      'No entiendo por qué el servidor está caído',
    ],
    de: [
      'Kannst du die Vorlage für morgen bestätigen',
      'Ich kann nicht vor drei Uhr dort sein',
      'Ich habe den Bericht schon fertig, den du wolltest',
      'Wir sehen uns heute Abend bei dir',
      'Das Problem ist noch nicht gelöst',
    ],
    it: [
      'Puoi confermare il modello per domani',
      'Non riesco ad arrivare prima delle tre',
      'Ho già finito la relazione che hai chiesto',
      'Il problema non è ancora risolto',
    ],
    pt: ['O problema ainda não está resolvido'],
  };

  /**
   * LES SILENCES CONNUS — une phrase courte dont les mots-outils sont TOUS
   * partagés avec une langue voisine n'atteint pas les DEUX coups exigés. Ce
   * n'est pas un bogue : c'est le plancher `LATIN_MIN_HITS`, qui achète
   * l'absence de verdict FAUX. Elles sont ici pour que le SILENCE soit lui
   * aussi une mesure écrite, jamais une surprise — mais aucune assertion ne
   * l'exige (un enrichissement futur des tables doit pouvoir les servir sans
   * rendre ce fichier rouge : la garde est l'invariant de sûreté ci-dessous,
   * jamais un plafond).
   */
  const SILENCES_CONNUS: Readonly<Record<string, readonly string[]>> = {
    es: ['Puedes confirmar la maqueta para mañana', 'Nos vemos esta noche en tu casa'],
    it: ['Ci vediamo stasera da te'],
    pt: [
      'Podes confirmar o modelo para amanhã',
      'Não consigo chegar antes das três',
      'Já terminei o relatório que pediste',
      'Vemo-nos esta noite em tua casa',
    ],
  };

  for (const [language, phrases] of Object.entries(RECONNUES)) {
    for (const phrase of phrases) {
      test(`« ${phrase} » ⇒ ${language}`, () => {
        const verdict = detectByStopwords(phrase);
        expect(verdict?.language).toBe(language);
        // Le plancher d'ADOPTION est la seule confiance qui compte : sous
        // 0,86, `detectByStopwords` rend déjà `null` (donc `verdict` serait
        // nul et la ligne ci-dessus rougirait) — on le REDIT ici pour que le
        // témoin nomme la garde qu'il vérifie.
        expect(verdict?.confidence ?? 0).toBeGreaterThanOrEqual(0.86);
      });
    }
  }

  /**
   * L'INVARIANT DE SÛRETÉ — celui qui ne doit JAMAIS rougir, et le seul qui
   * porte sur les TRENTE phrases, silences compris : une phrase peut rester
   * sans verdict (elle retombe alors sur le rang 1 du Prisme du lecteur,
   * c'est-à-dire le comportement d'avant #5828), elle ne doit JAMAIS être
   * attribuée à une AUTRE des six langues — un message étiqueté d'une langue
   * qu'il ne parle pas corrompt le pipeline NLLB de tous ses destinataires.
   */
  test('aucune des trente phrases n’est attribuée à une AUTRE des six langues (silences compris)', () => {
    const toutes = Object.entries(RECONNUES).concat(Object.entries(SILENCES_CONNUS));
    const faux = toutes.flatMap(([language, phrases]) =>
      phrases
        .map((phrase) => ({ phrase, verdict: detectByStopwords(phrase)?.language ?? null }))
        .filter((r) => r.verdict !== null && r.verdict !== language)
        .map((r) => `${language} → ${r.verdict} : ${r.phrase}`),
    );
    expect(faux).toEqual([]);
  });

  /**
   * LE CLIQUET DE PORTÉE — mesuré le 2026-09-12 sur ces trente phrases :
   * fr 5/5, en 5/5, de 5/5, it 4/5, es 3/5, pt 1/5. Le témoin exige ce
   * plancher, jamais un plafond : enrichir les tables ne peut que le tenir.
   */
  test('la portée mesurée par langue ne recule pas', () => {
    const PLANCHER: Readonly<Record<string, number>> = { fr: 5, en: 5, de: 5, it: 4, es: 3, pt: 1 };
    // Toutes les phrases des six langues, silences connus compris : le
    // plancher se mesure sur le CORPUS entier, pour qu'un enrichissement des
    // tables le fasse MONTER (et jamais rougir), là où un `toEqual` sur les
    // seules phrases reconnues en ferait un plafond.
    const sous = Object.entries(PLANCHER)
      .map(([language, floor]) => {
        const corpus = [...(RECONNUES[language] ?? []), ...(SILENCES_CONNUS[language] ?? [])];
        const served = corpus.filter((p) => detectByStopwords(p)?.language === language).length;
        return { language, served, floor };
      })
      .filter((r) => r.served < r.floor);
    expect(sous).toEqual([]);
  });
});
