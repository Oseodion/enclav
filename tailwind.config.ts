import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        geist: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        bg: '#000000',
        bg1: '#08060F',
        bg2: '#0F0C1A',
        bg3: '#161224',
        purple: {
          DEFAULT: '#7C3AED',
          bright: '#A78BFA',
          dim: 'rgba(139,92,246,0.15)',
        },
        pink: '#EC4899',
        teal: {
          DEFAULT: '#10B981',
          light: '#6EE7B7',
        },
        amber: '#F59E0B',
        text: {
          1: '#F0EEF8',
          2: '#9B99B0',
          3: '#3D3B52',
        },
      },
      backgroundImage: {
        'purple-pink': 'linear-gradient(135deg, #A78BFA 0%, #EC4899 50%, #7C3AED 100%)',
        'glass-top': 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.25) 50%, transparent 95%)',
      },
      backdropBlur: {
        xs: '4px',
        glass: '20px',
        heavy: '30px',
      },
      animation: {
        pulse: 'pulse 2.5s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        spin: 'spin 10s linear infinite',
        'spin-slow': 'spin 16s linear infinite',
        'spin-orb-outer': 'spin 12s linear infinite',
        'spin-orb-mid': 'spin 18s linear infinite reverse',
        breathe: 'breathe 5s ease-in-out infinite',
        'breathe-orb': 'breathe-orb 5s ease-in-out infinite',
        drift: 'drift 14s ease-in-out infinite',
        'drift-slow': 'drift 18s ease-in-out infinite reverse',
        'drift-delayed': 'drift 20s ease-in-out infinite 5s',
        shimmer: 'shimmer 3s linear infinite',
        float: 'float 5s ease-in-out infinite',
        'fade-up': 'fade-up 0.8s ease both',
        'fade-up-d1': 'fade-up 0.8s ease 0.1s both',
        'fade-up-d2': 'fade-up 0.8s ease 0.2s both',
        'fade-up-d3': 'fade-up 0.8s ease 0.3s both',
        'fade-up-d4': 'fade-up 0.8s ease 0.4s both',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
        'breathe-orb': {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow:
              '0 0 50px rgba(139,92,246,0.5), 0 0 100px rgba(139,92,246,0.2), inset 0 0 30px rgba(255,255,255,0.08)',
          },
          '50%': {
            transform: 'scale(1.04)',
            boxShadow:
              '0 0 70px rgba(139,92,246,0.6), 0 0 140px rgba(139,92,246,0.25), inset 0 0 30px rgba(255,255,255,0.08)',
          },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(30px, -20px)' },
          '66%': { transform: 'translate(-15px, 25px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0%' },
          '100%': { backgroundPosition: '200%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      borderRadius: {
        glass: '14px',
      },
    },
  },
  plugins: [],
}

export default config
