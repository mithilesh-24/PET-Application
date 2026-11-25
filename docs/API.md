# API Reference

All endpoints are mounted under `/api` on Express (`http://localhost:4000`, proxied via `/api` from Vite in dev).

## Standard Error Format & Roles

- **Required Role:** None (single-user local app; no authentication headers).
- **Error Envelope:** Every error uses HTTP `4xx`/`5xx` JSON:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable explanation",
    "details": {}
  }
}
```

Common error codes: `VALIDATION_FAILED` (`400`/`413`), `VALIDATION_ERROR` (`400` in history/compare/export), `NOT_FOUND` (`403` during active attempt review/result or `404`), `PAPER_INVALID` (`400`/`409`), `PAPER_CORRUPT` (`400`), `PAPER_VERSION_UNSUPPORTED` (`400`), `ATTEMPT_TERMINATED` (`403`), `BACKWARD_NAVIGATION_FORBIDDEN` (`403`), `SECTION_LOCKED` (`400`/`403`/`409`), `SECTION_EXPIRED` (`400`), `RESPONSE_REQUIRED` (`400`), `CONCURRENT_NAVIGATION` (`409`), `RATE_LIMITED` (`429`), `SANDBOX_UNAVAILABLE` (`503`), `INTERNAL_ERROR` (`500`).

---

## Health, Diagnostics & Settings

| Method | Path | Request | Response (`200`) |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | `{ "ok": true, "version": "0.1.0" }` |
| `GET` | `/api/health/diagnostics` | — | `{ ok, version, platform, ready, sandboxReady, sandboxStatus, sandboxMode, sandboxDriver, sandboxDetails, tools: [...] }` |
| `GET` | `/api/settings/compilers` | — | `{ platform, ready, sandboxReady, sandboxStatus, sandboxMode, sandboxDriver, sandboxDetails, tools: [{ tool, available, version, path, installHint }] }` |
| `GET` | `/api/settings` | — | `{ "violationLimit": 3, "dataDir": "..." }` |
| `POST` | `/api/settings` | `{ "violationLimit": 3 \| 5 }` | `{ "saved": true, "violationLimit": 3, "dataDir": "..." }` |
| `POST` | `/api/settings/backup` | `{}` (strict empty) | `{ "backedUp": true, "backupPath": "...", "sizeBytes": 147456, "createdAt": 1700000000000 }` |
| `POST` | `/api/settings/rebuild-runner` | `{}` (strict empty) | `{ "rebuilt": true, "output": "...", "compilers": { ... } }` |

**Example `GET /api/health/diagnostics`:**
```json
{
  "ok": true,
  "version": "0.1.0",
  "platform": "win32",
  "ready": true,
  "sandboxReady": true,
  "sandboxStatus": "ready",
  "sandboxMode": "appcontainer-job",
  "sandboxDriver": "windows-appcontainer",
  "sandboxDetails": "Windows AppContainer (zero network capabilities, isolated workspace ACLs) + Win32 Job Object...",
  "tools": [
    { "tool": "gcc", "available": true, "version": "gcc ...", "path": "C:\\MinGW\\bin\\gcc.exe", "installHint": null },
    { "tool": "sandbox", "available": true, "version": "appcontainer-job", "path": "...\\PetSandboxLauncher.exe", "installHint": null }
  ]
}
```

---

## Question Papers

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/papers/import` | Multipart `files` (1–3 `.petdraft` or 1 `.pet`, max 10 MB/file, 25 MB total) | `201`: `{ paper: { id, paperId, title, questionCount, totalMarks, createdAt, verifiedAt }, summary: { counts, totalMarks, treeOrGraphSatisfied, warnings } }` |
| `GET` | `/api/papers` | — | `200`: `{ papers: [...] }` |
| `GET` | `/api/papers/:id` | Safe ID param (`id` or `paperId`) | `200`: `{ paper: { ... } }` (`404 NOT_FOUND`) |
| `DELETE` | `/api/papers/:id` | Safe ID param | `200`: `{ deleted: true, id, paperId }` (deletes DB row + `.pet` file) |

---

## Exam Lifecycle & Code Execution

All `/attempts/:id/*` routes validate `:id` against path traversal via Zod (`safeIdParamSchema`).

| Method | Path | Request Body | Response (`200`/`201`) | Key Errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/attempts` | `{ paperId, violationLimit?: 3\|5 }` | `201`: `{ attempt: { id, paperId, paperDbId, paperTitle, status, violationLimit } }` | `404 NOT_FOUND`, `400 VALIDATION_FAILED` |
| `GET` | `/api/attempts/:id/state` | — | `{ attemptId, paperId, paperTitle, status, phase, violationLimit, violationCount, terminationReason, currentSection, currentIndex, totalInSection, answeredCount, unansweredCount, nextSection, lastSubmittedSection, transitionDeadlineAt, transitionSecondsRemaining, deadlineAt, secondsRemaining, serverNow, sectionStates }` | `404 NOT_FOUND` |
| `POST` | `/api/attempts/:id/start-section` | `{ section?: 'S1'\|'S2'\|'S2A' }` | Returns updated `state` | `403`/`409 SECTION_LOCKED`, `403 ATTEMPT_TERMINATED` |
| `GET` | `/api/attempts/:id/question` | — | `{ attemptId, section, index, questionNumber, totalInSection, question, savedResponse, codingDraft, answeredCount, unansweredCount, deadlineAt, secondsRemaining, serverNow }` *(no keys/tests)* | `409 SECTION_LOCKED`, `403 ATTEMPT_TERMINATED` |
| `POST` | `/api/attempts/:id/answer` | `{ questionId, selectedIndex: 0..3 \| null, timeSpentMs? }` | `{ saved: true, questionId, selectedIndex, savedAt, serverNow }` | `403 BACKWARD_NAVIGATION_FORBIDDEN`, `400 SECTION_EXPIRED` |
| `POST` | `/api/attempts/:id/next` | `{ unanswered?: boolean, questionId? }` | Next question payload | `400 RESPONSE_REQUIRED`, `403 BACKWARD_NAVIGATION_FORBIDDEN`, `409 CONCURRENT_NAVIGATION` |
| `POST` | `/api/attempts/:id/submit-section` | `{}` | `{ submittedSection, status, submittedAt, nextSection, completed, totalInSection, answeredCount, unansweredCount, transitionDeadlineAt, state }` | `400 SECTION_LOCKED` |
| `POST` | `/api/attempts/:id/violation` | `{ type, section?, questionId? }` | `{ deduplicated, count, limit, remaining, terminated, terminationReason? }` | `403 ATTEMPT_TERMINATED` |
| `POST` | `/api/attempts/:id/terminate` | `{ reason? }` | `{ terminated: true, state }` | `404 NOT_FOUND` |
| `POST` | `/api/attempts/:id/code/run` | `{ questionId, language, source, stdin? }` | `{ compile: { ok, stderr, ms }, status: 'ok'\|'ce'\|'tle'\|'rte'\|'mle', stdout, stderr, exitCode, ms, memoryKb }` | `429 RATE_LIMITED` (3s cooldown + 60/min), `503 SANDBOX_UNAVAILABLE` |
| `POST` | `/api/attempts/:id/code/submit` | `{ questionId, language, source }` | `{ submissionId, questionId, language, compile, totalTests, passedCount, marksObtained, totalMarks, runtimeMs, samples: [{ index, id, label, kind, passed, status, runtimeMs, memoryKb, input, sampleExpected, actualOutput }], tests: [{ index, id, label, kind, passed, status, runtimeMs, memoryKb, marksAwarded, maxMarks }] }` | `429 RATE_LIMITED`, `503 SANDBOX_UNAVAILABLE`, `403 BACKWARD_NAVIGATION_FORBIDDEN` |
| `POST` | `/api/attempts/:id/code/draft` | `{ questionId, language, source }` | `{ saved: true, questionId, language, savedAt }` | `429 RATE_LIMITED`, `400 SECTION_EXPIRED` |

---

## Results, History, Analytics & Export

| Method | Path | Request / Query | Response (`200`) | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/attempts/:id/result` | Safe `:id` | `{ attemptId, paperId, paperTitle, status, terminated, terminationReason, startedAt, endedAt, computedAt, total, section1, section2, section2a, breakdown }` | `403 NOT_FOUND` while running |
| `GET` | `/api/attempts/:id/review` | Safe `:id` | `{ attemptId, paperId, paperTitle, status, items: [...] }` | `403 NOT_FOUND` while running; includes `answerIndex` & `referenceSolution` after completion |
| `GET` | `/api/history` | — | `{ attempts: [{ attemptId, paperDbId, paperId, paperTitle, status, terminationReason, startedAt, endedAt, date, durationMs, total, section1, section2, section2a, hasResult }] }` | Ended & abandoned attempts |
| `GET` | `/api/history/analytics` | — | `{ totalAttempts, topics: [{ topic, attempted, correct, attemptsCount, enoughData, accuracyPercent, statusText }], recommendations }` | `enoughData` requires `attempted >= 3` |
| `GET` | `/api/history/compare` | `?ids=id1,id2[,id3,id4]` | `{ attempts: [...] }` | Requires 2–4 unique ended attempts (`400 VALIDATION_ERROR`) |
| `GET` | `/api/attempts/:id/export` | `?format=json\|csv` | Attachment download (sanitized scores + 67 responses, **zero** answer keys/hidden expected outputs) | `403 NOT_FOUND` while running |
| `DELETE` | `/api/attempts/:id` | Safe `:id` | `{ deleted: true, id }` | Cascade deletes attempt rows; retains paper |
