import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import SectorList from '@/pages/SectorList'
import SectorDetail from '@/pages/SectorDetail'
import StockList from '@/pages/StockList'
import StockDetail from '@/pages/StockDetail'
import RiskCalendar from '@/pages/RiskCalendar'
import CapitalTracking from '@/pages/CapitalTracking'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="sectors" element={<SectorList />} />
        <Route path="sectors/:id" element={<SectorDetail />} />
        <Route path="stocks" element={<StockList />} />
        <Route path="stocks/:id" element={<StockDetail />} />
        <Route path="calendar" element={<RiskCalendar />} />
        <Route path="capital" element={<CapitalTracking />} />
      </Route>
    </Routes>
  )
}
