import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CatalogPage } from "./pages/CatalogPage";
import { CardDetailPage } from "./pages/CardDetailPage";
import { CollectionPage } from "./pages/CollectionPage";
import { SetCompletionPage } from "./pages/SetCompletionPage";
import { ScanPage } from "./pages/ScanPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="cards/:id" element={<CardDetailPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="sets" element={<SetCompletionPage />} />
        <Route path="scan" element={<ScanPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
