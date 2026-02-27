import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { DevModeProvider } from './contexts/DevModeContext.jsx'
import App from './App.jsx'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DevModeProvider>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/room/:code" element={<App />} />
          </Routes>
        </DevModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
