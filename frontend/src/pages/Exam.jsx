import { useParams } from 'react-router-dom';

export default function Exam() {
  const { attemptId } = useParams();
  return (
    <main className="placeholder-page">
      <h1>Examination</h1>
      <p>Attempt: {attemptId}</p>
    </main>
  );
}
