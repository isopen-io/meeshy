import { bringDayOf } from '../../../../services/bring/bringDay';

describe('#14473 — le prochain minuit du Bring est le premier instant du jour local suivant', () => {
  it('Santiago saute minuit le 2026-09-06 : le jour commence à 01:00 locale, soit 04:00Z', () => {
    const veille = bringDayOf(new Date('2026-09-05T15:00:00Z'), 'America/Santiago');

    expect(veille).toEqual({ day: '2026-09-05', resetsAt: new Date('2026-09-06T04:00:00.000Z') });
  });

  it('Santiago reprend une heure le 2026-04-05 : le jour commence quand 23:00 a fini de se répéter, à 04:00Z', () => {
    const veille = bringDayOf(new Date('2026-04-04T15:00:00Z'), 'America/Santiago');

    expect(veille).toEqual({ day: '2026-04-04', resetsAt: new Date('2026-04-05T04:00:00.000Z') });
  });

  it('un instant juste avant le prochain minuit est encore la veille, et le prochain minuit est le jour suivant', () => {
    const { resetsAt } = bringDayOf(new Date('2026-09-05T15:00:00Z'), 'America/Santiago');
    const juste = bringDayOf(new Date(resetsAt.getTime() - 1_000), 'America/Santiago');
    const apres = bringDayOf(resetsAt, 'America/Santiago');

    expect(juste.day).toBe('2026-09-05');
    expect(apres.day).toBe('2026-09-06');
  });

  it('Paris au passage à l’heure d’été (minuit existe) : rien ne change, minuit local = 23:00Z', () => {
    expect(bringDayOf(new Date('2026-03-29T12:00:00Z'), 'Europe/Paris').resetsAt).toEqual(new Date('2026-03-29T22:00:00.000Z'));
    expect(bringDayOf(new Date('2026-03-28T12:00:00Z'), 'Europe/Paris').resetsAt).toEqual(new Date('2026-03-28T23:00:00.000Z'));
  });

  it('Tokyo et le repli UTC restent inchangés', () => {
    expect(bringDayOf(new Date('2026-10-31T12:00:00Z'), 'Asia/Tokyo')).toEqual({ day: '2026-10-31', resetsAt: new Date('2026-10-31T15:00:00.000Z') });
    expect(bringDayOf(new Date('2026-10-31T12:00:00Z'), 'Mars/Olympus')).toEqual({ day: '2026-10-31', resetsAt: new Date('2026-11-01T00:00:00.000Z') });
  });

  it.each(['America/Santiago', 'America/Havana', 'Asia/Beirut', 'Europe/Paris', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Asia/Kolkata'])(
    '%s : chaque jour de 2026, le prochain minuit est le premier instant du jour suivant',
    (zone) => {
      const midis = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1, 12) + i * 86_400_000));
      const fautes = midis.filter((midi) => {
        const { day, resetsAt } = bringDayOf(midi, zone);
        return bringDayOf(new Date(resetsAt.getTime() - 1_000), zone).day !== day || bringDayOf(resetsAt, zone).day === day;
      });

      expect(fautes).toEqual([]);
    },
  );
});
