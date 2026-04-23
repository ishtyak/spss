import SavViewer from '@/components/SavViewer'
import LandingPage from './pages/LandingPage'
import { useAuth } from './context/useAuth'

function App() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return <SavViewer />
}

export default App
