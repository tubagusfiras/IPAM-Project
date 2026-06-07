import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Initialize theme - sync dengan monitoring v2
const savedTheme = localStorage.getItem('sdi-theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const isDark = savedTheme ? savedTheme === 'dark' : prefersDark

// Apply ke :root (sesuai CSS variables kita)
if (isDark) document.documentElement.classList.add('dark')
else document.documentElement.classList.remove('dark')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
