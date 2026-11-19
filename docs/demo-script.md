# Şahin Göz jury demo

## 30-second clinician story

> At 02:45, one physician is watching more than ten people who entered the yellow zone stable. One is still waiting after all results came back. Another has lost a monitor feed. A third is deteriorating a little at a time, before any single blood-pressure number looks critical. Şahin Göz puts each issue in front of the right person, shows the evidence, and records what that person decides. Everything you see about the patients and hospital system is simulated.

## Eight-minute talk

| Time | Show |
|---|---|
| 0:00–1:30 | The night shift story, the crowded emergency department, and one question: can a clinician catch deterioration and idle waiting without drowning in alerts? |
| 1:30–5:00 | Run the live hero path below. Explain that RED is weighted evidence, YELLOW is a data-quality check, and GREEN suggests a review, not discharge. Show the alert reason and the human acknowledgement. |
| 5:00–6:30 | Continue from the hero end to the Y08 limitation. Show why a chronic baseline still triggers RED and how the override is audited. |
| 6:30–8:00 | Reset and step twice. On S-05 show the filtered lactate, then open the honesty panel. Y01's weighted score flags it at 03:30; its MAP-only threshold is crossed at 04:00. The 30 simulated minutes demonstrate the rule, not real-world performance. Close with what a pilot would measure. |

## Hero path and 60-second backup

Run `make demo`, use a 1280×720 or larger desktop viewport, keep English selected and the clock paused. Record this path without narration if needed; keep the recording on two devices. Use only the real controls, not an edited playback.

| Seconds | Click and verify |
|---|---|
| 0–7 | **Physician → Reset**. Show **SIMULATED DATA** and the 02:45 clock. |
| 7–19 | **+15 min**. Open S-06 (GREEN, results ready 35 minutes). Click **Discharge decision made**; the simulated patient leaves the board. |
| 19–32 | **+15 min → Nurse**. Show the S-03 missing monitor readings. Click **Monitor reconnected**; its simulated feed returns on the next cycle. |
| 32–49 | **Physician → +15 min**. The RED for S-01 blocks navigation. Show HR 108, temperature 38.4, MAP 18 below baseline and current MAP 74; attempt to open another patient and show refusal. |
| 49–60 | Click **Move to red zone**. Open **Audit log** and briefly hold on the acknowledged transfer. |

**Optional limitation rehearsal:** From the hero end, step to 04:00 and choose **Reassessing** for S-02. Step to 04:15: S-08 has MAP 64 from a chronically low baseline and still raises RED. Choose **Expected for this patient → Chronic baseline** and show the physician override in the audit. This is a scripted limitation, not an instruction to override alerts in practice.

**Suggested pilot endpoints, not outcomes:** time from ready results to discharge decisions, stretcher occupancy, cardiac arrests, in-ED mortality, and white-code calls. A real pilot needs local integration, governance, clinical sign-off, and a comparison design. Do not claim any of these have improved.
