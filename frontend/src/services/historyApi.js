import { apiRequest } from './apiClient.js';

export function listHistory() {
  return apiRequest('/history');
}

export function getHistoryAnalytics() {
  return apiRequest('/history/analytics');
}

export function compareAttempts(ids) {
  const query = encodeURIComponent(ids.join(','));
  return apiRequest(`/history/compare?ids=${query}`);
}

export function deleteAttempt(attemptId) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}`, {
    method: 'DELETE',
  });
}

export async function downloadAttemptExport(attemptId, format = 'json') {
  const url = `/api/attempts/${encodeURIComponent(attemptId)}/export?format=${encodeURIComponent(format)}`;
  const response = await fetch(url);
  if (!response.ok) {
    let errInfo = null;
    try {
      const json = await response.json();
      errInfo = json?.error;
    } catch {
      errInfo = null;
    }
    const err = new Error(errInfo?.message || `Export failed with status ${response.status}`);
    err.code = errInfo?.code || 'REQUEST_FAILED';
    throw err;
  }

  const blob = await response.blob();
  const filename = `pet-prep-attempt-${attemptId}.${format}`;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return { filename };
}
