import { apiRequest } from './apiClient.js';

export function listPapers() {
  return apiRequest('/papers');
}

export function getPaper(paperId) {
  return apiRequest(`/papers/${encodeURIComponent(paperId)}`);
}

export function deletePaper(id) {
  return apiRequest(`/papers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function importPaperFiles(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  return apiRequest('/papers/import', {
    method: 'POST',
    body: formData,
  });
}

export function createAttempt({ paperId, violationLimit }) {
  return apiRequest('/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paperId, violationLimit }),
  });
}
