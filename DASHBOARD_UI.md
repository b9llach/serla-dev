# Serla Dashboard UI Design System

This document describes the complete UI design system for the Serla dashboard. Follow these guidelines exactly when creating or modifying dashboard components to maintain visual consistency.

## Design Philosophy

The dashboard follows a **Polar.sh-inspired** dark theme with:
- Minimal, clean aesthetic
- No visible borders (use background colors for separation)
- Floating card layout with rounded corners
- Centered content with max-width constraints
- Monochrome icons with no colored accents
- Professional, non-AI appearance (no gradients, no teal/cyan)

---

## Color Palette

### Backgrounds (darkest to lightest)
```
#0a0a0a  - Outer shell / base background (the darkest layer)
#141414  - Main content area (the floating card on the right)
#1a1a1a  - Cards, nav active states, inputs hover, dividers
#222222  - Hover state for elements sitting on #1a1a1a
```

### Text Colors
```
white / #ffffff     - Primary text, headings, active nav items
zinc-300 / #d4d4d8  - Secondary text, code snippets
zinc-400 / #a1a1aa  - Labels, descriptions, card subtitles
zinc-500 / #71717a  - Muted text, placeholders, inactive nav, icons
zinc-600 / #52525b  - Very muted elements (keyboard shortcuts)
```

### Accent Colors (use sparingly, only for primary actions)
```
blue-600 / #2563eb  - Primary action buttons only
blue-700 / #1d4ed8  - Primary button hover state
```

### DO NOT USE
- Teal, cyan, purple, or any gradient colors
- Colored icon backgrounds or badges
- Bright accent colors for UI chrome
- Visible borders on cards or containers
- Box shadows

---

## Dashboard Layout Structure

### Shell Layout (`app/dashboard/layout.tsx`)

The dashboard uses a two-column layout with a sidebar and main content area:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db, projects } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { Sidebar } from '@/components/dashboard/sidebar';
import { DashboardProvider } from './provider';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/auth/signin');
  }

  const userProjects = await db.query.projects.findMany({
    where: eq(projects.userId, session.userId),
    orderBy: (projects, { asc }) => [asc(projects.createdAt)],
  });

  return (
    <DashboardProvider
      initialProjects={userProjects}
      initialProjectId={userProjects[0]?.id}
    >
      <div className="flex h-screen bg-[#0a0a0a] p-3">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-[#141414] rounded-2xl ml-3">
          {children}
        </main>
      </div>
    </DashboardProvider>
  );
}
```

**Key layout rules:**
- Outer container: `bg-[#0a0a0a] p-3` - dark background with padding for floating effect
- Main content: `bg-[#141414] rounded-2xl ml-3` - lighter card with large radius and gap from sidebar
- The `p-3` on outer + `ml-3` on main creates the floating card appearance
- No borders anywhere

---

## Sidebar (`components/dashboard/sidebar.tsx`)

### Complete Sidebar Implementation

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  BarChart3,
  Layers,
  GitMerge,
  Users,
  Flag,
  SlidersHorizontal,
  Link2,
  Send,
  FileDown,
  Settings,
  Key,
  Receipt,
  LogOut,
  BookOpen,
  MessageCircle,
} from 'lucide-react';
import { signOut } from '@/lib/auth/actions';

const navigation = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Events', href: '/dashboard/events', icon: BarChart3 },
  { name: 'Metrics', href: '/dashboard/metrics', icon: Layers },
  { name: 'Funnels', href: '/dashboard/funnels', icon: GitMerge },
  { name: 'Retention', href: '/dashboard/retention', icon: Users },
  { name: 'Goals', href: '/dashboard/goals', icon: Flag },
  { name: 'Segments', href: '/dashboard/segments', icon: SlidersHorizontal },
  { name: 'Attribution', href: '/dashboard/attribution', icon: Link2 },
  { name: 'Webhooks', href: '/dashboard/webhooks', icon: Send },
  { name: 'Export', href: '/dashboard/export', icon: FileDown },
];

const settingsNavigation = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  { name: 'API Keys', href: '/dashboard/settings/api-keys', icon: Key },
  { name: 'Billing', href: '/dashboard/settings/billing', icon: Receipt },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-56 flex-col py-4">
      {/* Logo - simple text, no icon or box */}
      <div className="px-4 mb-6">
        <span className="text-white font-medium">serla</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]/50'
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              {item.name}
            </Link>
          );
        })}

        <div className="h-px bg-[#1a1a1a] my-4" />

        {settingsNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]/50'
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section - Support, Docs, Sign out */}
      <div className="px-3 pt-4 space-y-0.5">
        <Link
          href="#"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]/50 transition-colors"
        >
          <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.5} />
          Support
        </Link>
        <Link
          href="/docs"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]/50 transition-colors"
        >
          <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.5} />
          Docs
        </Link>

        <div className="h-px bg-[#1a1a1a] my-3" />

        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-[13px] text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]/50 transition-colors"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
```

### Sidebar Specifications

| Property | Value |
|----------|-------|
| Width | `w-56` (224px) |
| Background | Transparent (inherits `#0a0a0a` from shell) |
| Padding | `py-4` vertical, `px-3` for nav, `px-4` for logo |
| Logo | Plain text: `text-white font-medium` |
| Nav text size | `text-[13px]` |
| Nav item padding | `px-3 py-2` |
| Icon size | `h-[18px] w-[18px]` |
| Icon stroke | `strokeWidth={1.5}` |
| Gap (icon to text) | `gap-3` |
| Item spacing | `space-y-0.5` |
| Active state | `bg-[#1a1a1a] text-white` |
| Inactive state | `text-zinc-500` |
| Hover state | `text-zinc-300 hover:bg-[#1a1a1a]/50` |
| Divider | `h-px bg-[#1a1a1a] my-4` |
| Border radius | `rounded-lg` |

### Navigation Icon Mapping

| Page | Icon | Import |
|------|------|--------|
| Home | `Home` | lucide-react |
| Events | `BarChart3` | lucide-react |
| Metrics | `Layers` | lucide-react |
| Funnels | `GitMerge` | lucide-react |
| Retention | `Users` | lucide-react |
| Goals | `Flag` | lucide-react |
| Segments | `SlidersHorizontal` | lucide-react |
| Attribution | `Link2` | lucide-react |
| Webhooks | `Send` | lucide-react |
| Export | `FileDown` | lucide-react |
| Settings | `Settings` | lucide-react |
| API Keys | `Key` | lucide-react |
| Billing | `Receipt` | lucide-react |
| Support | `MessageCircle` | lucide-react |
| Docs | `BookOpen` | lucide-react |
| Sign out | `LogOut` | lucide-react |

### Active State Detection

```tsx
// For top-level routes (exact match)
const isActive = pathname === item.href;

// For nested routes (prefix match, but exclude /dashboard itself)
const isActive = pathname === item.href ||
  (item.href !== '/dashboard' && pathname.startsWith(item.href));
```

---

## Page Container Pattern

Every dashboard page MUST use this structure:

```tsx
<div className="min-h-full p-6 lg:p-8 flex justify-center">
  <div className="w-full max-w-5xl space-y-6">
    {/* Page content */}
  </div>
</div>
```

**Breakdown:**
- `min-h-full` - ensures content fills the card height
- `p-6 lg:p-8` - responsive padding (24px mobile, 32px desktop)
- `flex justify-center` - centers the content horizontally
- `max-w-5xl` - constrains width to 1024px (use `max-w-4xl` for narrower, `max-w-6xl` for wider)
- `space-y-6` - consistent 24px vertical gap between sections

### Page Header Pattern

```tsx
<div>
  <h1 className="text-xl font-bold text-white mb-1">Page Title</h1>
  <p className="text-sm text-zinc-400">
    Brief description of the page
  </p>
</div>
```

---

## Cards

### Standard Card

```tsx
<div className="bg-[#1a1a1a] rounded-xl p-6">
  <div className="mb-6">
    <h2 className="text-base font-semibold text-white">Card Title</h2>
    <p className="text-sm text-zinc-400 mt-1">Card description</p>
  </div>

  {/* Card content */}
</div>
```

**Card specifications:**
- Background: `bg-[#1a1a1a]`
- Border radius: `rounded-xl`
- Padding: `p-6`
- NO borders, NO shadows
- Header margin: `mb-6`
- Title: `text-base font-semibold text-white`
- Subtitle: `text-sm text-zinc-400 mt-1`

### Card Grid

```tsx
<div className="grid gap-6 lg:grid-cols-2">
  <div className="bg-[#1a1a1a] rounded-xl p-6">...</div>
  <div className="bg-[#1a1a1a] rounded-xl p-6">...</div>
</div>
```

---

## Form Elements

### Form Field Container

```tsx
<div className="space-y-2">
  <label className="text-xs font-medium text-zinc-400">Label</label>
  {/* Input component */}
</div>
```

### Form Grid

```tsx
<div className="grid gap-5 sm:grid-cols-2">
  {/* Form fields */}
</div>
```

Spacing between fields: `space-y-5` or `gap-5`

### Labels

```tsx
<label className="text-xs font-medium text-zinc-400">Field Label</label>
```

### Select/Dropdown

```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="bg-[#0a0a0a] border-0 h-10">
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Text Input

```tsx
<Input className="bg-[#0a0a0a] border-0 h-10" placeholder="..." />
```

### Date Picker Button

```tsx
<Button
  variant="outline"
  className={cn(
    'w-full justify-start text-left font-normal h-10 bg-[#0a0a0a] border-0 hover:bg-[#141414]',
    !value && 'text-zinc-500'
  )}
>
  <CalendarIcon className="mr-2.5 h-4 w-4 text-zinc-500" />
  {value ? format(value, 'MMM d, yyyy') : 'Select date'}
</Button>
```

### Primary Action Button

```tsx
<Button className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium">
  <Icon className="h-4 w-4 mr-2" />
  Button Text
</Button>
```

### Secondary/Ghost Button

```tsx
<Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-[#1a1a1a]">
  Button Text
</Button>
```

---

## Code Blocks

### Inline Code

```tsx
<code className="text-zinc-300">variableName</code>
```

### Block Code

```tsx
<code className="block p-3 bg-[#0a0a0a] rounded-lg text-sm font-mono text-zinc-300">
  GET /api/v1/endpoint
</code>
```

### Small Block Code

```tsx
<code className="block p-3 bg-[#0a0a0a] rounded-lg text-xs font-mono text-zinc-400 break-all leading-relaxed">
  curl -H "Authorization: Bearer sk_live_..." \
  "https://example.com/api"
</code>
```

---

## Popovers and Dropdowns

```tsx
<PopoverContent
  className="w-auto p-0 bg-[#1a1a1a] border-zinc-800"
  align="start"
  sideOffset={8}
>
  {/* Content */}
</PopoverContent>
```

---

## Icons

### Icon Styling Rules

```tsx
// Navigation icons (sidebar)
<Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />

// Action icons (buttons)
<Icon className="h-4 w-4" />

// Muted/placeholder icons
<Icon className="h-4 w-4 text-zinc-500" />
```

### Approved Icons List

Only use these icons from `lucide-react`:

```tsx
import {
  // Navigation
  Home,
  BarChart3,
  Layers,
  GitMerge,
  Users,
  Flag,
  SlidersHorizontal,
  Link2,
  Send,
  FileDown,
  Settings,
  Key,
  Receipt,
  LogOut,
  BookOpen,
  MessageCircle,

  // Actions
  Download,
  CalendarIcon,
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
```

### DO NOT

- Use colored backgrounds behind icons
- Use filled icon variants
- Use emoji
- Use decorative or illustrative icons
- Apply colors other than white/zinc to icons

---

## Typography

### Headings

```tsx
// Page title
<h1 className="text-xl font-bold text-white">Page Title</h1>

// Card title
<h2 className="text-base font-semibold text-white">Card Title</h2>

// Section title
<h3 className="text-sm font-medium text-white">Section Title</h3>
```

### Body Text

```tsx
// Description text
<p className="text-sm text-zinc-400">Description here</p>

// Small muted text
<p className="text-xs text-zinc-500">Muted text</p>

// Navigation text
<span className="text-[13px]">Nav Item</span>
```

---

## Spacing Scale

Use these spacing values consistently:

| Use Case | Class | Pixels |
|----------|-------|--------|
| Between nav items | `space-y-0.5` | 2px |
| Between small text items | `space-y-1.5` | 6px |
| Between label and input | `space-y-2` | 8px |
| Divider margin | `my-3` or `my-4` | 12-16px |
| Between form fields | `space-y-5` or `gap-5` | 20px |
| Between major sections | `space-y-6` or `gap-6` | 24px |
| Page header to content | `mb-6` or `mb-8` | 24-32px |
| Shell padding | `p-3` | 12px |
| Nav padding | `px-3` | 12px |
| Card padding | `p-6` | 24px |
| Page padding | `p-6 lg:p-8` | 24-32px |

---

## Empty States

```tsx
<div className="min-h-full p-6 lg:p-8 flex justify-center">
  <div className="w-full max-w-5xl">
    <p className="text-zinc-500">No data found.</p>
  </div>
</div>
```

---

## Complete Page Example

```tsx
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default async function ExamplePage() {
  return (
    <div className="min-h-full p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Page Title</h1>
          <p className="text-sm text-zinc-400">
            Brief description of what this page does
          </p>
        </div>

        {/* Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card 1 */}
          <div className="bg-[#1a1a1a] rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-white">Card Title</h2>
              <p className="text-sm text-zinc-400 mt-1">Card description</p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Field Label</label>
                {/* Input component with bg-[#0a0a0a] border-0 h-10 */}
              </div>

              <Button className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium">
                <Download className="h-4 w-4 mr-2" />
                Action Button
              </Button>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-[#1a1a1a] rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-white">Another Card</h2>
              <p className="text-sm text-zinc-400 mt-1">More content here</p>
            </div>

            <div className="space-y-4">
              <code className="block p-3 bg-[#0a0a0a] rounded-lg text-sm font-mono text-zinc-300">
                GET /api/v1/endpoint
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Checklist for New Pages

When creating a new dashboard page, verify:

- [ ] Page uses `min-h-full p-6 lg:p-8 flex justify-center` wrapper
- [ ] Content constrained with `w-full max-w-5xl`
- [ ] Page header uses `text-xl font-bold text-white`
- [ ] Section spacing uses `space-y-6`
- [ ] Cards use `bg-[#1a1a1a] rounded-xl p-6`
- [ ] Card titles use `text-base font-semibold text-white`
- [ ] Form inputs use `bg-[#0a0a0a] border-0 h-10`
- [ ] Labels use `text-xs font-medium text-zinc-400`
- [ ] Primary buttons use `bg-blue-600 hover:bg-blue-700`
- [ ] Icons use `strokeWidth={1.5}` and are monochrome
- [ ] No visible borders on any element
- [ ] No colored backgrounds on icons
- [ ] No gradients or shadows
- [ ] Content is centered, not left-aligned

---

## Quick Reference Table

| Element | Classes |
|---------|---------|
| Shell background | `bg-[#0a0a0a] p-3` |
| Main content area | `bg-[#141414] rounded-2xl ml-3` |
| Sidebar | `w-56 py-4` (no background) |
| Sidebar logo | `text-white font-medium` |
| Sidebar nav item | `text-[13px] gap-3 rounded-lg px-3 py-2` |
| Sidebar active | `bg-[#1a1a1a] text-white` |
| Sidebar inactive | `text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]/50` |
| Sidebar icon | `h-[18px] w-[18px] strokeWidth={1.5}` |
| Sidebar divider | `h-px bg-[#1a1a1a] my-4` |
| Page container | `min-h-full p-6 lg:p-8 flex justify-center` |
| Page content | `w-full max-w-5xl space-y-6` |
| Page title | `text-xl font-bold text-white` |
| Card | `bg-[#1a1a1a] rounded-xl p-6` |
| Card title | `text-base font-semibold text-white` |
| Card description | `text-sm text-zinc-400 mt-1` |
| Form label | `text-xs font-medium text-zinc-400` |
| Form input | `bg-[#0a0a0a] border-0 h-10` |
| Primary button | `bg-blue-600 hover:bg-blue-700 text-white font-medium h-10` |
| Code block | `bg-[#0a0a0a] rounded-lg p-3 text-sm font-mono text-zinc-300` |
| Divider | `h-px bg-[#1a1a1a]` |
