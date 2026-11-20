import { t } from '../../i18n';
import { measurement } from '../clinical';

/** Alarm copy. Getters and functions read the active language on each access; nothing is translated at import. */
export const NOTE_MAX = 280;

export const copy = {
  get previousFindings() { return t('alarm.previousFindings'); },
  previousFindingsMore: (list: string, more: number) => t('alarm.previousFindingsMore', { list, more }),
  currentScore: (score: number) => t('alarm.currentScore', { score }),
  live: {
    get newAlarm() { return (beds: string) => t('alarm.live.newAlarm', { beds }); },
  },
  panel: {
    get heading() { return t('alarm.panel.heading'); },
    get headline() { return t('alarm.panel.headline'); },
    get patientLine() {
      return (bed: string, label: string, age: number) => t('alarm.panel.patientLine', { bed, label, age });
    },
    get newBadge() { return t('alarm.panel.newBadge'); },
    get worsenedBadge() { return t('alarm.panel.worsenedBadge'); },
    get view() { return t('alarm.view'); },
    get seen() { return t('alarm.panel.seen'); },
    get seenAt() { return (time: string, role: string) => t('alarm.panel.seenAt', { time, role }); },
    get evaluate() { return t('alarm.panel.evaluate'); },
    get findings() {
      return (list: string, more: number) => (more > 0
        ? t('alarm.panel.findingsMore', { list, more })
        : t('alarm.panel.findings', { list }));
    },
    get priority() { return t('alarm.panel.priority'); },
    get labDiagnosis() { return (diagnosis: string) => t('alarm.panel.labDiagnosis', { diagnosis }); },
    get orderBlocked() { return (bed: string) => t('alarm.panel.orderBlocked', { bed }); },
    get nurseEvaluate() { return t('alarm.lock.physician'); },
    get offline() { return t('alarm.panel.offline'); },
    get criticalIcon() { return t('alarm.panel.criticalIcon'); },
  },
  strip: {
    get label() { return t('alarm.strip.label'); },
    count: (count: number) => (count === 1
      ? t('alarm.strip.countOne', { count })
      : t('alarm.strip.countOther', { count })),
    viewAria: (bed: string) => t('alarm.strip.viewAria', { bed }),
  },
  sheet: {
    get heading() { return t('alarm.sheet.heading'); },
    get evidence() { return t('alarm.sheet.evidence'); },
    get note() { return t('alarm.sheet.note'); },
    noteCount: (count: number, max: number) => `${count} / ${max}`,
    get decision() { return t('alarm.sheet.decision'); },
    get close() { return t('alarm.sheet.close'); },
    get reasonGroup() { return t('reason.choose'); },
    get back() { return t('alarm.sheet.back'); },
  },
  tasks: {
    get heading() { return t('alarm.tasks.heading'); },
    get empty() { return t('alarm.tasks.empty'); },
    title: (level: string) => t(`alarm.tasks.title.${level}`, undefined, level),
    roleDisabled: (role: string) => (role === 'physician' ? t('alarm.lock.physician') : t('alarm.lock.nurse')),
    get vitals() { return t('alarm.tasks.vitals'); },
    discharge: (duration: string) => t('alarm.tasks.discharge', { duration }),
    get vitalsRulesUnavailable() { return t('alarm.tasks.vitalsRulesUnavailable'); },
  },
  history: {
    get heading() { return t('alarm.history.heading'); },
    get empty() { return t('alarm.history.empty'); },
    created: (time: string) => t('alarm.history.created', { time }),
    seenBy: (role: string, time: string, latency: string) => t('alarm.history.seenBy', { role, time, latency }),
    decided: (time: string, action: string, reason: string | null) => (reason
      ? t('alarm.history.decidedReason', { time, action, reason })
      : t('alarm.history.decided', { time, action })),
    decisionLatency: (latency: string) => t('alarm.history.decisionLatency', { latency }),
    get pending() { return t('alarm.history.pending'); },
    note: (note: string) => t('alarm.history.note', { note }),
    get view() { return t('alarm.view'); },
  },
  vitals: {
    get heading() { return t('vitals.title'); },
    get hint() { return t('vitals.hint'); },
    get fields(): Record<string, string> {
      return {
        hr: t('vitals.hr'),
        sbp: t('vitals.sbp'),
        dbp: t('vitals.dbp'),
        map: t('vitals.map'),
        temp: t('vitals.temp'),
        spo2: t('vitals.spo2'),
        rr: t('vitals.rr'),
        gcs: t('alarm.vitals.gcs'),
      };
    },
    get required() { return t('alarm.vitals.required'); },
    get optional() { return t('alarm.vitals.optional'); },
    get requiredError() { return t('vitals.fieldRequired'); },
    get invalid() { return t('vitals.invalid'); },
    get integer() { return t('alarm.vitals.integer'); },
    /** Server rule bounds: measurement() localizes the decimal separator for the active language. */
    range: (min: number, max: number) => t('vitals.fieldRange', {
      min: measurement(min, 'lab'),
      max: measurement(max, 'lab'),
    }),
    get sbpAboveDbp() { return t('vitals.error.sbp_not_above_dbp'); },
    get mapBetween() { return t('vitals.error.map_outside_bp'); },
    get save() { return t('vitals.save'); },
    get cancel() { return t('alarm.vitals.cancel'); },
  },
  action: (code: string) => t(`action.${code}`, undefined, code),
  reason: (code: string) => t(`reason.${code}`, undefined, code),
  status: (code: string) => t(`alarm.status.${code}`, undefined, code),
};
