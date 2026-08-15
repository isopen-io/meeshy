import { buildTranslationEvent } from '../buildTranslationEvent';

/**
 * Ces tests décrivent le CONTRAT que les deux clients lisent, pas la forme
 * qu'une implémentation se trouve produire.
 *
 * Web (`TranslationService.handleTranslationEvent`) :
 *   `data.translation` OU `data.translations` — sinon `return`, en silence.
 * iOS (`MessageSocketManager`, `decode(TranslationEvent.self, …)`) :
 *   `translations: [TranslationData]`, NON optionnel — un décodage qui échoue
 *   est un événement perdu, sans trace.
 *
 * Ce que les deux exigent est donc la même chose : un TABLEAU `translations`,
 * dont chaque entrée porte le texte sous `translatedContent`.
 */
describe('buildTranslationEvent', () => {
  const base = {
    messageId: 'msg-1',
    targetLanguage: 'fr',
    translatedText: 'Bonjour',
    cached: false,
    now: 1_700_000_000_000,
  };

  it('rend le texte traduit dans un tableau translations, jamais à la racine', () => {
    const event = buildTranslationEvent(base);

    expect(Array.isArray(event.translations)).toBe(true);
    expect(event.translations).toHaveLength(1);
    expect(event.translations[0].translatedContent).toBe('Bonjour');
    // Le nom que le chemin cache utilisait — aucun client ne l'a jamais lu.
    expect(event).not.toHaveProperty('translatedText');
  });

  it('porte messageId à la racine ET sur chaque traduction', () => {
    const event = buildTranslationEvent(base);

    expect(event.messageId).toBe('msg-1');
    expect(event.translations[0].messageId).toBe('msg-1');
  });

  it('conserve la langue cible et la langue source', () => {
    const event = buildTranslationEvent({ ...base, sourceLanguage: 'en' });

    expect(event.translations[0].targetLanguage).toBe('fr');
    expect(event.translations[0].sourceLanguage).toBe('en');
  });

  it("retombe sur 'auto' quand la langue source est absente ou vide", () => {
    expect(buildTranslationEvent({ ...base, sourceLanguage: null }).translations[0].sourceLanguage).toBe('auto');
    expect(buildTranslationEvent({ ...base, sourceLanguage: '' }).translations[0].sourceLanguage).toBe('auto');
    expect(buildTranslationEvent(base).translations[0].sourceLanguage).toBe('auto');
  });

  it('dit la vérité sur la provenance via `cached`', () => {
    expect(buildTranslationEvent({ ...base, cached: true }).translations[0].cached).toBe(true);
    expect(buildTranslationEvent({ ...base, cached: false }).translations[0].cached).toBe(false);
  });

  it("reprend l'identité de la ligne quand elle existe", () => {
    const event = buildTranslationEvent({ ...base, translationId: 'trad-42' });

    expect(event.translations[0].id).toBe('trad-42');
  });

  it('fabrique un id UNIQUE par émission quand la ligne n’a pas d’identité', () => {
    const first = buildTranslationEvent({ ...base, now: 1000 });
    const second = buildTranslationEvent({ ...base, now: 2000 });

    // Le web déduplique sur `${messageId}_${translation.id}` : un id stable
    // ferait avaler la réponse à une demande explicite de l'utilisateur.
    expect(first.translations[0].id).not.toBe(second.translations[0].id);
    expect(first.translations[0].id).toContain('msg-1');
    expect(first.translations[0].id).toContain('fr');
  });

  it('compose la cacheKey sur (message, source, cible)', () => {
    const event = buildTranslationEvent({ ...base, sourceLanguage: 'en' });

    expect(event.translations[0].cacheKey).toBe('msg-1_en_fr');
  });

  it('retombe sur des valeurs par défaut pour le modèle et la confiance', () => {
    const event = buildTranslationEvent(base);

    expect(event.translations[0].translationModel).toBe('medium');
    expect(event.translations[0].confidenceScore).toBe(0.85);
  });

  it('préserve une confiance de 0 plutôt que de la traiter comme absente', () => {
    const event = buildTranslationEvent({ ...base, confidenceScore: 0 });

    expect(event.translations[0].confidenceScore).toBe(0);
  });

  it('horodate la traduction', () => {
    const event = buildTranslationEvent(base);

    expect(event.translations[0].createdAt).toEqual(new Date(base.now));
  });
});
