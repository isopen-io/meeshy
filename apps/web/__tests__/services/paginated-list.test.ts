import { readPaginatedList } from '../../services/paginated-list';

/**
 * Le lecteur d'enveloppe `sendPaginatedSuccess`.
 *
 * Le témoin central est le premier : il reproduit la charge utile RÉELLE, avec
 * ses deux enveloppes empilées, et exige que la liste en ressorte. C'est ce que
 * quatre pages de la console lisaient de travers.
 */
describe('readPaginatedList', () => {
  const gatewayBody = {
    success: true,
    data: [{ id: 'a' }, { id: 'b' }],
    pagination: { total: 42, offset: 0, limit: 20, hasMore: true },
  };

  it('extrait la liste du corps que la passerelle sert vraiment', () => {
    const { items } = readPaginatedList<{ id: string }>({ data: gatewayBody });

    expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('extrait la pagination, qui est le FRÈRE de la liste et non son enfant', () => {
    const { pagination } = readPaginatedList({ data: gatewayBody });

    expect(pagination).toEqual({ total: 42, offset: 0, limit: 20, hasMore: true });
  });

  it('rend une liste vide quand la réponse ne porte aucun corps', () => {
    expect(readPaginatedList({}).items).toEqual([]);
    expect(readPaginatedList({ data: undefined }).items).toEqual([]);
  });

  it("rend une liste vide plutôt que de propager un `data` qui n'est pas un tableau", () => {
    const { items, pagination } = readPaginatedList({
      data: { data: { unexpected: true }, pagination: { total: 0, offset: 0, limit: 20, hasMore: false } },
    });

    expect(items).toEqual([]);
    expect(pagination).toEqual({ total: 0, offset: 0, limit: 20, hasMore: false });
  });

  it('rend une pagination absente sans lever, quand la route ne la sert pas', () => {
    const { items, pagination } = readPaginatedList<{ id: string }>({
      data: { success: true, data: [{ id: 'a' }] },
    });

    expect(items).toEqual([{ id: 'a' }]);
    expect(pagination).toBeUndefined();
  });
});
