import { useState, useRef, useEffect, useMemo } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateToken } from '../lib/requests';
import { uploadToTempFile } from '../lib/tempfile';
import { calculatePrice, formatINR } from '../lib/pricing';
import { processPayment } from '../lib/razorpay';
import ImageEditor from '../components/ImageEditor';
import PrintSettings from '../components/PrintSettings';
import LivePreview from '../components/LivePreview';

function ImageSlot({ label, required, preview, onPick, onRemove, onEdit }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraOpening, setCameraOpening] = useState(false);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const openCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraRef.current?.click();
      return;
    }
    setCameraOpening(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setCameraOpening(false);
    } catch (err) {
      closeCamera();
      setCameraOpening(false);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in browser settings.'
          : 'Camera is unavailable on this device.'
      );
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const captureFromVideo = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        onPick(new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' }));
      }
      closeCamera();
    }, 'image/png');
  };

  return (
    <div className="slot">
      <div className="slot-header">
        <span className="slot-label">{label}</span>
        {required && <span className="required">Required</span>}
      </div>

      {preview ? (
        <div className="preview-wrap">
          <img src={preview} alt={label} className="preview" />
          <div className="upload-actions">
            <button type="button" className="action-btn" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="action-btn" onClick={openCamera}>
              Take Photo
            </button>
            <button
              type="button"
              className="action-btn secondary"
              onClick={() => galleryRef.current?.click()}
            >
              Gallery
            </button>
          </div>
          <button type="button" className="remove-btn" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : (
        <div className="upload-actions">
          <button type="button" className="action-btn" onClick={openCamera}>
            Take Photo
          </button>
          <button
            type="button"
            className="action-btn secondary"
            onClick={() => galleryRef.current?.click()}
          >
            Choose from Gallery
          </button>
        </div>
      )}

      {cameraError && (
        <div className="camera-backdrop">
          <div className="camera-modal">
            <p className="camera-error">{cameraError}</p>
            <div className="upload-actions">
              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  setCameraError('');
                  galleryRef.current?.click();
                }}
              >
                Choose from Gallery
              </button>
              <button
                type="button"
                className="action-btn secondary"
                onClick={() => setCameraError('')}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraOpening && !cameraActive && !cameraError && (
        <div className="camera-backdrop">
          <div className="camera-modal">
            <p className="camera-opening">Camera starting...</p>
            <button type="button" className="action-btn secondary" onClick={closeCamera}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {cameraActive && (
        <div className="camera-backdrop">
          <div className="camera-modal">
            <video ref={videoRef} className="camera-video" playsInline muted />
            <div className="upload-actions">
              <button type="button" className="action-btn" onClick={captureFromVideo}>
                Capture
              </button>
              <button type="button" className="action-btn secondary" onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} hidden />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function PdfSlot({ file, onPick, onRemove, onInvalidType }) {
  const pdfRef = useRef(null);

  return (
    <div className="slot">
      <div className="slot-header">
        <span className="slot-label">PDF Document</span>
        {!file && <span className="optional-note">Optional</span>}
      </div>

      {file ? (
        <div className="preview-wrap">
          <p className="pdf-name">{file.name}</p>
          <button type="button" className="remove-btn" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : (
        <div className="upload-actions">
          <button
            type="button"
            className="action-btn"
            onClick={() => pdfRef.current?.click()}
          >
            Choose PDF
          </button>
        </div>
      )}

      <input
        ref={pdfRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (
            picked &&
            picked.type &&
            picked.type !== 'application/pdf' &&
            !picked.name.toLowerCase().endsWith('.pdf')
          ) {
            onInvalidType?.();
          } else {
            onPick(picked);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default function Upload() {
  // File states
  const [image1, setImage1] = useState(null);
  const [preview1, setPreview1] = useState(null);
  const [image2, setImage2] = useState(null);
  const [preview2, setPreview2] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);

  // Print settings
  const [layoutMode, setLayoutMode] = useState('full_page');
  const [orientation, setOrientation] = useState('portrait');
  const [scaling, setScaling] = useState('fit');
  const [pageColor, setPageColor] = useState('bw');
  const [copies, setCopies] = useState(1);
  const [customPages, setCustomPages] = useState([]);
  const [customerName, setCustomerName] = useState('');

  // UI states
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(1); // 1 = upload, 2 = settings/payment
  const [editingSlot, setEditingSlot] = useState(null); // 1 or 2
  const [paymentMode, setPaymentMode] = useState(''); // 'razorpay' | 'manual'

  // Determine total pages from uploaded files
  const totalPages = useMemo(() => {
    let pages = 0;
    if (image1) pages += 1;
    if (image2) pages += 1;
    if (pdfFile) pages += 1; // PDF counts as 1 page for now
    return Math.max(1, pages);
  }, [image1, image2, pdfFile]);

  // Effective pages (custom selection or all)
  const effectivePages = customPages.length > 0 ? customPages.length : totalPages;

  // Price calculation
  const pricing = useMemo(
    () =>
      calculatePrice({
        totalPages: effectivePages,
        copies,
        pageColor,
        layoutMode,
      }),
    [effectivePages, copies, pageColor, layoutMode]
  );

  const pick = (slot, file) => {
    if (!file) return;
    if (slot === 1) {
      if (preview1) URL.revokeObjectURL(preview1);
      setPreview1(URL.createObjectURL(file));
      setImage1(file);
    } else {
      if (preview2) URL.revokeObjectURL(preview2);
      setPreview2(URL.createObjectURL(file));
      setImage2(file);
    }
    setError('');
  };

  const remove = (slot) => {
    if (slot === 1) {
      if (preview1) URL.revokeObjectURL(preview1);
      setImage1(null);
      setPreview1(null);
    } else {
      if (preview2) URL.revokeObjectURL(preview2);
      setImage2(null);
      setPreview2(null);
    }
  };

  const handleEditApply = (blob) => {
    const file = new File([blob], `edited-${Date.now()}.png`, { type: 'image/png' });
    if (editingSlot === 1) {
      if (preview1) URL.revokeObjectURL(preview1);
      setPreview1(URL.createObjectURL(file));
      setImage1(file);
    } else {
      if (preview2) URL.revokeObjectURL(preview2);
      setPreview2(URL.createObjectURL(file));
      setImage2(file);
    }
    setEditingSlot(null);
  };

  const handleSubmitDocuments = () => {
    if (!image1) {
      setError('First image is required.');
      return;
    }
    setError('');
    setStep(2);
  };

  const handlePayment = async (mode) => {
    setError('');
    setPaymentMode(mode);
    setSubmitting(true);
    setProgress(0);

    const orderId = `MOC-${Date.now().toString().slice(-4)}`;

    try {
      // For Razorpay, process payment first
      let paymentData = null;
      if (mode === 'razorpay') {
        try {
          paymentData = await processPayment({
            amount: pricing.totalAmount,
            customerName,
            orderId,
          });
        } catch (payErr) {
          setError(payErr?.message || 'Payment failed.');
          setSubmitting(false);
          setPaymentMode('');
          return;
        }
      }

      // Upload files
      const uploads = [];
      const jobs = [
        { key: 'image1', label: 'Image 1', file: image1 },
        { key: 'image2', label: 'Image 2', file: image2 },
        { key: 'pdf', label: 'PDF document', file: pdfFile },
      ].filter((job) => job.file);

      for (const job of jobs) {
        setProgressLabel(`Uploading ${job.label}...`);
        setProgress(0);
        const info = await uploadToTempFile(job.file, {
          onProgress: (pct) => setProgress(pct),
        });
        uploads.push({ key: job.key, info });
      }

      let expiresAtValue = null;
      for (const { info } of uploads) {
        if (info?.expiryTime && typeof info.expiryTime === 'number') {
          const candidate = new Date(info.expiryTime);
          if (!expiresAtValue || candidate.getTime() < expiresAtValue.getTime()) {
            expiresAtValue = candidate;
          }
        }
      }
      if (!expiresAtValue) {
        expiresAtValue = new Date(Date.now() + 60 * 60 * 1000);
      }

      const has = (key) => uploads.some((u) => u.key === key);
      const payloadFor = (key) => uploads.find((u) => u.key === key)?.info || null;

      const payload = {
        token: generateToken(),
        orderId,
        status: mode === 'razorpay' ? 'Paid' : 'Pending',
        paymentMode: mode === 'razorpay' ? 'RAZORPAY' : 'MANUAL_PAY',
        paymentStatus: mode === 'razorpay' ? 'PAID' : 'PENDING',
        razorpayPaymentId: paymentData?.payment?.razorpay_payment_id || '',
        razorpayOrderId: paymentData?.payment?.razorpay_order_id || '',
        customerName: customerName || '',
        layoutMode,
        orientation,
        scaling,
        pageColor,
        copies,
        customPages: customPages.length > 0 ? customPages : [],
        totalPages: effectivePages,
        ratePerPage: pricing.ratePerPage,
        totalAmount: pricing.totalAmount,
        printStatus: mode === 'razorpay' ? 'WAITING_CONFIRMATION' : 'WAITING_OPERATOR_CONFIRMATION',
        uploadedAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAtValue),
        hasImage1: has('image1'),
        hasImage2: has('image2'),
        hasPdf: has('pdf'),
        image1: payloadFor('image1'),
        image2: payloadFor('image2'),
        pdfFile: payloadFor('pdf'),
      };

      await addDoc(collection(db, 'printRequests'), payload);

      setResult(payload.token);
      // Reset
      setImage1(null);
      setPreview1(null);
      setImage2(null);
      setPreview2(null);
      setPdfFile(null);
      setCopies(1);
      setCustomPages([]);
      setCustomerName('');
      setStep(1);
      setProgress(0);
      setProgressLabel('');
    } catch (err) {
      setError(err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
      setPaymentMode('');
      setProgressLabel('');
      setProgress(0);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError('');
  };

  // Success screen
  if (result) {
    return (
      <div className="page">
        <h1>Document Print Upload</h1>
        <div className="success-card">
          <p className="success-title">Upload successful!</p>
          <p className="token-label">Your token number:</p>
          <p className="token">{result}</p>
          <p className="note">Show this token at the shop to collect your prints.</p>
          <button type="button" className="submit-btn" onClick={handleReset}>
            Upload Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Document Print Upload</h1>
      <p className="subtitle">Upload your document images for printing.</p>
      <p className="scanner-link-row">
        <a className="scanner-link" href="/qr">QR Code Generator</a>
        <span className="link-separator">•</span>
        <a className="scanner-link" href="/counter">Counter Dashboard</a>
        <span className="link-separator">•</span>
        <a className="scanner-link" href="/dashboard">Admin Dashboard</a>
      </p>

      {/* Step indicator */}
      <div className="step-indicator">
        <div className={`step-dot ${step >= 1 ? 'active' : ''}`}>1</div>
        <div className={`step-line ${step >= 2 ? 'active' : ''}`} />
        <div className={`step-dot ${step >= 2 ? 'active' : ''}`}>2</div>
      </div>

      {step === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmitDocuments(); }} className="form">
          <ImageSlot
            label="First Image"
            required
            preview={preview1}
            onPick={(f) => pick(1, f)}
            onRemove={() => remove(1)}
            onEdit={() => setEditingSlot(1)}
          />
          <ImageSlot
            label="Second Image"
            required={false}
            preview={preview2}
            onPick={(f) => pick(2, f)}
            onRemove={() => remove(2)}
            onEdit={() => setEditingSlot(2)}
          />
          <PdfSlot
            file={pdfFile}
            onPick={(f) => { if (f) setPdfFile(f); setError(''); }}
            onRemove={() => setPdfFile(null)}
            onInvalidType={() => setError('PDF field accepts .pdf files only.')}
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" className="submit-btn">
            Continue to Print Settings
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="form">
          <div className="upload-summary">
            <p className="subtitle">
              {totalPages} page(s) | {image1 ? '1 image' : ''} {image2 ? '+ 1 image' : ''} {pdfFile ? '+ PDF' : ''}
            </p>
          </div>

          {/* Live Preview */}
          {preview1 && (
            <LivePreview
              imageUrl={preview1}
              layoutMode={layoutMode}
              orientation={orientation}
              scaling={scaling}
              pageColor={pageColor}
            />
          )}

          {/* Print Settings */}
          <PrintSettings
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            orientation={orientation}
            setOrientation={setOrientation}
            scaling={scaling}
            setScaling={setScaling}
            pageColor={pageColor}
            setPageColor={setPageColor}
            copies={copies}
            setCopies={setCopies}
            totalPages={totalPages}
            customPages={customPages}
            setCustomPages={setCustomPages}
            customerName={customerName}
            setCustomerName={setCustomerName}
          />

          {/* Price Summary */}
          <div className="price-summary">
            <div className="price-row">
              <span>Pages:</span>
              <span>{effectivePages}</span>
            </div>
            <div className="price-row">
              <span>Copies:</span>
              <span>{copies}</span>
            </div>
            <div className="price-row">
              <span>Rate:</span>
              <span>{formatINR(pricing.ratePerPage)}/page</span>
            </div>
            <div className="price-row total">
              <span>Total:</span>
              <span>{formatINR(pricing.totalAmount)}</span>
            </div>
          </div>

          {/* Payment Buttons */}
          <div className="payment-section">
            <button
              type="button"
              className="submit-btn razorpay-btn"
              disabled={submitting}
              onClick={() => handlePayment('razorpay')}
            >
              {paymentMode === 'razorpay' ? 'Processing...' : `Pay with Razorpay (${formatINR(pricing.totalAmount)})`}
            </button>
            <button
              type="button"
              className="submit-btn manual-btn"
              disabled={submitting}
              onClick={() => handlePayment('manual')}
            >
              {paymentMode === 'manual' ? 'Submitting...' : 'Pay with Cash (at Counter)'}
            </button>
            <button
              type="button"
              className="action-btn secondary"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              Back
            </button>
          </div>

          {submitting && (
            <div className="progress-wrap">
              <p className="progress-label">{progressLabel || 'Processing...'}</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Image Editor Modal */}
      {editingSlot && (
        <ImageEditor
          imageUrl={editingSlot === 1 ? preview1 : preview2}
          onApply={handleEditApply}
          onCancel={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}
