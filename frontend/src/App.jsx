import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
