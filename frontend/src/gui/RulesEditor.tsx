import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ConfigMutationResult } from '../api';
import { t } from '../i18n';
import type { Language, RulesView } from '../types';
import { parseDecimal } from './decimal';
import { displayRuleValue, ruleGroups, sameRuleValue, writeRule, type RuleField, type RuleValue } from './ruleFields';
import './RulesEditor.css';

type Draft = Record<string, string | boolean>;
type Issues = Record<string, string[]>;
type Change = { field: RuleField; before: RuleValue; after: RuleValue };
type Confirmation = { replayId: string; changes: Change[] } & (
  { kind: 'apply'; config: RulesView } | { kind: 'reset' }
);

interface Props {
  config: RulesView;
  defaults: RulesView;
  replayId: string;
  language: Language;
  editable: boolean;
  busy: boolean;
  rulesCustom: boolean;
  openCriticalCount: number;
  onApplyRules: (config: RulesView, replayId: string) => Promise<ConfigMutationResult>;
  onResetRules: (replayId: string) => Promise<ConfigMutationResult>;
}

function draftValue(field: RuleField, raw: string | boolean | undefined): RuleValue | undefined {
  if (raw === undefined) return field.current;
  if (typeof raw === 'boolean') return raw;
  const value = parseDecimal(raw);
  return field.input === 'integer' && !Number.isInteger(value) ? undefined : value;
}

export function RulesEditor({ config, defaults, replayId, language, editable, busy, rulesCustom, openCriticalCount,
                              onApplyRules, onResetRules }: Props) {
  const baseId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [draft, setDraft] = useState<Draft>({});
  const [issues, setIssues] = useState<Issues>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Field labels are localized even when the wire config is unchanged.
  const groups = useMemo(() => ruleGroups(config, defaults), [config, defaults, language]);
  const panels = groups.map(group => ({ ...group, fields: group.fields.map(field => ({
    field,
    value: draftValue(field, draft[field.path]),
  })) }));
  const entries = panels.flatMap(group => group.fields);
  const dirty = entries.some(({ field, value }) => !sameRuleValue(value, field.current));
  const countChanges = entries.reduce((count, { field, value }) => count + Number(!sameRuleValue(value, field.baseline)), 0);
  const unmatched = Object.entries(issues).filter(([path]) => !entries.some(({ field }) => field.path === path));

  useEffect(() => {
    if (confirmation && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [confirmation]);

  function showIssues(next: Issues) {
    setIssues(next);
    const first = Object.keys(next)[0];
    if (first) window.requestAnimationFrame(() => document.getElementById(`${baseId}-${first}`)?.focus());
  }

  function update(path: string, value: string | boolean) {
    setDraft(previous => ({ ...previous, [path]: value }));
    setIssues(previous => {
      const remaining = Object.entries(previous).filter(([key]) =>
        key !== path && entries.some(({ field }) => field.path === key));
      return remaining.length === Object.keys(previous).length ? previous : Object.fromEntries(remaining);
    });
  }

  function previewApply() {
    const invalid: Issues = {};
    const changes: Change[] = [];
    for (const { field, value } of entries) {
      if (!field.input || sameRuleValue(value, field.current)) continue;
      if (value === undefined) {
        invalid[field.path] = [t(field.input === 'integer' ? 'gui.rules.invalidInteger' : 'gui.rules.invalidNumber')];
      } else {
        changes.push({ field, before: field.current, after: value });
      }
    }
    if (Object.keys(invalid).length) {
      showIssues(invalid);
      return;
    }
    if (!changes.length) return;
    const next = structuredClone(config);
    for (const { field, after } of changes) {
      if (typeof after === 'number' || typeof after === 'boolean') writeRule(next, field.path, after);
    }
    setIssues({});
    setConfirmation({ kind: 'apply', config: next, changes, replayId });
  }

  function previewReset() {
    const changes = entries.flatMap(({ field }) => sameRuleValue(field.current, field.baseline) ? []
      : [{ field, before: field.current, after: field.baseline }]);
    setIssues({});
    setConfirmation({ kind: 'reset', changes, replayId });
  }

  async function submit() {
    if (!confirmation || busy || submitting.current) return;
    submitting.current = true;
    try {
      const result = await (confirmation.kind === 'apply'
        ? onApplyRules(confirmation.config, confirmation.replayId) : onResetRules(confirmation.replayId));
      dialog.current?.close();
      if (result.ok) {
        setDraft({});
        return;
      }
      const inline: Issues = {};
      if (result.error?.message === 'rules_invalid') {
        for (const { loc, msg } of result.error.body?.errors ?? []) (inline[loc] ??= []).push(msg);
      } else if (result.error?.message === 'rule_not_editable') {
        for (const path of result.error.body?.paths ?? []) inline[path] = [t('gui.error.rule_not_editable')];
      }
      if (Object.keys(inline).length) showIssues(inline);
    } finally {
      submitting.current = false;
    }
  }

  return <div className="rules-editor" data-testid={editable ? 'rules-editor' : 'rules-readonly'}>
    {editable && <div className="rules-editor-actions">
      <strong>{t('gui.rules.changeCount', { count: countChanges })}</strong>
      <button type="button" className="gui-primary rules-primary" data-testid="rules-apply"
        disabled={busy || !dirty} onClick={previewApply}>{t('gui.rules.apply')}</button>
      <button type="button" data-testid="rules-reset" disabled={busy || !rulesCustom}
        onClick={previewReset}>{t('gui.rules.resetDefaults')}</button>
    </div>}
    {unmatched.length > 0 && <ul className="rule-issues" role="alert">
      {unmatched.flatMap(([path, messages]) => messages.map((message, index) =>
        <li key={`${path}-${index}`}>{path ? `${path}: ` : ''}{message}</li>))}
    </ul>}
    {panels.map(group => <section key={group.key} className="rules-group" aria-labelledby={`${baseId}-${group.key}`}>
      <h4 id={`${baseId}-${group.key}`}>{t(`gui.rules.group.${group.key}`)}
        <small>{t('gui.rules.changeCount', {
          count: group.fields.reduce((n, { field, value }) => n + Number(!sameRuleValue(value, field.baseline)), 0),
        })}</small>
      </h4>
      <div className="rules-grid">{group.fields.map(({ field, value }) => {
        const { path, label, baseline, current } = field;
        const input = editable ? field.input : undefined;
        const changed = !sameRuleValue(value, baseline);
        const id = `${baseId}-${path}`;
        const errors = issues[path];
        const accessibility = {
          id, 'data-testid': `rule-${path}`, 'aria-invalid': errors ? true : undefined,
          'aria-describedby': `${id}-default${errors ? ` ${id}-errors` : ''}`,
        };
        return <div className="rule-field" key={path}>
          {input === 'boolean' ? <label className="rule-switch">
            <input {...accessibility} type="checkbox" disabled={busy} checked={value === true}
              onChange={event => update(path, event.target.checked)} />{label}
          </label> : input ? <>
            <label htmlFor={id}>{label}</label>
            <input {...accessibility} type="text" inputMode={input === 'integer' ? 'numeric' : 'decimal'}
              disabled={busy} value={String(draft[path] ?? displayRuleValue(path, current))}
              onChange={event => update(path, event.target.value)} />
          </> : <><span>{label}</span><strong>{displayRuleValue(path, current)}</strong></>}
          <small id={`${id}-default`}>{t('gui.rules.default', { value: displayRuleValue(path, baseline) })}</small>
          {changed && <span className="rule-changed">{t('gui.rules.changed')}</span>}
          {errors && <ul id={`${id}-errors`} data-testid={`rule-errors-${path}`} className="rule-issues" role="alert">
            {errors.map((message, index) => <li key={index}>{message}</li>)}
          </ul>}
        </div>;
      })}</div>
    </section>)}
    {editable && <dialog ref={dialog} className="rules-confirmation" aria-labelledby={`${baseId}-confirm`}
      onClose={() => setConfirmation(null)} onCancel={event => { if (busy || submitting.current) event.preventDefault(); }}>
      {confirmation && <>
        <h3 id={`${baseId}-confirm`}>{t(confirmation.kind === 'apply' ? 'gui.rules.confirmApply' : 'gui.rules.confirmReset')}</h3>
        <p>{t('gui.rules.confirmRestart')}</p>
        {openCriticalCount > 0 && <p data-testid="rules-confirm-open"><strong>
          {t('gui.rules.confirmOpenCount', { count: openCriticalCount })}
        </strong></p>}
        <p>{t('gui.rules.confirmLifetime')}</p>
        <p>{t('gui.rules.confirmWhatIf')}</p>
        <ul className="rules-preview">
          {confirmation.changes.map(({ field, before, after }) => <li key={field.path}>
            {field.label}: <strong>{displayRuleValue(field.path, before)} → {displayRuleValue(field.path, after)}</strong>
          </li>)}
        </ul>
        <div className="rules-editor-actions">
          <button type="button" disabled={busy} autoFocus onClick={() => dialog.current?.close()}>{t('gui.rules.confirmCancel')}</button>
          <button type="button" className="gui-primary rules-primary" data-testid="rules-confirm"
            disabled={busy} onClick={() => void submit()}>{t('gui.rules.confirmAccept')}</button>
        </div>
      </>}
    </dialog>}
  </div>;
}
