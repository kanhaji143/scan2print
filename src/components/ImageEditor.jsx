import { useState, useRef, useEffect } from 'react';

/**
 * Interactive image editor with crop, rotate, and B&W enhance.
 * Renders a "clean" offscreen canvas (rotation + B&W only) and a
 * visible canvas (clean + crop overlay). Applying crops from the
 * clean canvas so the dark overlay never bakes into the output.
 */
export default function ImageEditor({ imageUrl, onApply, onCancel }) {
  const canvasRef = useRef(null);
  const cleanRef = useRef(null);
  const imgRef = useRef(null);
  const [rotation, setRotation] = useState(0);
  const [isBw, setIsBw] = useState(false);
  const [crop, setCrop] = useState({ top: 0, bottom: 0, left: 0, right: 0 }); // percentages
  const [aspect, setAspect] = useState('free'); // 'free' | 'idcard' | 'a4'
  const [loaded, setLoaded] = useState(false);

  const renderClean = (rot, bw) => {
    const img = imgRef.current;
    const clean = cleanRef.current;
    if (!img || !clean) return null;

    const swap = rot === 90 || rot === 270;
    const maxDim = Math.max(img.width, img.height);
    const scale = Math.min(1, 600 / maxDim);
    const w = Math.round((swap ? img.height : img.width) * scale);
    const h = Math.round((swap ? img.width : img.height) * scale);

    clean.width = w;
    clean.height = h;
    const cctx = clean.getContext('2d');

    cctx.save();
    cctx.translate(w / 2, h / 2);
    cctx.rotate((rot * Math.PI) / 180);
    cctx.drawImage(
      img,
      (-img.width * scale) / 2,
      (-img.height * scale) / 2,
      img.width * scale,
      img.height * scale
    );
    cctx.restore();

    if (bw) {
      const imageData = cctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
      }
      cctx.putImageData(imageData, 0, 0);
    }
    return clean;
  };

  const drawVisible = (clean, cropVal, aspectMode) => {
    const canvas = canvasRef.current;
    if (!canvas || !clean) return;
    canvas.width = clean.width;
    canvas.height = clean.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(clean, 0, 0);

    const w = canvas.width;
    const h = canvas.height;
    const cropX = (cropVal.left / 100) * w;
    const cropY = (cropVal.top / 100) * h;
    const cropW = w - cropX - (cropVal.right / 100) * w;
    const cropH = h - cropY - (cropVal.bottom / 100) * h;

    // Darken outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, cropY);
    ctx.fillRect(0, cropY + cropH, w, h - cropY - cropH);
    ctx.fillRect(0, cropY, cropX, cropH);
    ctx.fillRect(cropX + cropW, cropY, w - cropX - cropW, cropH);

    // Crop border
    ctx.strokeStyle = '#0b1e3d';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);

    // Aspect ratio guides
    if (aspectMode !== 'free' && cropW > 0) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      const ratio = aspectMode === 'idcard' ? 53.98 / 85.6 : 297 / 210;
      const guideH = cropW * ratio;
      const guideY = cropY + (cropH - guideH) / 2;
      ctx.strokeRect(cropX, guideY, cropW, Math.min(guideH, cropH));
      ctx.setLineDash([]);
    }
  };

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const clean = renderClean(rotation, isBw);
      drawVisible(clean, crop, aspect);
      setLoaded(true);
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Redraw when settings change
  useEffect(() => {
    if (!loaded) return;
    const clean = renderClean(rotation, isBw);
    drawVisible(clean, crop, aspect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, isBw, crop, aspect, loaded]);

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleAutoCrop = () => {
    setCrop({ top: 0, bottom: 0, left: 0, right: 0 });
  };

  const handleApply = () => {
    const clean = cleanRef.current;
    if (!clean) return;

    const cropX = (crop.left / 100) * clean.width;
    const cropY = (crop.top / 100) * clean.height;
    const cropW = clean.width - cropX - (crop.right / 100) * clean.width;
    const cropH = clean.height - cropY - (crop.bottom / 100) * clean.height;

    if (cropW < 10 || cropH < 10) return;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = Math.round(cropW);
    outCanvas.height = Math.round(cropH);
    outCanvas
      .getContext('2d')
      .drawImage(clean, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    outCanvas.toBlob((blob) => {
      if (blob) onApply(blob);
    }, 'image/png');
  };

  return (
    <div className="editor-backdrop">
      <div className="editor-modal">
        <h3 className="editor-title">Edit Photo</h3>

        <div className="editor-canvas-wrap">
          <canvas ref={cleanRef} hidden />
          <canvas ref={canvasRef} className="editor-canvas" />
        </div>

        <div className="editor-controls">
          <div className="editor-presets">
            <button
              type="button"
              className={`preset-btn ${aspect === 'free' ? 'active' : ''}`}
              onClick={() => setAspect('free')}
            >
              Free
            </button>
            <button
              type="button"
              className={`preset-btn ${aspect === 'idcard' ? 'active' : ''}`}
              onClick={() => setAspect('idcard')}
            >
              ID Card
            </button>
            <button
              type="button"
              className={`preset-btn ${aspect === 'a4' ? 'active' : ''}`}
              onClick={() => setAspect('a4')}
            >
              A4
            </button>
          </div>

          <div className="editor-sliders">
            <label>
              Top
              <input
                type="range"
                min="0"
                max="40"
                value={crop.top}
                onChange={(e) => setCrop((c) => ({ ...c, top: +e.target.value }))}
              />
            </label>
            <label>
              Bottom
              <input
                type="range"
                min="0"
                max="40"
                value={crop.bottom}
                onChange={(e) => setCrop((c) => ({ ...c, bottom: +e.target.value }))}
              />
            </label>
            <label>
              Left
              <input
                type="range"
                min="0"
                max="40"
                value={crop.left}
                onChange={(e) => setCrop((c) => ({ ...c, left: +e.target.value }))}
              />
            </label>
            <label>
              Right
              <input
                type="range"
                min="0"
                max="40"
                value={crop.right}
                onChange={(e) => setCrop((c) => ({ ...c, right: +e.target.value }))}
              />
            </label>
          </div>

          <div className="editor-actions">
            <button type="button" className="action-btn" onClick={handleAutoCrop}>
              Auto Crop
            </button>
            <button
              type="button"
              className={`action-btn ${isBw ? 'active' : ''}`}
              onClick={() => setIsBw((b) => !b)}
            >
              B&W
            </button>
            <button type="button" className="action-btn" onClick={handleRotate}>
              Rotate
            </button>
          </div>

          <div className="editor-footer">
            <button type="button" className="action-btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="action-btn primary" onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
