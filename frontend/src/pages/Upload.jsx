import { useNavigate } from 'react-router-dom';
import PaperUploader from '../components/PaperUploader.jsx';

export default function Upload() {
  const navigate = useNavigate();

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">Upload Question Paper</h1>
          <p className="site-subtitle">
            Validate, verify, and encrypt 1 to 3 <code>.petdraft</code> files or a <code>.pet</code>{' '}
            package
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </header>

      <main className="panel">
        <PaperUploader
          onGoInstructions={(paperId) => navigate(`/instructions/${encodeURIComponent(paperId)}`)}
        />
      </main>
    </div>
  );
}
