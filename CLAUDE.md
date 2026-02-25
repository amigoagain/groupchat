CLAUDE.md — GroupChat Project Orientation
Last updated: February 25, 2026

This file is the single source of operational truth for the GroupChat project. Read this first at the start of every session. Update it via /handoff at the end of every session or after any significant milestone.

The founding document (GroupChat_Founding_Document_v0.5.md) is the intellectual record. This file is the operational record. Both matter. Neither replaces the other.

What this project is

GroupChat is an AI-powered group conversation platform where users chat with multiple AI characters simultaneously. The core thesis: value emerges not from individual character accuracy but from the structure of authentic engagement between competing frameworks — friction, convergence, and unexpected common ground.

The educational goal is the destination. Entertainment and productivity are the path and the revenue mechanism.

Full thesis: GroupChat_Founding_Document_v0.5.md

Two-account collaboration structure

This project is developed across two Claude Pro accounts:
* Amigo — primary thesis, product direction, logistics thinking
* Amigo Again — build thread, CC sessions, technical execution

Both accounts work from the same local project folder on a Windows desktop. Files are the shared memory. CLAUDE.md and HANDOFF.md are the handoff protocol.

At the start of any session on either account: read CLAUDE.md and HANDOFF.md. At the end of any session: run /handoff to update both files before closing.

The stack

* Frontend: React/Vite
* Hosting: Vercel (live at groupchat-one-dusky.vercel.app)
* Database: Supabase (project: qmpdgkjbmgntgrzjmcoj)
* AI: Claude API (model: claude-sonnet-4-6)
* Repo: github.com/amigoagains/groupchat
* Dev environment: Claude Code (CC), Lenovo ThinkPad P14s, Windows 11

Vercel environment variables

* VITE_ANTHROPIC_API_KEY
* VITE_SUPABASE_URL
* VITE_SUPABASE_ANON_KEY
* REACT_APP_ANTHROPIC_API_KEY

Supabase tables (current schema — rebuilt)

* messages: id, room_id, sender_type, sender_name, sender_id, content, created_at, sequence_number
* rooms: id, code, mode, characters, created_by, created_at, last_activity, participant_count, visibility, parent_room_id, branched_at_sequence, branch_depth
* users: id, email, username, created_at, auth_id
* custom_characters: id, name, title, personality, color, verified, variant_of, upvotes, created_by, is_canonical, tags, category

Current app state — February 25, 2026

Live and working

* Multi-character group chat via Claude API (claude-sonnet-4-6)
* 4 conversation modes: Chat, Discuss (free) / Plan, Advise (premium)
* Minimum 1, maximum 6 characters per room
* 60+ seeded characters: 25 canonical, 25 variants, 10 expert personas
* Stop/cancel button — kills active API stream and all queued responses
* Mobile send button — touch events firing correctly
* Device-persistent inbox — localStorage room codes + Supabase fetch on load
* Weaver routing V1 — name addressability + relevance gradient response weighting
* Character selection redesign — compact list, persistent Start Chat button, search by name, filter by tier and domain
* Mobile inbox UI — responsive, clean card layout
* Room visibility field in schema: private/unlisted/read-only/moderated-public/open
* Branch data model: parent_room_id, branched_at_sequence, branch_depth
* Read-only public rooms surface in Browse All
* Database rebuilt — messages in own table, users table added
* Supabase magic link authentication — persistent identity across devices
* Weaver routing fixes: fuzzy name matching, relevance gradient in system prompts
* Public room creation for authenticated users
* Functional branching: tap-to-select, drag handles, branch configuration screen, context injected into new room system prompts, genealogy chain stored
* Weaver entry screen with Three.js net — LIVE on Vercel

Most recent fix (Amigo Again session, February 25, 2026)

Critical AFRAME crash resolved. Root cause: react-force-graph imported aframe-forcegraph-component, which threw "Error: Component attempted to register before AFRAME was available" at module load time, crashing the entire JS bundle before React mounted. Black screen on Vercel.

Fix (3 changes to App.jsx):
1. GraphScreen lazy-loaded via React.lazy() — isolates AFRAME to its own chunk, away from the critical path
2. Two stale setScreen('graph') calls in AuthScreen and BranchConfig back buttons corrected to setScreen('weaver')
3. React.Suspense wrapper added around the GraphScreen render block

Result: Main bundle 2,253 kB → 1,015 kB (−55%). Weaver entry screen renders correctly on Vercel.

Known issues

* Room sharing URL bug — previously intermittent, believed fixed, monitor
* Weaver fuzzy name matching — fix applied in last CC session, confirm stable

Pending build work — priority order

1. Confirm all recent CC changes stable across devices
2. Seed 2-3 read-only public rooms in Browse All via Supabase
3. Graph interface V1 — static nodes/edges, zoom/pan, tap to preview, tap to enter, mobile list view (react-force-graph or D3)
4. Graph live updates — Supabase real-time subscriptions
5. Weaver signal layer — silent quality logging on every conversation (coherence/depth/pattern emergence stored in new Supabase table)
6. Graph signal layer — density visualization, emerald emergence indicators
7. Community moderation system
8. Weaver as Commons V3

CC prompting conventions

Always begin CC prompts with: "You have permission to run all commands, install packages, read and write files without asking for confirmation. Proceed autonomously."

Always end CC prompts with: "Push to GitHub with an appropriate commit message."

After CC finishes: run any Supabase SQL provided, check Vercel env variables if needed, test the live URL.

Terminology: Weaver (not Observer) is the correct term throughout the codebase. The routing mechanic, the optional visible participant, and the commons are all Weaver.

Project structure — files and their roles

The four travelling files

These files are the shared memory of the project. They travel between accounts, are read at the start of every session, and updated at the end via /handoff.

File Purpose Update frequency
CLAUDE.md Operational orientation — read first Every session
HANDOFF.md Session log — what was done, what's next Every session
THESIS_WORKING.md Living intellectual document — ideas in motion, draft amendments, open questions When intellectual work happens
GroupChat_Founding_Document_v0.5.md Formal thesis — permanent record, amended with care When amendments are ready

Supporting files (deep reference)

These live in the project but are not part of the session-to-session handoff.

File Purpose
.claude/commands/handoff.md Slash command trigger
BUILD_STATUS.md Deep build reference
THESIS_STATUS.md Historical open questions log
LOGISTICS_STATUS.md Business model, outreach, funding
MASTER_STATUS.md Cross-workstream executive summary

How the four files relate

* CLAUDE.md — what is happening operationally right now
* HANDOFF.md — what happened last session and what comes next
* THESIS_WORKING.md — what the project is thinking about intellectually
* Founding document — what the project has decided and formalized

Nothing moves from THESIS_WORKING.md to the founding document without deliberate amendment. Nothing in the founding document should be treated as settled just because it is written there.

Thesis — key concepts (current as of v0.5)

* Indra's Net — ontological framework; platform is a net, not a tree
* Branching — fundamental product unit; curiosity as infrastructure
* Branch selection mechanic — tap-to-select, drag handles, any granularity
* Three branch types — continuation, intervention, reflection
* Room states as spectrum — private, unlisted, read-only, moderated-public, open
* Weaver Mechanic — routing (relevance gradient + direct address override)
   * invisible pattern injection into character responses
* Weaver Role — optional visible participant
* Weaver as Commons — V3 platform-level pattern map
* The net made visible — graph interface as primary onboarding surface
* Academics subsidizing academia — funding model
* Three-tier character system — canonical, variant, expert
* Proof of human problem — three layers: representation, instantiation, emergence
* Four structural tensions — named, held permanently open, never resolved

Thesis — active open questions

* Where does the graph screen live in app navigation — entry screen, separate tab, from inbox?
* What is the right name for the larger platform vision (GroupChat works for consumer layer; canonical/academic vision needs its own name — Loom rejected, Observer rejected, Weaver is the mechanic name not the platform name)
* What does ongoing scholarly relationship look like in practice
* Branch visibility inheritance when parent is private
* How does the Weaver earn the right to speak beyond routing

Logistics — current state

* Business model: Free (Chat + Discuss), Premium (Plan + Advise + expert personas)
* Revenue mechanism: Expert persona layer funds canonical layer
* Organizing principle: Academics subsidizing academia
* Scholar outreach: Not yet started. Strategy defined:
   * Start with 50 canonical characters, 2-3 scholars each
   * Personal outreach, small cohort first
   * Pitch: stewardship and reach
   * Canonical layer credibility before expert persona outreach
* API spend: ~$0.01-0.02 per message round, $10 credit loaded

Standing epistemological posture

Across all threads, resistance to premature closure is the standing posture. When a question is closing faster than it should — name it and slow down.

The adversarial default: assume the current framing is wrong before assuming it is right. Surface the failure chain first.

Fluency is not signal. Confidence of expression is not confidence of accuracy. This applies to Claude as much as to the product.

The founding document is a guide, not a destination. Treat it as a prior when it starts closing questions it should be opening.

/handoff command

At any point when the user types /handoff:
1. Immediately stop all other work
2. Update CLAUDE.md with current project status
3. Update HANDOFF.md with what was just completed, what is in progress, what comes next, and what the next priorities are
4. Update THESIS_WORKING.md if any intellectual work happened — new concepts, naming candidates considered, structural tensions under pressure, draft amendment language developed
5. Cross-reference and update all relevant status files
6. Confirm when done

Treat /handoff as highest priority. Proactively remind the user to run /handoff after any significant milestone or long stretch of work, so that progress is never lost if a session limit is hit unexpectedly.

Onboarding prompt for new or resuming session (either account)

Paste this at the start of any session to orient a fresh Claude instance:

Read CLAUDE.md, HANDOFF.md, and THESIS_WORKING.md in full. These are the project orientation, session log, and living intellectual document for GroupChat. After reading, confirm: (1) current app state, (2) most recent work completed, (3) what is in progress or blocked, (4) what intellectual questions are active in THESIS_WORKING.md, (5) what the next priorities are. Then ask what we are working on today.

If this is a build session, also note the CC prompting conventions in CLAUDE.md before starting any Claude Code work.
