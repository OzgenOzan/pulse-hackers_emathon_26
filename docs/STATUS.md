# Şahin Göz v0 status

## Done

- Reviewed the approved draft and three source PDFs; recorded the [12-task build plan](superpowers/plans/2026-11-19-sahin-goz-v0.md).
- Added the validated YAML loader and typed Python/TypeScript wire contract. The loader passed five tests covering the default and rejected config variants.
- Implemented pure alert transitions; six tests passed for latching, supersession, updates, cooldown, escalation and priority.
- Wrote the 12-profile, 120-event synthetic night shift. `scripts/generate_noise.py --check` reproduced the six noise patients' readings.
- Implemented deterministic clock and validated scenario playback. The clinical rule table renders from the active YAML config.
- `make test` passed: 74 backend tests, TypeScript type check, and Vite build. `make setup` also succeeded in a clean clone.
- `make demo` served the client and the API from one Uvicorn process. At 1280×720 in Edge, the GREEN discharge, YELLOW reconnect, and RED transfer ran through; the RED blocked another patient and survived reload. Final-state and audit assertions passed.

## Real vs simulated

- The application evaluates weighted rules, reconciles alerts, applies operator-selected changes to simulated patients, and records audit entries.
- The HBYS, monitor and lab feeds, clock, patient identities and four diagnosis-group mappings are all simulated. This is not for real clinical use.

## Assumptions

- The tracked initial prompt already lives at the repository root; it is not copied or moved. The original team PDFs remain unchanged.
- No fixture-only endpoints: the browser uses the real local API, engine, and scenario player.
- Simulated times are local to the scenario. Actual wall timestamps are UTC; identical replay audit checks inject a fixed wall clock, and real-session comparisons exclude wall timestamps only.
- Lab cutoffs are inclusive; reference limits are normal at equality. Unrecognized units are not scored. Result times and physician actions in the same simulated minute count the action as having addressed the result. Repeated tests are separate orders paired oldest pending first.
- Y06 and other profiles without specified arrival times use explicit synthetic times; Y06 arrives at 01:55, before the 02:00 lab orders.
- URL fragment preserves navigation through refresh; patients, results, and acknowledgement state remain on the server. No real integration or outbound runtime calls.
- The role switch controls demo views, not authentication or authorization. `wait_justified` is recorded as a physician action; its explicit 30-minute snooze is the exception to clearing GREEN indefinitely after an action.
- Monitor reconnection takes effect at the next cycle. Opening manual entry does not dismiss YELLOW; the nurse must submit a reading.

## CLINICAL-REVIEW items

- Verify the vital weights/thresholds, baseline and trend approach, stale vitals window, diagnosis relevance groups, assay-specific reference and critical cutoffs, and universal panic bypass before making any demonstration claim about clinical performance.
- Review RED acknowledgement salience and navigation lock, cooldown and score-based re-alerts, role routing, and the distinction between results-ready and discharge-ready.
- Review inclusive critical cutoff interpretation, same-minute action semantics, and the Y08 chronic-baseline limitation. A clinician must always decide whether to reassess, intervene, transfer, or discharge.

## Known issues

- Not clinically validated. The test runner reports one dependency deprecation warning from Starlette's AnyIO blocking-portal alias.

## Next steps

- Finish the bilingual explanations and transparency panel, then rehearse the demo twice and publish the evidence.
