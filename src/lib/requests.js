const STORAGE_KEY = 'print_requests';

export function getRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRequests(requests) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

export function addRequest(request) {
  const requests = getRequests();
  requests.unshift(request);
  saveRequests(requests);
  return request;
}

export function updateRequestStatus(id, status) {
  const requests = getRequests();
  const next = requests.map((r) => (r.id === id ? { ...r, status } : r));
  saveRequests(next);
  return next;
}

export function generateToken() {
  const existing = new Set(getRequests().map((r) => r.token));
  let token;
  do {
    token = 'TKN-' + Math.floor(100000 + Math.random() * 900000);
  } while (existing.has(token));
  return token;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
