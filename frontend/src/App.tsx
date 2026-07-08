import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PageSkeleton } from "./components/Skeleton";

// Route-level code-splitting: each page (and its deps, e.g. recharts) loads on demand.
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CatalogPage = lazy(() =>
  import("./pages/CatalogPage").then((m) => ({ default: m.CatalogPage })),
);
const CardDetailPage = lazy(() =>
  import("./pages/CardDetailPage").then((m) => ({ default: m.CardDetailPage })),
);
const CollectionPage = lazy(() =>
  import("./pages/CollectionPage").then((m) => ({ default: m.CollectionPage })),
);
const SetCompletionPage = lazy(() =>
  import("./pages/SetCompletionPage").then((m) => ({ default: m.SetCompletionPage })),
);
const ScanPage = lazy(() => import("./pages/ScanPage").then((m) => ({ default: m.ScanPage })));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-6">
          <PageSkeleton />
        </div>
      }
    >
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
    </Suspense>
  );
}
