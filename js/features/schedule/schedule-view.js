import { escapeHtml } from '../../shared/safe.js';

export function renderScheduleCellContent(item, column) {
  if (!item) return '';
  switch (column) {
    case 'region':
      return escapeHtml(item.region || '');
    case 'clinic':
      return escapeHtml(item.clinic || '');
    case 'trans':
      return escapeHtml(item.transDetail || '');
    case 'hr':
      return escapeHtml(item.hrDetail || '');
    case 'ot':
      return escapeHtml(item.otDetail || '');
    default:
      return '';
  }
}
