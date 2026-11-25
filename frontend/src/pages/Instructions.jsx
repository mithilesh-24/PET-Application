import { useParams } from 'react-router-dom';

export default function Instructions() {
  const { paperId } = useParams();
  return (
    <main className="placeholder-page">
      <h1>Exam Instructions</h1>
      <p>Paper: {paperId}</p>
    </main>
  );
}
