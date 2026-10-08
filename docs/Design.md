# Design.md — Pactrieve Evidence-First Interface System

**Project:** Pactrieve — *Every answer, traceable.*  
**Design direction:** Contract Research Desk  
**Status:** Proposed visual baseline, adapted from the cybersecurity editorial design system  
**Prepared:** 2026-10-08

---

## 1. Design objective

The finished application must feel usable by a professional reviewing contracts for real work. Its most important affordance is not a chatbot input; it is the ability to **connect an answer to the exact passage that supports it**. Design should make uploaded documents, uncertain findings, revisions and real activity immediately understandable.

Inherited guiding idea:

> **Editorial clarity with technical precision.**

The cybersecurity project used typography, proportion, restrained color, meaningful whitespace, technical metadata and authored asymmetry instead of generic SaaS effects. Pactrieve retains those principles but is a **dense working application**, not an article homepage. The document surface is the hero.

## 2. Why this visual direction

Two traps to avoid: (1) a generic dark AI chat page with an upload icon, and (2) a legal-tech imitation of a bloated enterprise CRM. Legal analysis needs trust, source readability, document comparison and clear evidentiary states. An editorial research-desk metaphor delivers these without theatrical decoration.

Design adjectives: **precise, restrained, evidence-led, calm, readable, navigable, technical, authored**.

Avoid: playful gradients, cyberpunk, glowing cards, glass overlays, chat-first emptiness, pill overload, pseudo-statistics, full-screen animations, arbitrary icon walls and stock judge/gavel imagery.

## 3. Surface composition

Use an ink/navigation shell and comfortable warm-paper document working area. This is a **Pactrieve-specific** proposal, not a requirement to copy the earlier cybersecurity palette.

```text
App chrome / top bar          deep ink
Library/sidebar              warm stone / neutral panel
PDF/DOCX viewer              clean paper, low visual noise
Analysis/chat panel          warm white
Verified citation details    restrained teal indicator + clear text
Warnings/partial evidence    amber + wording
Unsupported/error            muted red + wording
Comparison                   two balanced paper panes + change ledger
```

Do not alternate giant marketing sections inside a productivity app. Use restrained separators and consistent panel sizes.

## 4. Proposed semantic color tokens

These are **new Pactrieve tokens** to be approved as one system before implementation, not copied from the original cybersecurity site:

```css
:root {
  --ink: #202A31;
  --ink-raised: #2B3840;
  --paper: #F5F4EF;
  --paper-raised: #FBFAF7;
  --surface: #FFFFFF;
  --text: #202A31;
  --text-soft: #56636A;
  --text-on-ink: #F5F4EF;
  --border: #D8DEDD;
  --border-strong: #AEBDBB;
  --accent: #17695F;
  --accent-hover: #11584F;
  --accent-soft: #E6F1EE;
  --focus: #177B80;
  --warning: #936115;
  --warning-soft: #FFF1D9;
  --danger: #B2473B;
  --danger-soft: #FBEAE7;
  --selection: #DCE9E6;
}
```

Apply status colours with words/icons, never colour alone. Contrast must be verified in the running application; if a combination fails WCAG thresholds, adjust the **token** and document the correction. Teal means genuinely verified or active action, not generic decoration. Unverified/unsupported citations must never look verified.

## 5. Typography

Use **Geist Sans** for UI, headings, contract-analysis text and navigation, and **Geist Mono** sparingly for page number, clause references, timestamps, file metadata and machine-readable source locations. Reuse installed fonts or approved locally bundled equivalent if the project cannot load Geist; do not silently fetch a third-party tracking font.

Suggested workspace scale (intentionally smaller than an editorial landing page):

| Role | Desktop | Mobile |
|---|---:|---:|
| Workspace title | 26–32 px | 22–26 px |
| Panel section heading | 18–22 px | 18–20 px |
| Main document text | 16–18 px | 16–17 px |
| Analysis body | 15–17 px | 15–16 px |
| Controls/navigation | 13–15 px | 14–16 px |
| Metadata/overlines | 11–12 px mono | 11–12 px |

Body line-height roughly 1.5–1.7; preserve the contract's whitespace and meaningful paragraph hierarchy. Avoid monospace for body paragraphs. Never fake Word/PDF fonts as a substitute for authentic source layout.

## 6. Layout: the source stays visible

Desktop target: top bar (roughly 56–64 px), collapsible library sidebar (roughly 240–280 px), flexible document viewport and analysis panel (roughly 350–430 px). Allow explicit resizing only if it can be implemented reliably and keyboard-accessibly; fixed responsive boundaries are preferable to buggy drag handles.

```text
┌────────────────────────────────────────────────────────────────┐
│ Pactrieve       Library  Compare         Current document     │
├──────────────┬─────────────────────────────┬───────────────────┤
│ Documents    │ SOURCE DOCUMENT             │ ANALYSIS / CHAT   │
│              │ page / zoom / search         │ question          │
│ Contract A   │                             │ grounded answer   │
│ Contract B   │ highlighted source span      │ verified excerpt  │
│ ...          │                             │ source link       │
└──────────────┴─────────────────────────────┴───────────────────┘
```

At 1024 px, narrow/collapse library and preserve workable reading width. At 768 px and below, use document/chat tabs or bottom/drawer navigation. At 390 and 360 px, one primary panel at a time; tap a citation to navigate to the document with a persistent return action. Do not squeeze three desktop panes onto mobile.

Use consistent 8 px base spacing with deliberate exceptions; panel padding generally 16–24 px. Avoid luxury-site empty space and avoid crowding file names, citations or tool events.

## 7. Header and information architecture

Compact typographic product mark (no invented logo); primary routes **Library** and **Compare**, with Document Workspace context in the main panel. No invented product statistics, pricing, user avatar, team settings or decorative command palette. Breadcrumbs only when they materially improve navigation. Current filename, document count/selection, processing state and original-file access should be easy to locate.

## 8. Library and upload experience

Upload is an explicit, intentional entry state, not a hero billboard. Include clearly labelled drop zone and browse control, supported formats, file-size constraints, progress, and specific failure explanations. Keep the library useful at 0, 1 and many files: sort recent first, support opening/deleting with confirmation, and show genuine status. File rows must communicate filename, type, processing status and practical actions without nesting every value in a card.

**No fake progress percentages.** If only stages are known, show a truthful indeterminate stage and filename.

## 9. Document viewer as evidence surface

Viewer must expose real page navigation, zoom, source identity, current page and a visible highlight location. Matched words should be highlighted using thin, readable selection surfaces that don't obscure the contract. Multiple segments spanning line/page breaks must still be visible. If an identical phrase appears more than once, allow meaningful occurrence navigation or clearly mark which occurrence is being viewed.

Citation click sequence: resolve verified source → switch/open correct viewer → render affected page(s) → scroll → highlight → expose page/section information → provide a way back to analysis. If highlight cannot be mapped, do not fake success with page-only navigation.

## 10. Chat and evidence card design

Answers should look like concise analytical notes, not giant chat bubbles. Use readable paragraphs, optional comparison table where needed, and verified citations adjacent to the claims they support. Display **source document, clause/page when actually derived, exact quote, and verification state**. A verified citation must be visibly clickable and reachable by keyboard. Keep model interpretation visually distinct from verbatim quotation.

Streaming: real content appears incrementally, with a clear **Stop generating** control. When stopped, keep partial text and label **Stopped — partial answer**. Distinguish searching, reading, verifying and responding using real backend events. Avoid an animated "thinking" performance with fabricated steps.

Abstention copy should say what wasn't established and whether search coverage was limited. Never use a generic green success state for a question with unsupported evidence.

## 11. Multi-document answers

Show selected documents as clear, removable context tokens or a compact selection list; a comparison answer should be organized by **point of difference**, not by a stack of document-by-document chatbot replies. Cite each document explicitly. Missing evidence in Contract B must not get the same verified treatment as a source-backed statement in Contract A.

## 12. Version comparison workspace

Comparison is an editorial **change ledger**:

- Top controls: baseline version, revised version, compare action, processing/error state.
- Primary view: list of changed clauses with readable old/new excerpts.
- Secondary controls: filter by added/removed/modified/moved/uncertain and significance.
- Each row: clause identifier if real, changed proposition, before/after, severity rationale, direct source links.
- Long contracts: progressive rendering/virtualisation as needed; avoid displaying giant monolithic diffs.

Use significance colors sparingly; always show textual label and reason. A liability cap changing by an order of magnitude should be readable immediately; punctuation-only adjustments should not dominate the screen.

## 13. Agentic research activity

Activity log should convey verified operational sequence: "Searching termination clauses", "Opened Section 8", "Cross-checking liability exception" only when those tools really ran. Distinguish requested tool, completed tool, controlled tool error and round-cap reached. Do not show chain-of-thought or fabricate a narrative of reasoning. Keep activity collapsible so it does not displace the document.

## 14. Radius, border and depth

Suggested radius: 4–6 px for controls, 8–10 px for panels, 999 px only for true status chips. Prefer 1 px borders, separators and typography to heavy shadows. No card-in-card-in-card nesting. Interactive states can use a thin border, underline or subtle surface change. File lists can be simple rows.

## 15. Motion system

CSS transitions first, roughly 150–250 ms for hover/focus/panel disclosure; only purposeful motion. Motion must not delay a citation click, hide errors or animate a long document. Honour `prefers-reduced-motion`. Avoid scroll hijacking, parallax, bouncing verified icons and decorative entrance choreography.

## 16. Empty, loading, error and recovered states

Design individually: empty library; unsupported upload; scanned PDF; corrupt file; extraction failed; partially unreadable pages; indexing; ready; empty conversation; streaming; stopped partial; connection lost; unverifiable quote; no evidence; ambiguous quote occurrence; viewer mapping unavailable; comparison not yet run; no meaningful differences; uncertain alignments; agent tool rejected; cap exceeded; document deleted.

Each state needs accurate text, appropriately labelled action and graceful focus management. Never say a document was read completely if pages were skipped.

## 17. Accessibility and responsive checks

Baseline screenshots/interaction review at **1440, 1280, 1024, 768, 390 and 360 px**. Check file names, upload state, viewer, citations, comparison and agent log. No overflow; document zoom controls work; focus order is sensible; screen-reader status announcements exist; minimum comfortable tap targets; color does not carry meaning alone; reduced motion supported. Audit actual colors/contrast rather than merely trusting tokens.

## 18. Content and copy rules

Sound like a competent tool, not a sales brochure. Prefer "Quote could not be verified in this document" over "Our powerful AI had trouble". Clear nouns, explicit document names, exact cited wording, and measured warnings. Avoid legal conclusions, fake confidence percentages, lorem ipsum, "revolutionise contracts", boastful hero headlines and fabricated compliance claims.

## 19. Human-designed visual review

Before accepting a screen, ask:

1. Is the current document or user task immediately clear?
2. Is the primary action obvious without a tour?
3. Are source text and citations legible in context?
4. Does every line, border, icon and color support hierarchy, navigation, evidence or trust?
5. Is there unnecessary rounding, animation, glow, decorative empty space or fake data?
6. Does mobile retain the full *workflow*, not just stacked screenshots?
7. Can a reviewer distinguish actual results, partial work and uncertainty at a glance?
8. Would this still make sense with an unfamiliar, messy, 150-page contract?

If not, fix the information architecture before adding visual effects.

## 20. Design decision record and change protocol

**D-01:** Desk layout over centered chat; document + evidence should coexist.  
**D-02:** Ink/paper over all-black; better long-form reading.  
**D-03:** One restrained deep-teal accent; evidence is distinctive without dominating.  
**D-04:** Geist Sans + limited Mono; editorial precision without terminal cosplay.  
**D-05:** Thin borders over floating cards; compact and authored.  
**D-06:** Actual viewer text highlight over coloured fake rectangles; credibility before polish.  
**D-07:** Compare as a clause change ledger, not a generic diff widget.  
**D-08:** Bounded real activity instead of animated fake intelligence.

Any proposal to change palette, fonts, principal pane layout, interaction paradigm, or adopted component system must be recorded and reviewed under `rules.md`. Minor responsive changes within these principles can proceed in approved UI phases.
