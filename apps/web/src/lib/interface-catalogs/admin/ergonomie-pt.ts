import type { AdminCatalogFragment } from './fragment';
import type fr from './ergonomie-fr';

const f = {
  'admin.quickEdit.title': 'Edição rápida',
  'admin.quickEdit.subtitle': 'Toque em uma informação para alterá-la: ela é salva assim que você sai dela.',
  'admin.quickEdit.fold': 'Recolher a edição rápida',
  'admin.quickEdit.unfold': 'Expandir a edição rápida',
  'admin.quickEdit.birthDate': 'Data de nascimento',
  'admin.quickEdit.birthValue': '{date} · {age}',
  'admin.quickEdit.account': 'Conta',
  'admin.quickEdit.active': 'Ativa',
  'admin.quickEdit.inactive': 'Desativada',
  'admin.quickEdit.presence': 'Presença',
  'admin.quickEdit.lastSeen': 'Visto em {date}',
  'admin.quickEdit.attempts': 'Tentativas de acesso',
  'admin.quickEdit.attemptsCount': 'Falhas desde o último acesso: {count}',
  'admin.quickEdit.attemptsNone': 'Nenhuma falha recente',
  'admin.quickEdit.attemptsReset': 'Zerar',
  'admin.quickEdit.attemptsDone': 'Tentativas zeradas, conta desbloqueada',
  'admin.quickEdit.regeneratePassword': 'Gerar uma nova senha',
  'admin.quickEdit.roleTitle': 'Passar este membro para “{role}”?',
  'admin.quickEdit.roleConfirm': 'Alterar a função',
  'admin.quickEdit.roleDone': 'Função alterada',
  'admin.quickEdit.deactivateTitle': 'Desativar esta conta?',
  'admin.quickEdit.deactivateConfirm': 'Desativar a conta',
  'admin.quickEdit.deactivateDone': 'Conta desativada',
  'admin.quickEdit.gestures': 'Ações nesta conta',
  'admin.navFilter.label': 'Ir para uma seção',
  'admin.navFilter.placeholder': 'Ir para…',
  'admin.navFilter.empty': 'Nenhuma seção corresponde.',
  'admin.navFilter.clear': 'Limpar a busca',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
