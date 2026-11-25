# User Guide

PET Prep has no separate login accounts; both question-paper management (instructor/organizer workflow) and mock exam delivery (student workflow) operate through the local web UI.

## Creating & Importing an Exam Paper (Organizer / Student Prep)

1. Open the Home page (`/`).
2. Click **Copy AI Question Generation Prompt** (or **Show Prompt Preview** / **Download as .txt** if clipboard access is blocked).
3. Paste the prompt into an external AI assistant (ChatGPT, Gemini, or Claude) to generate **Part A** (Section 1: 40 MCQs). Save the output as `PET-<paperId>-partA.petdraft`.
4. Send `next` for **Part B** (Section 2: 20 CS MCQs + 5 Code Snippets) and save as `-partB.petdraft`.
5. Send `next` for **Part C** (Section 2a: 2 Coding Problems with reference solutions and 10+ hidden tests) and save as `-partC.petdraft`. *(Single `part: "full"` `.petdraft` files and exported `.pet` packages are also supported.)*
6. Click **Upload Question Paper** (or navigate to `/upload`), drop/select the 1–3 files, and click **Upload & Verify Paper**.
   - The backend validates the 67-question schema (`questionValidator.js`), runs `referenceSolution` in the OS sandbox against all samples and hidden tests (`codingVerifier.js`), fills `"AUTO"` expected outputs, encrypts the paper with AES-256-GCM to `question-banks/encrypted/<paperId>.pet`, and adds it to the **Imported Question Papers** table.

---

## Taking an Exam (Student Workflow)

1. On `/` (under **Imported Question Papers**), click **Start Exam** next to a paper to open `/instructions/:paperId`.
2. Review the 150-minute exam pattern and browser-monitoring notice, select the violation limit (`3` or `5` warnings), check the acknowledgement box, and click **Start Exam**.
3. On the **Start-of-Examination Gate** (`/exam/:attemptId`), check the fullscreen agreement box and click **Enter Fullscreen & Start Section 1**.
4. **Section 1 (50 min, 40 MCQs) & Section 2 (50 min, 25 MCQs/Snippets):**
   - Select an option (click or press keys `1`–`4`). Answers autosave immediately (`Saved` indicator).
   - Click **Save and Next** (or press `Enter`) to advance. Navigation is **forward-only** (`Previous` is disabled; question numbers are display-only).
   - Skipping an unanswered question prompts **Proceed Without Answering?** (`Skip & Continue`).
   - On the final question of a section, click **Save and Submit Section** → **Confirm Submit Section**.
   - Between sections, the transition screen displays a 60-second auto-start countdown; click **Start Section 2** / **Start Section 2a** to begin immediately.
5. **Section 2a (50 min, 2 Coding Problems):**
   - Choose C, C++, Java, or Python 3 in the language selector (autocomplete/clues are disabled in Monaco Editor). Code drafts autosave per language (`Save Draft` or automatic timer sync).
   - Use **Custom Input** + **Run Code** (`Ctrl+Enter`, 3-second cooldown) to test stdout/stderr/runtime.
   - Click **Submit Code** to grade against sample cases (full I/O shown) and hidden test cases (pass/fail, runtime, memory, and marks shown without hidden test contents). If time expires, the latest saved draft is automatically graded.
   - Advance from problem 1 to problem 2 via **Save and Next**, then **Save and Submit Section**.
6. **Violation Monitoring:** Exiting fullscreen, switching tabs, losing window focus, pressing DevTools shortcuts, or copying/pasting in restricted question regions logs a warning (1s per-type dedup). Exceeding the configured limit (`> 3` or `> 5`) immediately terminates and locks the attempt (`terminated`), scoring submitted work only.

---

## Viewing Results, History & Exports

1. After finishing or terminating, click **View Results & Review** to open `/results/:attemptId`:
   - **Score Dashboard:** Overall `/ 100` score, accuracy counts, section timing/marks, Aptitude/Reasoning/Verbal breakdown, `CC01`–`CC05` & Snippet breakdown, Section 2a hidden-test breakdown, and violation log.
   - **Review Answers & Explanations:** Available only after attempt completion/termination; filter by section (`ALL`, `S1`, `S2`, `S2A`) or outcome (`correct`, `incorrect`, `unanswered`), inspect correct options, reference solutions, and explanations.
2. Open **Past Tests** (`/history`) or the **Recent Past Tests** panel on Home (`/`):
   - **Compare Attempts:** Select `2`–`4` completed/terminated attempts and click **Compare Attempts** to view a side-by-side metric table and inline SVG total-score trend chart.
   - **Weak-Topic Analytics:** Ranks topics with `>= 3` attempted questions by lowest accuracy (topics below 3 show `"not enough data"`) and generates numeric practice recommendations.
   - **Export & Delete:** Download sanitized **JSON** (scores + 67 responses, no paper keys) or **CSV** (one row per question), or delete individual attempt records without deleting the underlying paper.
