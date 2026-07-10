import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import AnalysisPage from './pages/AnalysisPage';
import HistoryPage from './pages/HistoryPage';
import GrowthPage from './pages/GrowthPage';
import MaterialsPage from './pages/MaterialsPage';
import StylesPage from './pages/StylesPage';
import FusePage from './pages/FusePage';
import EmotionPage from './pages/EmotionPage';

function App() {
  return (
    <div className="min-h-screen bg-rice-200">
      <Header />
      <main className="pb-20">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyze" element={<AnalysisPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/styles" element={<StylesPage />} />
          <Route path="/fuse" element={<FusePage />} />
          <Route path="/emotion" element={<EmotionPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/growth" element={<GrowthPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
