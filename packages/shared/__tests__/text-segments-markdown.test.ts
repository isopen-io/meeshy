/**
 * LE MARKDOWN LÉGER ET LES LIENS D'UN MESSAGE (#7849).
 *
 * Ce que ces témoins gardent :
 *  - le CODE est littéral : ni emphase, ni mention, ni lien n'y naît ;
 *  - un lien `[texte](url)` n'accepte QUE http(s) et mailto — la garde de
 *    schéma reste structurelle ;
 *  - une adresse `www.` et une adresse e-mail deviennent des liens ;
 *  - une adresse protégée (URL, code) n'est jamais coupée par une emphase ;
 *  - les BLOCS (titres, listes, citations, code) se découpent par ligne, et un
 *    texte sans syntaxe de bloc reste UN paragraphe identique à l'entrée.
 */
import { describe, expect, it } from 'vitest';

import { hasBlockSyntax, parseBlocks } from '../utils/text-blocks';
import { plainTextOf } from '../utils/text-plain';
import { segmentText } from '../utils/text-segments';

describe('segmentText — le code inline', () => {
  it('`code` devient un segment de code sans ses accents graves', () => {
    expect(segmentText('lance `bun test` puis')).toEqual([
      { kind: 'text', text: 'lance ' },
      { kind: 'code', text: 'bun test' },
      { kind: 'text', text: ' puis' },
    ]);
  });

  it('le code est LITTÉRAL — ni emphase, ni mention, ni lien à l’intérieur', () => {
    expect(segmentText('`**a** @alice https://x.fr`')).toEqual([
      { kind: 'code', text: '**a** @alice https://x.fr' },
    ]);
  });

  it('un accent grave isolé ou un code vide reste du texte', () => {
    expect(segmentText('a ` b')).toEqual([{ kind: 'text', text: 'a ` b' }]);
    expect(segmentText('a `` b')).toEqual([{ kind: 'text', text: 'a `` b' }]);
  });

  it('du code DANS une emphase reste du code', () => {
    expect(segmentText('**vois `x`**')).toEqual([
      {
        kind: 'emphasis',
        style: 'bold',
        children: [
          { kind: 'text', text: 'vois ' },
          { kind: 'code', text: 'x' },
        ],
      },
    ]);
  });
});

describe('segmentText — les liens markdown', () => {
  it('[texte](https://…) devient un lien qui AFFICHE le texte et SUIT l’adresse', () => {
    expect(segmentText('lis [la doc](https://meeshy.me/docs) ici')).toEqual([
      { kind: 'text', text: 'lis ' },
      { kind: 'url', text: 'la doc', href: 'https://meeshy.me/docs' },
      { kind: 'text', text: ' ici' },
    ]);
  });

  it('[texte](mailto:…) est un lien de courriel', () => {
    expect(segmentText('[écris-moi](mailto:a@b.fr)')).toEqual([
      { kind: 'url', text: 'écris-moi', href: 'mailto:a@b.fr' },
    ]);
  });

  it('AUCUN autre schéma ne produit de lien, même sous forme markdown', () => {
    for (const hostile of [
      '[x](javascript:alert(1))',
      '[x](data:text/html,hi)',
      '[x](vbscript:y)',
      '[x](//evil.fr)',
      '[x](/relatif)',
    ]) {
      expect(segmentText(hostile).every((s) => s.kind !== 'url')).toBe(true);
    }
  });

  it('un lien markdown EN GRAS reste un lien', () => {
    expect(segmentText('**[doc](https://x.fr)**')).toEqual([
      { kind: 'emphasis', style: 'bold', children: [{ kind: 'url', text: 'doc', href: 'https://x.fr' }] },
    ]);
  });

  it('une adresse de lien markdown qui porte des tirets bas doublés n’est pas coupée', () => {
    expect(segmentText('[init](https://x.fr/__init__)')).toEqual([
      { kind: 'url', text: 'init', href: 'https://x.fr/__init__' },
    ]);
  });
});

describe('segmentText — les adresses sans schéma et les courriels', () => {
  it('www.exemple.fr devient un lien https', () => {
    expect(segmentText('vois www.meeshy.me/a.')).toEqual([
      { kind: 'text', text: 'vois ' },
      { kind: 'url', text: 'www.meeshy.me/a', href: 'https://www.meeshy.me/a' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('une adresse e-mail devient un lien mailto — et jamais une mention', () => {
    expect(segmentText('écris à contact@marie.com.')).toEqual([
      { kind: 'text', text: 'écris à ' },
      { kind: 'url', text: 'contact@marie.com', href: 'mailto:contact@marie.com' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('un @ dans une URL ne fait pas un courriel', () => {
    expect(segmentText('https://x.fr/a@b.fr')).toEqual([
      { kind: 'url', text: 'https://x.fr/a@b.fr', href: 'https://x.fr/a@b.fr' },
    ]);
  });

  it('une URL brute portant des tirets bas doublés n’est JAMAIS coupée par un souligné', () => {
    expect(segmentText('https://x.fr/__init__ et __ok__')).toEqual([
      { kind: 'url', text: 'https://x.fr/__init__', href: 'https://x.fr/__init__' },
      { kind: 'text', text: ' et ' },
      { kind: 'emphasis', style: 'underline', children: [{ kind: 'text', text: 'ok' }] },
    ]);
  });
});

describe('parseBlocks — les blocs d’un message', () => {
  it('un texte sans syntaxe de bloc est UN paragraphe, identique à l’entrée', () => {
    const text = 'ligne 1\n\nligne 2';
    expect(hasBlockSyntax(text)).toBe(false);
    expect(parseBlocks(text)).toEqual([{ kind: 'paragraph', text }]);
  });

  it('les titres, niveaux 1 à 3', () => {
    expect(parseBlocks('# Un\n## Deux\n### Trois')).toEqual([
      { kind: 'heading', level: 1, text: 'Un' },
      { kind: 'heading', level: 2, text: 'Deux' },
      { kind: 'heading', level: 3, text: 'Trois' },
    ]);
  });

  it('un hashtag en tête de ligne n’est PAS un titre', () => {
    expect(hasBlockSyntax('#projet avance')).toBe(false);
  });

  it('une liste à puces et une liste numérotée', () => {
    expect(parseBlocks('courses :\n- pain\n* lait\n\n1. un\n2. deux')).toEqual([
      { kind: 'paragraph', text: 'courses :' },
      { kind: 'list', ordered: false, start: 1, items: ['pain', 'lait'] },
      { kind: 'list', ordered: true, start: 1, items: ['un', 'deux'] },
    ]);
  });

  it('une liste numérotée garde son numéro de départ', () => {
    expect(parseBlocks('3. trois\n4. quatre')).toEqual([{ kind: 'list', ordered: true, start: 3, items: ['trois', 'quatre'] }]);
  });

  it('une citation regroupe ses lignes', () => {
    expect(parseBlocks('> il a dit\n> ceci\nréponse')).toEqual([
      { kind: 'quote', text: 'il a dit\nceci' },
      { kind: 'paragraph', text: 'réponse' },
    ]);
  });

  it('un bloc de code est littéral et garde son langage', () => {
    expect(parseBlocks('avant\n```ts\nconst a = **1**;\n# pas un titre\n```\naprès')).toEqual([
      { kind: 'paragraph', text: 'avant' },
      { kind: 'code', language: 'ts', text: 'const a = **1**;\n# pas un titre' },
      { kind: 'paragraph', text: 'après' },
    ]);
  });

  it('un bloc de code NON FERMÉ court jusqu’à la fin', () => {
    expect(parseBlocks('```\nx\ny')).toEqual([{ kind: 'code', language: null, text: 'x\ny' }]);
  });

  it('les lignes vides internes d’un paragraphe sont gardées', () => {
    expect(parseBlocks('# T\na\n\nb')).toEqual([
      { kind: 'heading', level: 1, text: 'T' },
      { kind: 'paragraph', text: 'a\n\nb' },
    ]);
  });
});

describe('plainTextOf — ce qu’on lit, sans la notation', () => {
  it('retire les marqueurs et garde le texte lu', () => {
    expect(plainTextOf('un **mot** et [la doc](https://x.fr), `code`')).toBe('un mot et la doc, code');
    expect(plainTextOf('# Titre\n- a\n- b\n> cité')).toBe('Titre\na\nb\ncité');
  });

  it('un texte nu reste identique', () => {
    expect(plainTextOf('salut @alice, 3 * 4 = 12\n\nfin')).toBe('salut @alice, 3 * 4 = 12\n\nfin');
  });
});
