const API_BASE = '/api';

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const errInfo = data?.error || {
      code: 'REQUEST_FAILED',
      message: `Request failed with status ${response.status}`,
    };
    const error = new Error(errInfo.message);
    error.code = errInfo.code;
    error.details = errInfo.details;
    error.status = response.status;
    throw error;
  }

  return data;
}
