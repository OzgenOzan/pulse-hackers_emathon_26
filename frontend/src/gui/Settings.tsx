import type { ConfigMutationResult } from '../api';
import { ListModeButtons, type ListMode } from '../components/ui/FilterBar';
import { englishAvailable, t } from '../i18n';
import type { Language, Role, RulesView } from '../types';
import { roleLabels } from './clinical';
import { RulesEditor } from './RulesEditor';
import type { Theme } from './usePreferences';

export function Settings({
  config, defaults, replayId, rulesCustom, openCriticalCount, onApplyRules, onResetRules,
  theme, onTheme, mode, onMode, role, onRole, language, onLanguage, onAbout, busy,
}: {
  config: RulesView | null; theme: Theme; onTheme: (theme: Theme) => void;
  mode: ListMode; onMode: (mode: ListMode) => void; role: Role; onRole: (role: Role) => void;
  language: Language; onLanguage: (language: Language) => void;
  onAbout: () => void; busy: boolean;
  defaults: RulesView | null; replayId?: string; rulesCustom: boolean; openCriticalCount: number;
  onApplyRules: (config: RulesView, replayId: string) => Promise<ConfigMutationResult>;
  onResetRules: (replayId: string) => Promise<ConfigMutationResult>;
}) {
  const editable = role === 'physician';
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
      <summary>{t(editable ? 'gui.rules.title' : 'gui.rules.titleReadonly')}</summary>
      <p>{t('gui.rules.limitations')}</p>
      {!editable && <p>{t('gui.error.physician_role_required')}</p>}
      {config && defaults && replayId
        ? <RulesEditor key={`${role}/${replayId}`} config={config} defaults={defaults} replayId={replayId} language={language}
            editable={editable} busy={busy} rulesCustom={rulesCustom} openCriticalCount={openCriticalCount}
            onApplyRules={onApplyRules} onResetRules={onResetRules} />
        : <p role="status">{t('gui.rules.loading')}</p>}
    </details>
  </div>;
}
