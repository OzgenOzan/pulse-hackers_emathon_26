# Şahin Göz jury demo

## 30-second clinician story

> At 02:45, one physician is watching more than ten people who entered the yellow zone stable. One is still waiting after all results came back. Another has lost a monitor feed. A third is deteriorating a little at a time, before any single blood-pressure number looks critical. Şahin Göz puts each issue in front of the right person, shows the evidence, and records what that person decides. Everything you see about the patients and hospital system is simulated.

## Eight-minute talk

| Time | Show |
|---|---|
| 0:00–1:30 | The night shift story, the crowded emergency department, and one question: can a clinician catch deterioration and idle waiting without drowning in alerts? |
| 1:30–5:00 | Run the Turkish hero path below with English narration. Distinguish measured risk, a data-gap task, and a discharge-evaluation task. A seen alarm is not a clinical decision. |
| 5:00–6:30 | Continue to the Yatak 08 limitation. Explain why a chronically low baseline still triggers a critical alarm and how to record the reason. |
| 6:30–8:00 | Reset and step twice. On Yatak 05 show the filtered lactate and open the honesty panel. Yatak 01 shows **Yakın Takip** at 03:00, **Kritik** at 03:30, and crosses the isolated OAB cutoff at 04:00. These simulated times demonstrate the rules, not real-world performance. |

## Hero path and 60-second backup

Run `make demo`, use a 1280×720 or larger desktop viewport, and leave the clock paused. Narrate in English; the controls below are in Turkish. Keep a local copy of the [60-second backup recording](demo-backup.mp4) on two devices.

| Seconds | Click and verify |
|---|---|
| 0–7 | **Hekim → Sıfırla**. Point out **SİMÜLE VERİ**, 02:45, and 11 stable patients. |
| 7–19 | **+15 dk**. Yatak 01 is **Yakın Takip** before any critical alarm. Open Yatak 06 (results ready for 35 min), then choose **Taburculuk kararı verildi**. |
| 19–32 | **+15 dk → Hemşire**. Open Yatak 03 and choose **Monitör yeniden bağlandı**. The task clears; the patient stays **Sınıflandırılmamış** until new readings arrive. |
| 32–49 | **Hekim → +15 dk**. The Yatak 01 alarm cites tachycardia (108/min), fever (38.4 °C), and an OAB drop of 18 mmHg. Try another bed to show the lock. Press **Alarmı gördüm** and verify the alarm and lock both remain. |
| 49–60 | **Klinik değerlendirme kaydı oluştur → Kırmızı alana al**. Open **Klinik Alarmlar** to show the seen and clinical evaluation records. |

**Optional limitation rehearsal:** From the hero end at 03:30, press **+15 dk** twice. At 04:00 choose **Klinik değerlendirme kaydı oluştur → Yeniden değerlendiriyorum** for Yatak 02. Step once more: at 04:15 Yatak 08 has OAB 64 from a chronically low baseline and still gets a critical alarm. Choose **Bu hasta için beklenen → Kronik bazal değer** and show the recorded reason. This is a scripted limitation, not clinical advice.

**Suggested pilot endpoints, not outcomes:** time from ready results to discharge decisions, stretcher occupancy, cardiac arrests, in-ED mortality, and white-code calls. A real pilot needs local integration, governance, clinical sign-off, and a comparison design. Do not claim any of these have improved.

## Optional Q&A: what-if rules

Outside the eight-minute flow, choose **Ayarlar → Klinik kurallar**, set **Kritik puan eşiği** to **2**, then choose **Uygula ve vardiyayı 02:45'ten başlat** and confirm. Press **+15 dk** twice: Yatak 01 becomes **Kritik** at 03:15 instead of 03:30. Say: “An earlier alarm here; a lower threshold can also mean more alarms. This is a simulation what-if, not a recommendation.” Choose **Varsayılan kurallara dön** and confirm before the next rehearsal; verify that **ÖZEL KURAL SETİ** disappears.
