import { RATES, formatINR } from '../lib/pricing';

/**
 * Print settings panel with live price calculation
 */
export default function PrintSettings({
  layoutMode,
  setLayoutMode,
  orientation,
  setOrientation,
  scaling,
  setScaling,
  pageColor,
  setPageColor,
  copies,
  setCopies,
  totalPages,
  customPages,
  setCustomPages,
  customerName,
  setCustomerName,
}) {
  const colorTotal = totalPages * copies;
  const colorRate = colorTotal >= RATES.COLOR_DISCOUNT_THRESHOLD
    ? RATES.COLOR_DISCOUNTED_RATE
    : RATES.COLOR_PER_PAGE;

  return (
    <div className="print-settings">
      <h3 className="settings-title">Print Settings</h3>

      {/* Layout Mode */}
      <div className="setting-group">
        <label className="setting-label">Print Size</label>
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${layoutMode === 'full_page' ? 'active' : ''}`}
            onClick={() => setLayoutMode('full_page')}
          >
            Full A4 Page
          </button>
          <button
            type="button"
            className={`segmented-btn ${layoutMode === 'id_card' ? 'active' : ''}`}
            onClick={() => setLayoutMode('id_card')}
          >
            ID Card
          </button>
        </div>
      </div>

      {/* Orientation */}
      <div className="setting-group">
        <label className="setting-label">Orientation</label>
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${orientation === 'portrait' ? 'active' : ''}`}
            onClick={() => setOrientation('portrait')}
          >
            Portrait
          </button>
          <button
            type="button"
            className={`segmented-btn ${orientation === 'landscape' ? 'active' : ''}`}
            onClick={() => setOrientation('landscape')}
          >
            Landscape
          </button>
        </div>
      </div>

      {/* Scaling */}
      <div className="setting-group">
        <label className="setting-label">Scaling</label>
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${scaling === 'fit' ? 'active' : ''}`}
            onClick={() => setScaling('fit')}
          >
            Fit to Page
          </button>
          <button
            type="button"
            className={`segmented-btn ${scaling === 'actual' ? 'active' : ''}`}
            onClick={() => setScaling('actual')}
          >
            Actual Size
          </button>
        </div>
      </div>

      {/* Page Color */}
      <div className="setting-group">
        <label className="setting-label">Page Color</label>
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn ${pageColor === 'bw' ? 'active' : ''}`}
            onClick={() => setPageColor('bw')}
          >
            B&W ({formatINR(RATES.BW_PER_PAGE)}/page)
          </button>
          <button
            type="button"
            className={`segmented-btn ${pageColor === 'color' ? 'active' : ''}`}
            onClick={() => setPageColor('color')}
          >
            Color ({formatINR(colorRate)}/page)
          </button>
        </div>
        {pageColor === 'color' && colorTotal >= RATES.COLOR_DISCOUNT_THRESHOLD && (
          <p className="setting-hint">
            Discount applied! Color prints at {formatINR(RATES.COLOR_DISCOUNTED_RATE)}/page for 5+ prints.
          </p>
        )}
      </div>

      {/* Copies */}
      <div className="setting-group">
        <label className="setting-label">Copies</label>
        <div className="copies-control">
          <button
            type="button"
            className="copies-btn"
            onClick={() => setCopies(Math.max(1, copies - 1))}
          >
            -
          </button>
          <span className="copies-value">{copies}</span>
          <button
            type="button"
            className="copies-btn"
            onClick={() => setCopies(Math.min(99, copies + 1))}
          >
            +
          </button>
        </div>
      </div>

      {/* Customer Name */}
      <div className="setting-group">
        <label className="setting-label">Your Name (optional)</label>
        <input
          type="text"
          className="input"
          placeholder="Enter your name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </div>

      {/* Custom Pages (shown when multiple pages) */}
      {totalPages > 1 && (
        <div className="setting-group">
          <label className="setting-label">Page Selection</label>
          <div className="segmented">
            <button
              type="button"
              className={`segmented-btn ${customPages.length === 0 ? 'active' : ''}`}
              onClick={() => setCustomPages([])}
            >
              All Pages
            </button>
            <button
              type="button"
              className={`segmented-btn ${customPages.length > 0 ? 'active' : ''}`}
              onClick={() => setCustomPages([1])}
            >
              Custom
            </button>
          </div>
          {customPages.length > 0 && (
            <div className="custom-pages">
              <p className="setting-hint">Select pages to print:</p>
              <div className="page-pills">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`page-pill ${customPages.includes(p) ? 'active' : ''}`}
                    onClick={() => {
                      setCustomPages(
                        customPages.includes(p)
                          ? customPages.filter((x) => x !== p)
                          : [...customPages, p].sort((a, b) => a - b)
                      );
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
