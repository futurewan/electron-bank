/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            // S19 Aesthetic Harmony 配色方案
            colors: {
                // 背景色
                bg: {
                    primary: '#FFFFFF',
                    secondary: '#F8FAFC',
                },
                // 文本色
                text: {
                    primary: '#1E293B',
                    secondary: '#475569',
                    muted: '#94A3B8',
                },
                // 品牌色
                brand: {
                    primary: '#6366F1',
                    secondary: '#8B5CF6',
                    accent: '#EC4899',
                },
                // 边框色
                border: {
                    strong: '#E2E8F0',
                    subtle: '#F1F5F9',
                },
                // 状态色
                state: {
                    success: '#10B981',
                    warning: '#F59E0B',
                    error: '#EF4444',
                },
            },
            // 圆角 - 基于黄金比例
            borderRadius: {
                'sm': '8px',
                'md': '12px',
                'lg': '16px',
                'xl': '20px',
                'pill': '9999px',
            },
            // 阴影 - 带品牌色调
            boxShadow: {
                'sm': '0 2px 8px rgba(99,102,241,0.08), 0 1px 3px rgba(0,0,0,0.05)',
                'md': '0 4px 16px rgba(99,102,241,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                'lg': '0 8px 32px rgba(99,102,241,0.15), 0 4px 12px rgba(0,0,0,0.1)',
                'colored': '0 4px 16px rgba(99,102,241,0.2)',
                'hover': '0 8px 24px rgba(99,102,241,0.25)',
            },
            // 字体家族
            fontFamily: {
                sans: ['Inter', 'SF Pro Display', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
                mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
            },
            // 字体大小
            fontSize: {
                'h1': ['56px', { lineHeight: '64px', fontWeight: '600', letterSpacing: '-0.025em' }],
                'h2': ['40px', { lineHeight: '48px', fontWeight: '600', letterSpacing: '-0.015em' }],
                'h3': ['28px', { lineHeight: '36px', fontWeight: '600', letterSpacing: '-0.01em' }],
                'h4': ['20px', { lineHeight: '28px', fontWeight: '500', letterSpacing: '-0.005em' }],
                'body': ['16px', { lineHeight: '26px', fontWeight: '400', letterSpacing: '0' }],
                'small': ['14px', { lineHeight: '22px', fontWeight: '400', letterSpacing: '0' }],
            },
            // 布局
            maxWidth: {
                'content': '1140px',
                'wide': '1320px',
            },
            // 动画时长
            transitionDuration: {
                'fast': '200ms',
                'normal': '300ms',
                'slow': '400ms',
            },
            // 动画缓动
            transitionTimingFunction: {
                'default': 'cubic-bezier(0.4, 0, 0.2, 1)',
                'hover': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            },
            // 间距基准
            spacing: {
                '18': '72px',
                '22': '88px',
                '26': '104px',
                '30': '120px',
                '34': '136px',
            },
        },
    },
    plugins: [],
    // 避免与 Ant Design 冲突
    corePlugins: {
        preflight: false,
    },
}
