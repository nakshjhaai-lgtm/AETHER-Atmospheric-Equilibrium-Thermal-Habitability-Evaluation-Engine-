 AETHER (Atmospheric Equilibrium & Thermal Habitability Evaluation Engine)


Try It Here:- https://aetherplanetary.netlify.app/ 


## 1. The Big Picture (Project Overview)
AETHER is a web-based, interactive planetary physics simulator that lets users build and evaluate the habitability of alien worlds in real time. Think of it as a highly responsive, digital planetarium that fits in your pocket.
**What problem this solves and for whom:**
Historically, exoplanet simulators were either heavily academic tools locked behind complex command-line interfaces or overly simplified web toys that just guessed at planetary temperatures. AETHER bridges this gap. It gives space enthusiasts, educators, and researchers a highly precise, data-rich analysis dashboard that runs smoothly on a mobile phone without dumbing down the actual astrophysics.
**The User Journey:**
If AETHER were a high-end soundboard in a recording studio, the user is the producer sliding the dials. You start by selecting a base star, like a yellow sun or a red dwarf. Then, using sliders, you push the planet closer to the star, change its mass, or thicken its atmosphere. The moment you move a slider, the planet visually transforms on screen, the surrounding data readouts instantly recalculate, and an ambient audio track shifts in pitch to reflect the new temperature.
## 2. Technical Architecture — The Blueprint
If most modern web apps are like sprawling restaurant chains—relying on a central corporate office (the backend server) to approve menu changes and send supplies—AETHER is a fully stocked, self-sufficient food truck. It carries all its own ingredients and does all the cooking right in front of the customer.
**The Architecture Diagram:**
```text
[ User Inputs (Sliders/Touches) ] 
       │
       ▼
[ Orchestrator (app.js) ] ──▶ [ Math Engine (mathEngine.js) ] (The Brain)
       │                              │ Calculates temp, gravity, similarity
       │                              ▼
       ├────────────────────▶ [ Shader Engine (shaderEngine.js) ] (The Paintbrush)
       │                              │ Draws the planet, handles 3D space
       │                              ▼
       └────────────────────▶ [ Audio Engine (audioEngine.js) ] (The Voice)
                                      │ Generates atmospheric sounds

```
**Why this design?**
AETHER is a "pure-client" application. There is no backend server, no database, and no API keys. All calculations happen directly inside the user's web browser.
 * **Why we did it:** This eliminates server hosting costs, avoids network lag, and ensures that when a user moves a slider, the planet reacts instantly (within 0.15 milliseconds).
 * **The Trade-off:** Because we don't have a massive server farm doing the heavy lifting, the code running on the user's phone has to be incredibly lightweight and ruthlessly optimized to prevent the device's battery from draining or the screen from stuttering.
## 3. Codebase Structure — The Filing System
Think of the codebase like a theater production. You have the stage, the director, the script, the lighting crew, and the orchestra.
```text
aether-mvp/
├── index.html          (The Stage)
├── css/
│   └── app.css         (The Set Design & Costumes)
└── js/
    ├── app.js          (The Director)
    ├── mathEngine.js   (The Script / Laws of Physics)
    ├── shaderEngine.js (The Lighting & Visual Effects)
    └── audioEngine.js  (The Orchestra)

```
 * **index.html**: The skeleton of the app. It sets up the layout, the buttons, and the invisible canvas where the 3D graphics will be drawn.
 * **css/app.css**: Controls how everything looks. It manages the "glassmorphism" style (semi-transparent panels), the colors, and how the layout shifts when you move from a wide desktop screen to a narrow mobile phone.
 * **js/app.js**: The central orchestrator. It listens for your button clicks and slider movements, then yells at the other files to do their jobs. You open this file when you want to change how the app responds to user actions.
 * **js/mathEngine.js**: The physics brain. It holds the complex formulas that figure out how hot a planet gets based on its atmosphere and star.
 * **js/shaderEngine.js**: The visual workhorse. It takes the numbers from the math engine and uses them to paint the 3D planet on your screen, coloring the oceans and drawing the clouds.
 * **js/audioEngine.js**: The sound generator. It creates live audio frequencies based on the planet's temperature and atmospheric thickness.
## 4. Connections & Data Flow — How Things Talk to Each Other
Let's trace a specific action to see how the system communicates.
**Action: The user thickens the planet's atmosphere (increasing "Optical Depth").**
 1. **The Trigger:** The user drags the atmosphere slider to the right. The slider rings a bell inside app.js to announce a change.
 2. **The Calculation:** app.js immediately hands the new slider number to mathEngine.js. The math engine calculates the new, much hotter surface temperature (because a thicker atmosphere traps more heat).
 3. **The Visuals:** app.js then hands that new hot temperature to shaderEngine.js. The shader engine checks its rules, sees the planet is now boiling, and repaints the blue oceans into a glowing orange runaway greenhouse state.
 4. **The Sound:** Finally, app.js tells audioEngine.js about the thick atmosphere. The audio engine applies a "low-pass filter," making the ambient sound muffled and deep, like listening underwater.
**What could go wrong here?**
To use the device's gyroscope (to look around the 3D space by tilting your phone) or to play audio, Apple and Google require a deliberate user action, like a button click. If the app tries to start the audio engine automatically when the page loads, the phone's security system will silently block it, and the app will break or remain mute.
## 5. Technology Choices — The Toolbox
| Technology | What It Does Here | Why This One | Watch Out For |
|---|---|---|---|
| **Vanilla JavaScript** | Runs the entire application's logic without heavy frameworks. | We skipped big frameworks like React or Vue to keep the file size tiny (under 36 KB) and ensure the physics math runs instantly without overhead. | It requires writing more manual code to connect the sliders to the visual updates. |
| **Three.js** | Draws the 3D planet and stars in the background. | It is the industry standard for 3D web graphics, doing the heavy lifting of talking to the device's graphics card. | Rendering 3D graphics on a phone can easily drain the battery if not optimized. |
| **Web Audio API** | Synthesizes the ambient space sounds live. | We generate sounds with math rather than downloading heavy MP3 audio files, saving massive amounts of bandwidth. | Browsers strictly block audio from playing until the user explicitly clicks a "play" button. |
| **Device Orientation API** | Tracks how the user tilts their mobile phone. | Allows users to look around the planet by simply moving their device, creating a native app feel. | iPhones strictly require the site to be hosted on a secure connection (HTTPS) to allow this. |
## 6. Environment & Configuration
Because AETHER is a pure-client application, setting it up is incredibly simple.
 * **Environments:** There is no difference between a "development" environment and "production". What you run on your laptop is exactly what goes to the live server.
 * **Variables and Secrets:** There are absolutely zero .env files, API keys, database passwords, or secret tokens.
 * **Hosting:** You can drop this folder into any basic static file host (like GitHub Pages, Netlify, or Vercel) and it will work immediately.
**What could go wrong:** If you ever decide to add a database later (for example, letting users save their favorite planets), you will suddenly need to introduce servers, authentication, and secure environment variables, fundamentally changing how the app is hosted and deployed.
## 7. Lessons Learned — The War Stories
**Bugs & Fixes: The "Glass" that Broke the Graphics Card**
Early on, the app featured 17 stacked "blur filters" to create beautiful, frosted-glass menus overlapping the 3D background.
 * *The Cause:* Reading the 3D canvas and blurring it in real-time is computationally exhausting for a phone.
 * *The Fix:* We had to completely rip out the backdrop-filter CSS properties. The lesson here is that visual polish can easily destroy performance if you aren't testing on older mobile devices.
**Pitfalls & Landmines: The Anti-Aliasing Trap**
Anti-aliasing is a graphics trick that smooths out jagged edges on 3D shapes. Usually, you want this on.
 * *The Problem:* We found that leaving anti-aliasing on was the single biggest cause of frame-rate drops on mobile devices.
 * *The Fix:* We explicitly turned it off (antialias: false) and capped the screen resolution. The procedural planet still looks great, and the app now runs flawlessly at 60 frames per second. If anyone tries to turn anti-aliasing back on in shaderEngine.js to make it look slightly smoother, mobile performance will instantly tank.
**Engineering Wisdom: Trust the GPU**
Normally, to draw a realistic planet, you would download a massive image file of a rocky surface and wrap it around a 3D sphere.
Instead, we built custom "shaders" (code that runs directly on the graphics card) to mathematically generate mountains, oceans, and clouds from scratch using noise algorithms. This means we don't have to force the user to download large images, keeping the app lightning-fast and under 240 Kilobytes.
## 8. Quick Reference Card
 * **How to run locally:** Open your computer's terminal, navigate to the aether-mvp folder, and type python3 -m http.server 8080. Then open your web browser and go to http://localhost:8080.
 * **Security rule:** If you are testing the gyroscope feature on an iPhone, you *must* serve the site over HTTPS, or Apple will block the sensors.
 * **Where things start:** If you need to trace a bug, always start in js/app.js. It acts as the grand central station for all data moving through the app.
