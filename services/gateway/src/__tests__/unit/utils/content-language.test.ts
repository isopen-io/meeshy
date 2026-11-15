/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { detectContentLanguage, measureContentLanguage } from '../../../utils/content-language';

describe('detectContentLanguage', () => {
  it('reads an accented French caption as French, never as Portuguese', () => {
    expect(
      detectContentLanguage('Recette #9072 — ma légende se pose au ras du bas. Lien : https://meeshy.me/notes'),
    ).toBe('fr');
  });

  it('does not let an accented letter inside a word count as a word', () => {
    expect(detectContentLanguage('Une légende élégante pour la soirée')).toBe('fr');
  });

  it('still reads Portuguese when its words are really there', () => {
    expect(detectContentLanguage('Não sei se o filme é bom, mas vou com os amigos')).toBe('pt');
  });

  it('reads Spanish and German by their words', () => {
    expect(detectContentLanguage('El perro es muy bonito y come con los niños')).toBe('es');
    expect(detectContentLanguage('Ich habe das Buch nicht gelesen, und der Hund ist müde')).toBe('de');
  });

  it('ignores the words of an address', () => {
    expect(detectContentLanguage('Look at https://example.com/le/la/les/que/pour')).toBe('en');
  });

  it('reads scripts before words', () => {
    expect(detectContentLanguage('مرحبا بكم')).toBe('ar');
    expect(detectContentLanguage('你好世界')).toBe('zh');
    expect(detectContentLanguage('こんにちは')).toBe('ja');
  });

  it('falls back to English on empty or unknown text', () => {
    expect(detectContentLanguage('')).toBe('en');
    expect(detectContentLanguage('Hello world, see you soon')).toBe('en');
  });
});

describe('measureContentLanguage — une détection sans indice ne tranche pas (#9861)', () => {
  it('rend null sur un texte court fait de mots inconnus et de chiffres', () => {
    expect(measureContentLanguage('Story recette B 9743 r2')).toBeNull();
  });

  it('rend null sur un texte vide', () => {
    expect(measureContentLanguage('')).toBeNull();
  });

  it('rend la langue quand ses mots sont là', () => {
    expect(measureContentLanguage('Une légende pour la soirée')).toBe('fr');
  });

  it('rend la langue quand son écriture est là', () => {
    expect(measureContentLanguage('مرحبا بكم')).toBe('ar');
  });
});

describe('measureContentLanguage — l’anglais a son vocabulaire, un mot partagé ne tranche pas seul (#12332)', () => {
  it('une phrase anglaise contenant « a » est anglaise, jamais portugaise', () => {
    expect(measureContentLanguage('The photograph shows a beautiful orange cat sleeping peacefully on the comfortable sofa in the living room')).toBe('en');
    expect(measureContentLanguage('A cat on a roof')).toBe('en');
  });

  it('des textes COURTS dans chaque langue de vocabulaire', () => {
    expect(measureContentLanguage('See you at the office')).toBe('en');
    expect(measureContentLanguage('On se voit au bureau')).toBe('fr');
    expect(measureContentLanguage('Nos vemos en la oficina')).toBe('es');
    expect(measureContentLanguage('Wir sehen uns im Büro und nicht zu Hause')).toBe('de');
    expect(measureContentLanguage('Vou com você ao escritório')).toBe('pt');
    expect(measureContentLanguage('Ci vediamo in ufficio, non è lontano')).toBe('it');
  });

  it('des textes LONGS dans chaque langue de vocabulaire', () => {
    expect(measureContentLanguage('I think we should meet tomorrow morning because the weather will be much better and we can walk to the market together with your sister')).toBe('en');
    expect(measureContentLanguage('Je pense que nous devrions nous retrouver demain matin parce que le temps sera bien meilleur et nous pourrons marcher jusqu’au marché avec ta sœur')).toBe('fr');
    expect(measureContentLanguage('Creo que deberíamos vernos mañana por la mañana porque el tiempo será mucho mejor y podremos caminar hasta el mercado con tu hermana')).toBe('es');
    expect(measureContentLanguage('Ich denke, wir sollten uns morgen früh treffen, weil das Wetter viel besser sein wird und wir mit deiner Schwester zum Markt gehen können')).toBe('de');
    expect(measureContentLanguage('Eu acho que devemos nos encontrar amanhã de manhã porque o tempo vai estar muito melhor e podemos caminhar até o mercado com a sua irmã')).toBe('pt');
    expect(measureContentLanguage('Penso che dovremmo vederci domani mattina perché il tempo sarà molto migliore e potremo camminare fino al mercato con tua sorella')).toBe('it');
  });

  it('un seul mot partagé entre deux langues ne prouve rien', () => {
    expect(measureContentLanguage('a')).toBeNull();
    expect(measureContentLanguage('la')).toBeNull();
  });
});
