# Aesthetic Harmony SaaS Landing Page Prompt (S19)

## Objective
Design and specify a **conversion-focused Full Landing Page** for a **SaaS product** using the **S19 Aesthetic Harmony** style. Output must be **engineering-ready**: tokens, layout specs, components, responsive behavior, and accessibility.

## Inputs
- **Style:** S19 — Aesthetic Harmony
- **Industry:** SaaS
- **Use:** Full Landing Page

## Assumptions
- Product name placeholder: **[Automatic naming]**
- Core value prop placeholder: **[One-line Value Proposition]**
- Primary CTA: **Start free trial**
- Secondary CTA: **Book a demo**
- Target audience: **B2B teams and developers**
- No real metrics, certifications, or customer logos are claimed; all proof uses placeholders
- Target stack: **React + Next.js (App Router) + TypeScript + Tailwind CSS** using **CSS variables** for theming

---

## Style DNA (S19 – Aesthetic Harmony)

### Style Seeds
- **Palette strategy:** Analogous color harmony with strategic accent. Soft linear gradients create depth while maintaining visual comfort. High contrast ratios (WCAG AA) achieved through sophisticated value shifts rather than harsh color jumps.
- **Typography:** Humanist sans-serif with optical sizing. Refined letter-spacing (-0.025em for headlines) enhances readability. Clear visual hierarchy through weight variations (400-600) and calculated scale ratios (1.250). Line height optimized for scannability (1.625 for body).
- **Radius policy:** Golden ratio-based corner radius (8-16px). Balanced curvature provides perceived affordance without sacrificing perceived precision. Larger radius for interactive elements, smaller for content containers.
- **Shadow policy:** Multi-layered colored shadows following elevation guidelines. Tinted shadows (brand color at 8-15% opacity) create natural depth. Shadow blur radius scales with elevation (8-32px). No harsh black shadows.
- **Border language:** Minimalist borders with strategic emphasis. 1px hairline borders for structure, 2px for interactive states. Gradient borders on CTAs draw attention without overwhelming.
- **Patterns/textures:** Subtle noise textures (2% opacity) for depth. Micro-patterns in backgrounds create visual interest without cognitive load. Gradient overlays follow 45-degree angles for natural eye movement.
- **Motion:** Cognitive-load-aware micro-interactions. 200ms entry, 300ms exit timing follows human perception. Custom easing curves (cubic-bezier(0.25, 0.46, 0.45, 0.94)) for natural feel. Hover states provide immediate feedback (100ms).

Tone: confident, precise, non-hype.

---

```yaml
tokens:
  meta:
    style_id: "S19"
    style_name: "Aesthetic Harmony"
    industry: "SaaS"
    use_case: "Full Landing Page"
  color:
    bg:
      primary: "#FFFFFF"
      secondary: "#F8FAFC"
      gradient: "linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)"
    text:
      primary: "#1E293B"
      secondary: "#475569"
      muted: "#94A3B8"
    brand:
      primary: "#6366F1"
      secondary: "#8B5CF6"
      accent: "#EC4899"
    border:
      strong: "#E2E8F0"
      subtle: "#F1F5F9"
      gradient: "linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)"
    state:
      success: "#10B981"
      warning: "#F59E0B"
      error: "#EF4444"
    focus:
      ring: "#6366F1"
    gradient:
      primary: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)"
      secondary: "linear-gradient(135deg, #EC4899 0%, #F43F5E 100%)"
      subtle: "linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)"
  radius:
    none: 0
    sm: 8
    md: 12
    lg: 16
    xl: 20
    pill: 9999
  border:
    width:
      hairline: 1
      medium: 2
      strong: 3
  shadow:
    sm: "0 2px 8px rgba(99,102,241,0.08), 0 1px 3px rgba(0,0,0,0.05)"
    md: "0 4px 16px rgba(99,102,241,0.12), 0 2px 6px rgba(0,0,0,0.08)"
    lg: "0 8px 32px rgba(99,102,241,0.15), 0 4px 12px rgba(0,0,0,0.1)"
    colored: "0 4px 16px rgba(99,102,241,0.2)"
    hover: "0 8px 24px rgba(99,102,241,0.25)"
  layout:
    container:
      content: 1140
      wide: 1320
    grid:
      desktop: 12
      tablet: 8
      mobile: 4
    gutter:
      mobile: 20
      desktop: 28
  motion:
    duration:
      fast: 200
      normal: 300
      slow: 400
    easing: "cubic-bezier(0.4, 0, 0.2, 1)"
    hover: "cubic-bezier(0.25, 0.46, 0.45, 0.94)"
  typography:
    font:
      sans:
        primary: "Inter"
        fallback:
          - "SF Pro Display"
          - "system-ui"
          - "-apple-system"
          - "Segoe UI"
      mono:
        primary: "JetBrains Mono"
        fallback:
          - "SF Mono"
          - "ui-monospace"
          - "SFMono-Regular"
    scale:
      h1: { size: 56, line: 64, weight: 600, tracking: -0.025 }
      h2: { size: 40, line: 48, weight: 600, tracking: -0.015 }
      h3: { size: 28, line: 36, weight: 600, tracking: -0.01 }
      h4: { size: 20, line: 28, weight: 500, tracking: -0.005 }
      body: { size: 16, line: 26, weight: 400, tracking: 0 }
      small: { size: 14, line: 22, weight: 400, tracking: 0 }
    measure:
      hero_max: "48ch"
      body_max: "72ch"
  spacing:
    base: 8
    section_py:
      mobile: [80, 96]
      desktop: [128, 144]
```

---

## Deliverables
- Full hero section with high-impact product visualization
- Multi-column features grid with icon/illustration slots
- Social proof/customer logo strip (using placeholders)
- Pricing table with monthly/annual toggle
- FAQ accordion system
- Final conversion CTA module
- Responsive footer with site map

---

## Accessibility & Responsive
- WCAG AA contrast
- Visible focus rings
- Reduced motion support
- Touch targets ≥ 44px
- Mobile-first layout

---

## Engineering Notes
- CSS variables for all tokens
- Tailwind config mapping tokens
- Use semantic HTML5 elements
- Implement responsive design with mobile-first approach
- Ensure all interactive elements are keyboard accessible
- Include loading states and error handling

---

## Acceptance Checklist
- Clear hierarchy and visual discipline
- Primary CTA visible above the fold
- No fake metrics or certifications
- Trust modules included
- Fully responsive
- Accessible by keyboard

---

## Do / Don't

**Do**
- Use analogous color harmonies
- Create subtle gradients
- Apply golden ratio proportions
- Use refined typography

**Don't**
- Don't use harsh contrasts
- Don't ignore visual hierarchy
- Don't overcomplicate animations
- Don't break the harmony