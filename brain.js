// brain.js - Mesin Eksekusi Utama (Modular & Data-Driven)

// 1. SATU MEMORI UTAMA (Murni Menyimpan Status Berjalan / State)
const appMemory = {
    db: null, // Tempat menyimpan blueprint dari window.APP_DATABASE
    stream: null,
    currentFacingMode: "environment",
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
    timerOptions: [], 
    gallery: {        // Struktur manajemen history gambar terintegrasi
        display: [],
        archive: []
    }
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
    if (appMemory.db.camera_features && appMemory.db.camera_features.timer_options) {
        appMemory.timerOptions = appMemory.db.camera_features.timer_options;
    } else {
        appMemory.timerOptions = [0, 3, 5, 10]; // Cadangan darurat
    }

    applyBlueprintUI(); // Pengecatan tata letak awal dari database ke wadah HTML
    initGallery();      
    startCamera(false);
    setupEventListeners();
    
    const interval = appMemory.db.auto_exposure_stabilizer.analysis_interval_ms || 200;
    appMemory.exposureLoopInterval = setInterval(executeExposureStabilizer, interval);
}

// 3. LOGIKA PENEMPATAN VISUAL (Mengatur Tata Letak ke Wadah Index.html)
function applyBlueprintUI() {
    const blueprint = appMemory.db.navigation_buttons;
    
    for (const key in blueprint) {
        const elementConfig = blueprint[key];
        const el = document.getElementById(elementConfig.id);
        
        if (el && elementConfig.ui_coordinate) {
            const coords = elementConfig.ui_coordinate;
            for (const prop in coords) {
                const jsProp = prop.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
                                   .replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                
                if (prop === "z_index") {
                    el.style.zIndex = coords[prop];
                } else {
                    el.style[jsProp] = coords[prop];
                }
            }
            
            // PENGAMATAN: Hanya isi label default jika gallery belum memiliki history gambar aktif
            if (elementConfig.label) {
                if (elementConfig.id === 'gallery_preview' && appMemory.gallery.display.length > 0) {
                    continue; // Lewati pengisian emoji jika galeri sudah berisi foto pratinjau
                }
                el.innerText = elementConfig.label;
            }
        }
    }
}

// 4. LOGIKA DRIVER HARDWARE KAMERA (Data-Driven dari Spesifikasi DB)
function startCamera(needsAudio = false) {
    if (appMemory.stream) {
        appMemory.stream.getTracks().forEach(track => track.stop());
    }
    
    const idealWidth = appMemory.db.camera_hardware_config ? appMemory.db.camera_hardware_config.ideal_width : 1280;
    const idealHeight = appMemory.db.camera_hardware_config ? appMemory.db.camera_hardware_config.ideal_height : 720;
    
    navigator.mediaDevices.getUserMedia({
        video: { 
            facingMode: appMemory.currentFacingMode, 
            width: { ideal: idealWidth }, 
            height: { ideal: idealHeight } 
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
    console.log("Mempersiapkan proses penangkapan gambar...");
    
    const timerOptions = appMemory.timerOptions || [0, 3, 5, 10];
    const timerIndex = appMemory.timerIndex || 0;
    const detikMundur = timerOptions[timerIndex];
    
    const shutterBtn = document.getElementById('shutter_btn');
    
    if (detikMundur > 0) {
        console.log(`Timer aktif: Menghitung mundur ${detikMundur} detik.`);
        
        let sisaWaktu = detikMundur;
        if (shutterBtn) {
            shutterBtn.style.pointerEvents = "none"; 
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
                    shutterBtn.style.pointerEvents = "auto"; 
                }
                
                console.log("Waktu habis! Menembakkan sensor kamera...");
                jalankanProsesSensorKamera(); 
            }
        }, 1000);
        
    } else {
        jalankanProsesSensorKamera();
    }
}

function jalankanProsesSensorKamera() {
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('processing-canvas');
    
    if (!video || !canvas) {
        console.error("Komponen kamera tidak ditemukan di layar.");
        return;
    }
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    console.log("✓ Gambar berhasil ditangkap ke Canvas!");
    
    // Alihkan langsung ke pemrosesan WebP / AI terintegrasi
    const tempBuffer = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    // Fallback tiruan burst mode jika pemrosesan mata manusia membutuhkan array buffer
    tempBuffer.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    tempBuffer.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    
    prosesPemadatanMataManusia(tempBuffer, canvas.width, canvas.height);
}

function ambilFotoWebp() {
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('processing-canvas');
    const ctx = canvas.getContext('2d');
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w; 
    canvas.height = h;

    const config = appMemory.db.camera_features.burst_mode;
    let frameBuffer = [];
    let count = 0;
    
    const burst = setInterval(() => {
        if (count < config.frame_count) { 
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
    }, config.interval_ms); 
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

    const bufferAsli = new Uint8ClampedArray(data);
    const glareThreshold = aiConfig.glare_cut_threshold;
    const shadowLift = aiConfig.shadow_lift_factor;
    const kernel = aiConfig.edge_boost_kernel;

    let y, x, ky, kx;
    let i, pixelTetanggaIdx, kIdx, kVal;
    let r, g, b, brightness, overexposureFactor;
    let accR, accG, accB;

    for (y = 1; y < h - 1; y++) {
        for (x = 1; x < w - 1; x++) {
            i = (y * w + x) * 4;

            r = bufferAsli[i];
            g = bufferAsli[i+1];
            b = bufferAsli[i+2];
            brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (brightness > glareThreshold) {
                overexposureFactor = brightness / 255;
                r /= (overexposureFactor * 1.1);
                g /= (overexposureFactor * 1.1);
                b /= (overexposureFactor * 1.1);
            } else if (brightness < 80) {
                r = Math.min(255, r * shadowLift);
                g = Math.min(255, g * shadowLift);
                b = Math.min(255, b * shadowLift);
            }

            accR = 0; accG = 0; accB = 0;
            kIdx = 0;

            for (ky = -1; ky <= 1; ky++) {
                for (kx = -1; kx <= 1; kx++) {
                    pixelTetanggaIdx = ((y + ky) * w + (x + kx)) * 4;
                    kVal = kernel[kIdx++];

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
    let i;
    
    for (i = 0; i < pixels.length; i += 4) {
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
                handleSliderChange(value);
            }
            break;
            
        case "toggleMenuBox":
            const menu = document.getElementById('dropdownMenu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || menu.style.display === '';
                
                if (isHidden) {
                    menu.style.display = 'block';
                    menu.style.position = 'fixed'; 
                    menu.style.zIndex = '99999'; 
                    menu.style.maxHeight = '250px'; 
                    menu.style.height = 'auto';
                    menu.style.overflowY = 'scroll'; 
                    menu.style.overflowX = 'hidden';
                    menu.style.pointerEvents = 'auto'; 
                    menu.style.webkitOverflowScrolling = 'touch'; 
                    
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
            if (value === "teks") {
                updateSliderBehavior("teks");
            } else {
                updateSliderBehavior("default");
            }
            break;

        case "setAntiGlare":
            if (value === "jendela") {
                updateSliderBehavior("jendela");
            } else if (value === "kain") {
                updateSliderBehavior("kain");
            } else {
                updateSliderBehavior("default");
            }
            break;
            
        default:
            console.warn(`Aksi ${actionName} belum diimplementasikan.`);
    }
}

function renderDropdownMenuItems() {
    const menuContainer = document.getElementById('dropdownMenu');
    if (!menuContainer) return;
    
    menuContainer.innerHTML = ''; 
    menuContainer.style.pointerEvents = "auto"; 
    menuContainer.style.userSelect = "auto";
    menuContainer.style.display = "block"; 
    
    const maxH = (appMemory.db.navigation_buttons && appMemory.db.navigation_buttons.dropdownMenu)
        ? appMemory.db.navigation_buttons.dropdownMenu.ui_coordinate["max-height"]
        : "250px";
        
    menuContainer.style.maxHeight = maxH;
    menuContainer.style.overflowY = "scroll"; 
    menuContainer.style.webkitOverflowScrolling = "touch"; 
    
    menuContainer.ontouchstart = (e) => e.stopPropagation();
    menuContainer.ontouchmove = (e) => e.stopPropagation();
    menuContainer.onpointerdown = (e) => e.stopPropagation();
    
    const menuData = appMemory.db.menu_titik_tiga || [];
    
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
    if (!canvas) return;

    const quality = appMemory.formatFoto === 'webp_max' ? 1.0 : 0.95;
    const mimeType = appMemory.formatFoto && appMemory.formatFoto.includes('webp') ? 'image/webp' : 'image/jpeg';
    const ext = mimeType.split('/')[1];

    const base64Data = canvas.toDataURL(mimeType, quality);

    // KINERJA ANDROID: Eksekusi download fisik langsung ke penyimpanan
    const link = document.createElement('a');
    link.download = `Ai_Picture_${Date.now()}.${ext}`;
    link.href = base64Data;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link); 

    // SINKRONISASI KE GALERI INTERNAL
    saveToHistory(base64Data);

    // SINKRONISASI TAMPILAN TOMBOL BULAT KIRI BAWAH
    const previewEl = document.getElementById('gallery_preview');
    if (previewEl) {
        previewEl.style.backgroundImage = `url(${base64Data})`;
        previewEl.style.backgroundSize = "cover";
        previewEl.style.backgroundPosition = "center";
        previewEl.innerText = ""; // Bersihkan emoji agar tidak menutupi gambar foto
    }

    // Kembalikan status tombol jepret
    const shutterBtn = document.getElementById('shutter_btn');
    if (shutterBtn) {
        shutterBtn.style.pointerEvents = "auto";
        shutterBtn.style.opacity = "1";
        shutterBtn.innerText = ""; 
    }
    
    // PERBAIKAN FATAL: Dihapus agar tidak menimpa ulang pratinjau dengan emoji bawaan DB
    // if (typeof applyBlueprintUI === "function") { applyBlueprintUI(); }
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

            if (shutterBtn) {
                shutterBtn.innerText = "";
                shutterBtn.style.background = "#ffffff"; 
            }
            // PERBAIKAN FATAL: Dihapus dari sini untuk menjaga stabilitas UI
            // applyBlueprintUI(); 
        };

        appMemory.mediaRecorder.start(1000); 
        appMemory.isVideoRecording = true;

        if (shutterBtn) {
            shutterBtn.innerText = "🛑";
            shutterBtn.style.background = "#ff3b30";
            shutterBtn.style.borderRadius = "8px"; 
        }
        console.log("Perekaman video AI dimulai...");

    } else {
        if (appMemory.mediaRecorder && appMemory.mediaRecorder.state !== "inactive") {
            appMemory.mediaRecorder.stop();
        }
        appMemory.isVideoRecording = false;
        if (shutterBtn) shutterBtn.innerText = "⏳";
    }
}

// 8. MONITOR SENSOR ROTASI LAYAR
let internalBeta = 0;
let internalGamma = 0;
let targetAngle = 0;

if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (event) => {
        internalBeta = event.beta;   
        internalGamma = event.gamma; 
        
        targetAngle = 0;

        if (Math.abs(internalGamma) > 40) {
            targetAngle = internalGamma > 0 ? -90 : 90;
        } else if (internalBeta < 0 && Math.abs(internalBeta) > 45) {
            targetAngle = 180;
        } else {
            targetAngle = 0;
        }

        if (targetAngle !== appMemory.currentRotationAngle) {
            appMemory.currentRotationAngle = targetAngle;
            eksekusiRotasiKomponen(targetAngle);
        }
    }, true);
}

function eksekusiRotasiKomponen(angle) {
    console.log(`[Sensor Internal] Memutar tampilan ikon ke: ${angle}°`);

    const shutter = document.getElementById('shutter_btn');
    const gallery = document.getElementById('gallery_preview');
    const tripleDot = document.getElementById('triple_dot_btn');
    const timer = document.getElementById('timer_btn');
    const swCamera = document.getElementById('switch_camera');
    const swMode = document.getElementById('switch_mode');
    const expSlider = document.getElementById('expSlider');

    const smoothTransition = "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

    const kunciStabilitasTeks = (el) => {
        if (!el) return;
        el.style.transition = smoothTransition;
        el.style.backfaceVisibility = "hidden";
        el.style.webkitBackfaceVisibility = "hidden";
        el.style.willChange = "transform";
    };

    if (shutter) {
        kunciStabilitasTeks(shutter);
        shutter.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    }

    if (gallery) {
        kunciStabilitasTeks(gallery);
        gallery.style.transform = `rotate(${angle}deg)`;
    }

    if (tripleDot) {
        kunciStabilitasTeks(tripleDot);
        tripleDot.style.transform = `rotate(${angle}deg)`;
    }

    if (timer) {
        kunciStabilitasTeks(timer);
        timer.style.transform = `rotate(${angle}deg)`;
    }

    if (swCamera) {
        kunciStabilitasTeks(swCamera);
        swCamera.style.transform = `rotate(${angle}deg)`;
    }

    if (swMode) {
        kunciStabilitasTeks(swMode);
        swMode.style.transform = `rotate(${angle}deg)`;
    }

    if (expSlider) {
        kunciStabilitasTeks(expSlider);
        expSlider.style.transform = `rotate(${-90 + angle}deg) translateX(-50%)`;
    }
}

function bukaGaleriSistem() {
    console.log("Membuka galeri sistem...");
    
    const ghostInput = document.createElement('input');
    ghostInput.type = 'file';
    ghostInput.accept = 'image/*, video/*'; 
    ghostInput.style.display = 'none';
    
    ghostInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            alert(`Berhasil memilih file: ${file.name}`);
            
            const previewEl = document.getElementById('gallery_preview');
            if (previewEl) {
                const url = URL.createObjectURL(file);
                previewEl.style.backgroundImage = `url(${url})`;
                previewEl.style.backgroundSize = "cover";
                previewEl.style.backgroundPosition = "center";
                previewEl.innerText = "";
            }
        }
    };
    
    document.body.appendChild(ghostInput);
    ghostInput.click();
    document.body.removeChild(ghostInput);
}

let currentSliderMode = 'default'; 

function updateSliderBehavior(mode) {
    const slider = document.getElementById('expSlider');
    if (!slider) return;
    
    const caps = appMemory.db.slider_capabilities[mode] || appMemory.db.slider_capabilities.default;
    
    slider.min = caps.min;
    slider.max = caps.max;
    slider.step = caps.step;
    slider.value = 0; 
    
    currentSliderMode = mode;
    console.log(`Slider sekarang mengontrol: ${caps.target}`);
}

function handleSliderChange(val) {
    const strength = parseFloat(val);
    
    switch(currentSliderMode) {
        case 'teks':
            appMemory.localContrastStrength = strength;
            break;
        case 'jendela':
            if (appMemory.db && appMemory.db.auto_exposure_stabilizer) {
                appMemory.db.auto_exposure_stabilizer.conditions.anti_glare_jendela.max_dim_offset = strength;
            }
            break;
        default:
            if (typeof setExposure === "function") {
                setExposure(strength); 
            } else {
                console.warn("Fungsi setExposure tidak ditemukan.");
            }
            break;
    }
}

function saveToHistory(imageDataBase64) {
    let { display, archive } = appMemory.gallery;

    display.unshift(imageDataBase64);

    if (display.length > 5) {
        let oldItem = display.pop(); 
        archive.unshift(oldItem);    
    }

    if (archive.length > 3) {
        archive.pop(); 
    }

    localStorage.setItem('myCameraGallery', JSON.stringify(appMemory.gallery));
}

function initGallery() {
    const saved = localStorage.getItem('myCameraGallery');
    if (saved) {
        appMemory.gallery = JSON.parse(saved);
        
        if (appMemory.gallery.display && appMemory.gallery.display.length > 0) {
            const previewEl = document.getElementById('gallery_preview');
            if (previewEl) {
                previewEl.style.backgroundImage = `url(${appMemory.gallery.display[0]})`;
                previewEl.style.backgroundSize = "cover";
                previewEl.style.backgroundPosition = "center";
                previewEl.innerText = ""; // Singkirkan emoji karena ada riwayat gambar lama
            }
        }
    } else {
        appMemory.gallery = { display: [], archive: [] };
    }
}
