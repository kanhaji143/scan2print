import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function QrGenerator() {
  const [text, setText] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const defaultUrl = window.location.origin;
    setText(defaultUrl);
    QRCode.toDataURL(defaultUrl, { width: 256, margin: 2 })
      .then(setDataUrl)
      .catch(() => setError('Failed to generate QR code.'));
  }, []);

  const generate = async () => {
    setError('');
    if (!text.trim()) {
      setError('Please enter a URL or text.');
      return;
    }
    try {
      const url = await QRCode.toDataURL(text.trim(), { width: 256, margin: 2 });
      setDataUrl(url);
    } catch {
      setError('Failed to generate QR code.');
    }
  };

  return (
    <div className="page qr-generator-page">
      <h1>QR Code Generator</h1>
      <p className="subtitle">Create a QR code for your shop link or any text.</p>

      <div className="qr-generator-form">
        <input
          type="text"
          className="input"
          placeholder="Enter URL or text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="submit-btn" onClick={generate}>
          Generate QR Code
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {dataUrl && (
        <div className="qr-result">
          <img src={dataUrl} alt="QR Code" className="qr-image" />
          <a className="download-link" href={dataUrl} download="qrcode.png">
            Download QR Code
          </a>
        </div>
      )}
    </div>
  );
}
