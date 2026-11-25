import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Upload from './pages/Upload.jsx';
import Instructions from './pages/Instructions.jsx';
import Exam from './pages/Exam.jsx';
import Results from './pages/Results.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Syllabus from './pages/Syllabus.jsx';

export function AppRoutes() {
  return (
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
