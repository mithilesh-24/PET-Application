import { useNavigate } from 'react-router-dom';

const APTITUDE_TOPICS = [
  'Numbers',
  'HCF and LCM',
  'Percentage and Average',
  'Ratio and Proportion',
  'Profit and Loss',
  'Time and Work',
  'Work and Wages',
  'Time and Distance',
  'Alligation and Mixture',
  'Simple Interest',
  'Compound Interest',
  'Data Interpretation (small tabular datasets)',
  'Data Sufficiency',
  'Permutations and Combinations',
  'Mensuration I (Area and Perimeter)',
];

const REASONING_TOPICS = [
  'Series (2 questions)',
  'Coding-Decoding (2 questions)',
  'Blood Relations (2 questions)',
  'Arrangement Based (3 questions)',
  'Cubes and Dice (2 questions)',
  'Clocks and Calendar (2 questions)',
  'Syllogism (2 questions)',
];

const VERBAL_TOPICS = [
  'Synonyms',
  'Antonyms',
  'Para Jumbles',
  'Adjectives',
  'Verbal Analogies',
  'Ordering of Sentences',
  'Idioms and Phrases',
  'Spotting Errors',
  'Sentence Correction',
  'One Word Substitutes',
];

const CORE_SUBJECTS = [
  {
    code: 'CC01',
    name: 'Data Structures and Algorithms',
    distribution: '2 × 1-mark conceptual + 2 × 2-mark HOT = 6 marks',
  },
  {
    code: 'CC02',
    name: 'Programming and OOPS (Java)',
    distribution: '2 × 1-mark conceptual + 2 × 2-mark HOT = 6 marks',
  },
  {
    code: 'CC03',
    name: 'Database Management Systems',
    distribution: '2 × 1-mark conceptual + 2 × 2-mark HOT = 6 marks',
  },
  {
    code: 'CC04',
    name: 'Operating Systems',
    distribution: '2 × 1-mark conceptual + 2 × 2-mark HOT = 6 marks',
  },
  {
    code: 'CC05',
    name: 'Computer Networks',
    distribution: '2 × 1-mark conceptual + 2 × 2-mark HOT = 6 marks',
  },
];

const SNIPPET_TOPICS = [
  'Nested loops and complexity analysis',
  'Recursion and stack frames',
  'Pointer manipulation and dynamic memory (C / C++)',
  'Arrays, strings, and boundary conditions',
  'Variable scope and storage lifetime',
  'Java inheritance, polymorphism, and exception handling',
  'Python object behaviour, mutability, and slicing',
  'Operator precedence and short-circuit evaluation',
];

export default function Syllabus() {
  const navigate = useNavigate();

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">PET Syllabus</h1>
          <p className="site-subtitle">
            Kongu Engineering College — Placement Eligibility Test (CSE Software Only)
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </header>

      <section className="stat-strip" aria-label="PET exam pattern">
        <div className="stat-item">
          <span className="stat-value">3</span>
          <span className="stat-label">Sections</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">67</span>
          <span className="stat-label">Questions</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">100</span>
          <span className="stat-label">Total Marks</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">150</span>
          <span className="stat-label">Minutes (50 × 3)</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">4</span>
          <span className="stat-label">Languages</span>
        </div>
      </section>

      <main className="home-grid">
        <section className="panel">
          <h2>Section 1 — Aptitude, Reasoning &amp; Verbal (50 min · 40 Qs · 40 Marks)</h2>
          <p className="muted-text">All 40 questions are 1-mark multiple-choice questions.</p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 20,
              marginTop: 12,
            }}
          >
            <div>
              <h3>Aptitude (15 Questions)</h3>
              <p className="muted-text" style={{ fontSize: 13 }}>
                Difficulty: 3 medium, 8 hard, 4 very hard (1 question per topic)
              </p>
              <ol style={{ paddingLeft: 20 }}>
                {APTITUDE_TOPICS.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ol>
            </div>

            <div>
              <h3>Logical Reasoning (15 Questions)</h3>
              <p className="muted-text" style={{ fontSize: 13 }}>
                Difficulty: 3 medium, 8 hard, 4 very hard
              </p>
              <ol style={{ paddingLeft: 20 }}>
                {REASONING_TOPICS.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ol>
            </div>

            <div>
              <h3>Verbal Ability (10 Questions)</h3>
              <p className="muted-text" style={{ fontSize: 13 }}>
                Difficulty: 3 medium, 5 hard, 2 very hard (1 question per topic)
              </p>
              <ol style={{ paddingLeft: 20 }}>
                {VERBAL_TOPICS.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Section 2 — Software Core &amp; Code Snippets (50 min · 25 Qs · 40 Marks)</h2>

          <h3>Department Core MCQs (20 Questions · 30 Marks)</h3>
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject</th>
                <th>Pattern &amp; Marks</th>
              </tr>
            </thead>
            <tbody>
              {CORE_SUBJECTS.map((sub) => (
                <tr key={sub.code}>
                  <td>
                    <code>{sub.code}</code>
                  </td>
                  <td>{sub.name}</td>
                  <td>{sub.distribution}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Code-Snippet Trace MCQs (5 Questions · 2 Marks Each = 10 Marks)</h3>
          <p className="muted-text" style={{ fontSize: 13 }}>
            Set across C, C++, Java, and Python 3 (at least one in each language):
          </p>
          <ul style={{ paddingLeft: 20 }}>
            {SNIPPET_TOPICS.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Section 2a — Coding Assessment (50 min · 2 Problems · 20 Marks)</h2>
          <p>
            Two algorithmic programming problems worth <strong>10 marks each</strong>, solved in{' '}
            <strong>C (gcc)</strong>, <strong>C++ (g++)</strong>, <strong>Java (JDK)</strong>, or{' '}
            <strong>Python 3</strong> inside the isolated OS-native sandbox:
          </p>
          <ul style={{ paddingLeft: 20 }}>
            <li>
              <strong>Problem 1 (Medium · 10 Marks)</strong> &amp;{' '}
              <strong>Problem 2 (Hard · 10 Marks)</strong>
            </li>
            <li>
              <strong>Mandatory Tree / Graph Problem:</strong> At least one problem (typically Hard)
              focuses on advanced trees or graphs — e.g., LCA with queries, tree diameter / tree DP,
              shortest paths (Dijkstra / Bellman-Ford), topological sort &amp; cycle detection, DSU,
              MST, SCC, bridges / articulation points, or graph DP.
            </li>
            <li>
              <strong>Second Algorithmic Domain:</strong> Dynamic programming, greedy algorithms,
              strings and hashing, monotonic stacks, heaps / priority queues, binary search on the
              answer, or advanced array techniques.
            </li>
            <li>
              <strong>Evaluation:</strong> Graded on 10+ hidden test cases per problem with weighted
              partial marks (strict stdin/stdout comparison, time limit 1–3 s, memory limit 256 MB).
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
