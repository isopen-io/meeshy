import type { GameStatsTextKey } from './analytics-game-fr';

const f = {
  'admin.analytics.game.retention.title': 'Regreso de los nuevos registrados',
  'admin.analytics.game.retention.hint': 'Parte de las cuentas de una semana de registro todavía activas 1, 7 y 30 días después de registrarse. «—»: ninguna cuenta de esa semana ha tenido aún tiempo de llegar a ese día.',
  'admin.analytics.game.retention.column.week': 'Semana del',
  'admin.analytics.game.retention.column.accounts': 'Registrados',
  'admin.analytics.game.retention.column.day1': 'Tras 1 día',
  'admin.analytics.game.retention.column.day7': 'Tras 7 días',
  'admin.analytics.game.retention.column.day30': 'Tras 30 días',
  'admin.analytics.game.retention.empty.title': 'Ningún registro en las últimas {weeks} semanas',
  'admin.analytics.game.retention.empty.hint': 'El regreso se mide en cuanto una semana cuenta con un nuevo registrado.',
  'admin.analytics.game.daily.title': 'El Juego, día a día',
  'admin.analytics.game.daily.hint': 'Ofrendas abiertas y Meeshes acuñadas y gastadas cada día (UTC). Las Meeshes se cuentan en unidades.',
  'admin.analytics.game.daily.column.day': 'Día',
  'admin.analytics.game.daily.column.offerings': 'Ofrendas abiertas',
  'admin.analytics.game.daily.column.minted': 'Meeshes acuñadas',
  'admin.analytics.game.daily.column.spent': 'Meeshes gastadas',
  'admin.analytics.game.today.title': 'Hoy',
  'admin.analytics.game.today.hint': 'Los jugadores que mantienen su Llama, y los que han dejado el Juego de lado.',
  'admin.analytics.game.longFlames': 'Llamas largas todavía vivas',
  'admin.analytics.game.longFlames.caption': 'Encendidas desde hace {days} días o más.',
  'admin.analytics.game.hidden': 'Cuentas con el Juego oculto',
  'admin.analytics.game.notificationsOff': 'Cuentas sin notificaciones del Juego',
  'admin.analytics.game.sampled': 'Lectura limitada: las cifras son mínimos.',
  'admin.analytics.game.noValue': 'sin datos',
} satisfies Readonly<Record<GameStatsTextKey, string>>;

export default f;
