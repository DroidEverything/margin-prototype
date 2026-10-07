// Optional theme extension for a future Tailwind migration.
// The current MARGIN prototype uses vanilla CSS + CSS custom properties.
export default {
  theme: {
    extend: {
      colors: {
        'deep-space-black': '#050A14',
        'nasa-blue': '#0B3D91',
        'nasa-blue-hi': '#4B82D7',
        'nasa-red': '#FC3D21',
        'titanium-gray': '#8C96A3',
        nominal: '#65F2A5',
        warning: '#FFB000',
        critical: '#FC3D21',
        'hud-panel': '#0A101B',
        'hud-panel-raised': '#0D1522',
        'hud-line': '#243143',
        'hud-line-strong': '#33445A',
        'hud-text': '#E7ECF2',
        'hud-text-2': '#A6B1BF',
        'hud-text-3': '#667384'
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Consolas', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        'hud-blue': '0 0 26px rgba(11,61,145,.09)',
        'hud-blue-strong': '0 0 32px rgba(11,61,145,.14)'
      },
      letterSpacing: { hud: '0.14em' },
      borderRadius: { hud: '2px' }
    }
  }
};
