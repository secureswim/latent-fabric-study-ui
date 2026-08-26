# Latent Fabric Gesture Elicitation Study

This project is a frontend-only Wizard-of-Oz interface for conducting the Latent Fabric gesture elicitation study. It has two synchronized views:

- `/` - participant-facing projected interface
- `/researcher` - private researcher control console

The participant physically interacts with the deformable fabric. The researcher observes the action, records it, and manually triggers the corresponding visual response.

## 1. Requirements

- Node.js 22.13 or newer
- pnpm
- A Chromium-based browser is recommended
- A projector or second display for the participant view

No database, server account, ML model, camera integration, or sensor connection is required. All study data remains in the browser until exported.

## 2. Install and run

Open a terminal in the extracted project folder and run:

```bash
pnpm install
pnpm dev
```

The terminal will print the local address, normally:

```text
http://localhost:3000
```

Keep the development server running throughout the study.

## 3. Open the two study views

Open both URLs in the same browser profile:

1. Participant display: `http://localhost:3000/`
2. Researcher console: `http://localhost:3000/researcher`

Put the participant display on the projector or second screen. Keep the researcher console on the researcher's private screen.

The views synchronize through `BroadcastChannel` and `localStorage`. A change in the researcher console should appear immediately on the participant display.

Do not show `/researcher` to the participant. It contains canonical referent names and explicit Wizard-of-Oz controls that would bias the elicitation study.

## 4. Configure a session

1. Open `/researcher`.
2. Select the **SESSION** tab.
3. Enter the participant ID, for example `P07`.
4. Choose counterbalanced sequence A, B, C, or D.
5. Optionally enter the researcher initials.
6. Keep **Neutral elicitation mode** enabled for the actual gesture study.
7. Confirm that the participant screen is visible on the projected display.

The selected sequence is shown only to the researcher.

## 5. Run the introductory phases

Use the phase buttons in the **SESSION** tab in this order:

### Step 1 - Welcome

Click **WELCOME**. The participant sees the study title and a neutral description.

### Step 2 - Material familiarization

Click **FAMILIARIZATION**. Give the participant time to touch and manipulate the fabric freely. Do not explain gesture mappings or what movement and deformation mean.

### Step 3 - Practice

Click **PRACTICE**. Explain the study procedure, not a gesture. The participant should understand that there are no predefined correct actions.

### Step 4 - Main elicitation

Click **MAIN ELICITATION**, then switch to the **OBSERVE** tab.

## 6. Conduct an elicitation trial

Repeat this procedure for every trial:

1. Confirm the correct trial is selected in the left trial list.
2. Read the canonical referent name privately in the researcher console.
3. Click **START TRIAL**.
4. Allow the participant to read the neutral projected prompt.
5. Ask the participant to perform the first physical action that feels natural.
6. Click **MARK FIRST CAPTURED**.
7. Ask the participant to repeat the same action once.
8. Click **MARK REPEAT CAPTURED**.
9. Click the large orange **TRIGGER RESPONSE** button.
10. Observe the simulated visual consequence on the participant display.
11. Click **WHY QUESTION** and record the participant's explanation.
12. Click **EXPECTATION QUESTION** and record what the participant expected the surface to do.
13. Click **NATURALNESS**, ask the participant to say a number from 1 to 5, and record it.
14. Click **CONFIDENCE**, ask the participant to say a number from 1 to 5, and record it.
15. Complete the observation form.
16. Click **SAVE + NEXT TRIAL**.

The participant-facing prompt communicates the desired outcome but never names or demonstrates the expected gesture.

## 7. Use the response palette

The large **TRIGGER RESPONSE** button selects the expected mock response for the current referent. The **Mock Response Palette** can be used to override it manually.

Available responses include:

- Traverse
- Nearby variation
- Distant variation
- Broaden field
- Save current state
- Restore anchor
- Create branch
- Lock component
- Unlock component
- Undo
- Show comparison
- Show history
- Reset
- Commit selection
- Uncertain contact

These controls must remain hidden from the participant.

### Anchors

**Save current state** creates a blue square marker, adds an anchor tile, and records an anchor timeline node without moving the current design.

### Returning and branching

**Restore anchor** returns to a preserved state. **Create branch** retains the original exploration path while creating a new active branch.

### Component locking

**Lock component** preserves the chair backrest in the mockup. The preview and component list indicate that the part is locked. **Unlock component** releases it.

### Final selection

**Commit selection** uses green framing and confirmation styling. Green is reserved for committed outcomes and is visually distinct from blue anchors.

### Uncertain contact

**Uncertain contact** shows a dashed, low-confidence marker without treating the input as committed.

## 8. Complete the observation form

The observation panel records the taxonomy required by the study protocol.

### Gesture geometry

Record:

- one or two hands
- finger, multiple fingers, palm, or whole hand
- initial and final contact regions
- direction
- path shape
- movement distance and surface area, when relevant

### Deformation and timing

Record:

- approximate Z depth
- duration at maximum depth
- deformation rate
- elicitation time
- gesture duration
- repetition count
- hesitation

### Behavioural structure

Classify the action as appropriate:

- discrete or continuous
- static or dynamic
- single-touch or multitouch
- spatial or non-spatial
- deformation-based, planar, or mixed
- symbolic, direct manipulation, or mixed

### Subjective responses

Record:

- naturalness, 1-5
- confidence, 1-5
- why the participant chose the action
- what response the participant expected
- additional researcher notes

## 9. Run the post-study interview

1. Open the **INTERVIEW** tab.
2. Click **SHOW NEUTRAL INTERVIEW SCREEN TO PARTICIPANT** if a projected transition is desired.
3. Ask each interview question verbally.
4. Enter structured notes beside each question.

The interview covers movement, deformation, physical naturalness, actions better suited to buttons, gesture ambiguity, surface metaphors, hand-count meaning, and expected interactions that were not tested.

## 10. Review and export the session

1. Open the **SUMMARY** tab.
2. Review completed trials, average naturalness, average confidence, and deformation usage.
3. Click **EXPORT SESSION JSON** for the complete structured record.
4. Click **EXPORT CSV** for spreadsheet analysis.
5. Store both files using the participant ID and the study's data-handling procedure.
6. Click **SHOW SESSION COMPLETE** when the session is finished.

JSON is the most complete export. CSV is useful for quantitative analysis and coding workflows.

## 11. Pause, resume, or revisit a trial

- Use **PAUSE SESSION** if the study is interrupted.
- Use **RESUME SESSION** to continue.
- Select a trial in the left column to revisit it.
- Use **PREVIOUS** to move back one trial.
- Saving a revisited trial replaces the locally stored record for that trial number.

## 12. Refresh and recovery

The current session state and trial logs are saved in browser `localStorage`.

- Refreshing either page should retain the session.
- Reopening the pages in the same browser profile should restore the session.
- Incognito windows, another browser profile, or another computer do not share the stored session.
- Clearing site data removes unsaved local study data.

Export the session before clearing browser storage or moving to another machine.

## 13. Projection and study-validity checklist

Before every session, confirm:

- The participant sees only `/`.
- The researcher sees `/researcher` privately.
- Neutral elicitation mode is enabled.
- No mouse or visible participant controls are presented as the interaction method.
- No gesture demonstrations, hand illustrations, arrows, sliders, or named gesture commands are visible.
- The entire 2:1 instrument layout is legible on the projection surface.
- Orange means current/live interaction.
- Blue means a stored anchor or branch.
- Green appears only for final selection.
- The participant is reminded that there are no predefined correct gestures.

## 14. Production build

To verify or package the app for production:

```bash
pnpm build
```

The project is frontend-only. No backend configuration is required.

## 15. Troubleshooting

### The two views do not synchronize

- Confirm both URLs use exactly the same origin, normally `http://localhost:3000`.
- Confirm both views are open in the same browser profile.
- Refresh both views.
- Do not mix `localhost` and `127.0.0.1`; browsers treat them as different origins.

### The researcher page shows old session data

Export any needed records first, then clear the site's local storage in browser developer settings and refresh both pages.

### The layout appears cropped

The participant interface intentionally preserves a wide, approximately 2:1 instrument composition. Use a 16:9 or wider browser window, hide browser chrome where possible, and fit the projected browser window to the active surface.

### The development server stops

Return to the terminal and run:

```bash
pnpm dev
```

Then reopen both URLs.
