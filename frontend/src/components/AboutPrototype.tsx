import { useEffect, useRef } from 'react';
import { t } from '../i18n';

export function AboutPrototype({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="about" aria-labelledby="about-title" onClose={onClose}>
      <div className="drawer-head">
        <h2 id="about-title">{t('about.title')}</h2>
        <button type="button" className="big" onClick={() => dialog.current?.close()}>{t('about.close')}</button>
      </div>
      <span className="simulated">{t('app.simulated')}</span>
      <h3>{t('about.real')}</h3>
      <p>{t('about.realBody')}</p>
      <h3>{t('about.simulated')}</h3>
      <p>{t('about.simulatedBody')}</p>
      <p>{t('about.rulesAndData')}</p>
      <h3>{t('about.limits')}</h3>
      <p>{t('about.limitsBody')}</p>
      <p>{t('about.ai')}</p>
      <p><strong>{t('app.footer')}</strong></p>
    </dialog>
  );
}
