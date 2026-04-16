# AGENTS.md

---

# Main Development Rules & Guidelines

You MUST follow these core development rules and workflows without exception, drawing from the integrated skills available.

## 0. Start of Every Conversation
- **Activate `using-superpowers` first** — establishes how to find and use all available skills. This is required before ANY response, including clarifying questions.

## 1. Skill-First Development
- **Activate Skills:** ALWAYS check for and activate relevant skills before starting any task. Skills provide expert procedural guidance that overrides general defaults.
- **Before every action:** Scan the `# Available Skills` table in this file to check if a skill applies — do NOT rely on memory. If no matching skill is found, use `find-skills` to discover one before proceeding.
- **Skill Discovery:** Use `find-skills` if a user requests functionality that might exist as an installable skill.
- **Skill Maintenance:**
  - **Installing from registry:** `npx skills add <package> --agent claude-code -y`, then run `sync-custom-skills` to symlink into any other agent directories.
  - **Creating a custom skill:** Use `writing-skills` to author the skill in `.agents/skills/<name>/`, then run `sync-custom-skills` to symlink it into all agent-specific directories.
  - **After installing or creating any skill:** Update the `# Available Skills` section in `AGENTS.md` with the new skill name and purpose, then instruct the user to restart and resume the session so all new skills are loaded.
  - Update `.gemini/settings.json` to include any new rule files in the `context.fileName` array.

## 2. Product Strategy & Documentation
- **Centralized Docs:** Use the root `/docs` directory for all project strategy and lifecycle artifacts. Always refer to `docs/` for project context, goals, and constraints before making product or technical decisions — activate `product-owner` to guide that process.
- **Product Ownership:** Activate the `product-owner` skill for brainstorming, feature prioritization, requirement definition, and any time a product or scope decision needs to be made.

## 3. Planning & Exploration
- **Brainstorm:** You MUST invoke the `brainstorming` skill before any creative work, feature creation, or spec writing — no exceptions.
- **Product decisions:** You MUST invoke `product-owner` for feature prioritization, requirement definition, or scope decisions.
- **Write a Plan:** You MUST invoke `writing-plans` before touching any code — do not write plans ad-hoc.
- **Execute the Plan:** You MUST invoke `executing-plans` when carrying out a written plan — do not skip steps.

## 4. Test-Driven Development (TDD)
- **Test First:** Use the `test-driven-development` skill when implementing ANY new feature or bugfix.
- **Validation:** Write failing tests first, implement the minimum required code to pass, and refactor. Ensure robust coverage for edge cases.

## 5. UI/UX and Frontend Design Excellence
- **Component Architecture:** Adhere to `atomic-design-fundamentals` when structuring UI components, dividing them logically into atoms, molecules, organisms, templates, and pages to ensure maximum reusability and scalability.
- **Distinctive Design:** Leverage `frontend-design` and `ui-ux-pro-max` skills to create production-grade web and mobile interfaces. Absolutely avoid generic AI aesthetics.
- **Styling Execution:** Implement curated palettes, modern typography, glassmorphism/bento-grid layouts, and smooth micro-animations. Ensure your UI feels premium and dynamic.

## 6. Web: Next.js & React Best Practices
- **Architecture:** Apply `next-best-practices` for file conventions, React Server Component (RSC) boundaries, proper data fetching, route handlers, and SEO/metadata.
- **Performance Optimization:** Adhere to `vercel-react-best-practices`. Focus on efficient rendering, bundle optimizations, and eliminating unnecessary re-renders.

## 7. Mobile: React Native & Expo
- **High-Performance App Development:** Use `vercel-react-native-skills` for mobile tasks. Optimize list rendering, implement fluid native animations, and follow Expo best practices.
- **Native UI Building:** Activate `building-native-ui` for comprehensive guidance on Expo Router, native controls, gradients, and platform-specific UI patterns.
- **Keyboard Handling:** Use `react-native-keyboard-controller` for keyboard avoidance and interactions instead of the core `KeyboardAvoidingView`.
- **Component Library:** Utilize `heroui-native` for building accessible, theme-aware mobile UI components. Always use its specific documentation and patterns (Tailwind v4 via Uniwind) rather than web-based React patterns.
- **Styling Infrastructure:** Rely on the `uniwind` skill for Tailwind 4 utility usage across all mobile components.

## 8. Backend & Data
- **Database:** Use `drizzle-orm` for all ORM patterns, schema design, and queries. For Cloudflare D1 specifically, use `d1-drizzle-schema`.
- **API / Edge Workers:** Apply `hono-cloudflare` for all work on `apps/updates-worker` and any Cloudflare Worker endpoints.

## 9. AI & LLM Integration
- **Vercel AI SDK:** Use `ai-sdk` when building or modifying any AI-powered feature — streaming, tool use, model selection.
- **Prompt Design:** Apply `prompt-engineering-patterns` when writing or refining prompts for reliable, consistent LLM outputs.

## 10. Debugging
- **Systematic First:** Use `systematic-debugging` when encountering any bug, test failure, or unexpected behavior — before proposing any fix.

## 11. Execution Mindset
- Always prioritize **Performance**, **Accessibility (a11y)**, and **Visual Excellence**.
- Ensure code is modular, reusable, and strictly typed (TypeScript).
- Use `dispatching-parallel-agents` or `subagent-driven-development` when facing 2+ independent tasks that can run concurrently.

## 12. Version Control & PR Workflow
- **Branch Management:**
  - Always create a new branch from `main` before starting work.
  - Name your branch semantically based on the work being done (e.g., `feature/...`, `fix/...`, `chore/...`, `refactor/...`, `docs/...`, `test/...`).
  - Before making a new commit on an existing task, always check if your current branch has already been merged into `main`. If it has, pull the latest updates from `main`, branch off from `main` anew, and create a new PR.
- **Commits & Pushes:** Make atomic, logical commits with descriptive messages. Push your branch to the remote repository continuously.
- **Before Completing:** Run `verification-before-completion` before claiming any work is done or creating a PR.
- **Finishing a Branch:** Use `finishing-a-development-branch` when implementation is complete to decide how to integrate the work.
- **Code Review:** Use `requesting-code-review` when submitting work for review. Use `receiving-code-review` when processing feedback — never implement suggestions blindly.
- **Pull Requests:** Use the `pr-creator` skill when asked to create a pull request (PR) against the `main` branch.

---

# Product Strategy & Documentation Rules

These rules govern how we manage the project lifecycle and non-code artifacts.

## 1. Documentation Structure
All strategic work MUST be placed in the root `/docs` folder using the following hierarchy:
- `docs/discovery/`: Brainstorming sessions, raw ideas, and research logs.
- `docs/product/`: PRDs (Product Requirement Documents), user stories, and finalized feature specs.
- `docs/roadmap/`: Phasing, milestones, and high-level project trajectory.
- `docs/planning/`: Technical implementation plans and detailed task breakdowns.
- `docs/architecture/`: ADRs (Architecture Decision Records) and system diagrams.
- `docs/execution/`: Progress logs, implementation notes, and post-mortems.

## 2. Feature Lifecycle
No major feature should be implemented without following this workflow:
1. **Discovery:** Brainstorm ideas in `docs/discovery/`.
2. **Strategy:** Define the "Why" and "What" in a PRD under `docs/product/`.
3. **Phasing:** Update `docs/roadmap/` to reflect where this feature fits.
4. **Planning:** Create an implementation plan in `docs/planning/`.

## 3. Product Ownership
- **Skill Activation:** Always activate the `product-owner` skill when performing tasks related to feature discovery or roadmap management.
- **Decision Logic:** When proposing features, provide options (Lean, Standard, Visionary) to help the user decide on the best path forward.

---

# Available Skills

## Workflow & Process
| Skill | Purpose |
|---|---|
| `using-superpowers` | Master guide for activating and combining all available skills |
| `remembering-conversations` | Recall prior conversation context and decisions across sessions |
| `brainstorming` | Explore intent, requirements & design before any implementation |
| `writing-plans` | Create structured implementation plans before coding |
| `executing-plans` | Execute a written plan with review checkpoints |
| `subagent-driven-development` | Run independent tasks in parallel via subagents |
| `dispatching-parallel-agents` | Dispatch 2+ independent tasks concurrently |
| `test-driven-development` | TDD workflow — write failing tests first, then implement |
| `systematic-debugging` | Step-by-step debugging methodology |
| `requesting-code-review` | Structured code review request workflow |
| `receiving-code-review` | Process review feedback with technical rigor |
| `verification-before-completion` | Verify work before claiming done or creating PRs |
| `finishing-a-development-branch` | Complete and integrate a development branch |
| `using-git-worktrees` | Isolate feature work using git worktrees |
| `writing-skills` | Create and edit skills before deployment |
| `find-skills` | Discover and install new skills from the ecosystem |
| `sync-custom-skills` | Symlink a newly created custom skill into all agent directories |
| `product-owner` | Feature discovery, prioritization & roadmap management |
| `pr-creator` | Create PRs following repo templates and standards |

## Mobile: React Native & Expo
| Skill | Purpose |
|---|---|
| `building-native-ui` | Expo Router, native controls, gradients, platform-specific UI |
| `vercel-react-native-skills` | Performance, list rendering, animations, Expo best practices |
| `heroui-native` | HeroUI Native components (Tailwind v4 via Uniwind) |
| `uniwind` | Tailwind 4 utility styling for React Native |
| `mobile-ui-tester` | Visual testing & auditing of React Native apps |
| `agent-device` | Automate device interactions — tap, type, scroll, screenshot on iOS/Android |
| `expo-api-routes` | Expo API routes patterns |
| `expo-cicd-workflows` | CI/CD pipelines for Expo apps |
| `expo-deployment` | Expo deployment strategies |
| `expo-dev-client` | Expo Dev Client setup and usage |
| `expo-module` | Creating native Expo modules |
| `expo-ui-jetpack-compose` | Expo UI with Jetpack Compose (expo/ui) |
| `expo-ui-swiftui` | Expo UI with SwiftUI (expo/ui) |
| `upgrading-expo` | Expo SDK upgrade guide |
| `use-dom` | Expo use-dom patterns for web target |
| `native-data-fetching` | Data fetching patterns for React Native |

## UI/UX & Design
| Skill | Purpose |
|---|---|
| `ui-ux-pro-max` | Production-grade UI/UX design (50 styles, 21 palettes) |
| `frontend-design` | Distinctive, polished frontend interfaces |
| `atomic-design-fundamentals` | Component hierarchy: atoms → molecules → organisms → pages |
| `heroui-react` | HeroUI React & Native shared patterns |

## Web: Next.js & React
| Skill | Purpose |
|---|---|
| `next-best-practices` | Next.js file conventions, RSC, data fetching, metadata |
| `vercel-react-best-practices` | React/Next.js performance optimization (Vercel Engineering) |

## Backend & Data
| Skill | Purpose |
|---|---|
| `drizzle-orm` | Drizzle ORM patterns, schema design, queries |
| `d1-drizzle-schema` | Drizzle ORM with Cloudflare D1 |
| `hono-cloudflare` | Hono framework on Cloudflare Workers |

## AI & LLM
| Skill | Purpose |
|---|---|
| `ai-sdk` | Vercel AI SDK — streaming, tool use, model integration |
| `prompt-engineering-patterns` | Prompt design patterns for reliable LLM outputs |
