# Şahin Göz v0 status

## Done

- Reviewed the approved draft and three source PDFs; recorded the [12-task build plan](superpowers/plans/2026-11-19-sahin-goz-v0.md).
- Added the validated YAML loader and typed Python/TypeScript wire contract. The loader passed five tests covering the default and rejected config variants.

## Real vs simulated

- Implemented code is intended to evaluate rules, reconcile alerts, apply acknowledgements and log audit events end to end.
- The HBYS, monitor and lab feeds, clock, patient identities and four diagnosis-group mappings are all simulated. This is not for real clinical use.

## Assumptions

- The tracked initial prompt already lives at the repository root; it is not copied or moved. The original team PDFs remain unchanged.
- No fixture-only endpoints will be presented as live behavior. The browser will exercise the real API and engine as soon as the scenario and scoring tracks land.
- Simulated times are local to the scenario. Actual wall timestamps are UTC; identical replay audit checks inject a fixed wall clock, and real-session comparisons exclude wall timestamps only.
- Lab cutoffs are inclusive; reference limits are normal at equality. Unrecognized units are not scored. Result times and physician actions in the same simulated minute count the action as having addressed the result. Repeated tests are separate orders paired oldest pending first.
- URL fragment preserves navigation through refresh; patients, results, and acknowledgement state remain on the server. No real integration or outbound runtime calls.

## CLINICAL-REVIEW items

- Verify the vital weights/thresholds, baseline and trend approach, stale vitals window, diagnosis relevance groups, assay-specific reference and critical cutoffs, and universal panic bypass before making any demonstration claim about clinical performance.
- Review RED acknowledgement salience and navigation lock, cooldown and score-based re-alerts, role routing, and the distinction between results-ready and discharge-ready.
- Review inclusive critical cutoff interpretation, same-minute action semantics, and the Y08 chronic-baseline limitation. A clinician must always decide whether to reassess, intervene, transfer, or discharge.

## Known issues

- The prototype is in initial development; no clinical validation is claimed.

## Next steps

- Implement the independent engine, night-shift playback, and HBYS tracks, then integrate and verify P0.
