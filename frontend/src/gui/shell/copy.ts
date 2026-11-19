import type { OverviewKey, Role } from '../../types';

/** Turkish copy for the shell and its widgets. Grouped so the P2 English catalogue can mirror it key-for-key. */
export const shellCopy = {
  title: 'ŞAHİN GÖZ 2.0',
  subtitle: 'Akıllı Klinik Takip ve Karar Destek Sistemi',
  logo: 'Şahin Göz logosu',
  bell: (count: number) => `Kaydedilmemiş kritik alarm: ${count}`,
  clockLabel: 'Simüle saat',
  clockEmpty: '—',
  roleGroup: 'Demo rolü',
  roles: { physician: 'Hekim', nurse: 'Hemşire' } satisfies Record<Role, string>,
  profile: { physician: 'Dr. Deniz Aksoy', nurse: 'Hmş. Elif Kaya' } satisfies Record<Role, string>,
  simulatedPill: 'SİMÜLE VERİ',
  simulatedPillTitle: 'Bu ekrandaki veriler sentetik simülasyon verisidir.',
  about: 'Bu prototip hakkında',
  overview: 'Genel durum',
  filterChip: (label: string) => `Filtre: ${label}`,
  clearFilter: 'Filtreyi kaldır',
  theme: {
    toLight: 'Açık temaya geç',
    toDark: 'Koyu temaya geç',
  },
  nav: {
    label: 'Ana gezinme',
    expand: 'Menüyü genişlet',
    collapse: 'Menüyü daralt',
    more: 'Daha fazla',
    pending: (count: number) => `Bekleyen işlem: ${count}`,
  },
  connection: {
    connected: 'Bağlı',
    weak: 'Bağlantı zayıf',
    offline: 'Bağlantı kesildi',
  },
  connectionTitle: {
    connected: 'Son veri çekme 2 sn içinde başarılı',
    weak: 'Yavaş yanıt veya başarısız bir veri çekme',
    offline: 'Üst üste 3 veri çekme başarısız',
  },
  offlineNotice: (time: string | null) =>
    time ? `Bağlantı kesildi — veriler ${time} itibarıyla` : 'Bağlantı kesildi — veriler güncel değil',
  footer: 'Yalnızca karar desteğidir; nihai karar hekime aittir.',
  stats: {
    aktif: 'Aktif hasta',
    kritik: 'Kritik',
    yakin_takip: 'Yakın Takip',
    stabil: 'Stabil',
    siniflandirilmamis: 'Sınıflandırılmamış',
    bekleyen_islem: 'Bekleyen işlem',
    taburculuk_bekleyen: 'Taburculuk değerlendirmesi bekleyen',
  } satisfies Record<OverviewKey, string>,
  /** Visible card labels only; the full label stays in aria-label and title. */
  statsShort: {
    taburculuk_bekleyen: 'Taburculuk bekleyen',
  } as Partial<Record<OverviewKey, string>>,
};

const clockFormat = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** Wall-clock HH:MM:SS of the last successful poll (not simulated time). */
export function wallClock(date: Date): string {
  return clockFormat.format(date);
}
