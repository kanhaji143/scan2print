const UPLOAD_URL = 'https://tempfile.org/api/upload/local';
const ORIGIN = 'https://tempfile.org';
const EXPIRY_HOURS = '1';
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB TempFile limit per file

function friendlyError(status, data) {
  if (status === 413) {
    return 'File is too large (max 100MB).';
  }
  if (status === 429) {
    return 'Too many uploads right now. Please wait a moment and retry.';
  }
  if (status >= 500) {
    return 'File storage service error. Please try again.';
  }
  return data?.error || 'Upload failed. Please try again.';
}

function buildResult(entry) {
  const id = entry?.id;
  if (!id) {
    throw new Error('Upload failed. Please try again.');
  }
  return {
    id,
    name: entry.name || 'file',
    size: entry.size || 0,
    url: entry.url || `${ORIGIN}/${id}/`,
    previewUrl: `${ORIGIN}/${id}/preview`,
    downloadUrl: `${ORIGIN}/${id}/download`,
    expiryTime: entry.expiryTime,
  };
}

/**
 * Upload a single file to TempFile.org (temporary public storage).
 * Returns { id, name, size, url, previewUrl, downloadUrl, expiryTime },
 * or null when `file` is empty.
 */
export function uploadToTempFile(file, { onProgress } = {}) {
  if (!file) return Promise.resolve(null);

  if (file.size > MAX_FILE_BYTES) {
    return Promise.reject(new Error('File is too large (max 100MB).'));
  }

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('files', file);
    form.append('expiryHours', EXPIRY_HOURS);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_URL, true);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        data?.success &&
        Array.isArray(data.files) &&
        data.files.length > 0
      ) {
        onProgress?.(100);
        resolve(buildResult(data.files[0]));
      } else {
        reject(new Error(friendlyError(xhr.status, data)));
      }
    };

    xhr.onerror = () =>
      reject(
        new Error(
          'Network error while contacting file storage. Check your connection and try again.'
        )
      );
    xhr.ontimeout = () =>
      reject(new Error('Upload timed out. Please try again.'));

    xhr.send(form);
  });
}
