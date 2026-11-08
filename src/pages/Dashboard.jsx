import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const STATUSES = ['Pending', 'Paid', 'Printed'];

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

function isImage(info) {
  return Boolean(info?.previewUrl && info?.name && IMAGE_EXT.test(info.name));
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'printRequests'), orderBy('uploadedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError(err?.message || 'Login failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const setStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, 'printRequests', id), { status });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id, token) => {
    if (!window.confirm(`Delete request ${token}? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'printRequests', id));
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading) {
    return (
      <div className="page dashboard">
        <h1>Shop Dashboard</h1>
        <p className="subtitle">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page dashboard">
        <h1>Shop Dashboard</h1>
        <p className="subtitle">Sign in to access the dashboard.</p>

        <form onSubmit={handleLogin} className="form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input"
          />
          {authError && <p className="error">{authError}</p>}
          <button type="submit" className="submit-btn" disabled={signingIn}>
            {signingIn ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page dashboard">
      <div className="dashboard-header">
        <h1>Shop Dashboard</h1>
        <div className="dashboard-header-actions">
          <a className="scanner-link" href="/qr">QR Code</a>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
      <p className="subtitle">Signed in as {user.email}</p>
      <p className="subtitle">Customer print requests (live).</p>

      {loading && <p className="subtitle">Loading requests...</p>}

      {!loading && requests.length === 0 && (
        <p className="no-requests">No requests yet.</p>
      )}

      <div className="request-list">
        {requests.map((req) => (
          <div className="request-card" key={req.id}>
            <div className="request-header">
              <span className="token">{req.token}</span>
              <span className={`status status-${(req.status || 'pending').toLowerCase()}`}>
                {req.status || 'Pending'}
              </span>
            </div>

            <p className="created-at">
              Uploaded: {formatDate(req.uploadedAt)}
            </p>
            <p className="created-at">
              Expires: {formatDate(req.expiresAt)}
            </p>

            <div className="images">
              <div className="image-box">
                <p className="image-label">Image 1</p>
                {isImage(req.image1) ? (
                  <>
                    <img
                      src={req.image1.previewUrl}
                      alt="Image 1"
                      className="thumb"
                      onError={(e) => {
                        e.currentTarget.replaceWith(
                          Object.assign(document.createElement('p'), {
                            textContent: 'Preview unavailable',
                            className: 'no-image',
                          })
                        );
                      }}
                    />
                    <a
                      className="download-link"
                      href={req.image1.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <p className="no-image">
                    {req.hasImage1 ? 'Uploaded (not stored)' : 'Not provided'}
                  </p>
                )}
              </div>

              <div className="image-box">
                <p className="image-label">Image 2</p>
                {isImage(req.image2) ? (
                  <>
                    <img
                      src={req.image2.previewUrl}
                      alt="Image 2"
                      className="thumb"
                      onError={(e) => {
                        e.currentTarget.replaceWith(
                          Object.assign(document.createElement('p'), {
                            textContent: 'Preview unavailable',
                            className: 'no-image',
                          })
                        );
                      }}
                    />
                    <a
                      className="download-link"
                      href={req.image2.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <p className="no-image">
                    {req.hasImage2 ? 'Uploaded (not stored)' : 'Not provided'}
                  </p>
                )}
              </div>
            </div>

            {req.pages?.length > 0 && (
              <div className="scanner-pages">
                <p className="scanner-pages-title">
                  Scanned pages ({req.pages.length})
                </p>
                <div className="scanner-thumb-list">
                  {req.pages.map((page, index) => (
                    <div className="scanner-thumb" key={page.id || index}>
                      <img src={page.previewUrl} alt={`Page ${index + 1}`} />
                      <span className="scanner-thumb-index">{index + 1}</span>
                      <a
                        className="download-link"
                        href={page.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {req.pdfFile?.downloadUrl && (
              <div className="pdf-link-row">
                <p className="pdf-label">
                  {req.pdfFile.name || 'PDF document'}
                </p>
                <a
                  className="download-link"
                  href={req.pdfFile.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download PDF
                </a>
              </div>
            )}

            <div className="status-actions">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`status-btn ${req.status === s ? 'active' : ''}`}
                  onClick={() => setStatus(req.id, s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="delete-btn"
              onClick={() => handleDelete(req.id, req.token)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
