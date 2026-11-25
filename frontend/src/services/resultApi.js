import { apiRequest } from './apiClient.js';

export function getAttemptResult(attemptId) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/result`);
}

export function getAttemptReview(attemptId) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/review`);
}
