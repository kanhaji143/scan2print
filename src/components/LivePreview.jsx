import { useRef, useEffect } from 'react';

/**
 * Live A4 print preview that renders the uploaded document image
 * onto a simulated A4 sheet.
 */
export default function LivePreview({ imageUrl, layoutMode, orientation, scaling, pageColor }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    const ctx = canvas.getContext('2d');

    // A4 ratio: 210 x 297 mm
    const isLandscape = orientation === 'landscape';
    const sheetW = isLandscape ? 297 : 210;
    const sheetH = isLandscape ? 210 : 297;

    // Scale to canvas
    const maxW = 280;
    const scale = maxW / sheetW;
    canvas.width = sheetW * scale;
    canvas.height = sheetH * scale;

    // White sheet background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const margin = 10;
      const availW = canvas.width - margin * 2;
      const availH = canvas.height - margin * 2;

      let drawW, drawH;
      const imgRatio = img.width / img.height;
      const availRatio = availW / availH;

      if (scaling === 'fit') {
        if (imgRatio > availRatio) {
          drawW = availW;
          drawH = availW / imgRatio;
        } else {
          drawH = availH;
          drawW = availH * imgRatio;
        }
      } else {
        drawW = Math.min(img.width * 0.5, availW);
        drawH = Math.min(img.height * 0.5, availH);
      }

      // ID card mode: smaller, centered
      if (layoutMode === 'id_card') {
        drawW = Math.min(drawW, canvas.width * 0.6);
        drawH = Math.min(drawH, canvas.height * 0.6);
      }

      const x = (canvas.width - drawW) / 2;
      const y = (canvas.height - drawH) / 2;

      ctx.drawImage(img, x, y, drawW, drawH);

      // Apply B&W filter if needed
      if (pageColor === 'bw') {
        const imageData = ctx.getImageData(x, y, drawW, drawH);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = avg;
          data[i + 1] = avg;
          data[i + 2] = avg;
        }
        ctx.putImageData(imageData, x, y);
      }
    };
    img.src = imageUrl;
  }, [imageUrl, layoutMode, orientation, scaling, pageColor]);

  return (
    <div className="live-preview">
      <h3 className="settings-title">Live Preview</h3>
      <div className="preview-sheet-wrap">
        <canvas ref={canvasRef} className="preview-sheet" />
      </div>
      <p className="preview-label">
        {layoutMode === 'id_card' ? 'ID Card Size' : 'A4 Page'} | {orientation} | {pageColor === 'bw' ? 'B&W' : 'Color'}
      </p>
    </div>
  );
}
