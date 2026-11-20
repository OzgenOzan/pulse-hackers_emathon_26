# Şahin Göz 2.0 design system

Şahin Göz uses local Inter Variable and Lucide icons. It never loads a font, icon or chart from a third party. Body text is 16 px, secondary text is at least 14 px, overview counts are 36 px, and patient-card vital readings are 24 px. Secondary controls are at least 44 px tall; primary alarm actions are at least 48 px. Motion is limited to short transitions and disabled under `prefers-reduced-motion`.

## Colour and meaning

The source of truth is [`frontend/src/styles/tokens.css`](../frontend/src/styles/tokens.css). Call `scripts/check_palette.py --check` directly or via `make test`. Components use tokens and `currentColor`; neither a status colour nor an icon alone communicates clinical meaning.

| Status | Signal | Use |
|---|---|---|
| Kritik | Red edge, warning triangle, label | An open critical alarm or an assessment meeting the existing threshold. Recording a decision does not itself make the patient stable. |
| Yakın Takip | Yellow fill, dark ink, eye, label | Early deterioration below the critical threshold. No yellow text. |
| Sınıflandırılmamış | Gray hatch, question mark, label | Insufficient or delayed data, or assessment not yet complete. Never the stable treatment. |
| Stabil | Green edge and tint, circled check, label | Current assessment without risk findings or a data gap. |

Neutral tasks don't change clinical status. An alarm marked seen remains active and cannot release the physician navigation lock. Vital highlights come from the backend's scored components, not from front-end thresholds. Stale values show a gray label and time, not a large number.

### Contrast

Ratios use WCAG relative luminance, calculated from the actual CSS token pairs. Text targets 4.5:1; edges and other meaningful non-text shapes target 3:1.

| Token pair | Light | Dark |
|---|---:|---:|
| Primary text / surface | 18.88 | 14.89 |
| Muted text / surface | 6.19 | 8.87 |
| Critical text / critical tint | 5.72 | 7.13 |
| Stable text / stable tint | 5.64 | 7.09 |
| Watch ink / yellow fill | 11.23 | 13.38 |
| Unclassified ink / darker hatch band | 10.32 | 5.94 |
| Unclassified ink / lighter hatch band | 14.59 | 9.51 |
| Critical edge / surface | 6.54 | 7.30 |
| Stable edge / surface | 6.34 | 8.28 |
| Watch edge / surface | 18.88 | 11.81 |
| Unclassified edge / surface | 6.19 | 6.22 |
| Control border / surface | 4.54 | 6.22 |
| Focus ring / surface | 21.00 | 16.67 |
| Selection text / selection background | 4.54 | 6.99 |

Focus is a 3 px black ring in light mode and white in dark mode. Native select pop-ups and browser/OS forced-colour settings can use the platform accent; they are not application-authored colours. Native selects remain for demo scenario, speed and list filters.

## Components

Shared primitives live in [`frontend/src/components/ui/`](../frontend/src/components/ui/).

| Component | Contract |
|---|---|
| `StatusLabel` | Shows the classification icon and text; optionally adds the recorded evaluation time and decision. |
| `StatCard` | Shows and toggles a filter; keeps the full label and count accessible even when the visible label is shorter. |
| `AlarmCard` | Shows evidence and actions; critical vs. neutral variant. `AlarmPanel` manages assertive announcements; `AlarmStrip` gives the persistent compact entry point. |
| `PatientCard` | Shows identity, history entry, status, vital readings, assessment evidence and pending tasks without inventing a status or action. |
| `VitalSign` | Renders measured, missing or stale values as distinct states; accepts scored flags from the server. Cards list abbreviated findings beneath the marked readings. |
| `FilterBar` | Search, multi-select risk, pending-work and owner filters, ordering, active chips, and the card/table switch. |
| `TaskChip` | Shows pending work in neutral gray. Work queues gate actions by the active demo role. |
| `ConnectionStatus` | Monochrome connection icon plus explicit status text; data are marked stale when offline. |

Desktop uses a sidebar and a right-hand patient sheet. Below 1200 px, navigation moves to the bottom bar; on phones the overview metrics scroll horizontally, critical alarms use the sticky strip, and the patient sheet fills the screen. The table can scroll inside its own labelled region on narrow viewports; secondary columns hide below 1440 px. The demo controls and simulated-data disclosure remain distinct from clinical UI.

Turkish is the default. English is enabled only through Settings → Language, and the selector is available only when catalog keys, translations and placeholder names match. `scripts/check_locales.py` checks this as part of `make test`. Audit numbers and the neutral role chart are labelled as simulation activity, not clinical outcomes.
