import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Instructions from './pages/Instructions.jsx';
import Exam from './pages/Exam.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Syllabus from './pages/Syllabus.jsx';

const Results = lazy(() => import('./pages/Results.jsx'));

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="academic-shell muted-text">Loading page...</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/instructions/:paperId" element={<Instructions />} />
        <Route path="/exam/:attemptId" element={<Exam />} />
        <Route path="/results/:attemptId" element={<Results />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/syllabus" element={<Syllabus />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
