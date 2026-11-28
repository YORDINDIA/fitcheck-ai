import { Outlet } from 'react-router-dom'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import { CrayonFilters } from '../components/crayon/CrayonFilters'

export default function PublicLayout() {
  return (
    <div className="cp flex min-h-svh flex-col">
      <CrayonFilters />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
