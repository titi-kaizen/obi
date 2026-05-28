import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/sidebar'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'OGAS — O&G Argentina Scraper',
  description: 'O&G Argentina Scraper — Inteligencia para el sector Oil & Gas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full`}>
      <body className="flex h-full bg-[#F5F7FA] text-[#111827] antialiased">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-[#F5F7FA]">{children}</main>
      </body>
    </html>
  )
}
