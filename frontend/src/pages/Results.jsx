import { useParams } from 'react-router-dom';

export default function Results() {
  const { attemptId } = useParams();
  return (
    <main className="placeholder-page">
      <h1>Exam Results</h1>
      <p>Attempt: {attemptId}</p>
    </main>
  );
}
