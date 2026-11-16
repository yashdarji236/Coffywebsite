/**
 * ============================================================================
 * YOUR CAFÉ — IMMERSIVE COFFEE
 * Continuous Full-Screen Scroll-Driven Cinematic Background Animation Engine
 * ============================================================================
 */

(function () {
    'use strict';

    /* ========================================================================
       1. FRAME SEQUENCE CONFIGURATION
       Configurable frame naming & sequence parameters.
       ======================================================================== */
    const FRAME_CONFIG = {
        // Total number of frames in the sequence
        totalFrames: 260,

        // Path prefix up to the padded number
        prefix: 'assets/ezgif-frame-',

        // File extension
        suffix: '.jpg',

        // Zero-padding digits (e.g. 3 -> "001", "002", etc.)
        padLength: 3,

        // Starting index (1-based for filenames)
        startIndex: 1,

        // Native dimensions of the video frames
        nativeWidth: 1280,
        nativeHeight: 720
    };

    /**
     * Resolves the image path for a given 0-based frame index
     * @param {number} index (0 to totalFrames - 1)
     * @returns {string} File path
     */
    function getFrameUrl(index) {
        const fileNumber = FRAME_CONFIG.startIndex + index;
        const padded = String(fileNumber).padStart(FRAME_CONFIG.padLength, '0');
        return `${FRAME_CONFIG.prefix}${padded}${FRAME_CONFIG.suffix}`;
    }


    /* ========================================================================
       2. DOM REFERENCES
       ======================================================================== */
    const DOM = {
        canvas: document.getElementById('bg-canvas'),
        preloader: document.getElementById('preloader'),
        preloaderBar: document.getElementById('preloader-bar'),
        preloaderPercent: document.getElementById('preloader-percent'),
        preloaderFrames: document.getElementById('preloader-frames'),
        cursor: document.getElementById('custom-cursor'),
        soundToggle: document.getElementById('sound-toggle'),
        soundState: document.getElementById('sound-state'),
        scenes: document.querySelectorAll('.scene-section')
    };

    const ctx = DOM.canvas ? DOM.canvas.getContext('2d', { alpha: false }) : null;


    /* ========================================================================
       3. GLOBAL APPLICATION STATE
       ======================================================================== */
    const state = {
        images: new Array(FRAME_CONFIG.totalFrames),
        loadedCount: 0,
        currentProgress: 0,
        targetProgress: 0,
        renderedFrameIndex: -1,
        isPreloaded: false,
        mouse: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        cursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        audioCtx: null,
        soundPlaying: false
    };


    /* ========================================================================
       4. PRELOADER & FRAME CACHING ENGINE
       ======================================================================== */

    /**
     * Finds the nearest already-loaded frame to avoid black flashing
     * if the user scrolls faster than frame buffering.
     * @param {number} targetIdx 
     * @returns {HTMLImageElement|null}
     */
    function getNearestLoadedImage(targetIdx) {
        if (state.images[targetIdx] && state.images[targetIdx].complete && state.images[targetIdx].naturalWidth > 0) {
            return state.images[targetIdx];
        }

        let minDistance = Infinity;
        let nearestImage = null;

        for (let i = 0; i < FRAME_CONFIG.totalFrames; i++) {
            const img = state.images[i];
            if (img && img.complete && img.naturalWidth > 0) {
                const dist = Math.abs(i - targetIdx);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestImage = img;
                }
            }
        }
        return nearestImage;
    }

    /**
     * Preloads image sequence with priority on the first frame
     */
    function preloadFrames() {
        // 1. Immediately load frame 0 for zero-delay background appearance
        const firstImg = new Image();
        firstImg.src = getFrameUrl(0);
        state.images[0] = firstImg;

        firstImg.onload = () => {
            state.loadedCount++;
            updatePreloaderUI();
            renderFrame(0, true);
        };

        firstImg.onerror = () => {
            console.warn(`Could not load primary frame: ${firstImg.src}`);
        };

        // 2. Progressively load all remaining frames
        for (let i = 1; i < FRAME_CONFIG.totalFrames; i++) {
            const img = new Image();
            img.src = getFrameUrl(i);
            state.images[i] = img;

            img.onload = () => {
                state.loadedCount++;
                updatePreloaderUI();
                if (state.loadedCount >= FRAME_CONFIG.totalFrames) {
                    onPreloadComplete();
                }
            };

            img.onerror = () => {
                // Count errors so preloader doesn't get stuck indefinitely
                state.loadedCount++;
                updatePreloaderUI();
                if (state.loadedCount >= FRAME_CONFIG.totalFrames) {
                    onPreloadComplete();
                }
            };
        }
    }

    function updatePreloaderUI() {
        const percent = Math.min(100, Math.floor((state.loadedCount / FRAME_CONFIG.totalFrames) * 100));
        if (DOM.preloaderBar) DOM.preloaderBar.style.width = `${percent}%`;
        if (DOM.preloaderPercent) DOM.preloaderPercent.textContent = `${percent}%`;
        if (DOM.preloaderFrames) DOM.preloaderFrames.textContent = `${state.loadedCount} / ${FRAME_CONFIG.totalFrames} FRAMES`;

        // Once 85% or more frames are ready, allow smooth entry
        if (percent >= 85 && !state.isPreloaded) {
            onPreloadComplete();
        }
    }

    function onPreloadComplete() {
        if (state.isPreloaded) return;
        state.isPreloaded = true;

        setTimeout(() => {
            if (DOM.preloader) {
                DOM.preloader.classList.add('fade-out');
                setTimeout(() => {
                    DOM.preloader.style.display = 'none';
                }, 800);
            }
        }, 300);
    }


    /* ========================================================================
       5. FULL-SCREEN CANVAS RENDERING ENGINE (OBJECT-FIT: COVER)
       ======================================================================== */

    /**
     * Resizes canvas to cover entire viewport, handling devicePixelRatio for retina crispness.
     */
    function handleResize() {
        if (!DOM.canvas || !ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = window.innerWidth;
        const ch = window.innerHeight;

        DOM.canvas.width = Math.floor(cw * dpr);
        DOM.canvas.height = Math.floor(ch * dpr);

        // Force redraw of current frame
        if (state.renderedFrameIndex >= 0) {
            renderFrame(state.renderedFrameIndex, true);
        }
    }

    /**
     * Draws the image frame using object-fit: cover scaling.
     * Guarantees the coffee product remains prominent without distortion or stretching.
     * @param {number} frameIndex 
     * @param {boolean} forceRedraw 
     */
    function renderFrame(frameIndex, forceRedraw = false) {
        if (!ctx || !DOM.canvas) return;
        if (!forceRedraw && frameIndex === state.renderedFrameIndex) return;

        const img = getNearestLoadedImage(frameIndex);
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const cw = DOM.canvas.width;
        const ch = DOM.canvas.height;
        const iw = img.naturalWidth || FRAME_CONFIG.nativeWidth;
        const ih = img.naturalHeight || FRAME_CONFIG.nativeHeight;

        // Object-cover calculations
        const imgRatio = iw / ih;
        const canvasRatio = cw / ch;

        let renderW, renderH, offsetX, offsetY;

        if (canvasRatio > imgRatio) {
            renderW = cw;
            renderH = cw / imgRatio;
            offsetX = 0;
            offsetY = (ch - renderH) / 2;
        } else {
            renderH = ch;
            renderW = ch * imgRatio;
            offsetX = (cw - renderW) / 2;
            offsetY = 0;
        }

        ctx.fillStyle = '#171412';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, Math.floor(offsetX), Math.floor(offsetY), Math.ceil(renderW), Math.ceil(renderH));

        state.renderedFrameIndex = frameIndex;
    }


    /* ========================================================================
       6. GLOBAL DOCUMENT SCROLL ENGINE
       Maps the complete page scroll progress to the continuous frame timeline.
       ======================================================================== */

    /**
     * Calculates the normalized scroll progress (0.0 to 1.0) of the whole page.
     */
    function updateScrollProgress() {
        const docHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScroll = docHeight - viewportHeight;

        if (maxScroll <= 0) {
            state.targetProgress = 0;
            return;
        }

        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const progress = Math.max(0, Math.min(1, scrollY / maxScroll));
        state.targetProgress = progress;
    }


    /* ========================================================================
       7. SCENE STORYTELLING & DYNAMIC UI TRANSFORMATIONS
       ======================================================================== */

    // Scene progression thresholds across the global scroll timeline
    const SCENE_DATA = [
        { id: 'scene-hero', name: 'SCENE 01 — HERO', start: 0.00, end: 0.16 },
        { id: 'scene-experience', name: 'SCENE 02 — THE EXPERIENCE', start: 0.16, end: 0.32 },
        { id: 'scene-ingredients', name: 'SCENE 03 — THE INGREDIENTS', start: 0.32, end: 0.52 },
        { id: 'scene-craft', name: 'SCENE 04 — THE CRAFT', start: 0.52, end: 0.72 },
        { id: 'scene-product', name: 'SCENE 05 — THE PRODUCT', start: 0.72, end: 0.88 },
        { id: 'scene-cta', name: 'SCENE 06 — FINAL RITUAL', start: 0.88, end: 1.00 }
    ];

    /**
     * Updates active scene storytelling visibility.
     * @param {number} progress (0.0 to 1.0)
     * @param {number} frameIndex (0 to totalFrames - 1)
     */
    function initStorytelling(progress, frameIndex) {
        // Trigger dynamic appearance of scene contents
        DOM.scenes.forEach((section) => {
            const rect = section.getBoundingClientRect();
            const content = section.querySelector('.scene-content');
            if (!content) return;

            // Content is active when sticky container is in view
            if (rect.top <= window.innerHeight * 0.45 && rect.bottom >= window.innerHeight * 0.45) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }


    /* ========================================================================
       8. GSAP SCROLLTRIGGER SYNCHRONIZATION
       ======================================================================== */
    function initScrollAnimations() {
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);

            // Synchronize GSAP with the whole document scroll
            ScrollTrigger.create({
                start: 0,
                end: 'max',
                onUpdate: (self) => {
                    state.targetProgress = self.progress;
                }
            });

            // Smooth parallax and opacity transitions for each scene content
            DOM.scenes.forEach((scene) => {
                const content = scene.querySelector('.scene-content');
                if (!content) return;

                gsap.fromTo(content, 
                    { opacity: 0, y: 35 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 1,
                        ease: 'power2.out',
                        scrollTrigger: {
                            trigger: scene,
                            start: 'top 60%',
                            end: 'bottom 40%',
                            toggleActions: 'play reverse play reverse'
                        }
                    }
                );
            });

            window.addEventListener('load', () => ScrollTrigger.refresh());
        }
    }


    /* ========================================================================
       9. MASTER REQUEST ANIMATION FRAME LOOP
       Provides velvet momentum & reversible timeline rendering.
       ======================================================================== */
    function animationTick() {
        // Smooth dampening (lerp)
        const delta = state.targetProgress - state.currentProgress;
        state.currentProgress += delta * 0.12; // Silky cinematic response

        if (Math.abs(delta) < 0.0001) {
            state.currentProgress = state.targetProgress;
        }

        // Calculate exact frame index (0 to totalFrames - 1)
        const frameIndex = Math.min(
            FRAME_CONFIG.totalFrames - 1,
            Math.max(0, Math.floor(state.currentProgress * (FRAME_CONFIG.totalFrames - 1)))
        );

        // Render background canvas frame
        renderFrame(frameIndex);

        // Update UI, HUD, and storytelling layers
        initStorytelling(state.currentProgress, frameIndex);

        // Update custom cursor with smooth tracking
        if (DOM.cursor) {
            state.cursorPos.x += (state.mouse.x - state.cursorPos.x) * 0.2;
            state.cursorPos.y += (state.mouse.y - state.cursorPos.y) * 0.2;
            DOM.cursor.style.transform = `translate3d(${state.cursorPos.x}px, ${state.cursorPos.y}px, 0)`;
        }

        requestAnimationFrame(animationTick);
    }


    /* ========================================================================
       10. UI INTERACTIONS & SOUND SYNTHESIS
       ======================================================================== */
    function initUIInteractions() {
        // Track mouse coordinates for cursor
        window.addEventListener('mousemove', (e) => {
            state.mouse.x = e.clientX;
            state.mouse.y = e.clientY;
        });

        // Hover expansions for interactive elements
        const hoverables = document.querySelectorAll('a, button, input, .ing-item, .metric-line');
        hoverables.forEach((el) => {
            el.addEventListener('mouseenter', () => DOM.cursor?.classList.add('active'));
            el.addEventListener('mouseleave', () => DOM.cursor?.classList.remove('active'));
        });
    }

    /**
     * Web Audio API ambient acoustic generator (gentle roastery warmth & steam).
     */
    function initAmbientSound() {
        if (!DOM.soundToggle) return;

        let noiseNode = null;
        let gainNode = null;
        let filterNode = null;

        function startSound() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!state.audioCtx) {
                    state.audioCtx = new AudioContext();
                }
                if (state.audioCtx.state === 'suspended') {
                    state.audioCtx.resume();
                }

                const bufferSize = state.audioCtx.sampleRate * 2;
                const buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + white * 0.0555179;
                    b1 = 0.99332 * b1 + white * 0.0750759;
                    b2 = 0.96900 * b2 + white * 0.1538520;
                    b3 = 0.86650 * b3 + white * 0.3104856;
                    b4 = 0.55000 * b4 + white * 0.5329522;
                    b5 = -0.7616 * b5 - white * 0.0168980;
                    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                    data[i] *= 0.035;
                    b6 = white * 0.115926;
                }

                noiseNode = state.audioCtx.createBufferSource();
                noiseNode.buffer = buffer;
                noiseNode.loop = true;

                filterNode = state.audioCtx.createBiquadFilter();
                filterNode.type = 'lowpass';
                filterNode.frequency.setValueAtTime(360, state.audioCtx.currentTime);

                gainNode = state.audioCtx.createGain();
                gainNode.gain.setValueAtTime(0.01, state.audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.3, state.audioCtx.currentTime + 1.5);

                noiseNode.connect(filterNode);
                filterNode.connect(gainNode);
                gainNode.connect(state.audioCtx.destination);

                noiseNode.start();
                state.soundPlaying = true;
                DOM.soundToggle.classList.add('playing');
                if (DOM.soundState) DOM.soundState.textContent = 'ON';
            } catch (err) {
                console.warn('Audio synthesis not supported or blocked:', err);
            }
        }

        function stopSound() {
            if (gainNode && state.audioCtx) {
                gainNode.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.8);
                setTimeout(() => {
                    try {
                        noiseNode?.stop();
                        noiseNode?.disconnect();
                    } catch (e) {}
                    state.soundPlaying = false;
                    DOM.soundToggle.classList.remove('playing');
                    if (DOM.soundState) DOM.soundState.textContent = 'OFF';
                }, 850);
            }
        }

        DOM.soundToggle.addEventListener('click', () => {
            if (!state.soundPlaying) {
                startSound();
            } else {
                stopSound();
            }
        });
    }


    /* ========================================================================
       11. EVENT LISTENERS
       ======================================================================== */
    function attachListeners() {
        // Native scroll listener for continuous progress computation
        window.addEventListener('scroll', updateScrollProgress, { passive: true });

        // Debounced resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                handleResize();
                updateScrollProgress();
                if (typeof ScrollTrigger !== 'undefined') {
                    ScrollTrigger.refresh();
                }
            }, 100);
        });

        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                handleResize();
                updateScrollProgress();
            }, 250);
        });
    }


    /* ========================================================================
       12. INITIALIZATION LIFECYCLE
       ======================================================================== */
    function init() {
        handleResize();
        preloadFrames();
        initScrollAnimations();
        initUIInteractions();
        initAmbientSound();
        attachListeners();

        // Calculate initial scroll
        updateScrollProgress();

        // Start continuous RAF render loop
        requestAnimationFrame(animationTick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

