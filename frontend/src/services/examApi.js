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

export function reportViolation(attemptId, { type, section = null, questionId = null }) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/violation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, section, questionId }),
  });
}

export function terminateAttempt(attemptId, reason) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/terminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export function runCode(attemptId, { questionId, language, source, stdin }) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/code/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, language, source, stdin }),
  });
}

export function submitCode(attemptId, { questionId, language, source }) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/code/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, language, source }),
  });
}

export function saveCodeDraft(attemptId, { questionId, language, source }) {
  return apiRequest(`/attempts/${encodeURIComponent(attemptId)}/code/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, language, source }),
  });
}
