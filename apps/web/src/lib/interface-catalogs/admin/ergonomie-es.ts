import type { AdminCatalogFragment } from './fragment';
import type fr from './ergonomie-fr';

const f = {
  'admin.quickEdit.title': 'Edición rápida',
  'admin.quickEdit.subtitle': 'Toca un dato para cambiarlo: se guarda en cuanto lo dejas.',
  'admin.quickEdit.fold': 'Plegar la edición rápida',
  'admin.quickEdit.unfold': 'Desplegar la edición rápida',
  'admin.quickEdit.birthDate': 'Fecha de nacimiento',
  'admin.quickEdit.birthValue': '{date} · {age}',
  'admin.quickEdit.account': 'Cuenta',
  'admin.quickEdit.active': 'Activa',
  'admin.quickEdit.inactive': 'Desactivada',
  'admin.quickEdit.presence': 'Presencia',
  'admin.quickEdit.lastSeen': 'Visto el {date}',
  'admin.quickEdit.attempts': 'Intentos de conexión',
  'admin.quickEdit.attemptsCount': 'Fallos desde la última conexión: {count}',
  'admin.quickEdit.attemptsNone': 'Ningún fallo reciente',
  'admin.quickEdit.attemptsReset': 'Poner a cero',
  'admin.quickEdit.attemptsDone': 'Intentos puestos a cero, cuenta desbloqueada',
  'admin.quickEdit.regeneratePassword': 'Regenerar la contraseña',
  'admin.quickEdit.roleTitle': '¿Pasar a este miembro a «{role}»?',
  'admin.quickEdit.roleConfirm': 'Cambiar el rol',
  'admin.quickEdit.roleDone': 'Rol cambiado',
  'admin.quickEdit.deactivateTitle': '¿Desactivar esta cuenta?',
  'admin.quickEdit.deactivateConfirm': 'Desactivar la cuenta',
  'admin.quickEdit.deactivateDone': 'Cuenta desactivada',
  'admin.quickEdit.gestures': 'Acciones sobre esta cuenta',
  'admin.navFilter.label': 'Ir a una sección',
  'admin.navFilter.placeholder': 'Ir a…',
  'admin.navFilter.empty': 'Ninguna sección coincide.',
  'admin.navFilter.clear': 'Borrar la búsqueda',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
