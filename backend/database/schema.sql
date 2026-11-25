CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  key_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  total_marks INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'running', 'completed', 'terminated', 'abandoned')),
  started_at INTEGER,
  ended_at INTEGER,
  violation_limit INTEGER NOT NULL DEFAULT 3,
  termination_reason TEXT,
  current_section TEXT
    CHECK (current_section IS NULL OR current_section IN ('S1', 'S2', 'S2A')),
  current_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS section_state (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('S1', 'S2', 'S2A')),
  started_at INTEGER,
  deadline_at INTEGER,
  submitted_at INTEGER,
  status TEXT NOT NULL DEFAULT 'locked'
    CHECK (status IN ('locked', 'open', 'submitted', 'expired')),
  PRIMARY KEY (attempt_id, section)
);

CREATE TABLE IF NOT EXISTS responses (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('S1', 'S2', 'S2A')),
  selected_index INTEGER
    CHECK (selected_index IS NULL OR (selected_index >= 0 AND selected_index <= 3)),
  time_spent_ms INTEGER NOT NULL DEFAULT 0,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS coding_submissions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('c', 'cpp', 'java', 'python')),
  source TEXT NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  submitted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coding_test_results (
  submission_id TEXT NOT NULL REFERENCES coding_submissions(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'tle', 'rte', 'ce')),
  runtime_ms INTEGER NOT NULL DEFAULT 0,
  memory_kb INTEGER NOT NULL DEFAULT 0,
  marks_awarded REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, test_id)
);

CREATE TABLE IF NOT EXISTS violations (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('tab_hidden', 'fullscreen_exit', 'window_blur', 'devtools', 'copy_paste')),
  at INTEGER NOT NULL,
  section TEXT CHECK (section IS NULL OR section IN ('S1', 'S2', 'S2A')),
  question_id TEXT
);

CREATE TABLE IF NOT EXISTS results (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
  total REAL NOT NULL,
  section1 REAL NOT NULL,
  section2 REAL NOT NULL,
  section2a REAL NOT NULL,
  breakdown_json TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_paper_id ON attempts(paper_id);
CREATE INDEX IF NOT EXISTS idx_responses_attempt_id ON responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_violations_attempt_id ON violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_coding_submissions_attempt_id ON coding_submissions(attempt_id);
