import { apiRequest } from './apiClient.js';

export function getExamState(attemptId) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/state`);
}

export function startSection(attemptId, section) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/start-section`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(section ? { section } : {}),
  });
}

export function getCurrentQuestion(attemptId) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/question`);
}

export function saveAnswer(attemptId, { questionId, selectedIndex, timeSpentMs }) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, selectedIndex, timeSpentMs }),
  });
}

export function nextQuestion(attemptId, { unanswered = false, questionId } = {}) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unanswered, questionId }),
  });
}

export function submitSection(attemptId) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/submit-section`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}
