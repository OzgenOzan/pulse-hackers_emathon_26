# Şahin Göz jury demo

## 30-second clinician story

> At 02:45, one physician is watching more than ten people who entered the yellow zone stable. One is still waiting after all results came back. Another has lost a monitor feed. A third is deteriorating a little at a time, before any single blood-pressure number looks critical. Şahin Göz puts each issue in front of the right person, shows the evidence, and records what that person decides. Everything you see about the patients and hospital system is simulated.

## Eight-minute talk

| Time | Show |
|---|---|
| 0:00–1:30 | The night shift story, the crowded emergency department, and one question: can a clinician catch deterioration and idle waiting without drowning in alerts? |
| 1:30–5:00 | Run the hero path below with English narration. Distinguish measured risk, a data-gap task, and a discharge-evaluation task. A seen alarm is not a clinical decision. |
| 5:00–6:30 | Continue to the Bed 08 (Yatak 08) limitation. Explain why a chronically low baseline still triggers a critical alarm and how to record the reason. |
| 6:30–8:00 | Reset and step twice. On Bed 05 (Yatak 05) show the filtered lactate and open the honesty panel. Bed 01 (Yatak 01) shows **Close Watch** (**Yakın Takip**) at 03:00, **Critical** (**Kritik**) at 03:30, and crosses the isolated MAP (OAB) cutoff at 04:00. These simulated times demonstrate the rules, not real-world performance. |

## Hero path and 60-second backup

Run `make demo`, use a 1280×720 or larger desktop viewport, and leave the clock paused. Narrate in English. The UI opens in English; for Turkish, choose **Settings → Language → Turkish** (**Ayarlar → Dil → Türkçe**). The backup recording and screenshots show the Turkish UI. Keep a local copy of the [60-second backup recording](demo-backup.mp4) on two devices.

| Seconds | Click and verify |
|---|---|
| 0–7 | **Physician → Reset** (**Hekim → Sıfırla**). Point out **SIMULATED DATA** (**SİMÜLE VERİ**), 02:45, and 11 **Stable** (**Stabil**) patients. |
| 7–19 | **+15 min** (**+15 dk**). Bed 01 (Yatak 01) is **Close Watch** (**Yakın Takip**) before any critical alarm. Open Bed 06 (Yatak 06; results ready for 35 min), then choose **Discharge decision made** (**Taburculuk kararı verildi**). |
| 19–32 | **+15 min → Nurse** (**+15 dk → Hemşire**). Open Bed 03 (Yatak 03) and choose **Monitor reconnected** (**Monitör yeniden bağlandı**). The task clears; the patient stays **Unclassified** (**Sınıflandırılmamış**) until new readings arrive. |
| 32–49 | **Physician → +15 min** (**Hekim → +15 dk**). The Bed 01 (Yatak 01) alarm cites tachycardia (108/min), fever (38.4 °C), and a MAP (OAB) drop of 18 mmHg. Try another bed to show the lock. Press **Mark alarm seen** (**Alarmı gördüm**) and verify the alarm and lock both remain. |
| 49–60 | **Create clinical assessment record → Move to red zone** (**Klinik değerlendirme kaydı oluştur → Kırmızı alana al**). Open **Clinical Alarms** (**Klinik Alarmlar**) to show the seen and clinical evaluation records. |

Jurors can open the [public demo page](https://ozgenozan.github.io/pulse-hackers_emathon_26/) on their own devices to watch the backup and view screenshots.

**Optional limitation rehearsal:** From the hero end at 03:30, press **+15 min** (**+15 dk**) twice. At 04:00 choose **Create clinical assessment record → Reassessing** (**Klinik değerlendirme kaydı oluştur → Yeniden değerlendiriyorum**) for Bed 02 (Yatak 02). Step once more: at 04:15 Bed 08 (Yatak 08) has MAP (OAB) 64 from a chronically low baseline and still gets a critical alarm. Choose **Expected for this patient → Chronic baseline** (**Bu hasta için beklenen → Kronik bazal değer**) and show the recorded reason. This is a scripted limitation, not clinical advice.

**Suggested pilot endpoints, not outcomes:** time from ready results to discharge decisions, stretcher occupancy, cardiac arrests, in-ED mortality, and white-code calls. A real pilot needs local integration, governance, clinical sign-off, and a comparison design. Do not claim any of these have improved.

## Optional Q&A: what-if rules

Outside the eight-minute flow, choose **Settings → Clinical rules** (**Ayarlar → Klinik kurallar**), set **Critical score threshold** (**Kritik puan eşiği**) to **2**, then choose **Apply and restart the shift at 02:45** (**Uygula ve vardiyayı 02:45'ten başlat**) and confirm. Press **+15 min** (**+15 dk**) twice: Bed 01 (Yatak 01) becomes **Critical** (**Kritik**) at 03:15 instead of 03:30. Say: “An earlier alarm here; a lower threshold can also mean more alarms. This is a simulation what-if, not a recommendation.” Choose **Restore default rules** (**Varsayılan kurallara dön**) and confirm before the next rehearsal; verify that **CUSTOM RULE SET** (**ÖZEL KURAL SETİ**) disappears.
