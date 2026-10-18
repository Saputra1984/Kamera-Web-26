// STATE GLOBAL
const appMemory = {
    db: null,
    stream: null,
    mediaRecorder: null,
    videoChunks: [],
    isRecording: false,
    currentFacingMode: "environment",
    currentMode: "foto",
    defaultFormatFoto: "webp",
    exportQuality: "standar",
    activeFeature: "normal",
    featureSliderValues: {
        normal: -0.5,
        hdr_natural: 0.0,
        ketajaman: 1.0,
        jendela: -1.5,
        kain: 1.4,
        teks: 2.2,
        gelap: 1.8,
        malam: 1.3,
        objek: 1.0,
        zoom: 1.5,
        default: 0.0
    },
    currentRotationAngle: 0,
    timerIndex: 0,
    currentHardwareExposure: 0.0,   // FIX BUG 11: init properti
    exposureStabilizerInterval: null,
    orientationThrottleTimer: null
};

let currentBoosterMode = "default";

// INIT
document.addEventListener("DOMContentLoaded", () => {
    if (window.APP_DATABASE) {
        appMemory.db = window.APP_DATABASE;

        // FIX BUG 7: sinkronkan format default dari database
        const dbSettings = appMemory.db.app_config.settings;
        if (dbSettings && dbSettings.default_format_foto) {
            let fmt = dbSettings.default_format_foto;
            if (fmt === "webp_max") fmt = "webp";
            if (fmt === "jpeg_hr") fmt = "jpeg";
            appMemory.defaultFormatFoto = fmt;
        }

        // Sinkronkan facing mode
        if (dbSettings && dbSettings.default_facing) {
            appMemory.currentFacingMode = dbSettings.default_facing;
        }

        initApp();
    }
});

function initApp() {
    setupEventListeners();
    applyBlueprintUI();
    startCamera();

    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientationChange, true);
    }

    history.pushState({ app: 'main' }, '');
    window.addEventListener('popstate', handleBackButton);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && appMemory.isRecording) {
            console.warn("[Video] Halaman disembunyikan — menghentikan rekaman otomatis");
            try {
                if (appMemory.mediaRecorder && appMemory.mediaRecorder.state !== "inactive") {
                    appMemory.mediaRecorder.stop();
                }
            } catch (e) { /* ignore */ }
        }
    });
}

// APPLY BLUEPRINT UI
function applyBlueprintUI() {
    const blueprint = appMemory.db.navigation_buttons;

    for (const key in blueprint) {
        const btnConfig = blueprint[key];
        const el = document.getElementById(btnConfig.id);
        if (!el) continue;

        if (btnConfig.ui_coordinate) {
            for (const prop in btnConfig.ui_coordinate) {
                const jsProp = prop.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
                                   .replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                try {
                    el.style[jsProp] = btnConfig.ui_coordinate[prop];
                } catch (e) {
                    console.warn(`[UI] Gagal set ${prop}:`, e.message);
                }
            }
        }
        if (btnConfig.transition) el.style.transition = btnConfig.transition;

        if (btnConfig.label && btnConfig.type !== "container") {
            el.innerText = btnConfig.label;
        }

        // FIX BUG 2: Slider vertikal — pakai writing-mode (bukan -webkit-appearance deprecated)
        if (btnConfig.type === "slider") {
            el.style.writingMode = "vertical-lr";
            el.style.direction = "rtl";
            el.style.webkitAppearance = "none";
            el.style.appearance = "none";
            el.style.background = "rgba(255,255,255,0.15)";
            el.style.borderRadius = "10px";
            el.style.outline = "none";

            // Batasan nilai awal dari registry
            const activeRoute = appMemory.db.slider_booster_routing.registry[appMemory.activeFeature]
                             || appMemory.db.slider_booster_routing.registry.default;
            el.min = activeRoute.min;
            el.max = activeRoute.max;
            el.step = activeRoute.step;
            el.value = activeRoute.default_value;
        }
    }

    renderRightContainerButtons(blueprint.right_actions_container);
}

function renderRightContainerButtons(config) {
    const container = document.getElementById('right_actions_container');
    if (!container || !config || !config.child_buttons) return;

    container.innerHTML = '';
    config.child_buttons.forEach(btn => {
        const buttonEl = document.createElement('button');
        buttonEl.id = btn.id;
        buttonEl.innerHTML = `<span class="icon-art" style="display:inline-block; transition: transform 0.3s ease;">${btn.label}</span>`;

        buttonEl.style.width = btn.width || '46px';
        buttonEl.style.height = btn.height || '46px';
        buttonEl.style.background = btn.background || 'rgba(255,255,255,0.2)';
        buttonEl.style.borderRadius = btn.border_radius || btn["border-radius"] || '50%';
        buttonEl.style.color = btn.color || '#fff';
        buttonEl.style.border = "none";
        buttonEl.style.fontSize = "20px";
        buttonEl.style.display = "flex";
        buttonEl.style.alignItems = "center";
        buttonEl.style.justifyContent = "center";
        buttonEl.style.cursor = "pointer";

        buttonEl.onclick = (e) => {
            e.stopPropagation();
            executeAction(btn.action, null);
        };
        container.appendChild(buttonEl);
    });
}

// ORIENTATION HANDLING (FIX BUG 10: throttle)
function handleOrientationChange(event) {
    if (appMemory.orientationThrottleTimer) return;
    appMemory.orientationThrottleTimer = setTimeout(() => {
        appMemory.orientationThrottleTimer = null;
    }, 150);

    let beta = event.beta;
    let gamma = event.gamma;
    let targetAngle = appMemory.currentRotationAngle;

    if (beta > 45 && beta < 135) {
        targetAngle = 180;
    } else if (gamma < -35) {
        targetAngle = 90;
    } else if (gamma > 35) {
        targetAngle = -90;
    } else if (beta > -45 && beta < 45 && Math.abs(gamma) < 30) {
        targetAngle = 0;
    }

    if (targetAngle !== appMemory.currentRotationAngle) {
        appMemory.currentRotationAngle = targetAngle;
        executeRotationBlueprint(targetAngle);
    }
}

function executeRotationBlueprint(angle) {
    const blueprint = appMemory.db.navigation_buttons;
    const videoEl = document.getElementById('camera-view');
    const adapt = appMemory.db.viewport_adaptation;

    if (videoEl && adapt) {
        const isLandscape = (angle === 90 || angle === -90);
        videoEl.style.cssText = isLandscape ? adapt.landscape.video_css : adapt.portrait.video_css;
    }

    const smoothTransition = "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    const kunciStabilitasTeks = (el) => {
        if (!el) return;
        el.style.transition = smoothTransition;
        el.style.backfaceVisibility = "hidden";
        el.style.webkitBackfaceVisibility = "hidden";
        el.style.willChange = "transform";
    };

    for (const key in blueprint) {
        const btnConfig = blueprint[key];
        const el = document.getElementById(btnConfig.id);

        if (el && btnConfig.allow_rotation) {
            kunciStabilitasTeks(el);

            if (btnConfig.rotation_mode === "icon_only") {
                if (btnConfig.id === "right_actions_container") {
                    const icons = el.querySelectorAll('.icon-art');
                    icons.forEach(ico => {
                        kunciStabilitasTeks(ico);
                        ico.style.transform = `rotate(${angle}deg)`;
                    });
                } else {
                    if (btnConfig.id === "shutter_btn") {
                        el.style.transform = `translateX(-50%) rotate(${angle}deg)`;
                    } else {
                        el.style.transform = `rotate(${angle}deg)`;
                    }
                }
            }
            else if (btnConfig.rotation_mode === "layout_follow") {
                el.style.transform = `rotate(${angle}deg)`;
            }
        }
    }
}

// MENU DROPDOWN
function renderDropdownMenuItems() {
    const menuContainer = document.getElementById('dropdownMenu');
    if (!menuContainer || !appMemory.db.menu_titik_tiga) return;

    menuContainer.innerHTML = '';

    appMemory.db.menu_titik_tiga.forEach(group => {
        const header = document.createElement('div');
        header.innerText = group.label;
        header.style.color = '#888';
        header.style.fontSize = '12px';
        header.style.margin = '12px 0 6px 0';
        header.style.fontWeight = 'bold';
        header.style.borderBottom = '1px solid #222';
        header.style.paddingBottom = '4px';
        menuContainer.appendChild(header);

        const items = group.sub_menu || group.items || [];
        items.forEach(item => {
            const itemBtn = document.createElement('button');
            let isSelected = false;

            if (item.action === "setFormat") {
                isSelected = (appMemory.defaultFormatFoto === item.value
                    || appMemory.db.app_config.settings.default_format_video === item.value);
            } else if (item.action === "setExportQuality") {
                isSelected = (appMemory.exportQuality === item.value);
            } else if (item.action === "setActiveFeature") {
                isSelected = (appMemory.activeFeature === item.value);
            }

            itemBtn.innerText = isSelected ? `✓ ${item.label}` : item.label;
            styleMenuItem(itemBtn);

            if (isSelected) {
                itemBtn.style.color = '#4caf50';
                itemBtn.style.fontWeight = 'bold';
                itemBtn.style.background = 'rgba(76, 175, 80, 0.05)';
            }

            itemBtn.onclick = (e) => {
                e.stopPropagation();
                executeAction(item.action, item.value);
                renderDropdownMenuItems();
            };

            menuContainer.appendChild(itemBtn);
        });
    });
}

function styleMenuItem(btn) {
    btn.style.background = 'transparent';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.textAlign = 'left';
    btn.style.padding = '8px 4px';
    btn.style.fontSize = '14px';
    btn.style.cursor = 'pointer';
    btn.style.width = '100%';
}

// EVENT LISTENERS
function setupEventListeners() {
    const blueprint = appMemory.db.navigation_buttons;

    let focusBox = document.getElementById('focus-box');
    if (!focusBox) {
        focusBox = document.createElement('div');
        focusBox.id = 'focus-box';
        document.body.appendChild(focusBox);
    }
    // FIX: pastikan focusBox punya styling dari blueprint
    if (blueprint["focus-box"] && blueprint["focus-box"].ui_coordinate) {
        for (const prop in blueprint["focus-box"].ui_coordinate) {
            const jsProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            focusBox.style[jsProp] = blueprint["focus-box"].ui_coordinate[prop];
        }
    }

    for (const key in blueprint) {
        const btnConfig = blueprint[key];
        const el = document.getElementById(btnConfig.id);

        if (el && btnConfig.action && btnConfig.type !== "container") {
            el.onclick = (e) => {
                e.stopPropagation();
                executeAction(btnConfig.action, btnConfig.value || null);
            };
        }
    }

    const slider = document.getElementById('expSlider');
    if (slider) {
        slider.oninput = (e) => {
            executeAction("setExposure", e.target.value);
        };
    }

    const videoView = document.getElementById('camera-view');
    if (videoView) {
        videoView.style.transition = "transform 0.15s ease-out, filter 0.1s ease-out";
        videoView.style.transformOrigin = "center center";

        videoView.onclick = (e) => {
            const menu = document.getElementById('dropdownMenu');
            if (menu) menu.style.display = 'none';

            const rect = videoView.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (focusBox) {
                focusBox.style.left = `${e.clientX}px`;
                focusBox.style.top = `${e.clientY}px`;
                focusBox.style.display = 'block';
                focusBox.style.transform = 'translate(-50%, -50%) scale(1.3)';

                setTimeout(() => {
                    focusBox.style.transform = 'translate(-50%, -50%) scale(1.0)';
                }, 150);

                setTimeout(() => {
                    focusBox.style.display = 'none';
                }, 2000);
            }

            triggerHardwareFocus(x / rect.width, y / rect.height);
        };
    }
}

// SLIDER BOOSTER
function switchSliderBooster(modeName) {
    const registry = appMemory.db.slider_booster_routing.registry;
    if (!registry[modeName]) modeName = "default";

    currentBoosterMode = modeName;
    const config = registry[modeName];
    const sliderEl = document.getElementById("expSlider");

    if (sliderEl) {
        sliderEl.min = config.min;
        sliderEl.max = config.max;
        sliderEl.step = config.step;

        const savedValue = appMemory.featureSliderValues[modeName];
        sliderEl.value = (savedValue !== undefined) ? savedValue : config.default_value;

        console.log(`[Slider] Mode: ${config.name} (${modeName}) = ${sliderEl.value}`);
        applyBoosterEffect(sliderEl.value);
    }
}

function applyBoosterEffect(value) {
    const config = appMemory.db.slider_booster_routing.registry[currentBoosterMode];
    if (!config) return;

    const numericValue = parseFloat(value);
    const videoEl = document.querySelector("#camera-view");

    if (appMemory.activeFeature) {
        appMemory.featureSliderValues[appMemory.activeFeature] = numericValue;
    }

    // Simpan ke target_database_path
    if (config.target_database_path) {
        const paths = config.target_database_path.split('.');
        let currentObj = window.APP_DATABASE;
        for (let i = 0; i < paths.length - 1; i++) {
            if (!currentObj[paths[i]]) currentObj[paths[i]] = {};
            currentObj = currentObj[paths[i]];
        }
        currentObj[paths[paths.length - 1]] = numericValue;
    }

    if (!videoEl) return;

    if (config.realtime_feedback_formula !== "zoom_transform") {
        videoEl.style.transform = "scale(1)";
    }

    if (config.realtime_feedback_formula === "brightness") {
        videoEl.style.filter = `brightness(${1 + (numericValue * 0.15)})`;
        appMemory.currentHardwareExposure = numericValue;
        applyHardwareExposure();
    }
    else if (config.realtime_feedback_formula === "convolution_intensity"
          || config.realtime_feedback_formula === "kernel_multiplier") {
        const contrastBoost = 1 + (numericValue * 0.15);
        videoEl.style.filter = `contrast(${contrastBoost}) saturate(1.05)`;
    }
    else if (config.realtime_feedback_formula === "glare_cut"
          || config.realtime_feedback_formula === "chroma_lock") {
        const dimFactor = 1 - (numericValue * 0.2);
        videoEl.style.filter = `brightness(${dimFactor}) contrast(1.15)`;
    }
    else if (config.realtime_feedback_formula === "zoom_transform") {
        applyDigitalZoom(numericValue);
    }
}

// CAMERA DRIVER
function startCamera(needsAudio = false) {
    window.cameraTrack = null;

    if (appMemory.stream) {
        appMemory.stream.getTracks().forEach(track => track.stop());
        appMemory.stream = null;
    }

    const config = appMemory.db.camera_hardware_config;

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: appMemory.currentFacingMode || "environment",
            width: { ideal: config.ideal_width },
            height: { ideal: config.ideal_height },
            aspectRatio: config.aspect_ratio
        },
        audio: needsAudio
    }).then(stream => {
        appMemory.stream = stream;
        window.cameraTrack = stream.getVideoTracks()[0];

        const videoEl = document.getElementById('camera-view');
        if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.onloadedmetadata = () => {
                videoEl.play();

                // FIX BUG 1: mulai auto-exposure stabilizer
                startExposureStabilizer();

                applyHardwareExposure();
                switchSliderBooster(appMemory.activeFeature);
            };
        }

        // Hapus overlay error kalau ada
        const errOverlay = document.getElementById('camera-error-overlay');
        if (errOverlay) errOverlay.remove();

    }).catch(err => {
        console.error("[Driver] Gagal membuka kamera:", err);
        // FIX BUG 5: tampilkan error ke user
        showCameraError(err);
    });
}

function showCameraError(err) {
    let overlay = document.getElementById('camera-error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'camera-error-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); color: #fff; z-index: 99999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 20px; text-align: center; font-family: sans-serif;
        `;
        document.body.appendChild(overlay);
    }

    const msg = err.name === 'NotAllowedError' ? 'Izin kamera ditolak.\nAktifkan izin kamera di pengaturan situs, lalu muat ulang.' :
                err.name === 'NotFoundError' ? 'Kamera tidak ditemukan di perangkat ini.' :
                err.name === 'NotReadableError' ? 'Kamera sedang dipakai aplikasi lain.' :
                (err.message || 'Error tidak diketahui');

    overlay.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">📷</div>
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">Kamera tidak bisa dibuka</div>
        <div style="font-size: 13px; color: #ccc; max-width: 320px; line-height: 1.6; white-space: pre-line;">${msg}</div>
        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #2196F3; border: none; border-radius: 8px; color: #fff; font-size: 14px; font-weight: bold; cursor: pointer;">Coba Lagi</button>
    `;
}

function applyHardwareExposure() {
    if (!window.cameraTrack) return;
    if (typeof window.cameraTrack.getCapabilities !== "function") return;

    const capabilities = window.cameraTrack.getCapabilities();
    if (!capabilities.exposureCompensation) return;

    const expValue = appMemory.currentHardwareExposure || 0.0;
    window.cameraTrack.applyConstraints({
        advanced: [{ exposureCompensation: expValue }]
    }).then(() => {
        console.log(`[Hardware] Exposure set: ${expValue}`);
    }).catch(err => console.warn("[Hardware] Exposure gagal:", err.message));
}

// CAPTURE FLOW
function executeCapture() {
    const mode = appMemory.currentMode || "foto";
    if (mode === "video") {
        handleVideoRecordingLogic();
    } else {
        handlePhotoCaptureLogic();
    }
}

function handlePhotoCaptureLogic() {
    console.log("Mempersiapkan proses penangkapan gambar...");

    const timerFeatures = appMemory.db?.camera_features || {};
    const timerOptions = timerFeatures.timer_options || [0, 3, 5, 10];
    const timerIndex = appMemory.timerIndex || 0;
    const detikMundur = timerOptions[timerIndex] || 0;

    const shutterBtn = document.getElementById('shutter_btn');

    if (shutterBtn) {
        shutterBtn.disabled = true;
        shutterBtn.style.pointerEvents = "none";
        shutterBtn.style.opacity = "0.6";
    }

    const pulihkanTombolShutterDarurat = () => {
        if (shutterBtn) {
            shutterBtn.disabled = false;
            shutterBtn.style.pointerEvents = "auto";
            shutterBtn.style.opacity = "1";
            shutterBtn.innerText = "";
            shutterBtn.style.background = "#ffffff";
            shutterBtn.style.color = "";
        }
    };

    if (detikMundur > 0) {
        let sisaWaktu = detikMundur;
        if (shutterBtn) {
            shutterBtn.innerText = sisaWaktu;
            shutterBtn.style.background = "rgba(255, 0, 0, 0.8)";
            shutterBtn.style.color = "#ffffff";
        }

        const hitungan = setInterval(() => {
            sisaWaktu--;
            if (sisaWaktu > 0) {
                if (shutterBtn) shutterBtn.innerText = sisaWaktu;
            } else {
                clearInterval(hitungan);
                if (shutterBtn) {
                    shutterBtn.innerText = "";
                    shutterBtn.style.background = "#ffffff";
                }
                try { ambilFotoWebp(); }
                catch (err) { console.error("Timer capture error:", err); pulihkanTombolShutterDarurat(); }
            }
        }, 1000);
    } else {
        try { ambilFotoWebp(); }
        catch (err) { console.error("Instant capture error:", err); pulihkanTombolShutterDarurat(); }
    }
}

function handleVideoRecordingLogic() {
    const shutterBtn = document.getElementById('shutter_btn');

    if (appMemory.isRecording) {
        console.log("Menghentikan perekaman video...");
        if (appMemory.mediaRecorder && appMemory.mediaRecorder.state !== "inactive") {
            appMemory.mediaRecorder.stop();
        }
        return;
    }

    if (!appMemory.stream) {
        alert("Hardware kamera belum siap!");
        return;
    }

    console.log("Memulai perekaman video...");
    appMemory.videoChunks = [];
    appMemory.isRecording = true;

    if (shutterBtn) {
        shutterBtn.style.background = "#ff0000";
        shutterBtn.style.borderRadius = "8px";
        shutterBtn.style.opacity = "1";
    }

    try {
        appMemory.mediaRecorder = new MediaRecorder(appMemory.stream, {
            mimeType: 'video/webm;codecs=vp8'
        });
    } catch (e) {
        appMemory.mediaRecorder = new MediaRecorder(appMemory.stream);
    }

    appMemory.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            appMemory.videoChunks.push(event.data);
        }
    };

    appMemory.mediaRecorder.onstop = () => {
        console.log("[Video] Menyusun file...");

        const videoBlob = new Blob(appMemory.videoChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(videoBlob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `Ai_Picture_VID_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        appMemory.videoChunks = [];
        appMemory.mediaRecorder = null;
        appMemory.isRecording = false;

        if (shutterBtn) {
            shutterBtn.style.background = "#ffffff";
            shutterBtn.style.borderRadius = "50%";
            shutterBtn.style.border = "4px solid #ff0000";
        }
    };

    appMemory.mediaRecorder.start(1000);
}

// ACTION DISPATCHER
function executeAction(actionName, value) {
    console.log(`Aksi: ${actionName}`, value);
    const shutterBtn = document.getElementById('shutter_btn');

    switch (actionName) {
        case "openGallery":
            bukaGaleriSistem();
            break;

        case "capture":
            executeCapture();
            break;

        case "switchCamera":
            appMemory.currentFacingMode = (appMemory.currentFacingMode === "environment") ? "user" : "environment";
            startCamera(false);
            break;

        case "switchMode":
            if (appMemory.isRecording) {
                console.warn("Hentikan rekaman dulu.");
                break;
            }
            appMemory.currentMode = (appMemory.currentMode === "foto") ? "video" : "foto";
            const modeBtn = document.getElementById('switch_mode');
            if (modeBtn) {
                modeBtn.innerHTML = appMemory.currentMode === "foto"
                    ? `<span class="icon-art" style="display:inline-block; transition: transform 0.3s ease;">📸</span>`
                    : `<span class="icon-art" style="display:inline-block; transition: transform 0.3s ease;">🎥</span>`;
            }
            if (shutterBtn) {
                shutterBtn.style.border = appMemory.currentMode === "video"
                    ? "4px solid #ff0000"
                    : "4px solid #cccccc";
            }
            break;

        case "cycleTimer":
            const options = appMemory.db?.camera_features?.timer_options || [0, 3, 5, 10];
            appMemory.timerIndex = ((appMemory.timerIndex || 0) + 1) % options.length;
            const detik = options[appMemory.timerIndex];
            const timerBtn = document.getElementById('timer_btn');
            if (timerBtn) timerBtn.innerText = detik === 0 ? "⏱️" : `⏱️ ${detik}s`;
            break;

        case "setFormat":
            appMemory.defaultFormatFoto = value;
            console.log(`Format: ${value}`);
            break;

        case "setExportQuality":
            appMemory.exportQuality = value;
            console.log(`Kualitas: ${value}`);
            break;

        case "setActiveFeature":
            appMemory.activeFeature = value || "normal";
            console.log(`Fitur aktif: ${appMemory.activeFeature}`);
            switchSliderBooster(appMemory.activeFeature);
            break;

        case "setExposure":
            if (value !== null && value !== undefined) {
                applyBoosterEffect(value);
            }
            break;

        case "toggleMenuBox":
            const menu = document.getElementById('dropdownMenu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || menu.style.display === '';
                if (isHidden) {
                    menu.style.display = 'block';
                    menu.style.position = 'absolute';
                    menu.style.zIndex = '99999';
                    menu.style.maxHeight = '70vh';
                    menu.style.overflowY = 'auto';
                    menu.style.overflowX = 'hidden';
                    menu.style.pointerEvents = 'auto';
                    menu.style.webkitOverflowScrolling = 'touch';

                    renderDropdownMenuItems();
                    menu.scrollTop = 0;
                } else {
                    menu.style.display = 'none';
                }
            }
            break;

        default:
            console.warn(`Aksi "${actionName}" belum diimplementasikan.`);
    }
}

// PHOTO CAPTURE
function ambilFotoWebp() {
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('processing-canvas');

    if (!video || !canvas) {
        console.error("Komponen kamera tidak ditemukan.");
        const shutterBtn = document.getElementById('shutter_btn');
        if (shutterBtn) { shutterBtn.disabled = false; shutterBtn.style.pointerEvents = "auto"; }
        return;
    }

    const pipeline = window.APP_DATABASE.shutter_pipeline;
    const flashDiv = document.createElement('div');
    flashDiv.style.cssText = pipeline.visual_effects.flash_screen_css;
    document.body.appendChild(flashDiv);
    setTimeout(() => { flashDiv.style.opacity = "1"; }, 10);
    setTimeout(() => {
        flashDiv.style.opacity = "0";
        setTimeout(() => flashDiv.remove(), 100);
    }, pipeline.visual_effects.flash_duration_ms);

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const config = (appMemory.activeFeature === "normal")
        ? { frame_count: 1, interval_ms: 0 }
        : appMemory.db.camera_features.burst_mode;

    let frameBuffer = [];
    let count = 0;

    // ⭐ Mode HDR Natural — pipeline terpisah
    if (appMemory.activeFeature === "hdr_natural") {
        captureHDRBracketing(video, canvas, w, h);
        return;
    }

    const burst = setInterval(() => {
        if (count < config.frame_count) {
            const temp = document.createElement('canvas');
            temp.width = w;
            temp.height = h;
            const tCtx = temp.getContext('2d');
            tCtx.drawImage(video, 0, 0, w, h);
            frameBuffer.push(tCtx.getImageData(0, 0, w, h));
            count++;
        } else {
            clearInterval(burst);
            prosesPemadatanMataManusia(frameBuffer, w, h);
        }
    }, config.interval_ms);
}

function prosesPemadatanMataManusia(buffers, w, h) {
    const canvas = document.getElementById('processing-canvas');
    const ctx = canvas.getContext('2d');
    const output = ctx.createImageData(w, h);
    const data = output.data;

    if (appMemory.activeFeature === "normal" && buffers.length === 1) {
        data.set(buffers[0].data);
        ctx.putImageData(output, 0, 0);
        
        // Langsung simpan tanpa filter
        const formatTerpilih = appMemory.defaultFormatFoto || "webp";
        let profileKey = "jpeg_hr";
        if (formatTerpilih === "webp") profileKey = "webp_max";
        else if (formatTerpilih === "jpeg") profileKey = "jpeg_hr";
        else if (formatTerpilih === "png") profileKey = "png";
        else if (formatTerpilih === "pdf") { prosesSimpanSebagaiPDF(canvas); return; }
        
        const profile = window.APP_DATABASE.shutter_pipeline.processing_profiles[profileKey];
        const finalDataURL = canvas.toDataURL(profile.mime_type, profile.quality);
        saveImageToAppGallery(finalDataURL);
        
        // Pulihkan tombol shutter
        setTimeout(() => {
            const shutterBtn = document.getElementById('shutter_btn');
            if (shutterBtn) {
                shutterBtn.disabled = false;
                shutterBtn.style.pointerEvents = "auto";
                shutterBtn.style.opacity = "1";
            }
        }, window.APP_DATABASE.shutter_pipeline.visual_effects.button_cooldown_ms);
        return;
    }

    const f1 = buffers[0].data;
    const f2 = buffers[1] ? buffers[1].data : f1;
    const f3 = buffers[2] ? buffers[2].data : f1;

    // Rata-rata 3 frame untuk mengurangi noise
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = (f1[i]     + f2[i]     + f3[i])     / 3;
        data[i + 1] = (f1[i + 1] + f2[i + 1] + f3[i + 1]) / 3;
        data[i + 2] = (f1[i + 2] + f2[i + 2] + f3[i + 2]) / 3;
        data[i + 3] = 255;
    }

    applyBilateralSharpening(data, w, h);
    ctx.putImageData(output, 0, 0);

    if (appMemory.db.human_eye_perception_formula.squint_reflex_mechanism.enabled) {
        applySquintReflex(canvas, w, h);
    }

    const formatTerpilih = appMemory.defaultFormatFoto || "webp";
    const kualitasTerpilih = appMemory.exportQuality || "standar";
    let profileKey = "webp";

    if (formatTerpilih === "webp") {
        profileKey = (kualitasTerpilih === "high") ? "webp_max" : "webp";
    } else if (formatTerpilih === "jpeg") {
        profileKey = (kualitasTerpilih === "high") ? "jpeg_hr" : "jpeg";
    } else if (formatTerpilih === "png") {
        profileKey = "png";
    } else if (formatTerpilih === "pdf") {
        profileKey = "pdf";
    }

    const profile = window.APP_DATABASE.shutter_pipeline.processing_profiles[profileKey];

    if (formatTerpilih === "pdf") {
        prosesSimpanSebagaiPDF(canvas);
    } else {
        const finalDataURL = canvas.toDataURL(profile.mime_type, profile.quality);
        saveImageToAppGallery(finalDataURL);
    }

    setTimeout(() => {
        const shutterBtn = document.getElementById('shutter_btn');
        if (shutterBtn) {
            shutterBtn.disabled = false;
            shutterBtn.style.pointerEvents = "auto";
            shutterBtn.style.opacity = "1";
        }
    }, window.APP_DATABASE.shutter_pipeline.visual_effects.button_cooldown_ms);
}

function saveImageToAppGallery(finalDataURL) {
    const galleryPreview = document.getElementById('gallery_preview');
    if (galleryPreview) {
        galleryPreview.innerHTML = `<img src="${finalDataURL}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;" />`;
    }

    try {
        const downloadLink = document.createElement('a');
        const now = new Date();
        
        // Format tanggal: 2025-10-18_14-30-45
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
        
        const activeFormat = appMemory.defaultFormatFoto || "webp";
        const profile = window.APP_DATABASE.shutter_pipeline.processing_profiles[
            activeFormat === "jpeg" ? "jpeg_hr" : "webp_max"
        ] || { mime_type: "image/webp" };
        const ext = profile.mime_type.includes("webp") ? "webp" : "jpg";
        
        // ⭐ Nama file dengan prefix + tanggal
        // Contoh: AiPicture_Cam_2025-10-18_14-30-45.webp
        const filename = `AiPicture_Cam_${timestamp}.${ext}`;

        downloadLink.download = filename;
        downloadLink.href = finalDataURL;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        console.log(`📸 Tersimpan: ${filename}`);
    } catch (error) {
        console.error("Fallback download:", error);
        fetch(finalDataURL).then(res => res.blob()).then(blob => {
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const mi = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            downloadLink.download = `AiPicture_Cam_${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}.webp`;
            downloadLink.href = url;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            setTimeout(() => {
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(url);
            }, 100);
        });
    }
}

// VIEWER (Galeri)
let viewerState = {
    isViewerOpen: false,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
};

function bukaGaleriSistem() {
    const canvas = document.getElementById('processing-canvas');
    const video = document.getElementById('camera-view');
    if (!canvas) return;

    if (viewerState.isViewerOpen) {
        tutupGaleriSistem();
        return;
    }

    viewerState.isViewerOpen = true;
    viewerState.scale = 1;
    viewerState.offsetX = 0;
    viewerState.offsetY = 0;

    if (video && video.srcObject) video.style.opacity = "0";

    // FIX BUG 6: sembunyikan UI kamera saat viewer terbuka
    setUICameraVisible(false);

    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "contain";
    canvas.style.zIndex = "8";
    canvas.style.transition = "transform 0.05s ease-out";

    updateCanvasTransform();
    setupViewerTouchEvents(canvas);
}

function tutupGaleriSistem() {
    const canvas = document.getElementById('processing-canvas');
    const video = document.getElementById('camera-view');

    viewerState.isViewerOpen = false;

    if (canvas) {
        canvas.style.display = "none";
        canvas.style.transform = "none";
    }
    if (video) video.style.opacity = "1";

    // FIX BUG 6: tampilkan UI kamera kembali
    setUICameraVisible(true);
}

function setUICameraVisible(visible) {
    const ids = ['gallery_preview', 'shutter_btn', 'right_actions_container',
                 'timer_btn', 'left_slider_container', 'triple_dot_btn'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.opacity = visible ? '1' : '0';
        el.style.pointerEvents = visible ? 'auto' : 'none';
        el.style.transition = 'opacity 0.25s ease';
    });

    if (!visible) {
        const menu = document.getElementById('dropdownMenu');
        if (menu) menu.style.display = 'none';
    }
}

function setupViewerTouchEvents(canvas) {
    let initialDist = null;

    canvas.ontouchstart = (e) => {
        if (!viewerState.isViewerOpen) return;

        if (e.touches.length === 1) {
            viewerState.isDragging = true;
            viewerState.startX = e.touches[0].clientX - viewerState.offsetX;
            viewerState.startY = e.touches[0].clientY - viewerState.offsetY;
        } else if (e.touches.length === 2) {
            viewerState.isDragging = false;
            initialDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    };

    canvas.ontouchmove = (e) => {
        if (!viewerState.isViewerOpen) return;
        e.preventDefault();

        if (e.touches.length === 1 && viewerState.isDragging) {
            viewerState.offsetX = e.touches[0].clientX - viewerState.startX;
            viewerState.offsetY = e.touches[0].clientY - viewerState.startY;
            terapkanBatasKunciGambar();
            updateCanvasTransform();
        } else if (e.touches.length === 2 && initialDist) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const zoomFactor = currentDist / initialDist;
            let targetScale = viewerState.scale * zoomFactor;
            if (targetScale < 1) targetScale = 1;
            if (targetScale > 10) targetScale = 10;
            viewerState.scale = targetScale;
            initialDist = currentDist;
            terapkanBatasKunciGambar();
            updateCanvasTransform();
        }
    };

    canvas.ontouchend = () => {
        viewerState.isDragging = false;
        initialDist = null;
    };
}

function terapkanBatasKunciGambar() {
    const canvas = document.getElementById('processing-canvas');
    if (!canvas) return;

    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    const maxOffsetX = Math.max(0, (viewWidth * viewerState.scale - viewWidth) / 2);
    const maxOffsetY = Math.max(0, (viewHeight * viewerState.scale - viewHeight) / 2);

    if (viewerState.scale === 1) {
        viewerState.offsetX = 0;
        viewerState.offsetY = 0;
        return;
    }

    if (viewerState.offsetX > maxOffsetX) viewerState.offsetX = maxOffsetX;
    if (viewerState.offsetX < -maxOffsetX) viewerState.offsetX = -maxOffsetX;
    if (viewerState.offsetY > maxOffsetY) viewerState.offsetY = maxOffsetY;
    if (viewerState.offsetY < -maxOffsetY) viewerState.offsetY = -maxOffsetY;
}

function updateCanvasTransform() {
    const canvas = document.getElementById('processing-canvas');
    if (canvas) {
        canvas.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px) scale(${viewerState.scale})`;
    }
}

// AI SHARPENING
function applyBilateralSharpening(data, w, h) {
    const feature = appMemory.activeFeature || "normal";
    
    if (feature === "normal") {
        return;
    }
    
    const sliderVal = appMemory.featureSliderValues[feature] !== undefined
                    ? appMemory.featureSliderValues[feature] : 1.0;

    const profileRegistry = appMemory.db.ai_reconstruction_profiles || {};
    const profile = profileRegistry[feature] || profileRegistry["normal"];
    const toneData = appMemory.db.human_eye_perception_formula.tone_mapping;

    let shadowLift = profile.shadow_lift;
    let saturation = profile.saturation;
    let edgeBoost = sliderVal * profile.edge_boost_multiplier;

    // FIX BUG 6: skip kernel kalau edgeBoost = 0 (hemat CPU)
    const doKernel = edgeBoost > 0.05;

    let isInfraredMode = (feature === "gelap");
    if (feature === "malam" || feature === "gelap") shadowLift = sliderVal;

    const bufferAsli = new Uint8ClampedArray(data);

    for (let y = 1; y < h - 1; y++) {
        const rowBase = y * w;
        for (let x = 1; x < w - 1; x++) {
            const i = (rowBase + x) * 4;

            const rAsli = bufferAsli[i];
            const gAsli = bufferAsli[i + 1];
            const bAsli = bufferAsli[i + 2];

            const totalCahayaAsli = rAsli + gAsli + bAsli;
            if (totalCahayaAsli === 0) continue;

            const persenR = rAsli / totalCahayaAsli;
            const persenG = gAsli / totalCahayaAsli;
            const persenB = bAsli / totalCahayaAsli;

            let r = rAsli, g = gAsli, b = bAsli;
            let v = totalCahayaAsli / 3;

            if (feature === "normal" || feature === "natural") {
                if (v < 128) {
                    v = v * shadowLift;
                } else {
                    v = 255 - (255 - v) * (2.0 - shadowLift);
                }
            } else {
                if (v > profile.glare_threshold) {
                    const factor = v / 255;
                    const dimAmt = toneData.glare_dim_factor || 0.92;
                    v /= (factor * (2.0 - dimAmt));
                } else if (v < 90) {
                    v = v * shadowLift;
                }
            }

            r = v; g = v; b = v;

            if (saturation !== 1.0) {
                r = v + (r - v) * saturation;
                g = v + (g - v) * saturation;
                b = v + (b - v) * saturation;
            }

            if (doKernel) {
                // Inline kernel (tanpa nested array access) untuk kecepatan
                const up = ((y - 1) * w + x) * 4;
                const down = ((y + 1) * w + x) * 4;
                const left = (rowBase + x - 1) * 4;
                const right = (rowBase + x + 1) * 4;

                const accR = bufferAsli[up] + bufferAsli[down] + bufferAsli[left] + bufferAsli[right];
                const accG = bufferAsli[up + 1] + bufferAsli[down + 1] + bufferAsli[left + 1] + bufferAsli[right + 1];
                const accB = bufferAsli[up + 2] + bufferAsli[down + 2] + bufferAsli[left + 2] + bufferAsli[right + 2];

                // Kernel: 5*center - sum(4 neighbors)
                const sharpR = 5 * bufferAsli[i] - accR;
                const sharpG = 5 * bufferAsli[i + 1] - accG;
                const sharpB = 5 * bufferAsli[i + 2] - accB;

                r = (sharpR * edgeBoost) + (r * (1 - edgeBoost));
                g = (sharpG * edgeBoost) + (g * (1 - edgeBoost));
                b = (sharpB * edgeBoost) + (b * (1 - edgeBoost));
            }

            const totalCahayaAkhir = r + g + b;
            let finalR = totalCahayaAkhir * persenR;
            let finalG = totalCahayaAkhir * persenG;
            let finalB = totalCahayaAkhir * persenB;

            if (isInfraredMode && feature === "gelap") {
                const brightness = (rAsli + gAsli + bAsli) / 3;
                const finalLumi = Math.max(0, Math.min(255, brightness * shadowLift));
                finalR = finalLumi * 0.3;
                finalG = finalLumi;
                finalB = finalLumi * 0.5;
            }

            const maxClip = toneData.max_clipping_safety || 255;
            data[i]     = Math.max(0, Math.min(maxClip, finalR));
            data[i + 1] = Math.max(0, Math.min(maxClip, finalG));
            data[i + 2] = Math.max(0, Math.min(maxClip, finalB));
        }
    }
}

function applySquintReflex(canvas, w, h) {
    const ctx = canvas.getContext('2d');
    const squintData = appMemory.db.human_eye_perception_formula.squint_reflex_mechanism;
    if (!squintData.vignette_shadow_alpha || squintData.vignette_shadow_alpha <= 0) return;

    const gradient = ctx.createRadialGradient(w / 2, h / 2, w / 4, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${squintData.vignette_shadow_alpha})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
}

// AUTO EXPOSURE STABILIZER
function startExposureStabilizer() {
    stopExposureStabilizer();
    const interval = appMemory.db.auto_exposure_stabilizer.analysis_interval_ms || 200;
    appMemory.exposureStabilizerInterval = setInterval(executeExposureStabilizer, interval);
    console.log(`[Stabilizer] Aktif setiap ${interval}ms`);
}

function stopExposureStabilizer() {
    if (appMemory.exposureStabilizerInterval) {
        clearInterval(appMemory.exposureStabilizerInterval);
        appMemory.exposureStabilizerInterval = null;
    }
}

function executeExposureStabilizer() {
    const video = document.getElementById('camera-view');
    if (!video || video.videoWidth === 0) return;

    const canvas = document.getElementById('processing-canvas');
    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, 10, 10);
    const pixels = ctx.getImageData(0, 0, 10, 10).data;

    let totalLumi = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        totalLumi += (0.2126 * pixels[i]) + (0.7152 * pixels[i + 1]) + (0.0722 * pixels[i + 2]);
    }
    const avgLumi = totalLumi / 100;

    const conditions = appMemory.db.auto_exposure_stabilizer.conditions;
    let targetFilter = "brightness(1.0) contrast(1.0)";

    if (avgLumi < conditions.indoor_lowlight.trigger_luminance_below) {
        targetFilter = conditions.indoor_lowlight.adjust_filter;
    } else if (avgLumi > conditions.outdoor_bright.trigger_luminance_above) {
        targetFilter = conditions.outdoor_bright.adjust_filter;
    }

    const activeColor = appMemory.activeColorMode
                     || appMemory.db.app_config.settings.default_color_mode
                     || "natural";
    const filterWarnaAktif = appMemory.db.camera_features.color_filters[activeColor] || "";

    if (appMemory.activeFeature !== "hdr_natural") {
        video.style.filter = `${filterWarnaAktif} ${targetFilter}`.trim();
    }
}

// HARDWARE FOCUS & ZOOM
function triggerHardwareFocus(relativeX, relativeY) {
    if (!window.cameraTrack) return;
    if (typeof window.cameraTrack.getCapabilities !== "function") return;

    const capabilities = window.cameraTrack.getCapabilities();
    if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
        window.cameraTrack.applyConstraints({
            advanced: [{
                focusMode: 'manual',
                pointsOfInterest: [{ x: relativeX, y: relativeY }]
            }]
        }).catch(() => {
            window.cameraTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        });
    }
}

function applyDigitalZoom(zoomLevel) {
    const videoView = document.getElementById('camera-view');
    if (!videoView) return;

    if (window.cameraTrack && typeof window.cameraTrack.getCapabilities === "function") {
        const caps = window.cameraTrack.getCapabilities();
        if (caps.zoom) {
            window.cameraTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] }).catch(() => {});
            return;
        }
    }

    const scale = 1 + (zoomLevel * 0.05);
    videoView.style.transform = `scale(${scale})`;
}

// PDF EXPORT
function prosesSimpanSebagaiPDF(canvas) {
    const imgDataUrl = canvas.toDataURL("image/jpeg", 0.85);

    const galleryPreview = document.getElementById('gallery_preview');
    if (galleryPreview) {
        galleryPreview.innerHTML = `<img src="${imgDataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;" />`;
    }

    try {
        const timestamp = new Date().getTime();
        const pdfBlob = (function () {
            const w = canvas.width;
            const h = canvas.height;
            const header = `%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/XObject << /Im1 4 0 R >>\n>>\n/MediaBox [0 0 ${w} ${h}]\n/Contents 5 0 R\n>>\nendobj\n`;

            const base64Content = imgDataUrl.split(',')[1];
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);

            const pdfHeader = new TextEncoder().encode(header);
            const pdfFooter = new TextEncoder().encode(`\n4 0 obj\n<<\n/Type /XObject\n/Subtype /Image\n/Width ${w}\n/Height ${h}\n/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n/Filter /DCTDecode\n/Length ${byteArray.length}\n>>\nstream\n`);
            const pdfEndStream = new TextEncoder().encode(`\nendstream\nendobj\n5 0 obj\n<<\n/Length 54\n>>\nstream\nq\n${w} 0 0 ${h} 0 0 cm\n/Im1 Do\nQ\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n110\n%%EOF`);

            return new Blob([pdfHeader, pdfFooter, byteArray, pdfEndStream], { type: 'application/pdf' });
        })();

        const url = URL.createObjectURL(pdfBlob);
        const downloadLink = document.createElement('a');
        downloadLink.download = `AiPicture_${timestamp}.pdf`;
        downloadLink.href = url;
        document.body.appendChild(downloadLink);
        downloadLink.click();

        setTimeout(() => {
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`PDF tersimpan: AiPicture_${timestamp}.pdf`);
    } catch (err) {
        console.error("Gagal PDF:", err);
    }
}

// BACK BUTTON HANDLER (FIX BUG 8)
function handleBackButton() {
    const menu = document.getElementById('dropdownMenu');
    const menuOpen = menu && menu.style.display === 'block';

    if (menuOpen) {
        menu.style.display = 'none';
        history.pushState({ app: 'main' }, '');
        return;
    }

    if (viewerState.isViewerOpen) {
        tutupGaleriSistem();
        history.pushState({ app: 'main' }, '');
        return;
    }

}

// CLEANUP
window.addEventListener('beforeunload', () => {
    stopExposureStabilizer();
    if (appMemory.stream) {
        appMemory.stream.getTracks().forEach(t => t.stop());
    }
    if (appMemory.isRecording && appMemory.mediaRecorder) {
        try { appMemory.mediaRecorder.stop(); } catch (e) {}
    }
});

// HDR NATURAL — Exposure Bracketing 5 Frame
async function captureHDRBracketing(video, canvas, w, h) {
    console.log("🌤️ Memulai HDR bracketing 3 frame (Fast)...");
    const t0 = performance.now();

    stopExposureStabilizer();

    const track = window.cameraTrack;
    const originalEV = appMemory.currentHardwareExposure || 0;
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    const hasExposure = !!(caps.exposureCompensation);

    // Reset ke EV 0 dulu
    if (hasExposure) {
        try {
            await track.applyConstraints({ advanced: [{ exposureCompensation: 0 }] });
            await new Promise(r => setTimeout(r, 200));
        } catch (e) { /* ignore */ }
    }

    const evs = [-1, -0.5, 0];
    const frames = [];
    const settleMs = hasExposure ? 200 : 50; // Lebih cepat dari 350ms

    for (const ev of evs) {
        try {
            if (hasExposure) {
                await track.applyConstraints({ advanced: [{ exposureCompensation: ev }] });
            }
            await new Promise(r => setTimeout(r, settleMs));
        } catch (e) {
            console.warn(`[HDR] Gagal set EV ${ev}:`, e.message);
        }

        const temp = document.createElement('canvas');
        temp.width = w; temp.height = h;
        const tCtx = temp.getContext('2d');
        tCtx.drawImage(video, 0, 0, w, h);
        frames.push(tCtx.getImageData(0, 0, w, h));
        console.log(`  ✓ Frame EV ${ev > 0 ? '+' : ''}${ev} diambil`);
    }

    if (hasExposure) {
        try {
            await track.applyConstraints({ advanced: [{ exposureCompensation: originalEV }] });
        } catch (e) { /* ignore */ }
    }

    console.log(`📸 3 frame terambil: ${(performance.now() - t0).toFixed(0)}ms`);

    // Merge HDR
    const t1 = performance.now();
    let merged = mergeHDRFramesWasm(frames, w, h);
    console.log(`✅ Merge selesai: ${(performance.now() - t1).toFixed(0)}ms`);

    // ⭐ POST-PROCESSING (Local Tone Map & Multi-Scale Detail)
    if (typeof Module !== 'undefined') {
        const size = w * h * 4;
        const ptr = Module._malloc(size);
        
        // 1. Local Tone Map (Angkat bayangan tapi jangan berlebihan)
        if (Module._local_tone_map) {
            console.log("🎨 Local Tone Mapping...");
            Module.HEAPU8.set(merged, ptr);
            Module._local_tone_map(ptr, w, h, 0.6); // 0.6 = Aman, tidak merusak kontras
            merged.set(Module.HEAPU8.subarray(ptr, ptr + size));
        }
    
        // 2. Multi-Scale Detail (Cukup 0.2 agar tidak mempertegas noise)
        if (Module._multi_scale_detail) {
            console.log("✨ Multi-Scale Detail...");
            Module.HEAPU8.set(merged, ptr);
            Module._multi_scale_detail(ptr, w, h, 0.2); 
            merged.set(Module.HEAPU8.subarray(ptr, ptr + size));
        }
        
        // 3. Chroma Denoise (Cukup 0.4 agar warna tidak jadi belang/posterized)
        if (Module._chroma_denoise) {
            console.log("🧹 Chroma Denoise...");
            Module.HEAPU8.set(merged, ptr);
            Module._chroma_denoise(ptr, w, h, 0.4); 
            merged.set(Module.HEAPU8.subarray(ptr, ptr + size));
        }
        
        Module._free(ptr);
    }
    
    // Tulis ke Canvas
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(merged, w, h), 0, 0);

    // Simpan
    const fmt = appMemory.defaultFormatFoto || "webp";
    let pk = "webp_max";
    if (fmt === "jpeg") pk = "jpeg_hr";
    else if (fmt === "png") pk = "png";
    else if (fmt === "pdf") pk = "pdf";

    if (fmt === "pdf") {
        prosesSimpanSebagaiPDF(canvas);
    } else {
        const prof = window.APP_DATABASE.shutter_pipeline.processing_profiles[pk];
        const url = canvas.toDataURL(prof.mime_type, prof.quality);
        saveImageToAppGallery(url);
    }

    console.log(`✅ Total HDR: ${(performance.now() - t0).toFixed(0)}ms`);

    startExposureStabilizer();
    setTimeout(() => {
        const sb = document.getElementById('shutter_btn');
        if (sb) { sb.disabled = false; sb.style.pointerEvents = "auto"; sb.style.opacity = "1"; }
    }, 500);
}

// ⭐ FUNGSI FINAL: WASM Merge dengan indikator Badge
function mergeHDRFramesWasm(frames, w, h) {
    const badge = document.getElementById('wasm-badge');
    
    // 1. Cek apakah Module dan fungsinya siap
    if (typeof Module === 'undefined' || !Module._find_shift_sad) {
        console.warn('❌ WASM belum siap / fallback JS');
        if (badge) {
            badge.style.display = 'block';
            badge.style.color = '#ff9500';
            badge.style.borderColor = '#ff9500';
            badge.innerText = '⚠️ WASM fallback JS';
            setTimeout(() => { badge.style.display = 'none'; }, 3000);
        }
        return mergeHDRFrames(frames, w, h);
    }
    
    // 2. WASM Siap
    if (badge) {
        badge.style.display = 'block';
        badge.style.color = '#00e5ff';
        badge.style.borderColor = '#00e5ff';
        badge.innerText = '✅ Kamera Siap';
    }

    const n = frames.length;
    const frameSize = w * h * 4;

    try {
        // Alokasi memori untuk frame
        const framePtrs = [];
        for (let i = 0; i < n; i++) {
            const ptr = Module._malloc(frameSize);
            Module.HEAPU8.set(frames[i].data, ptr);
            framePtrs.push(ptr);
        }

        const ptrArrayPtr = Module._malloc(n * 4);
        for (let i = 0; i < n; i++) {
            Module.HEAP32[(ptrArrayPtr >> 2) + i] = framePtrs[i];
        }

        // Cari shift (Alignment)
        const baseIdx = Math.floor(n / 2);
        const shiftsArrayPtr = Module._malloc(n * 2 * 4);

        for (let i = 0; i < n; i++) {
            const dxPtr = Module._malloc(4);
            const dyPtr = Module._malloc(4);

            if (i === baseIdx) {
                Module.HEAP32[dxPtr >> 2] = 0;
                Module.HEAP32[dyPtr >> 2] = 0;
            } else {
                Module._find_shift_sad(
                    framePtrs[baseIdx], framePtrs[i],
                    w, h, 25, // Max shift 25 pixel
                    dxPtr, dyPtr
                );
            }

            const dx = Module.HEAP32[dxPtr >> 2];
            const dy = Module.HEAP32[dyPtr >> 2];
            Module.HEAP32[(shiftsArrayPtr >> 2) + i * 2]     = dx;
            Module.HEAP32[(shiftsArrayPtr >> 2) + i * 2 + 1] = dy;

            console.log(`  🔍 Frame ${i}: shift (${dx}, ${dy})`);

            Module._free(dxPtr);
            Module._free(dyPtr);
        }

        // Merge HDR
        const outPtr = Module._malloc(frameSize);
        const t0 = performance.now();
        
        Module._hdr_merge_aligned(
            ptrArrayPtr, n,
            shiftsArrayPtr,
            w, h,
            outPtr
        );
        
        const t1 = performance.now();
        console.log(`✅ Kmera merge: ${(t1 - t0).toFixed(0)}ms`);

        if (badge) {
            badge.innerText = `✅ Kamera ${(t1-t0).toFixed(0)}ms`;
        }

        const merged = new Uint8ClampedArray(w * h * 4);
        merged.set(Module.HEAPU8.subarray(outPtr, outPtr + frameSize));

        // Cleanup
        for (const p of framePtrs) Module._free(p);
        Module._free(ptrArrayPtr);
        Module._free(shiftsArrayPtr);
        Module._free(outPtr);

        setTimeout(() => { if (badge) badge.style.display = 'none'; }, 2500);

        return merged;
    } catch (err) {
        console.error('❌ WASM error:', err);
        if (badge) {
            badge.style.color = '#ff3b30';
            badge.style.borderColor = '#ff3b30';
            badge.innerText = '❌ WASM error: ' + err.message;
            setTimeout(() => { badge.style.display = 'none'; }, 5000);
        }
        // Fallback ke JS jika WASM crash di tengah jalan
        return mergeHDRFrames(frames, w, h);
    }
}

// Tone curve HALUS — k=0.06 (dari 0.15)
function toneCurveNaturalHalus(v) {
    let x = v / 255;
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    const k = 0.06;
    const y = x + k * x * (1 - x) * (2 * x - 1);
    return Math.max(0, Math.min(255, y * 255));
}

// Vibrance HALUS — max 1.08 (dari 1.18)
function vibranceHalus(r, g, b) {
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const maxV = Math.max(r, g, b);
    const minV = Math.min(r, g, b);
    const chroma = maxV - minV;
    const chromaRatio = chroma / 255;
    const boost = 1 + 0.08 * Math.pow(1 - chromaRatio, 2);
    const newR = lum + (r - lum) * boost;
    const newG = lum + (g - lum) * boost;
    const newB = lum + (b - lum) * boost;
    return {
        r: Math.max(0, Math.min(255, newR)),
        g: Math.max(0, Math.min(255, newG)),
        b: Math.max(0, Math.min(255, newB))
    };
}

// Highlight roll-off: kompres highlight lembut, bukan hard clip
function highlightRollOff(v) {
    if (v <= 200) return v;
    // Soft compress: 200..255 → 200..250
    const t = (v - 200) / 55;  // 0..1
    const softened = 200 + 50 * Math.sqrt(t);  // kurva akar
    return Math.min(250, softened);
}

function chromaDenoiseShadow(data, w, h) {
    const out = new Uint8ClampedArray(data);
    const DARK_LIMIT = 130;
    const SIMILAR_THRESHOLD = 25;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Skip area terang
            if (lum >= DARK_LIMIT) continue;

            const iUp    = ((y - 1) * w + x) * 4;
            const iDown  = ((y + 1) * w + x) * 4;
            const iLeft  = (y * w + (x - 1)) * 4;
            const iRight = (y * w + (x + 1)) * 4;

            const lumUp    = 0.2126 * data[iUp] + 0.7152 * data[iUp + 1] + 0.0722 * data[iUp + 2];
            const lumDown  = 0.2126 * data[iDown] + 0.7152 * data[iDown + 1] + 0.0722 * data[iDown + 2];
            const lumLeft  = 0.2126 * data[iLeft] + 0.7152 * data[iLeft + 1] + 0.0722 * data[iLeft + 2];
            const lumRight = 0.2126 * data[iRight] + 0.7152 * data[iRight + 1] + 0.0722 * data[iRight + 2];

            // Kalau tetangga jauh beda luminance (edge), beri bobot 0
            const wUp    = Math.abs(lum - lumUp)    < SIMILAR_THRESHOLD ? 1 : 0;
            const wDown  = Math.abs(lum - lumDown)  < SIMILAR_THRESHOLD ? 1 : 0;
            const wLeft  = Math.abs(lum - lumLeft)  < SIMILAR_THRESHOLD ? 1 : 0;
            const wRight = Math.abs(lum - lumRight) < SIMILAR_THRESHOLD ? 1 : 0;

            const totalW = 1 + wUp + wDown + wLeft + wRight;

            const avgR = (r + data[iUp] * wUp + data[iDown] * wDown + data[iLeft] * wLeft + data[iRight] * wRight) / totalW;
            const avgG = (g + data[iUp + 1] * wUp + data[iDown + 1] * wDown + data[iLeft + 1] * wLeft + data[iRight + 1] * wRight) / totalW;
            const avgB = (b + data[iUp + 2] * wUp + data[iDown + 2] * wDown + data[iLeft + 2] * wLeft + data[iRight + 2] * wRight) / totalW;

            // Kekuatan denoise: makin gelap, makin kuat
            const depthFactor = 1 - lum / DARK_LIMIT;
            const s = 0.4 + 0.25 * depthFactor;

            out[i]     = r * (1 - s) + avgR * s;
            out[i + 1] = g * (1 - s) + avgG * s;
            out[i + 2] = b * (1 - s) + avgB * s;
        }
    }

    data.set(out);
}
