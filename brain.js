// brain.js - Mesin Eksekusi Utama (Modular & Data-Driven)

// 1. SATU MEMORI UTAMA (Dipadatkan, Tidak Boleh Dobel)
const appMemory = {
    db: null, // Tempat menyimpan blueprint dari window.APP_DATABASE
    stream: null,
    currentFacingMode: "environment",
    cameraHistoryThumbs: [],
    currentMode: "foto",       
    mediaRecorder: null,
    recordedChunks: [],
    isVideoRecording: false,
    activeSharpnessMode: "max", 
    activeColorMode: "natural", 
    currentZoom: 1,
    maxZoom: 4,                  
    startTouchDist: 0,
    exposureLoopInterval: null,
    currentRotationAngle: 0,
    timerIndex: 0,
    timerOptions: [0, 3, 5, 10] // Sinkronisasi opsi timer dari database
};

// 2. SINKRONISASI INITIALISASI (Handshake dengan Database)
document.addEventListener("DOMContentLoaded", () => {
    if (window.APP_DATABASE) {
        appMemory.db = window.APP_DATABASE;
        initApp();
    } else {
        console.error("Database tidak ditemukan! Pastikan database.js dimuat sebelum brain.js");
    }
});

function initApp() {
    applyBlueprintUI(); // Menghias index.html berdasarkan database
    startCamera(false);
    setupEventListeners();
    
    // Jalankan loop stabilisasi cahaya sesuai interval di database (200ms)
    const interval = appMemory.db.auto_exposure_stabilizer.analysis_interval_ms || 200;
    appMemory.exposureLoopInterval = setInterval(executeExposureStabilizer, interval);
}

// 3. LOGIKA PENEMPATAN VISUAL (Mengecat Layar Kosong Index.html)
function applyBlueprintUI() {
    const blueprint = appMemory.db.navigation_buttons;
    
    for (const key in blueprint) {
        const elementConfig = blueprint[key];
        const el = document.getElementById(elementConfig.id);
        
        if (el && elementConfig.ui_coordinate) {
            const coords = elementConfig.ui_coordinate;
            for (const prop in coords) {
                // PERBAIKAN: Mengubah kebab-case DAN underscore-case (z_index -> zIndex, overflow-y -> overflowY)
                const jsProp = prop.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
                                   .replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                
                // Khusus jika ada penulisan z_index di DB, arahkan langsung ke zIndex standar JS
                if (prop === "z_index") {
                    el.style.zIndex = coords[prop];
                } else {
                    el.style[jsProp] = coords[prop];
                }
            }
            
            if (elementConfig.label) {
                el.innerText = elementConfig.label;
            }
        }
    }
}

// 4. LOGIKA DRIVER HARDWARE KAMERA
function startCamera(needsAudio = false) {
    if (appMemory.stream) {
        appMemory.stream.getTracks().forEach(track => track.stop());
    }
    
    navigator.mediaDevices.getUserMedia({
        video: { 
            facingMode: appMemory.currentFacingMode, 
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
        },
        audio: needsAudio 
    }).then(stream => {
        appMemory.stream = stream;
        const videoEl = document.getElementById('camera-view');
        videoEl.srcObject = stream;
    }).catch(err => console.error("Akses hardware kamera ditolak:", err));
}

// 5. HUB PEMROSESAN GAMBAR (Mata Manusia + AI)
function executeCapture() {
    const shutterBtn = document.getElementById('shutter_btn');
    shutterBtn.style.pointerEvents = "none";
    shutterBtn.innerText = "⏳";

    if (appMemory.currentMode === "foto") {
        ambilFotoWebp();
    } else {
        kontrolPerekamanVideo();
    }
}

function ambilFotoWebp() {
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('processing-canvas');
    const ctx = canvas.getContext('2d');
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w; 
    canvas.height = h;

    let frameBuffer = [];
    let count = 0;
    
    const burst = setInterval(() => {
        if (count < 3) {
            const temp = document.createElement('canvas');
            temp.width = w; temp.height = h;
            const tCtx = temp.getContext('2d');
            const z = appMemory.currentZoom;
            
            tCtx.drawImage(video, (w - w/z)/2, (h - h/z)/2, w/z, h/z, 0, 0, w, h);
            frameBuffer.push(tCtx.getImageData(0, 0, w, h));
            count++;
        } else {
            clearInterval(burst);
            prosesPemadatanMataManusia(frameBuffer, w, h);
        }
    }, 15);
}

function prosesPemadatanMataManusia(buffers, w, h) {
    const canvas = document.getElementById('processing-canvas');
    const ctx = canvas.getContext('2d');
    const output = ctx.createImageData(w, h);
    const data = output.data;
    
    const cie = appMemory.db.human_eye_perception_formula.luminance_weights_cie1931;
    const tone = appMemory.db.human_eye_perception_formula.tone_mapping;
    
    const f1 = buffers[0].data;
    const f2 = buffers[1].data;
    const f3 = buffers[2].data;

    for (let i = 0; i < data.length; i += 4) {
        let r = (f1[i] + f2[i] + f3[i]) / 3;
        let g = (f1[i+1] + f2[i+1] + f3[i+1]) / 3;
        let b = (f1[i+2] + f2[i+2] + f3[i+2]) / 3;

        let luminance = (r * cie.r) + (g * cie.g) + (b * cie.b);

        if (luminance > tone.trigger_glare_above) {
            const faktorRedam = tone.glare_dim_factor;
            r *= faktorRedam;
            g *= faktorRedam;
            b *= faktorRedam;
        }

        data[i] = Math.min(tone.max_clipping_safety, r);
        data[i+1] = Math.min(tone.max_clipping_safety, g);
        data[i+2] = Math.min(tone.max_clipping_safety, b);
        data[i+3] = 255; 
    }
    
    applyBilateralSharpening(data, w, h);
    ctx.putImageData(output, 0, 0);
    
    if (appMemory.db.human_eye_perception_formula.squint_reflex_mechanism.enabled) {
        applySquintReflex(canvas, w, h);
    }
    
    simpanDanDownloadHasil(canvas);
}

function applyBilateralSharpening(data, w, h) {
    const aiConfig = appMemory.db.ai_vision_core;
    if (!aiConfig || !aiConfig.enabled) return;

    console.log("AI Core: Mengeksekusi HDR Biologis & Penajaman Garis...");
    const bufferAsli = new Uint8ClampedArray(data);
    
    const glareThreshold = aiConfig.glare_cut_threshold;
    const shadowLift = aiConfig.shadow_lift_factor;
    const kernel = aiConfig.edge_boost_kernel;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;

            let r = bufferAsli[i];
            let g = bufferAsli[i+1];
            let b = bufferAsli[i+2];
            let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (brightness > glareThreshold) {
                const overexposureFactor = brightness / 255;
                r /= (overexposureFactor * 1.1);
                g /= (overexposureFactor * 1.1);
                b /= (overexposureFactor * 1.1);
            } else if (brightness < 80) {
                r = Math.min(255, r * shadowLift);
                g = Math.min(255, g * shadowLift);
                b = Math.min(255, b * shadowLift);
            }

            let accR = 0, accG = 0, accB = 0;
            let kIdx = 0;

            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const pixelTetanggaIdx = ((y + ky) * w + (x + kx)) * 4;
                    const kVal = kernel[kIdx++];

                    accR += bufferAsli[pixelTetanggaIdx] * kVal;
                    accG += bufferAsli[pixelTetanggaIdx] * kVal;
                    accB += bufferAsli[pixelTetanggaIdx] * kVal;
                }
            }

            data[i]     = Math.max(0, Math.min(255, (accR * 0.4) + (r * 0.6)));
            data[i+1]   = Math.max(0, Math.min(255, (accG * 0.4) + (g * 0.6)));
            data[i+2]   = Math.max(0, Math.min(255, (accB * 0.4) + (b * 0.6)));
        }
    }
}

function applySquintReflex(canvas, w, h) {
    const ctx = canvas.getContext('2d');
    const squintData = appMemory.db.human_eye_perception_formula.squint_reflex_mechanism;
    
    const gradient = ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w/2);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${squintData.vignette_shadow_alpha})`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
}

// 6. STABILISASI CAHAYA REAL-TIME (AUTO EXPOSURE LOOPER)
function executeExposureStabilizer() {
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('processing-canvas');
    const ctx = canvas.getContext('2d');
    
    if (!video || video.videoWidth === 0 || !appMemory.db.auto_exposure_stabilizer.enabled) return;
    
    ctx.drawImage(video, 0, 0, 10, 10);
    const pixels = ctx.getImageData(0, 0, 10, 10).data;
    
    let totalLumi = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        totalLumi += (0.2126 * pixels[i]) + (0.7152 * pixels[i+1]) + (0.0722 * pixels[i+2]);
    }
    const avgLumi = totalLumi / 100;

    const conditions = appMemory.db.auto_exposure_stabilizer.conditions;
    let targetFilter = "brightness(1.0) contrast(1.0)";

    if (avgLumi < conditions.indoor_lowlight.trigger_luminance_below) {
        targetFilter = conditions.indoor_lowlight.adjust_filter;
    } else if (avgLumi > conditions.outdoor_bright.trigger_luminance_above) {
        targetFilter = conditions.outdoor_bright.adjust_filter;
    }

    const filterWarnaAktif = appMemory.db.camera_features.color_filters[appMemory.activeColorMode] || "";
    video.style.filter = `${filterWarnaAktif} ${targetFilter}`.trim();
}

// 7. EVENT LISTENERS UTAMA & ANTARMUKA
function setupEventListeners() {
    const blueprint = appMemory.db.navigation_buttons;

    for (const key in blueprint) {
        const btnConfig = blueprint[key];
        const el = document.getElementById(btnConfig.id);
        
        if (el && btnConfig.action) {
            el.onclick = (e) => {
                e.stopPropagation();
                executeAction(btnConfig.action, btnConfig.value || null);
            };
        }
    }

    if (blueprint.right_actions_container && blueprint.right_actions_container.child_buttons) {
        const container = document.getElementById('right_actions_container');
        container.innerHTML = ''; 
        
        blueprint.right_actions_container.child_buttons.forEach(btn => {
            const buttonEl = document.createElement('button');
            buttonEl.id = btn.id;
            buttonEl.innerText = btn.label;
            
            buttonEl.style.width = btn.width;
            buttonEl.style.height = btn.height;
            buttonEl.style.background = btn.background;
            buttonEl.style.color = btn.color;
            buttonEl.style.borderRadius = btn.border_radius;
            buttonEl.style.border = "none";
            buttonEl.style.fontSize = "18px";
            buttonEl.style.transition = btn.transition || "none";
            
            buttonEl.onclick = (e) => {
                e.stopPropagation();
                executeAction(btn.action, null);
            };
            container.appendChild(buttonEl);
        });
    }

    const slider = document.getElementById('expSlider');
    if (slider) {
        slider.oninput = (e) => {
            executeAction("setExposure", e.target.value);
        };
    }

    document.getElementById('camera-view').onclick = () => {
        const menu = document.getElementById('dropdownMenu');
        if (menu) menu.style.display = 'none';
    };
}

function executeAction(actionName, value) {
    console.log(`Menjalankan aksi: ${actionName} dengan nilai:`, value);
    
    switch (actionName) {
        case "capture":
            executeCapture();
            break;
            
        case "switchCamera":
            appMemory.currentFacingMode = (appMemory.currentFacingMode === "environment") ? "user" : "environment";
            startCamera(false);
            break;
            
        case "switchMode":
            appMemory.currentMode = (appMemory.currentMode === "foto") ? "video" : "foto";
            const modeBtn = document.getElementById('switch_mode');
            if (modeBtn) modeBtn.innerText = (appMemory.currentMode === "foto") ? "📸" : "🎥";
            break;
            
        case "cycleTimer":
            appMemory.timerIndex = (appMemory.timerIndex + 1) % appMemory.timerOptions.length;
            const detik = appMemory.timerOptions[appMemory.timerIndex];
            const timerBtn = document.getElementById('timer_btn');
            if (timerBtn) timerBtn.innerText = detik === 0 ? "⏱️" : `⏱️ ${detik}s`;
            break;
            
        case "setExposure":
            if (value !== null) {
                console.log(`Kompensasi cahaya disetel ke: ${value}`);
            }
            break;
            
        case "toggleMenuBox":
            const menu = document.getElementById('dropdownMenu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || menu.style.display === '';
                
                if (isHidden) {
                    // 1. Tampilkan dan kunci posisi agar berada di atas segalanya
                    menu.style.display = 'block';
                    menu.style.position = 'fixed'; // Memutuskan hubungan kekakuan dari parent container
                    menu.style.zIndex = '99999'; // Naikkan ke lapisan layar paling atas agar tidak terhalang elemen ghaib
                    
                    // 2. Batasi dimensi fisik kotak menu secara ketat
                    menu.style.maxHeight = '250px'; // Kunci tinggi maksimal 250 piksel (pasti memicu scroll jika menu panjang)
                    menu.style.height = 'auto';
                    
                    // 3. Paksa otorisasi sistem gulir dan sentuhan layar
                    menu.style.overflowY = 'scroll'; // Gunakan 'scroll' (memaksa) bukan 'auto'
                    menu.style.overflowX = 'hidden';
                    menu.style.pointerEvents = 'auto'; // Pastikan elemen bisa menerima respons sentuhan jari
                    menu.style.webkitOverflowScrolling = 'touch'; // Akselerasi hardware gesture mobile
                    
                    // Jalankan penggambaran item
                    renderDropdownMenuItems();
                } else {
                    menu.style.display = 'none';
                }
            }
            break;
            
        case "setFormat":
            appMemory.defaultFormatFoto = value;
            alert(`Format diubah ke: ${value}`);
            break;
            
        case "setSharpness":
            appMemory.activeSharpnessMode = value;
            alert(`Ketajaman disetel: ${value}`);
            break;
            
        case "setColorMode":
            appMemory.activeColorMode = value;
            break;
            
        default:
            console.warn(`Aksi ${actionName} belum diimplementasikan.`);
    }
}

function renderDropdownMenuItems() {
    const menuContainer = document.getElementById('dropdownMenu');
    menuContainer.innerHTML = ''; 
    
    // PERBAIKAN TOTAL: Bersihkan efek buruk class 'ui-element' secara paksa via JavaScript
    menuContainer.style.pointerEvents = "auto"; 
    menuContainer.style.userSelect = "auto";
    menuContainer.style.display = "block"; // Overwrite flex-direction dari DB yang mengunci layout
    
    // Ambil nilai batas tinggi dan scroll langsung dari database yang sudah diparsing aman
    menuContainer.style.maxHeight = appMemory.db.navigation_buttons.dropdownMenu.ui_coordinate["max-height"] || "60vh";
    menuContainer.style.overflowY = "scroll"; // Paksa scroll aktif
    menuContainer.style.webkitOverflowScrolling = "touch"; // Akselerasi swipe jempol HP
    
    // Kunci event agar geseran jari tidak bocor menembus ke background kamera
    menuContainer.ontouchstart = (e) => e.stopPropagation();
    menuContainer.ontouchmove = (e) => e.stopPropagation();
    menuContainer.onpointerdown = (e) => e.stopPropagation();
    
    const menuData = appMemory.db.menu_titik_tiga;
    
    menuData.forEach(group => {
        const groupDiv = document.createElement('div');
        groupDiv.style.marginBottom = "15px";
        groupDiv.style.width = "100%";
        groupDiv.style.display = "block";
        
        const label = document.createElement('div');
        label.innerText = group.label;
        label.style.color = "#888";
        label.style.fontSize = "12px";
        label.style.marginBottom = "6px";
        label.style.fontWeight = "bold";
        groupDiv.appendChild(label);
        
        const items = group.sub_menu || (group.items ? group.items : []);
        
        items.forEach(item => {
            const itemBtn = document.createElement('button');
            itemBtn.innerText = item.label;
            itemBtn.style.width = "100%";
            itemBtn.style.padding = "12px 12px"; 
            itemBtn.style.background = "#222";
            itemBtn.style.color = "#fff";
            itemBtn.style.border = "1px solid #333";
            itemBtn.style.borderRadius = "6px";
            itemBtn.style.marginBottom = "6px";
            itemBtn.style.textAlign = "left";
            itemBtn.style.fontSize = "14px";
            itemBtn.style.display = "block";
            
            itemBtn.onclick = (e) => {
                e.stopPropagation();
                executeAction(item.action, item.value);
                menuContainer.style.display = 'none'; 
            };
            
            groupDiv.appendChild(itemBtn);
        });
        
        menuContainer.appendChild(groupDiv);
    });
}

function simpanDanDownloadHasil(canvas) {
    const link = document.createElement('a');
    link.download = `Ai_Picture_${Date.now()}.webp`;
    link.href = canvas.toDataURL ? canvas.toDataURL('image/webp', 0.95) : canvas.toDataURL('image/jpeg', 0.9);
    link.click();

    const shutterBtn = document.getElementById('shutter_btn');
    shutterBtn.style.pointerEvents = "auto";
    shutterBtn.innerText = "";
    applyBlueprintUI(); 
}

function kontrolPerekamanVideo() {
    const shutterBtn = document.getElementById('shutter_btn');

    if (!appMemory.isVideoRecording) {
        appMemory.recordedChunks = []; 
        const formatMime = appMemory.db.app_config.settings.default_format_video === "video_webm" 
            ? 'video/webm;codecs=vp8' 
            : 'video/mp4';

        try {
            appMemory.mediaRecorder = new MediaRecorder(appMemory.stream, {
                mimeType: formatMime,
                videoBitsPerSecond: 1500000 
            });
        } catch (e) {
            console.warn("MimeType tidak didukung, menggunakan standar browser.");
            appMemory.mediaRecorder = new MediaRecorder(appMemory.stream);
        }

        appMemory.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                appMemory.recordedChunks.push(event.data);
            }
        };

        appMemory.mediaRecorder.onstop = () => {
            const blob = new Blob(appMemory.recordedChunks, { type: appMemory.mediaRecorder.mimeType });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.download = `Vid_Ai_Picture_${Date.now()}.webm`;
            link.href = url;
            link.click();

            shutterBtn.innerText = "";
            shutterBtn.style.background = "#ffffff"; 
            applyBlueprintUI(); 
        };

        appMemory.mediaRecorder.start(1000); 
        appMemory.isVideoRecording = true;

        shutterBtn.innerText = "🛑";
        shutterBtn.style.background = "#ff3b30";
        shutterBtn.style.borderRadius = "8px"; 
        console.log("Perekaman video AI dimulai...");

    } else {
        if (appMemory.mediaRecorder && appMemory.mediaRecorder.state !== "inactive") {
            appMemory.mediaRecorder.stop();
        }
        appMemory.isVideoRecording = false;
        shutterBtn.innerText = "⏳";
    }
}

// 8. MONITOR SENSOR ROTASI LAYAR
window.addEventListener("deviceorientation", (event) => {
    const gamma = event.gamma;
    const beta = event.beta;
    let targetAngle = 0;

    if (Math.abs(gamma) > 45) {
        targetAngle = gamma > 0 ? -90 : 90;
    } else if (beta < 0 && Math.abs(beta) > 45) {
        targetAngle = 180; 
    } else {
        targetAngle = 0; 
    }

    if (targetAngle !== appMemory.currentRotationAngle) {
        appMemory.currentRotationAngle = targetAngle;
        eksekusiRotasiKomponen(targetAngle);
    }
});

function eksekusiRotasiKomponen(angle) {
    const rotatingIcons = [
        document.getElementById('shutter_btn'),
        document.getElementById('gallery_preview'),
        document.getElementById('triple_dot_btn'),
        document.getElementById('switch_camera'), 
        document.getElementById('switch_mode')
    ];

    rotatingIcons.forEach(el => {
        if (el) {
            el.style.transition = "transform 0.3s ease";
            if (el.id === 'shutter_btn') {
                el.style.transform = `translateX(-50%) rotate(${angle}deg)`;
            } else {
                el.style.transform = `rotate(${angle}deg)`;
            }
        }
    });

    const timerBtn = document.getElementById('timer_btn');
    const expSlider = document.getElementById('expSlider');

    if (timerBtn) {
        timerBtn.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
        timerBtn.style.transform = `rotate(${angle}deg)`;
    }

    if (expSlider) {
        expSlider.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
        expSlider.style.transform = `rotate(${-90 + angle}deg) translateX(-50%)`;
    }
}
