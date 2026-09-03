import { aposteRepost, basculeAime } from '@/lib/realtime/feed-etat';

describe('basculeAime', () => {
  it('aime quand ce n’était pas le cas', () => {
    expect(basculeAime({ actif: false, compte: 128 })).toEqual({ actif: true, compte: 129 });
  });

  it('retire quand c’était le cas', () => {
    expect(basculeAime({ actif: true, compte: 129 })).toEqual({ actif: false, compte: 128 });
  });

  it('ne descend jamais sous zéro', () => {
    expect(basculeAime({ actif: true, compte: 0 })).toEqual({ actif: false, compte: 0 });
  });
});

describe('aposteRepost', () => {
  it('incrémente le compte, à sens unique', () => {
    expect(aposteRepost({ compte: 4 })).toEqual({ compte: 5 });
  });
});
