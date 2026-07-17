// brain.js - Mesin Eksekusi Kamera Berbasis Data-Driven & Akselerasi Sensor

const appMemory = {
    db: null,
    stream: null,
    mediaRecorder: null,      
    videoChunks: [],          
    isRecording: false,       
    currentFacingMode: "environment",
    currentMode: "foto",       
    defaultFormatFoto: "webp",       // Diambil dari menu titik tiga (webp, jpeg, png, pdf)
    exportQuality: "standar",        // Diambil dari menu titik tiga (low, standar, high)
    activeFeature: "normal",         // Tombol fitur aktif di layar (normal, jendela, kain, teks, gelap, malam, objek, zoom)
    featureSliderValues: {           // Menyimpan memori posisi nilai slider terakhir untuk tiap fitur
        normal: -0.5,
        jendela: -1.5,
        kain: 1.4,
        teks: 2.2,
        gelap: 1.8,
        malam: 1.3,
        objek: 1.0,
        zoom: 1.5
    },
    currentRotationAngle: 0, 
    timerIndex: 0
};

document.addEventListener("DOMContentLoaded", () => {
    if (window.APP_DATABASE) {
        appMemory.db = window.APP_DATABASE;
        initApp();
    }
});

let currentBoosterMode = "default";

function initApp() {
    setupEventListeners(); 
    applyBlueprintUI(); 
    startCamera();
    
    // AKTIFKAN SENSOR GYROSCOPE / ACCELEROMETER INTERNAL HP
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientationChange, true);
    }
}

function applyBlueprintUI() {
    const blueprint = appMemory.db.navigation_buttons;

    for (const key in blueprint) {
        const btnConfig = blueprint[key];
        const el = document.getElementById(btnConfig.id);

        if (el) {
            // 1. Suntikkan Koordinat & Dimensi Ukuran yang Valid dari Database
            if (btnConfig.ui_coordinate) {
                for (const prop in btnConfig.ui_coordinate) {
                    const jsProp = prop.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
                                       .replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    el.style[jsProp] = btnConfig.ui_coordinate[prop];
                }
            }
            if (btnConfig.transition) el.style.transition = btnConfig.transition;
            
            // 2. Suntik Label Teks Mandiri
            if (btnConfig.label && btnConfig.type !== "container") {
                el.innerText = btnConfig.label;
            }

            // 3. Sinkronisasi batasan nilai input slider dari database jika ada
            if (btnConfig.type === "slider") {
                const activeRoute = appMemory.db.slider_booster_routing.registry[appMemory.activeFeature] || appMemory.db.slider_booster_routing.registry.default;
                el.min = activeRoute.min;
                el.max = activeRoute.max;
                el.step = activeRoute.step;
                el.value = activeRoute.default_value;
            }
        }
    }

    // Bangun Anak Tombol Kanan Bawah secara Fisik
    renderRightContainerButtons(blueprint.right_actions_container);
}

function renderRightContainerButtons(config) {
    const container = document.getElementById('right_actions_container');
    if (!container || !config || !config.child_buttons) return;

    container.innerHTML = '';
    config.child_buttons.forEach(btn => {
        const buttonEl = document.createElement('button');
        buttonEl.id = btn.id;
        
        // Buat bungkus teks internal (span) agar icon bisa berputar secara independen
        buttonEl.innerHTML = `<span class="icon-art" style="display:inline-block; transition: transform 0.3s ease;">${btn.label}</span>`;
        
        buttonEl.style.width = btn.width;
        buttonEl.style.height = btn.height;
        buttonEl.style.background = btn.background;
        buttonEl.style.borderRadius = btn.border_radius;
        buttonEl.style.color = btn.color;
        buttonEl.style.border = "none";
        buttonEl.style.fontSize = "20px";
        buttonEl.style.display = "flex";
        buttonEl.style.alignItems = "center";
        buttonEl.style.justifyContent = "center";
        
        buttonEl.onclick = (e) => {
            e.stopPropagation();
            executeAction(btn.action, null);
        };
        container.appendChild(buttonEl);
    });
}

// MESIN UTAMA: DETEKSI KEMIRINGAN GRAVITASI HP
function handleOrientationChange(event) {
    let beta = event.beta;   // Kemiringan depan-belakang (-180 ke 180)
    let gamma = event.gamma; // Kemiringan kiri-kanan (-90 ke 90)
    let targetAngle = appMemory.currentRotationAngle;

    // Logika pembagian sudut berdasarkan orientasi genggaman tangan
    if (beta > 45 && beta < 135) {
        targetAngle = 180; // HP Terbalik
    } else if (gamma < -35) {
        targetAngle = 90;  // Landscape Kiri (Tombol Jepret di Kanan)
    } else if (gamma > 35) {
        targetAngle = -90; // Landscape Kanan
    } else if (beta > -45 && beta < 45 && Math.abs(gamma) < 30) {
        targetAngle = 0;   // Portrait Tegak Normal
    }

    if (targetAngle !== appMemory.currentRotationAngle) {
        appMemory.currentRotationAngle = targetAngle;
        executeRotationBlueprint(targetAngle);
    }
}

// EKSEKUSI ROTASI DAN TRANSISI FRAME VIDEO BERBASIS DATA + PENGAMAN STABILITAS GPU
function executeRotationBlueprint(angle) {
    const blueprint = appMemory.db.navigation_buttons;
    const videoEl = document.getElementById('camera-view');
    const adapt = appMemory.db.viewport_adaptation;

    // 1. ADAPTASI FRAME VIEW KAMERA
    if (videoEl && adapt) {
        const isLandscape = (angle === 90 || angle === -90);
        videoEl.style.cssText = isLandscape ? adapt.landscape.video_css : adapt.portrait.video_css;
    }

    // Aturan transisi halus + Pengunci Memori agar teks/ikon TIDAK bergeser saat disentuh
    const smoothTransition = "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    const kunciStabilitasTeks = (el) => {
        if (!el) return;
        el.style.transition = smoothTransition;
        el.style.backfaceVisibility = "hidden";
        el.style.webkitBackfaceVisibility = "hidden";
        el.style.willChange = "transform";
    };

    // 2. PUTAR IKON SEARAH GRAVITASI HP SECARA STABIL
    for (const key in blueprint) {
        const btnConfig = blueprint[key];
        const el = document.getElementById(btnConfig.id);

        if (el && btnConfig.allow_rotation) {
            kunciStabilitasTeks(el); // Kunci di memori GPU agar tidak bergetar

            if (btnConfig.rotation_mode === "icon_only") {
                if (btnConfig.id === "right_actions_container") {
                    // Putar anak emoji di dalam kontainer kanan bawah secara independen
                    const icons = el.querySelectorAll('.icon-art');
                    icons.forEach(ico => {
                        kunciStabilitasTeks(ico);
                        ico.style.transform = `rotate(${angle}deg)`;
                    });
                } else {
                    el.style.transform = `rotate(${angle}deg)`;
                    if (btnConfig.id === "shutter_btn") {
                        el.style.transform = `translateX(-50%) rotate(${angle}deg)`;
                    }
                }
            } 
            else if (btnConfig.rotation_mode === "layout_follow") {
                // Untuk komponen zona tengah lainnya (Kecuali slider yang sudah dikunci mati di database)
                el.style.transform = `rotate(${angle}deg)`;
            }
        }
    }
}

// Fungsi pembantu melahirkan item menu titik tiga dari database secara dinamis
function renderDropdownMenuItems() {
    const menuContainer = document.getElementById('dropdownMenu');
    if (!menuContainer || !appMemory.db.menu_titik_tiga) return;

    menuContainer.innerHTML = ''; // Bersihkan renderan lama
    
    appMemory.db.menu_titik_tiga.forEach(group => {
        // Buat Label Group Header (Contoh: Opsi Format Foto)
        const header = document.createElement('div');
        header.innerText = group.label;
        header.style.color = '#888';
        header.style.fontSize = '12px';
        header.style.margin = '12px 0 6px 0';
        header.style.fontWeight = 'bold';
        header.style.borderBottom = '1px solid #222';
        header.style.paddingBottom = '4px';
        menuContainer.appendChild(header);

        // Satukan pembacaan sub_menu maupun items dari database
        const items = group.sub_menu || group.items || [];
        
        items.forEach(item => {
            const itemBtn = document.createElement('button');
            let isSelected = false;

            // Logika Cerdas: Cek status aktif untuk memberikan tanda visual
            if (item.action === "setFormat") {
                // Bisa format foto atau video
                isSelected = (appMemory.defaultFormatFoto === item.value || appMemory.db.app_config.settings.default_format_video === item.value);
            } else if (item.action === "setExportQuality") {
                isSelected = (appMemory.exportQuality === item.value);
            } else if (item.action === "setActiveFeature") {
                isSelected = (appMemory.activeFeature === item.value);
            }

            // Beri tanda teks jika tombol sedang aktif terpilih
            itemBtn.innerText = isSelected ? `✓ ${item.label}` : item.label;
            
            styleMenuItem(itemBtn);
            
            // Jika aktif, beri warna penanda (hijau natural lembut) agar kontras di layar hitam
            if (isSelected) {
                itemBtn.style.color = '#4caf50';
                itemBtn.style.fontWeight = 'bold';
                itemBtn.style.background = 'rgba(76, 175, 80, 0.05)';
            }

            itemBtn.onclick = (e) => {
                e.stopPropagation();
                executeAction(item.action, item.value);
                
                // RENDER ULANG menu agar tanda centang (✓) langsung berpindah secara real-time
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

function setupEventListeners() {
    const blueprint = appMemory.db.navigation_buttons;

    // PREPARATION: Buat Elemen Fokus Secara Dinamis
    let focusBox = document.getElementById('focus-box');
    if (!focusBox) {
        focusBox = document.createElement('div');
        focusBox.id = 'focus-box';
        document.body.appendChild(focusBox);
    }

    // 1. Mengaktifkan Klik Tombol Utama Bawaan DB
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

    // 2. Jalur Input Slider Dinamis (Menggunakan routing di DB)
    const slider = document.getElementById('expSlider');
    if (slider) {
        slider.oninput = (e) => {
            executeAction("setExposure", e.target.value);
        };
    }

    // 3. Ketuk Layar: Auto Fokus, Stabilizer, & Tutup Menu
    const videoView = document.getElementById('camera-view');
    if (videoView) {
        videoView.style.transition = "transform 0.15s ease-out, filter 0.1s ease-out";
        videoView.style.transformOrigin = "center center";

        videoView.onclick = (e) => {
            // A. Tutup dropdown menu
            const menu = document.getElementById('dropdownMenu');
            if (menu) menu.style.display = 'none';

            // B. Hitung Koordinat Sentuhan Jari
            const rect = videoView.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // C. Jalankan Animasi Kotak Fokus Dinamis
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

            // D. Jalankan Driver Hardware Auto-Focus Kamera
            triggerHardwareFocus(x / rect.width, y / rect.height);
        };
    }
}

// Blok Fungsi: Mengubah Rute dan Batas Nilai Slider Booster secara Dinamis
function switchSliderBooster(modeName) {
  const registry = window.APP_DATABASE.slider_booster_routing.registry;
  
  if (!registry[modeName]) {
    modeName = "default";
  }
  
  currentBoosterMode = modeName;
  const config = registry[modeName];
  const sliderEl = document.getElementById("expSlider");
  
  if (sliderEl) {
    sliderEl.min = config.min;
    sliderEl.max = config.max;
    sliderEl.step = config.step;
    
    // Ambil nilai terakhir dari memori appMemory agar slider tidak lompat ke default
    const savedValue = appMemory.featureSliderValues[modeName];
    sliderEl.value = savedValue !== undefined ? savedValue : config.default_value;
    
    console.log(`[Brain] Slider dialihkan ke: ${config.name} (${modeName}) dengan nilai ${sliderEl.value}`);
    applyBoosterEffect(sliderEl.value);
  }
}

// Blok Fungsi: Menerapkan Efek Booster ke Sistem / Tampilan Real-Time
function applyBoosterEffect(value) {
  const config = window.APP_DATABASE.slider_booster_routing.registry[currentBoosterMode];
  if (!config) return;
  
  const numericValue = parseFloat(value);
  const videoEl = document.querySelector("video");
  
  // Update memori internal real-time untuk fitur aktif saat ini
  if (appMemory.activeFeature) {
      appMemory.featureSliderValues[appMemory.activeFeature] = numericValue;
  }
  
  // 1. Simpan ke database target path (mengatasi bug target_database_path yang mengambang)
  if (config.target_database_path) {
    const paths = config.target_database_path.split('.');
    let currentObj = window.APP_DATABASE;
    for (let i = 0; i < paths.length - 1; i++) {
      if (!currentObj[paths[i]]) {
        currentObj[paths[i]] = {};
      }
      currentObj = currentObj[paths[i]];
    }
    currentObj[paths[paths.length - 1]] = numericValue;
  }
  
  // 2. Kurir menerapkan feedback visual real-time ke elemen antarmuka (HTML/Video)
  if (videoEl) {
    if (config.realtime_feedback_formula !== "zoom_transform") {
      videoEl.style.transform = "scale(1)";
    }

    if (config.realtime_feedback_formula === "brightness") {
      videoEl.style.filter = `brightness(${1 + (numericValue * 0.15)})`;
      // Sinkronkan juga ke exposure kamera fisik jika didukung
      appMemory.currentHardwareExposure = numericValue;
      applyHardwareExposure();
    } 
    else if (config.realtime_feedback_formula === "convolution_intensity" || config.realtime_feedback_formula === "kernel_multiplier") {
      const contrastBoost = 1 + (numericValue * 0.15);
      videoEl.style.filter = `contrast(${contrastBoost}) saturate(1.05)`; // Bug filter 'sharp' tidak valid telah dihapus
    } 
    else if (config.realtime_feedback_formula === "glare_cut" || config.realtime_feedback_formula === "chroma_lock") {
      const dimFactor = 1 - (numericValue * 0.2);
      videoEl.style.filter = `brightness(${dimFactor}) contrast(1.15)`;
    }
    // 3. LOGIKA ZOOM
    else if (config.realtime_feedback_formula === "zoom_transform") {
      applyDigitalZoom(numericValue);
    }
  }
}

// 4. Driver Kamera dengan Kontrol Exposure Hardware Real-time
function startCamera(needsAudio = false) {
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
        
        // AMANKAN DAN IKAT KAMERA TRACK KE GLOBAL WINDOW AGAR BISA DIAKSES FUNGSI FOKUS & ZOOM
        window.cameraTrack = stream.getVideoTracks()[0];
        
        const videoEl = document.getElementById('camera-view');
        if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.onloadedmetadata = () => {
                videoEl.play();
                applyHardwareExposure();
                // Set awal slider booster sesuai mode default pertama kali
                switchSliderBooster(appMemory.activeFeature);
            };
        }
    }).catch(err => console.error("[Driver] Gagal membuka kamera:", err));
}

// Fungsi untuk meredupkan/menerangkan sensor kamera fisik berdasarkan Slider Kiri
function applyHardwareExposure() {
    if (!window.cameraTrack) return;

    if (typeof window.cameraTrack.getCapabilities === "function") {
        const capabilities = window.cameraTrack.getCapabilities();
        
        // Periksa apakah hardware HP mendukung kontrol Exposure otomatis lewat browser
        if (capabilities.exposureCompensation) {
            const expValue = appMemory.currentHardwareExposure || 0.0; 
            
            window.cameraTrack.applyConstraints({
                advanced: [{ exposureCompensation: expValue }]
            }).then(() => {
                console.log(`[Hardware] Sensor kamera diatur ke exposure: ${expValue}`);
            }).catch(err => console.warn("[Hardware] Gagal menerapkan exposure compensation:", err));
        }
    }
}

// 5. HUB PEMROSESAN GAMBAR & VIDEO (Multi-Mode Dinamis)
function executeCapture() {
    const mode = appMemory.currentMode || "foto";
    
    if (mode === "video") {
        handleVideoRecordingLogic();
    } else {
        handlePhotoCaptureLogic();
    }
}

// LOGIKA INTERNAL FOTO
function handlePhotoCaptureLogic() {
    console.log("Mempersiapkan proses penangkapan gambar...");
    
    const timerFeatures = appMemory.db?.camera_features || {};
    const timerOptions = timerFeatures.timer_options || [0, 3, 5, 10];
    const timerIndex = appMemory.timerIndex || 0;
    const detikMundur = timerOptions[timerIndex] || 0;
    
    const shutterBtn = document.getElementById('shutter_btn');
    
    // Kunci tombol jepret secara visual & fungsi demi keamanan RAM
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
        console.log(`Timer aktif: Menghitung mundur ${detikMundur} detik.`);
        let sisaWaktu = detikMundur;
        
        if (shutterBtn) {
            shutterBtn.innerText = sisaWaktu;
            shutterBtn.style.background = "rgba(255, 0, 0, 0.8)"; // Merah siaga
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
                
                try {
                    ambilFotoWebp();
                } catch (err) {
                    console.error("Gagal mengeksekusi ambilFotoWebp setelah timer:", err);
                    pulihkanTombolShutterDarurat();
                }
            }
        }, 1000);
    } else {
        try {
            ambilFotoWebp();
        } catch (err) {
            console.error("Gagal mengeksekusi ambilFotoWebp secara instan:", err);
            pulihkanTombolShutterDarurat();
        }
    }
}

// LOGIKA INTERNAL VIDEO (HEMAT RAM)
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

    console.log("Memulai perekaman video HD...");
    appMemory.videoChunks = []; // Reset total buffer RAM
    appMemory.isRecording = true;

    if (shutterBtn) {
        shutterBtn.style.background = "#ff0000";
        shutterBtn.style.borderRadius = "8px"; 
        shutterBtn.style.opacity = "1";
    }

    try {
        appMemory.mediaRecorder = new MediaRecorder(appMemory.stream, {
            mimeType: 'video/webm;codecs=vp8' // Paling ringan di Xiaomi 5A 2GB RAM
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
        console.log("[Video] Menyusun file & mengosongkan RAM...");

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
        console.log("✓ Buffer video dihancurkan dari RAM. File aman di folder Download.");
    };

    appMemory.mediaRecorder.start(1000);
}

// INTERFACE UTAMA EKSEKUSI DATA-DRIVEN (executeAction)
function executeAction(actionName, value) {
    console.log(`Menjalankan aksi: ${actionName} dengan nilai:`, value);
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
                console.warn("Harap hentikan perekaman video terlebih dahulu.");
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
                shutterBtn.style.border = appMemory.currentMode === "video" ? "4px solid #ff0000" : "4px solid #cccccc";
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
            console.log(`Format file diatur ke: ${value}`);
            break;

        case "setExportQuality": 
            appMemory.exportQuality = value;
            console.log(`Kualitas ekspor diatur ke: ${value}`);
            break;

        // --- SISTEM AKTIVASI TOMBOL FITUR DI LAYAR UTAMA ---
        case "setActiveFeature": 
            appMemory.activeFeature = value || "normal";
            console.log(`Fitur aktif beralih ke: ${appMemory.activeFeature}`);
            
            // SINKRONKAN SLIDER KE FITUR YANG DIPILIH DARI MENU
            switchSliderBooster(appMemory.activeFeature);
            break;
            
        case "setExposure": // Penanganan pergerakan slider kiri
            if (value !== null && value !== undefined) {
                applyBoosterEffect(value);
            }
            break;
            
        case "toggleMenuBox":
            const menu = document.getElementById('dropdownMenu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || menu.style.display === '';
                if (isHidden) {
                    // KOREKSI: Gunakan 'block' agar scroll HTML mendeteksi elemen dari baris paling atas
                    menu.style.display = 'block';
                    menu.style.position = 'absolute'; 
                    menu.style.zIndex = '99999'; 
                    menu.style.maxHeight = '70vh'; // Batasi tinggi menu maksimal 70% dari tinggi layar agar tidak luber
                    menu.style.overflowY = 'auto'; 
                    menu.style.overflowX = 'hidden';
                    menu.style.pointerEvents = 'auto'; 
                    menu.style.webkitOverflowScrolling = 'touch'; 
                    
                    renderDropdownMenuItems();
                    
                    // Paksa scrollbar kembali ke posisi paling atas setiap kali menu dibuka
                    menu.scrollTop = 0;
                } else {
                    menu.style.display = 'none';
                }
            }
            break;

        default:
            console.warn(`Aksi ${actionName} belum diimplementasikan.`);
    }
}

function ambilFotoWebp() {
    const video = document.getElementById('camera-view');
    const canvas = document.getElementById('processing-canvas');
    
    if (!video || !canvas) {
        console.error("Komponen kamera tidak ditemukan di layar.");
        const shutterBtn = document.getElementById('shutter_btn');
        if (shutterBtn) {
            shutterBtn.disabled = false;
            shutterBtn.style.pointerEvents = "auto";
        }
        return;
    }

    // Efek flash visual kedipan layar
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

    const config = appMemory.db.camera_features.burst_mode;
    let frameBuffer = [];
    let count = 0;
    
    const z = appMemory.featureSliderValues.zoom || 1; 

    // DETEKSI LOGIKA ZOOM: Jika sedang di-zoom, otomatis set fitur aktif ke mode rekonstruksi zoom
    if (z > 1.2) {
        appMemory.activeFeature = "zoom";
    }

    const burst = setInterval(() => {
        if (count < config.frame_count) {
            const temp = document.createElement('canvas');
            temp.width = w; temp.height = h;
            const tCtx = temp.getContext('2d');
            
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
    
    const f1 = buffers[0].data;
    const f2 = buffers[1].data;
    const f3 = buffers[2].data;

    // LANGKAH MURNI: Hanya merata-ratakan 3 frame burst untuk gambar yang bersih (Raw Merge)
    for (let i = 0; i < data.length; i += 4) {
        data[i]     = (f1[i] + f2[i] + f3[i]) / 3;     // Red
        data[i+1]   = (f1[i+1] + f2[i+1] + f3[i+1]) / 3; // Green
        data[i+2]   = (f1[i+2] + f2[i+2] + f3[i+2]) / 3; // Blue
        data[i+3]   = 255;                               // Alpha (Full)
    }
    
    // Kirim gambar mentah yang bersih ke satu-satunya mesin AI
    applyBilateralSharpening(data, w, h);
    ctx.putImageData(output, 0, 0);
    
    if (appMemory.db.human_eye_perception_formula.squint_reflex_mechanism.enabled) {
        applySquintReflex(canvas, w, h);
    }
    
    // LOGIKA FORMAT & KUALITAS
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
    
    // COOLDOWN PEMULIHAN TOMBOL SHUTTER
    setTimeout(() => {
        const shutterBtn = document.getElementById('shutter_btn');
        if (shutterBtn) {
            shutterBtn.disabled = false;
            shutterBtn.style.pointerEvents = "auto";
            shutterBtn.style.opacity = "1";
        }
    }, window.APP_DATABASE.shutter_pipeline.visual_effects.button_cooldown_ms);
}

// Fungsi Eksekutor Penyimpanan Gambar ke Memori Internal HP & Update Preview UI
function saveImageToAppGallery(finalDataURL) {
    const galleryPreview = document.getElementById('gallery_preview');
    if (galleryPreview) {
        galleryPreview.innerHTML = `<img src="${finalDataURL}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;" />`;
    }

    try {
        const downloadLink = document.createElement('a');
        const timestamp = new Date().getTime();
        const activeFormat = appMemory.defaultFormatFoto || "webp_max";
        const profile = window.APP_DATABASE.shutter_pipeline.processing_profiles[activeFormat];
        const ext = profile.mime_type.includes("webp") ? "webp" : "jpg";
        
        downloadLink.download = `AiPicture_${timestamp}.${ext}`;
        downloadLink.href = finalDataURL;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        console.log(`Gambar berhasil diunduh ke memori perangkat: AiPicture_${timestamp}.${ext}`);

    } catch (error) {
        console.error("Gagal memicu pengunduhan lokal, menjalankan sistem cadangan blob:", error);
        
        fetch(finalDataURL)
            .then(res => res.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                const timestamp = new Date().getTime();
                const activeFormat = appMemory.defaultFormatFoto || "webp_max";
                const ext = window.APP_DATABASE.shutter_pipeline.processing_profiles[activeFormat].mime_type.includes("webp") ? "webp" : "jpg";
                
                downloadLink.download = `AiPicture_${timestamp}.${ext}`;
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

    if (video && video.srcObject) {
        video.style.opacity = "0";
    }

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
    if (video) {
        video.style.opacity = "1";
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

// Mesin Utama AI: Merekonstruksi Gambar Redup Menjadi Super Tajam & Jernih
function applyBilateralSharpening(data, w, h) {
    const feature = appMemory.activeFeature || "normal";
    const sliderVal = appMemory.featureSliderValues[feature];
    
    const profileRegistry = appMemory.db.ai_reconstruction_profiles || {};
    const profile = profileRegistry[feature] || profileRegistry["normal"];
    const toneData = appMemory.db.human_eye_perception_formula.tone_mapping;

    let glareThreshold = profile.glare_threshold;
    let shadowLift = profile.shadow_lift;
    let saturation = profile.saturation;
    let isNoiseReduction = profile.noise_reduction;
    let edgeBoost = sliderVal * profile.edge_boost_multiplier;
    
    let isInfraredMode = (feature === "gelap");

    if (feature === "malam" || feature === "gelap") {
        shadowLift = sliderVal; 
    }

    const bufferAsli = new Uint8ClampedArray(data);
    const kernel = [
         0, -1,  0,
        -1,  5, -1,
         0, -1,  0
    ];

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;

            let r = bufferAsli[i];
            let g = bufferAsli[i+1];
            let b = bufferAsli[i+2];

            // 1. JALUR KHUSUS INFRAMERAH (Mode Gelap)
            if (isInfraredMode && feature === "gelap") {
                let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                let finalLumi = Math.max(0, Math.min(255, brightness * shadowLift));
                data[i]     = finalLumi * 0.3;  
                data[i+1]   = finalLumi;        
                data[i+2]   = finalLumi * 0.5;  
                continue; 
            }

            // 2. REDUKSI NOISE (Jika aktif di database)
            if (isNoiseReduction) {
                const iKiri = i - 4;
                const iKanan = i + 4;
                r = (r + bufferAsli[iKiri] + bufferAsli[iKanan]) / 3;
                g = (g + bufferAsli[iKiri+1] + bufferAsli[iKanan+1]) / 3;
                b = (b + bufferAsli[iKiri+2] + bufferAsli[iKanan+2]) / 3;
            }

            // Dapatkan nilai kecerahan piksel tunggal
            let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // 3. JALUR FILTER PEWARNAAN BERDASARKAN FITUR AKTIF
            if (feature === "normal" || feature === "natural") {
                // Mode natural: Hanya menaikkan kecerahan tipis (shadow_lift) untuk membuang kabut
                if (shadowLift !== 1.0) {
                    r = Math.min(255, r * shadowLift);
                    g = Math.min(255, g * shadowLift);
                    b = Math.min(255, b * shadowLift);
                }
            } else {
                // Mode Fungsional: Peredam Silau & Pengangkat Gelap Aktif secara proporsional
                if (brightness > glareThreshold) {
                    const factor = brightness / 255;
                    const dimAmt = toneData.glare_dim_factor || 0.92;
                    // Redam silau secara merata ke semua channel RGB agar tidak bergeser ke hijau-biru
                    r /= (factor * (2.0 - dimAmt));
                    g /= (factor * (2.0 - dimAmt));
                    b /= (factor * (2.0 - dimAmt));
                } else if (brightness < 90) {
                    r = Math.min(255, r * shadowLift);
                    g = Math.min(255, g * shadowLift);
                    b = Math.min(255, b * shadowLift);
                }
            }

            // Hitung ulang kecerahan pasca-filter untuk pemrosesan saturasi adem
            brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // 4. EFEK KACAMATA HITAM (Mengatur Keademan Warna)
            if (saturation !== 1.0) {
                r = brightness + (r - brightness) * saturation;
                g = brightness + (g - brightness) * saturation;
                b = brightness + (b - brightness) * saturation;
            }

            // 5. PENAJAMAN GARIS TEPI (Convolution Laplacian)
            if (edgeBoost > 0) {
                let accR = 0, accG = 0, accB = 0;
                let kIdx = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const safeY = Math.max(0, Math.min(h - 1, y + ky));
                        const safeX = Math.max(0, Math.min(w - 1, x + kx));
                        const pixelTetanggaIdx = (safeY * w + safeX) * 4;
                        const kVal = kernel[kIdx++];
                        
                        accR += bufferAsli[pixelTetanggaIdx] * kVal;
                        accG += bufferAsli[pixelTetanggaIdx] * kVal;
                        accB += bufferAsli[pixelTetanggaIdx] * kVal;
                    }
                }
                r = (accR * edgeBoost) + (r * (1 - edgeBoost));
                g = (accG * edgeBoost) + (g * (1 - edgeBoost));
                b = (accB * edgeBoost) + (b * (1 - edgeBoost));
            }

            // Kunci output akhir di batas aman RGB
            data[i]     = Math.max(0, Math.min(toneData.max_clipping_safety || 255, r));
            data[i+1]   = Math.max(0, Math.min(toneData.max_clipping_safety || 255, g));
            data[i+2]   = Math.max(0, Math.min(toneData.max_clipping_safety || 255, b));
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

// 6. STABILISASI CAHAYA REAL-TIME (AUTO EXPOSURE LOOPER - RAM 2GB Friendly)
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

    // Amankan pemanggilan warna filter dari database jika activeColorMode belum dideklarasikan
    const activeColor = appMemory.activeColorMode || appMemory.db.app_config.settings.default_color_mode || "natural";
    const filterWarnaAktif = appMemory.db.camera_features.color_filters[activeColor] || "";
    
    video.style.filter = `${filterWarnaAktif} ${targetFilter}`.trim();
}

// Driver Kamera untuk Memaksa Lensa Perangkat Keras Fokus ke Koordinat Tertentu
function triggerHardwareFocus(relativeX, relativeY) {
    if (window.cameraTrack && typeof window.cameraTrack.getCapabilities === "function") {
        const capabilities = window.cameraTrack.getCapabilities();
        
        if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
            window.cameraTrack.applyConstraints({
                advanced: [{
                    focusMode: 'manual',
                    pointsOfInterest: [{x: relativeX, y: relativeY}]
                }]
            }).catch(err => {
                window.cameraTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            });
        }
    }
}

// Logika Implementasi Zoom Digital Aman Tanpa Merusak Layout UI
function applyDigitalZoom(zoomLevel) {
    const videoView = document.getElementById('camera-view');
    if (!videoView) return;
    
    if (window.cameraTrack && typeof window.cameraTrack.getCapabilities === "function") {
        const caps = window.cameraTrack.getCapabilities();
        if (caps.zoom) {
            window.cameraTrack.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
            return;
        }
    }
    
    // Fallback Zoom CSS Stabilizer
    const scale = 1 + (zoomLevel * 0.05); 
    videoView.style.transform = `scale(${scale})`;
}

function prosesSimpanSebagaiPDF(canvas) {
    // 1. Dapatkan Data URL Gambar (menggunakan format JPEG standar agar ukuran PDF tetap bersahabat dengan RAM 2GB)
    const imgDataUrl = canvas.toDataURL("image/jpeg", 0.85);

    // 2. Tampilkan pratinjau di kiri bawah
    const galleryPreview = document.getElementById('gallery_preview');
    if (galleryPreview) {
        galleryPreview.innerHTML = `<img src="${imgDataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;" />`;
    }

    // 3. Konversi gambar menjadi berkas dokumen PDF murni (sangat efisien di WebView)
    try {
        const timestamp = new Date().getTime();
        const pdfBlob = (function() {
            // Skrip internal rakitan PDF instan tanpa membebani library eksternal (RAM Saver)
            const w = canvas.width;
            const h = canvas.height;
            const header = `%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/XObject << /Im1 4 0 R >>\n>>\n/MediaBox [0 0 ${w} ${h}]\n/Contents 5 0 R\n>>\nendobj\n`;
            
            // Kita bungkus Base64 gambar ke dalam objek stream PDF
            const base64Content = imgDataUrl.split(',')[1];
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);

            // Merakit output dokumen
            const pdfHeader = new TextEncoder().encode(header);
            const pdfFooter = new TextEncoder().encode(`\n4 0 obj\n<<\n/Type /XObject\n/Subtype /Image\n/Width ${w}\n/Height ${h}\n/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n/Filter /DCTDecode\n/Length ${byteArray.length}\n>>\nstream\n`);
            const pdfEndStream = new TextEncoder().encode(`\nendstream\nendobj\n5 0 obj\n<<\n/Length 54\n>>\nstream\nq\n${w} 0 0 ${h} 0 0 cm\n/Im1 Do\nQ\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n110\n%%EOF`);

            return new Blob([pdfHeader, pdfFooter, byteArray, pdfEndStream], { type: 'application/pdf' });
        })();

        // Unduh langsung berkas PDF yang dihasilkan
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
        
        console.log(`✓ Dokumen berhasil dikonversi & diunduh sebagai PDF: AiPicture_${timestamp}.pdf`);
    } catch (err) {
        console.error("Gagal menyusun dokumen PDF di memori lokal:", err);
    }
}
