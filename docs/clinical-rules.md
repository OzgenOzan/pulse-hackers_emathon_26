# Clinical rules (generated)

Generated from `backend/app/engine/config.yaml` by `scripts/export_rules.py`. Do not edit by hand.

## Red

- Threshold: 3 points
- Vital data maximum age: 30 minutes
- Critical lab points: 3

### Vital rules

| Key | Parameter | Rule | Points | Enabled |
|---|---|---|---|---|
| `map_low` | map | <= 65.0 | 3 | yes |
| `hr_high` | hr | > 100.0 | 1 | yes |
| `temp_high` | temp | >= 38.0 | 1 | yes |
| `spo2_low` | spo2 | <= 90.0 | 2 | no |
| `rr_high` | rr | >= 25.0 | 1 | no |

### Trend rules (versus the first reading in the zone)

| Key | Parameter | Direction | Delta | Points |
|---|---|---|---|---|
| `map_drop` | map | down | 15.0 | 1 |
| `hr_rise` | hr | up | 20.0 | 1 |

## Labs

| Lab | Unit | Reference | Critical |
|---|---|---|---|
| troponin (hs-cTnT) | ng/L | below 14.0 | below 52.0 |
| lactate (Lactate) | mmol/L | below 2.0 | below 4.0 |
| ph (pH (blood gas)) | - | 7.35 to 7.45 | 7.2 to 7.6 |
| potassium (K+) | mmol/L | 3.5 to 5.1 | 2.5 to 6.0 |

## Diagnosis to lab relevance

| Group | ICD prefixes | Labs |
|---|---|---|
| `chest_pain_acs` | `R07`, `I20`, `I21`, `I24` | troponin |
| `infection_sepsis` | `A40`, `A41`, `N39.0`, `J18`, `R50`, `R65` | lactate |
| `dka_acidosis` | `E10.1`, `E11.1`, `E87.2` | ph, potassium |
| `renal_potassium` | `N17`, `N18`, `N19`, `E87.5`, `E87.6` | potassium, ph |

## Universal panic (bypasses the diagnosis filter)

- Enabled: yes
| Lab | Critical low | Critical high |
|---|---|---|
| potassium | 2.5 | 6.5 |
| ph | 7.1 | - |

## Yellow

- Monitor gap: 15 minutes
- Vitals overdue: 30 minutes
- Vitals overdue escalation: 60 minutes

## Green

- Idle after results: 30 minutes

## Alerting

- Acknowledgement cooldown: 30 minutes
- Re-alert on score increase of: 2
- Red blocks navigation: yes

## Review markers in config.yaml

- line 1: `# Şahin Göz engine config. PROTOTYPE DEFAULTS. Values marked CLINICAL-REVIEW`
- line 5: `threshold: 3                        # CLINICAL-REVIEW`
- line 6: `vital_max_age_minutes: 30           # CLINICAL-REVIEW (not in design report)`
- line 8: `- {key: map_low,   param: map,  op: "<=", value: 65,   points: 3}   # CLINICAL-REVIEW`
- line 9: `- {key: hr_high,   param: hr,   op: ">",  value: 100,  points: 1}   # CLINICAL-REVIEW`
- line 10: `- {key: temp_high, param: temp, op: ">=", value: 38.0, points: 1}   # CLINICAL-REVIEW`
- line 11: `- {key: spo2_low,  param: spo2, op: "<=", value: 90,   points: 2, enabled: false}  # candidate, not in design report`
- line 12: `- {key: rr_high,   param: rr,   op: ">=", value: 25,   points: 1, enabled: false}  # candidate, not in design report`
- line 13: `trend_rules:                        # vs the patient's first reading in the zone. CLINICAL-REVIEW (not in design report)`
- line 16: `critical_lab_points: 3              # CLINICAL-REVIEW`
- line 17: `labs:                                 # CLINICAL-REVIEW: cut-offs are assay- and lab-specific`
- line 22: `icd_lab_relevance:                    # only these diagnosis→lab pairs may raise a lab-driven RED. CLINICAL-REVIEW`
- line 27: `universal_panic:                      # bypasses the diagnosis filter. NOT in design report. CLINICAL-REVIEW`
- line 38: `ack_cooldown_minutes: 30            # CLINICAL-REVIEW (not in design report)`
- line 39: `realert_score_increase: 2           # CLINICAL-REVIEW (not in design report)`
