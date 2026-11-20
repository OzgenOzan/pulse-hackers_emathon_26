import { ListModeButtons, type ListMode } from '../components/ui/FilterBar';
import { englishAvailable, t } from '../i18n';
import type { Language, Role, RulesView } from '../types';
import { copy } from './alarms/copy';
import { labDisplayLabel, measurement, roleLabels, stayLabel } from './clinical';
import type { Theme } from './usePreferences';

export function Settings({ config, theme, onTheme, mode, onMode, role, onRole, language, onLanguage, onAbout, busy }: {
  config: RulesView | null; theme: Theme; onTheme: (theme: Theme) => void;
  mode: ListMode; onMode: (mode: ListMode) => void; role: Role; onRole: (role: Role) => void;
  language: Language; onLanguage: (language: Language) => void;
  onAbout: () => void; busy: boolean;
}) {
  return <div className="gui-settings">
    <section>
      <h3>{t('gui.settings.preferences')}</h3>
      <div className="settings-options">
        <div className="settings-choice" role="group" aria-label={t('gui.settings.theme')}>
          <span>{t('gui.settings.theme')}</span>
          {(['system', 'light', 'dark'] as const).map(value => <button type="button" key={value}
            data-testid={`theme-${value}`} aria-pressed={theme === value} onClick={() => onTheme(value)}>
            {t(`gui.theme.${value}`)}
          </button>)}
        </div>
        <div className="settings-choice"><span>{t('gui.settings.listMode')}</span><ListModeButtons mode={mode} onMode={onMode} /></div>
        <div className="settings-choice" role="group" aria-label={t('app.role.demo')}>
          <span>{t('app.role.demo')}</span>{(['physician', 'nurse'] as const).map(value => <button type="button" disabled={busy} key={value}
            aria-pressed={role === value} onClick={() => onRole(value)}>{roleLabels[value]}</button>)}
        </div>
        {englishAvailable
          ? <div className="settings-choice" role="group" aria-label={t('app.language')}>
              <span>{t('app.language')}</span>
              {(['tr', 'en'] as const).map(value => <button type="button" key={value}
                data-testid={`language-${value}`} aria-pressed={language === value} onClick={() => onLanguage(value)}>
                {t(`gui.language.${value}`)}
              </button>)}
            </div>
          : <p>{t('app.language')}: {t('gui.language.tr')}</p>}
        <button type="button" onClick={onAbout}>{t('about.title')}</button>
      </div>
    </section>
    <details className="settings-rules">
      <summary>{t('gui.rules.title')}</summary>
      <p>{t('gui.rules.limitations')}</p>
      {config ? <ClinicalRules config={config} /> : <p role="status">{t('gui.rules.loading')}</p>}
    </details>
  </div>;
}

function ClinicalRules({ config }: { config: RulesView }) {
  const field = (key: string) => copy.vitals.fields[key] ?? key;
  const measure = (value: number, param = '') => measurement(value, param === 'temp' ? 'temp' : 'lab');
  return <>
    <dl className="settings-definitions">
      <dt>{t('gui.rules.cycle')}</dt><dd>{stayLabel(config.cycle_minutes)}</dd>
      <dt>{t('gui.rules.critical')}</dt><dd>{config.red.threshold}</dd>
      <dt>{t('gui.rules.watch')}</dt><dd>{config.status.watch_min_score}</dd>
      <dt>{t('gui.rules.required')}</dt><dd>{config.status.required_fresh_vitals.map(field).join(', ')}</dd>
      <dt>{t('gui.rules.vitalAge')}</dt><dd>{stayLabel(config.red.vital_max_age_minutes)}</dd>
      <dt>{t('gui.rules.gcsAge')}</dt><dd>{stayLabel(config.display.gcs_fresh_minutes)}</dd>
      <dt>{t('gui.rules.monitorGap')}</dt><dd>{stayLabel(config.yellow.monitor_gap_minutes)}</dd>
      <dt>{t('gui.rules.overdue')}</dt><dd>{stayLabel(config.yellow.vitals_overdue_minutes)} / {stayLabel(config.yellow.vitals_overdue_escalate_minutes)}</dd>
      <dt>{t('gui.rules.discharge')}</dt><dd>{stayLabel(config.green.idle_after_results_minutes)}</dd>
      <dt>{t('gui.rules.lock')}</dt><dd>{t(config.alerting.red_blocks_navigation ? 'gui.rules.on' : 'gui.rules.off')}</dd>
      <dt>{t('gui.rules.cooldown')}</dt><dd>{stayLabel(config.alerting.ack_cooldown_minutes)} / {config.alerting.realert_score_increase}</dd>
    </dl>
    <h4>{t('gui.rules.vitalScoring')}</h4>
    <ul>{config.red.vital_rules.filter(rule => rule.enabled).map(rule => <li key={rule.key}>
      {field(rule.param)} {rule.op} {measure(rule.value, rule.param)} · {t('gui.rules.points', { points: rule.points })}
    </li>)}{config.red.trend_rules.map(rule => <li key={rule.key}>
      {field(rule.param)} · {t(`gui.rules.trend.${rule.direction}`, { delta: measure(rule.delta, rule.param) })}
      {' · '}{t('gui.rules.points', { points: rule.points })}
    </li>)}</ul>
    <h4>{t('gui.rules.labs')}</h4>
    <p>{t('gui.rules.scoredLab', { points: config.red.critical_lab_points })}</p>
    <ul>{Object.entries(config.labs).map(([key, lab]) => <li key={key}>
      {labDisplayLabel(lab.label)} {lab.unit} · {t('gui.rules.reference', { range: range(lab.ref_low, lab.ref_high) })}
      {' · '}{t('gui.rules.criticalRange', { range: range(lab.critical_low, lab.critical_high, true) })}
    </li>)}</ul>
    <h4>{t('gui.rules.manual')}</h4>
    <ul>{Object.entries(config.manual_entry.limits).map(([key, bound]) => <li key={key}>{field(key)} · {range(bound.min, bound.max)}</li>)}</ul>
  </>;
}

function range(min: number | null, max: number | null, critical = false) {
  const values = [min === null ? null : `${critical ? '≤ ' : ''}${measurement(min, 'lab')}`,
    max === null ? null : `${critical ? '≥ ' : ''}${measurement(max, 'lab')}`].filter(Boolean);
  if (!critical && values.length === 1) return min === null ? `≤ ${values[0]}` : `≥ ${values[0]}`;
  return values.join(critical ? ' / ' : '–');
}
