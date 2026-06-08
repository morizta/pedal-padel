---
name: Vibrant Matchmaker
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#444933'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#747a60'
  outline-variant: '#c4c9ac'
  surface-tint: '#506600'
  primary: '#506600'
  on-primary: '#ffffff'
  primary-container: '#ccff00'
  on-primary-container: '#5b7300'
  inverse-primary: '#abd600'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#005ac2'
  on-tertiary: '#ffffff'
  tertiary-container: '#e7ecff'
  on-tertiary-container: '#0466d9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
  elo-gold: '#F59E0B'
  elo-silver: '#94A3B8'
  elo-bronze: '#B45309'
  win-green: '#22C55E'
  loss-red: '#EF4444'
  reliability-dimmed: '#64748B'
typography:
  display-elo:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
  inset-card: 20px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 40px
  touch-target: 44px
---

## Brand & Style

The design system is engineered for the competitive spirit of Padel, blending the high-energy aesthetics of sports performance with the functional precision of a data-driven dashboard. It targets an active, community-focused audience that values clarity in rankings and efficiency in match organization.

The style is **Corporate / Modern** with a **High-Contrast** edge. It utilizes generous white space and professional typography to manage high-density data, while injecting "Vibrant Lime" to drive action and signal movement. The aesthetic avoids unnecessary decoration, favoring structural integrity and clear hierarchy to ensure that player stats and tournament progress remain the focal point of the mobile-first experience.

## Colors

The palette is anchored by **Vibrant Lime**, a high-visibility hue synonymous with Padel and Tennis equipment. This is used exclusively for primary actions and "Live" status indicators. 

**Deep Navy** provides a professional, grounding contrast, used for headers, text, and primary containers to ensure readability. 

A sophisticated range of neutrals supports the dashboard's data-dense requirements:
- **Surface:** A crisp, near-white background maintains a clean, "pro-club" atmosphere.
- **Semantic Accents:** Gold, silver, and bronze are reserved strictly for ranking badges (ELO), while success/error states handle match results (W-L-T).

## Typography

The system utilizes a dual-font strategy: **Hanken Grotesk** for headlines and brand-heavy stats to project modern authority, and **Inter** for the UI's backbone to ensure maximum legibility at small sizes.

- **Data Precision:** Monospaced fonts are utilized for specific ELO changes and match scoreboards to ensure numerical alignment in tables.
- **Mobile Adaptation:** Headlines scale down on mobile devices to preserve screen real estate for cards and lists, while body text remains at a comfortable 16px to accommodate outdoor lighting conditions.
- **Visual Weight:** Use heavy weights (700-800) sparingly for player names and ELO scores to establish a clear focal point.

## Layout & Spacing

This design system employs a **Fluid Grid** for mobile views and a **Fixed Max-Width Grid** (1200px) for desktop to prevent data lines from becoming too long.

- **Mobile-First Rhythm:** A base 4px/8px grid system ensures vertical consistency. Card components use a 20px internal padding to provide "breathing room" between dense stats and text.
- **Breakpoints:** 
  - **Mobile (<768px):** Single-column stack. Bottom-fixed primary actions.
  - **Desktop (>1024px):** Two-panel dashboard layout (e.g., Leaderboard on left, Live Match on right).
- **Interactive Density:** All interactive elements maintain a minimum 44px height/width to support reliable touch interaction during active gameplay tracking.

## Elevation & Depth

To maintain a clean, athletic feel, the system uses **Tonal Layers** combined with **Ambient Shadows**.

- **Primary Surface:** The background uses a flat, neutral gray-blue.
- **Cards:** White surfaces with a very subtle, diffused shadow (0px 4px 20px, 4% opacity Navy) to lift them from the background without creating visual clutter.
- **Active State:** The primary action button (Lime) uses a slight 2px border of the same hue at a higher saturation to create a "pressed" tactile feel rather than traditional skeuomorphism.
- **Section Headers:** Use a slightly darker neutral background (Surface-Container) to group related player stats.

## Shapes

The shape language is consistently **Rounded**, reflecting the geometry of the Padel ball and the friendly, social nature of the community.

- **Cards & Containers:** 0.5rem (8px) corner radius for a modern, approachable feel.
- **Badges & Tags:** Full-pill (3rem) rounding for ELO tiers and reliability percentages to distinguish them from structural cards.
- **Buttons:** Large buttons use 0.75rem (12px) rounding to signal their high-priority interactive status.
- **Avatars:** Circular (100% rounded) to create a soft, human contrast to the data-heavy grid.

## Components

### Cards
Tournament and League cards must feature a "meta-bar" at the top (e.g., "Americano • 8 Players") using the `label-caps` style. The main body contains primary stats, with a clear separation for the "Status" badge in the top-right corner.

### ELO Ranking List
List items should feature a ranking number (1-3 with medal colors), followed by the circular avatar, then the player name. ELO scores must be right-aligned using `data-mono` for visual consistency. Reliability percentages appear as a sub-label in a dimmed state.

### Buttons
- **Primary:** Vibrant Lime background with Navy text.
- **Secondary:** Transparent with a 1px Navy border.
- **Ghost:** Minimal padding, used for "See All" or "View Profile" links within cards.

### Input Fields
Standardized height of 48px. Uses a 1px neutral border that transitions to Deep Navy on focus. Labels should be floating or positioned directly above the field in `label-caps`.

### Dashboards
The League Dashboard groups multiple tournament results. Use a "Card-in-Card" pattern where the parent League container provides context, and nested cards represent individual sessions or matches.