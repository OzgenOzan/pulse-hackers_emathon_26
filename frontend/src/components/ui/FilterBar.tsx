import { useState } from 'react';
import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import type { RiskKey, Summary } from '../../types';
import { statusLabels } from '../../gui/clinical';
import { type Filters, type Presence, type Sort, sortLabels } from '../../gui/patients/filters';
import './FilterBar.css';

export type ListMode = 'cards' | 'table';
const riskChoices: RiskKey[] = ['kritik', 'yakin_takip', 'siniflandirilmamis', 'stabil'];
const presenceLabel = (presence: Presence) => presence === 'yes' ? 'Var' : 'Yok';
const names = (patients: Summary[], key: 'nurse' | 'physician') =>
  [...new Set(patients.flatMap(patient => patient.display?.[key] ? [patient.display[key]] : []))].sort((a, b) => a.localeCompare(b, 'tr-TR'));

export function ListModeButtons({ mode, onMode }: { mode: ListMode; onMode: (mode: ListMode) => void }) {
  return <div className="list-modes" role="group" aria-label="Liste görünümü">
    <button type="button" aria-label="Kart görünümü" title="Kart görünümü" aria-pressed={mode === 'cards'}
      data-testid="view-cards" onClick={() => onMode('cards')}><LayoutGrid size={18} aria-hidden="true" /></button>
    <button type="button" aria-label="Tablo görünümü" title="Tablo görünümü" aria-pressed={mode === 'table'}
      data-testid="view-table" onClick={() => onMode('table')}><List size={18} aria-hidden="true" /></button>
  </div>;
}

export function FilterBar({ filters, onChange, allPatients, defaultExpanded, mode, onMode, statChip, onClear }: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  allPatients: Summary[];
  defaultExpanded: boolean;
  mode: ListMode;
  onMode: (mode: ListMode) => void;
  statChip?: { label: string; clear: () => void };
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const toggleRisk = (risk: RiskKey) => set('risks', filters.risks.includes(risk)
    ? filters.risks.filter(key => key !== risk) : [...filters.risks, risk]);
  const chips: { label: string; clear: () => void }[] = [];
  if (statChip) chips.push(statChip);
  for (const risk of filters.risks) chips.push({ label: statusLabels[risk], clear: () => toggleRisk(risk) });
  if (filters.query.trim()) chips.push({ label: `Arama: ${filters.query.trim()}`, clear: () => set('query', '') });
  if (filters.labs) chips.push({ label: `Tetkik: ${presenceLabel(filters.labs)}`, clear: () => set('labs', '') });
  if (filters.consults) chips.push({ label: `Konsültasyon: ${presenceLabel(filters.consults)}`, clear: () => set('consults', '') });
  if (filters.physician) chips.push({ label: filters.physician, clear: () => set('physician', '') });
  if (filters.nurse) chips.push({ label: filters.nurse, clear: () => set('nurse', '') });
  if (filters.stay) chips.push({ label: `Acilde en az ${Number(filters.stay) / 60} saat`, clear: () => set('stay', '') });
  if (filters.oldVitals) chips.push({ label: 'Son vital en az 30 dk önce', clear: () => set('oldVitals', false) });
  if (filters.sort !== 'risk') chips.push({ label: 'Risk sırası kapalı', clear: () => set('sort', 'risk') });

  return <div className="patient-filter">
    <div className="filter-toolbar">
      <label className="filter-search" title="Ad, soyad veya protokol numarası ile ara">
        <Search size={18} aria-hidden="true" />
        <input type="search" data-testid="patient-search" placeholder="Ad, soyad veya protokol"
          aria-label="Hasta ara" value={filters.query} onChange={event => set('query', event.target.value)} />
      </label>
      <button type="button" className="filter-toggle" data-testid="filter-toggle" aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={18} aria-hidden="true" /> Filtreler</button>
      <ListModeButtons mode={mode} onMode={onMode} />
    </div>
    {chips.length > 0 && <div className="filter-active" aria-label="Etkin filtreler">
      {chips.map(({ label, clear }, i) => <button type="button" className="filter-chip" key={`${i}:${label}`}
        onClick={clear} aria-label={`${label} — kaldır`}>{label}<X size={16} aria-hidden="true" /></button>)}
      <button type="button" data-testid="filters-clear" onClick={onClear}>Filtreleri temizle</button>
    </div>}
    {expanded && <div className="filter-options">
      <fieldset><legend>Klinik risk</legend><div className="filter-risks">
        {riskChoices.map(risk => <button type="button" key={risk} aria-pressed={filters.risks.includes(risk)}
          data-testid={`filter-risk-${risk}`} onClick={() => toggleRisk(risk)}>{statusLabels[risk]}</button>)}
      </div></fieldset>
      <div className="filter-fields">
        <label>Sıralama<select data-testid="patient-sort" value={filters.sort} onChange={e => set('sort', e.target.value as Sort)}>
          {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {(['labs', 'consults'] as const).map(key => <label key={key}>{key === 'labs' ? 'Bekleyen tetkik' : 'Bekleyen konsültasyon'}
          <select value={filters[key]} onChange={event => set(key, event.target.value as Presence)}>
            <option value="">Tümü</option><option value="yes">Var</option><option value="no">Yok</option>
          </select></label>)}
        {(['physician', 'nurse'] as const).map(key => <label key={key}>{key === 'physician' ? 'Sorumlu hekim' : 'Sorumlu hemşire'}
          <select value={filters[key]} onChange={event => set(key, event.target.value)}>
            <option value="">Tümü</option>{names(allPatients, key).map(name => <option key={name}>{name}</option>)}
          </select></label>)}
        <label>Acilde kalış süresi<select value={filters.stay} onChange={e => set('stay', e.target.value as Filters['stay'])}>
          <option value="">Tümü</option><option value="120">En az 2 saat</option><option value="240">En az 4 saat</option>
        </select></label>
        <label className="filter-check"><input type="checkbox" checked={filters.oldVitals}
          onChange={e => set('oldVitals', e.target.checked)} />Son vital en az 30 dk önce</label>
      </div>
    </div>}
  </div>;
}
