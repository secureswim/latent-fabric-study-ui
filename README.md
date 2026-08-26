# Latent Fabric Gesture Study

Wizard-of-Oz study software with a projected participant display, a simplified researcher console, per-trial timers, automatic draft preservation, and durable hosted study storage.

## Run locally

Requirements: Node.js 22.13+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open:

- Participant display: `http://localhost:3000/`
- Researcher console: `http://localhost:3000/researcher`

Keep the participant display on the projector or participant machine. Keep the researcher console private.

## Conduct a participant session

1. Open `/researcher`.
2. Enter the Participant ID, assigned sequence A-D, and optional researcher initials.
3. Click **Begin Participant Study**. The whole-study timer begins.
4. Open `/` on the projected machine. Hosted displays retrieve the current study state from the backend automatically.
5. Select a task in the left trial list. Its neutral prompt appears on the participant display.
6. Click **Start Trial**. The prompt disappears and the per-trial timer begins.
7. Observe the participant's physical action and fill the manual gesture-observation form while the trial runs.
8. Click **Trigger Response** when the participant performs the action. The projected mock generative response plays without revealing the internal referent name.
9. Continue filling geometry, deformation, temporal, behavioural, rating, explanation, and note fields.
10. Click **Save + Next Trial**. The trial is marked complete, its final time is stored, and the next prompt is shown.
11. Use **Previous** to revisit an earlier task and **Pause Session** when the study is interrupted.
12. After trial 15, click **Save Participant Results**.
13. Export JSON if a local copy is required, then click **Next Participant**.

## Draft and session storage

- Every form change is immediately copied to browser storage and queued for durable database autosave.
- Switching tasks preserves the current task as a draft even when **Save + Next Trial** was not clicked.
- The researcher setup page lists stored participant sessions and supports resuming them.
- The participant session records whole-study elapsed time.
- Each trial separately records its accumulated elapsed time.
- Pausing stops active timers; resuming continues from the accumulated value.
- The storage indicator reports **Stored**, **Saving**, or **Local backup**.

The hosted app uses Cloudflare D1 through the Sites platform. The browser copy is a recovery cache, not the authoritative hosted record.

## Participant prompt behaviour

- Selecting a task displays its neutral prompt.
- Clicking **Start Trial** hides the prompt.
- Clicking **Trigger Response** keeps the prompt hidden and plays the mock response.
- The participant never sees canonical labels such as Anchor, Branch, Zoom, or Lock.

## Research-validity checklist

- Show only `/` to participants.
- Keep `/researcher` private.
- Do not explain which physical action should produce a response.
- Do not introduce gesture demonstrations, arrows, sliders, hand diagrams, or mouse instructions.
- Orange indicates live interaction, blue indicates stored structures, and green is reserved for final selection.

## Production build

```bash
pnpm build
```

Database schema definitions are in `db/schema.ts`; generated migrations are in `drizzle/`.
