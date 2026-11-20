import { useState } from 'react';
import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { t } from '../../i18n';
import type { RiskKey, Summary } from '../../types';
import { staffLabel, statusLabels } from '../../gui/clinical';
import { type Filters, type Presence, type Sort, sortLabels } from '../../gui/patients/filters';
import './FilterBar.css';

export type ListMode = 'cards' | 'table';
const riskChoices: RiskKey[] = ['kritik', 'yakin_takip', 'siniflandirilmamis', 'stabil'];
const presenceLabel = (presence: Presence) => t(presence === 'yes' ? 'patients.presence.yes' : 'patients.presence.no');
const names = (patients: Summary[], key: 'nurse' | 'physician') =>
  [...new Set(patients.flatMap(patient => patient.display?.[key] ? [patient.display[key]] : []))].sort((a, b) => a.localeCompare(b, 'tr-TR'));

export function ListModeButtons({ mode, onMode }: { mode: ListMode; onMode: (mode: ListMode) => void }) {
  const cards = t('patients.view.cards');
  const table = t('patients.view.table');
  return <div className="list-modes" role="group" aria-label={t('patients.view.group')}>
    <button type="button" aria-label={cards} title={cards} aria-pressed={mode === 'cards'}
      data-testid="view-cards" onClick={() => onMode('cards')}><LayoutGrid size={18} aria-hidden="true" /></button>
    <button type="button" aria-label={table} title={table} aria-pressed={mode === 'table'}
      data-testid="view-table" onClick={() => onMode('table')}><List size={18} aria-hidden="true" /></button>
  </div>;
}

export function FilterBar({ filters, onChange, allPatients, defaultExpanded, mode, onMode, statChip, overdueMinutes, onClear }: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  allPatients: Summary[];
  defaultExpanded: boolean;
  mode: ListMode;
  onMode: (mode: ListMode) => void;
  statChip?: { label: string; clear: () => void };
  overdueMinutes?: number;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const toggleRisk = (risk: RiskKey) => set('risks', filters.risks.includes(risk)
    ? filters.risks.filter(key => key !== risk) : [...filters.risks, risk]);
  const chips: { label: string; clear: () => void }[] = [];
  if (statChip) chips.push(statChip);
  for (const risk of filters.risks) chips.push({ label: statusLabels[risk], clear: () => toggleRisk(risk) });
  if (filters.query.trim()) chips.push({ label: t('patients.filter.query', { query: filters.query.trim() }), clear: () => set('query', '') });
  if (filters.labs) chips.push({ label: t('patients.filter.labsChip', { value: presenceLabel(filters.labs) }), clear: () => set('labs', '') });
  if (filters.consults) chips.push({ label: t('patients.filter.consultsChip', { value: presenceLabel(filters.consults) }), clear: () => set('consults', '') });
  if (filters.physician) chips.push({ label: staffLabel(filters.physician), clear: () => set('physician', '') });
  if (filters.nurse) chips.push({ label: staffLabel(filters.nurse), clear: () => set('nurse', '') });
  if (filters.stay) chips.push({ label: t('patients.filter.stayChip', { hours: Number(filters.stay) / 60 }), clear: () => set('stay', '') });
  const oldVitalsLabel = overdueMinutes === undefined ? t('patients.filter.oldVitalsLoading')
    : t('patients.filter.oldVitals', { minutes: overdueMinutes });
  if (filters.oldVitals && overdueMinutes !== undefined) chips.push({ label: oldVitalsLabel, clear: () => set('oldVitals', false) });
  if (filters.sort !== 'risk') chips.push({ label: t('patients.filter.sortOff'), clear: () => set('sort', 'risk') });

  return <div className="patient-filter">
    <div className="filter-toolbar">
      <label className="filter-search" title={t('patients.filter.searchHint')}>
        <Search size={18} aria-hidden="true" />
        <input type="search" data-testid="patient-search" placeholder={t('patients.filter.searchPlaceholder')}
          aria-label={t('patients.filter.searchLabel')} value={filters.query} onChange={event => set('query', event.target.value)} />
      </label>
      <button type="button" className="filter-toggle" data-testid="filter-toggle" aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={18} aria-hidden="true" /> {t('patients.filter.toggle')}</button>
      <ListModeButtons mode={mode} onMode={onMode} />
    </div>
    {chips.length > 0 && <div className="filter-active" aria-label={t('patients.filter.active')}>
      {chips.map(({ label, clear }, i) => <button type="button" className="filter-chip" key={`${i}:${label}`}
        onClick={clear} aria-label={t('patients.filter.remove', { label })}>{label}<X size={16} aria-hidden="true" /></button>)}
      <button type="button" data-testid="filters-clear" onClick={onClear}>{t('patients.filter.clear')}</button>
    </div>}
    {expanded && <div className="filter-options">
      <fieldset><legend>{t('patients.filter.risk')}</legend><div className="filter-risks">
        {riskChoices.map(risk => <button type="button" key={risk} aria-pressed={filters.risks.includes(risk)}
          data-testid={`filter-risk-${risk}`} onClick={() => toggleRisk(risk)}>{statusLabels[risk]}</button>)}
      </div></fieldset>
      <div className="filter-fields">
        <label>{t('patients.filter.sort')}<select data-testid="patient-sort" value={filters.sort} onChange={e => set('sort', e.target.value as Sort)}>
          {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {(['labs', 'consults'] as const).map(key => <label key={key}>{t(`patients.filter.${key}`)}
          <select value={filters[key]} onChange={event => set(key, event.target.value as Presence)}>
            <option value="">{t('patients.filter.all')}</option><option value="yes">{presenceLabel('yes')}</option><option value="no">{presenceLabel('no')}</option>
          </select></label>)}
        {(['physician', 'nurse'] as const).map(key => <label key={key}>{t(`patients.${key}`)}
          <select value={filters[key]} onChange={event => set(key, event.target.value)}>
            <option value="">{t('patients.filter.all')}</option>{names(allPatients, key).map(name => <option key={name} value={name}>{staffLabel(name)}</option>)}
          </select></label>)}
        <label>{t('patients.filter.stay')}<select value={filters.stay} onChange={e => set('stay', e.target.value as Filters['stay'])}>
          <option value="">{t('patients.filter.all')}</option>
          <option value="120">{t('patients.filter.stayOption', { hours: 2 })}</option>
          <option value="240">{t('patients.filter.stayOption', { hours: 4 })}</option>
        </select></label>
        <label className="filter-check"><input type="checkbox" checked={filters.oldVitals} disabled={overdueMinutes === undefined}
          onChange={e => set('oldVitals', e.target.checked)} />{oldVitalsLabel}</label>
      </div>
    </div>}
  </div>;
}
