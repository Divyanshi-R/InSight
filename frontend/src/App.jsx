import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import DashboardPage from './pages/DashboardPage'
import InterviewPage from './pages/InterviewPage'
import InterviewSetupPage from './pages/InterviewSetupPage'
import JobProfilesPage from './pages/JobProfilesPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ReportsHistoryPage from './pages/ReportsHistoryPage'
import SessionReportPage from './pages/SessionReportPage'
import './App.css'

function ProtectedRoute({ children }) {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return <main className="screen-loader">Restoring your session...</main>
  }

  return user ? children : <Navigate to="/login" replace />
}

function GuestRoute({ children }) {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return <main className="screen-loader">Restoring your session...</main>
  }

  return user ? <Navigate to="/dashboard" replace /> : children
}

function App() {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return <main className="screen-loader">Restoring your session...</main>
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/job-profiles"
        element={
          <ProtectedRoute>
            <JobProfilesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/job-profiles/:jobProfileId"
        element={
          <ProtectedRoute>
            <JobProfilesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview/new"
        element={
          <ProtectedRoute>
            <InterviewSetupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview/setup"
        element={
          <ProtectedRoute>
            <InterviewSetupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview/:sessionId"
        element={
          <ProtectedRoute>
            <InterviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/interview/:sessionId/report"
        element={
          <ProtectedRoute>
            <SessionReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
