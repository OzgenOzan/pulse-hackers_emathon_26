import { ListModeButtons, type ListMode } from '../components/ui/FilterBar';
import type { Role, RulesView } from '../types';
import { copy } from './alarms/copy';
import { labDisplayLabel, measurement, roleLabels, stayLabel } from './clinical';
import type { Theme } from './usePreferences';

export function Settings({ config, theme, onTheme, mode, onMode, role, onRole, onAbout, busy }: {
  config: RulesView | null; theme: Theme; onTheme: (theme: Theme) => void;
  mode: ListMode; onMode: (mode: ListMode) => void; role: Role; onRole: (role: Role) => void;
  onAbout: () => void; busy: boolean;
}) {
  return <div className="gui-settings">
    <section>
      <h3>Tercihler</h3>
      <div className="settings-options">
        <div className="settings-choice" role="group" aria-label="Görünüm teması">
          <span>Tema</span>
          {([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']] as const).map(([value, label]) => <button
            type="button" key={value} data-testid={`theme-${value}`} aria-pressed={theme === value} onClick={() => onTheme(value)}>{label}</button>)}
        </div>
        <div className="settings-choice"><span>Liste görünümü</span><ListModeButtons mode={mode} onMode={onMode} /></div>
        <div className="settings-choice" role="group" aria-label="Demo rolü">
          <span>Demo rolü</span>{(['physician', 'nurse'] as const).map(value => <button type="button" disabled={busy} key={value}
            aria-pressed={role === value} onClick={() => onRole(value)}>{roleLabels[value]}</button>)}
        </div>
        <p>Dil: Türkçe</p>
        <button type="button" onClick={onAbout}>Bu prototip hakkında</button>
      </div>
    </section>
    <details className="settings-rules">
      <summary>Klinik kurallar · Salt okunur</summary>
      <p>Simülasyon kurallarıdır; klinik kullanım önerisi değildir. Klinik ekip onayı gerekir.</p>
      {config ? <ClinicalRules config={config} /> : <p role="status">Klinik kurallar yükleniyor…</p>}
    </details>
  </div>;
}

function ClinicalRules({ config }: { config: RulesView }) {
  const field = (key: string) => copy.vitals.fields[key] ?? key;
  const measure = (value: number, param = '') => measurement(value, param === 'temp' ? 'temp' : 'lab');
  return <>
    <dl className="settings-definitions">
      <dt>Değerlendirme aralığı</dt><dd>{stayLabel(config.cycle_minutes)}</dd>
      <dt>Kritik puan eşiği</dt><dd>{config.red.threshold}</dd>
      <dt>Yakın Takip puan eşiği</dt><dd>{config.status.watch_min_score}</dd>
      <dt>Durum için gerekli güncel ölçümler</dt><dd>{config.status.required_fresh_vitals.map(field).join(', ')}</dd>
      <dt>Vital geçerlilik süresi</dt><dd>{stayLabel(config.red.vital_max_age_minutes)}</dd>
      <dt>GKS geçerlilik süresi</dt><dd>{stayLabel(config.display.gcs_fresh_minutes)}</dd>
      <dt>Monitör veri boşluğu</dt><dd>{stayLabel(config.yellow.monitor_gap_minutes)}</dd>
      <dt>Vital gecikmesi ve öncelik artışı</dt><dd>{stayLabel(config.yellow.vitals_overdue_minutes)} / {stayLabel(config.yellow.vitals_overdue_escalate_minutes)}</dd>
      <dt>Sonuçtan sonra taburculuk değerlendirmesi</dt><dd>{stayLabel(config.green.idle_after_results_minutes)}</dd>
      <dt>Kritik alarmda hasta geçiş kilidi</dt><dd>{config.alerting.red_blocks_navigation ? 'Açık' : 'Kapalı'}</dd>
      <dt>Alarm bekleme aralığı / tekrar için puan artışı</dt><dd>{stayLabel(config.alerting.ack_cooldown_minutes)} / {config.alerting.realert_score_increase}</dd>
    </dl>
    <h4>Vital puanlama</h4>
    <ul>{config.red.vital_rules.filter(rule => rule.enabled).map(rule => <li key={rule.key}>
      {field(rule.param)} {rule.op} {measure(rule.value, rule.param)} · {rule.points} puan
    </li>)}{config.red.trend_rules.map(rule => <li key={rule.key}>
      {field(rule.param)} · Bazale göre {measure(rule.delta, rule.param)} {rule.direction === 'up' ? 'artış' : 'düşüş'} · {rule.points} puan
    </li>)}</ul>
    <h4>Tetkik eşikleri</h4>
    <p>Kritik ve ilgili sonuç: {config.red.critical_lab_points} puan</p>
    <ul>{Object.entries(config.labs).map(([key, lab]) => <li key={key}>
      {labDisplayLabel(lab.label)} {lab.unit} · Referans {range(lab.ref_low, lab.ref_high)} · Kritik {range(lab.critical_low, lab.critical_high, true)}
    </li>)}</ul>
    <h4>Manuel giriş sınırları</h4>
    <ul>{Object.entries(config.manual_entry.limits).map(([key, bound]) => <li key={key}>{field(key)} · {range(bound.min, bound.max)}</li>)}</ul>
  </>;
}

function range(min: number | null, max: number | null, critical = false) {
  const values = [min === null ? null : `${critical ? '≤ ' : ''}${measurement(min, 'lab')}`,
    max === null ? null : `${critical ? '≥ ' : ''}${measurement(max, 'lab')}`].filter(Boolean);
  if (!critical && values.length === 1) return min === null ? `≤ ${values[0]}` : `≥ ${values[0]}`;
  return values.join(critical ? ' / ' : '–');
}
