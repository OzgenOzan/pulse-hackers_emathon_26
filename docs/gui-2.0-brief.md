# Şahin Göz 2.0 — GUI Brief

## Scope and goals
- Redesign the UI of the existing Şahin Göz ED decision-support and patient-tracking system.
- Target: a "Smart Clinical Control Panel" built for fast reading and low cognitive load.
- UI/UX only: keep all existing infrastructure and functions. Focus on visuals,
  information hierarchy, accessibility and UX.
- Goals:
  - Critical patients noticed at a glance; deterioration visible early
  - Missing or outdated data never misread
  - Patient info reachable in as few clicks as possible
  - Fast, consistent, safe use in a busy ED
- All on-screen text is Turkish. Use the Turkish terms given below.

## Visual style
- Look: a digital ED command center, not a classic hospital information system.
- Blend aviation-panel readability, ICU-monitor data display and clean health-tech design.
- Modern, minimalist, professional, highly legible. Font: Inter or Roboto.
- Avoid small text, unnecessary explanations, complex menus and decorative clutter.
- Cards: white/neutral background, light shadow, clear border, rounded corners.
- Light and dark themes; colors and hierarchy keep the same meaning in both.
- Responsive across desktop, tablet and mobile.
- Motion: brief, subtle transitions only. Nothing that blinks continuously, moves
  needlessly or pulls attention from clinical data.

## Clinical color rules (strict)
- Only these four status colors:
  - Red: "Kritik" (critical, needs urgent evaluation)
  - Yellow: "Yakın Takip" (at risk, may deteriorate, needs close monitoring)
  - Green: "Stabil" (stable)
  - Light gray: "Sınıflandırılmamış" (unclassified, evaluation incomplete, insufficient data)
- Color is never the only signal: every status color appears with its text label and an icon.
- No other hues anywhere: no blue, orange, purple or turquoise.
- All other UI (backgrounds, text, borders, buttons, menus): white, black and grays only.
- Light gray must never be mistaken for stable. Label those patients clearly, e.g.
  "Sınıflandırılmamış", "Değerlendirme bekliyor" or "Yetersiz veri".

## Layout
- Desktop, top to bottom: fixed header → stat cards → critical alarm panel → patient list.
- Navigation: collapsible left sidebar on desktop; bottom bar on tablet and mobile.

### Header (fixed, minimal)
- Left: minimalist logo (hawk's eye + medical monitoring), then:
  - Title: "ŞAHİN GÖZ 2.0"
  - Subtitle: "Akıllı Klinik Takip ve Karar Destek Sistemi"
- Right:
  - Notification/alarm icon; current date and time
  - Active role ("Hekim" or "Hemşire"); user profile
  - Light/dark theme toggle
  - System/data connection status, always in words: "Bağlı", "Bağlantı zayıf", "Bağlantı kesildi"

### Stat cards (horizontal row)
- Big numbers, simple icons, short labels.
- Clicking a card filters the patient list to that group.
- Cards and colors:
  - Aktif hasta (active patients): neutral gray
  - Kritik: red
  - Yakın Takip: yellow
  - Stabil: green
  - Sınıflandırılmamış: light gray
  - Bekleyen işlem (pending tasks): neutral gray
  - Taburculuk değerlendirmesi bekleyen (awaiting discharge evaluation): neutral gray

### Critical alarm panel
- Directly below the stat cards, above the patient list and everything else.
- Light red background, strong red border, warning icon, high-contrast text. No blinking.
- New alarms appear in real time; new or worsening conditions are visually emphasized.
- Example alarm:
    KRİTİK HASTA UYARISI
    Yatak 04 – A.K. – 68 yaş
    Hipotansiyon ve taşikardi saptandı.
    Öncelikli klinik değerlendirme gerekli.
- Buttons on every alarm: "Hastayı görüntüle", "Alarmı gördüm", "Klinik değerlendirme kaydı oluştur"
- "Alarmı gördüm" only records that the user has seen the alert. It must NOT:
  - close or dismiss the alarm
  - show the patient as resolved or back to normal

### Patient list
- Default card view; user can switch to a table view.
- Card fields:
  - Hasta adı ve soyadı, Protokol numarası, Yaş ve cinsiyet, Yatak numarası
  - Başvuru şikâyeti, Acil serviste kalış süresi
  - Vital bulgular: Kan basıncı (sistolik/diyastolik), Nabız, SpO₂, Solunum sayısı,
    Vücut sıcaklığı, Glasgow Koma Skalası
  - Son vital bulgu ölçüm zamanı, Güncel klinik risk durumu
  - Bekleyen tetkikler, Bekleyen konsültasyonlar
- Left edge: vertical stripe in the status color, plus the written status label inside the card.
- Vitals in large numbers; units visible but clearly separate from the values.
- Abnormal vitals: highlighted with color, an icon and a short note.
- Missing, unmeasured or outdated values must never look normal. Show "Ölçülmedi",
  "Veri yok" or "Güncel değil" instead.

### Sorting, filtering, search
- List re-sorts automatically by current risk:
  Kritik → Yakın Takip → Sınıflandırılmamış → Stabil (unclassified ranks above stable).
- Newly deteriorating patients get extra emphasis.
- Filter and sort by: risk status, bed number, time in ED, last vitals time, pending tests,
  pending consultations, responsible physician, responsible nurse.
- Quick search by patient name, surname or protocol number.
- Active filters always visible; one action clears them all.

### Navigation
- Sidebar items, each with a simple, consistent icon: Genel Bakış, Aktif Hastalar,
  Kritik Hastalar, Klinik Alarmlar, Bekleyen İşlemler, Hekim Paneli, Hemşire Paneli,
  İstatistik ve Analiz, Ayarlar.
- Collapsed sidebar: icons stay visible; label appears on hover.
- Tablet/mobile: bottom bar shows the most-used sections; the rest sit in a "more" menu.

## Roles, accessibility, components
- Hekim and Hemşire interfaces tailored to each role's tasks and permissions.
- Actions outside the user's permissions: hidden, or shown disabled with a clear reason.
- Touch-friendly sizes for all buttons, cards and interactive areas.
- Enough text/background contrast; every icon gets an accessible name and short description.
- Reusable, modular components in one shared design system: patient card, alarm card,
  vital-sign display, status label, filter bar, stat card.
