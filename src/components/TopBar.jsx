import { useEffect } from 'react';
import { BRAND, applyBrandTitle } from '../lib/branding';

/**
 * Branded top bar (navy + gold) — reference site jaisa.
 * Logo replace karna ho to public/logo.svg (ya logo.png) badlo.
 */
export default function TopBar({ page = '' }) {
  useEffect(() => {
    applyBrandTitle(page);
  }, [page]);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <img
          src={BRAND.logo}
          alt="Logo"
          className="topbar-logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <div className="topbar-text">
          <span className="topbar-name">{BRAND.shopName}</span>
          <span className="topbar-tagline">{BRAND.tagline}</span>
        </div>
      </div>
    </header>
  );
}
