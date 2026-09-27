/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-pt.ts` comme `catalog-pt-call-feedback.ts`.
 */
const ptCallsErase = {
  'calls.edit': 'Editar',
  'calls.editDone': 'Concluído',
  'calls.hide.named': 'Remover a chamada com {name} do histórico',
  'calls.clearAll': 'Apagar tudo',
  'calls.clearAll.confirm': 'Apagar todo o seu histórico de chamadas? Os outros participantes mantêm o deles.',
  'calls.clearAll.confirmAction': 'Apagar',
  'calls.clearAll.cancel': 'Cancelar',
  'calls.erase.failed': 'Não foi possível apagar. Tente novamente.',
  'calls.search': 'Pesquisar um nome',
  'calls.search.clear': 'Limpar a pesquisa',
  'calls.search.empty': 'Nenhuma chamada corresponde a «{query}»',
  'calls.participants.more': '{names} +{count}',
  'calls.participants.a11y': 'com {names}',
  'callJoin.detail.participants': 'Participantes',
} as const;

export default ptCallsErase;
