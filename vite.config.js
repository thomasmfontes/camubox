import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      includeAssets: ['lockers.png', 'my-locker.png'],
      manifest: {
        name: 'CAMUBOX - Armários Escolares',
        short_name: 'CAMUBOX',
        description: 'Sistema de gestão de armários para instituições de ensino',
        theme_color: '#003d2b',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/my-locker.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/my-locker.png',
            sizes: '500x500',
            type: 'image/png'
          },
          {
            src: '/my-locker.png',
            sizes: '500x500',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
